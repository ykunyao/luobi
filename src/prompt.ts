import { EXCLUDED_FILE_PATTERNS, type CommitType, MAX_DIFF_LENGTH } from "./types.js";

/**
 * System prompt template for LLM-based commit message generation.
 *
 * The prompt instructs the model to:
 * - Analyze the git diff
 * - Generate one commit message in Chinese
 * - Follow Conventional Commits format
 * - Output ONLY the commit message string
 */
export const SYSTEM_PROMPT = `你是一个 Git 提交信息生成助手。请根据提供的 git diff 分析改动内容，生成一条符合 Conventional Commits 规范的中文提交信息。

## 规则

1. **格式**: \`type: 中文描述\`
2. **类型 (type)** 必须从以下选择：
   - \`feat\` — 新功能
   - \`fix\` — 修复 bug
   - \`refactor\` — 重构代码（既非 feat 也非 fix）
   - \`chore\` — 杂项（依赖更新、构建配置、工具链等）
   - \`docs\` — 文档变更
   - \`style\` — 代码风格调整（空格、格式化、分号等，不影响逻辑）
   - \`test\` — 测试相关
   - \`perf\` — 性能优化
   - \`ci\` — CI/CD 变更
   - \`build\` — 构建系统或外部依赖变更

3. **描述** 必须用中文，简洁明了（控制在 50 字以内），描述**做了什么**而非怎么做的。
4. 如果改动涉及多个类型，选择**最重要**的那个。
5. **只输出**提交信息本身，不要加引号、不要解释、不要前后缀、不要代码块标记。

## 示例

feat: 新增用户登录功能
fix: 修复订单金额精度丢失问题
refactor: 重构支付模块错误处理逻辑
chore: 升级 TypeScript 至 5.8
docs: 补充 API 接口文档
style: 统一代码缩进格式
test: 新增订单服务单元测试
perf: 优化首页图片加载性能
ci: 新增 GitHub Actions 自动发布流程
build: 移除废弃的 lodash 依赖

## 提交的改动

以下为 git diff --staged 的内容（如果过长可能已截断）：`;

/**
 * Build user message with optional type constraint.
 * If `type` is specified, instruct the LLM to use that exact type.
 */
export function buildUserMessage(diff: string, files: string[], type?: CommitType): string {
  const lines = [diff, "", "---", `涉及文件 (${files.length}):`, ...files.map((f) => `  - ${f}`)];

  if (type) {
    lines.unshift(`请使用 \`${type}\` 类型生成提交信息。\n`);
  }

  return lines.join("\n");
}

/** Truncate diff with a note if it exceeds the limit */
export function truncateDiff(diff: string, maxLength: number): { text: string; truncated: boolean } {
  if (diff.length <= maxLength) {
    return { text: diff, truncated: false };
  }
  const truncated = diff.slice(0, maxLength);
  return {
    text: truncated + `\n\n[注意：diff 内容过长，已截断至 ${maxLength} 字符。请基于可见部分分析。]`,
    truncated: true,
  };
}

/**
 * Check if a file path matches any excluded pattern (lockfiles, minified, etc.)
 */
export function isExcludedFile(filePath: string): boolean {
  const basename = filePath.split("/").pop() ?? filePath;
  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(basename));
}

/**
 * Filter out lockfile/minified file sections from the diff text.
 * Git diff sections are delimited by "diff --git a/..." headers.
 */
export function filterLockfileDiff(diff: string): string {
  // Split by diff --git headers, keeping the delimiter
  const sections = diff.split(/\n(?=diff --git a\/)/);
  return sections
    .filter((section) => {
      const match = section.match(/^diff --git a\/(.+) b\//);
      if (!match) return true; // keep non-diff text
      const filePath = match[1];
      return !isExcludedFile(filePath);
    })
    .join("\n");
}
