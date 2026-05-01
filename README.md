# 落笔 (luobi)

> AI 驱动的 Git 提交信息助手

只需 `git add` → `lb`，AI 自动分析暂存区改动，生成符合 Conventional Commits 规范的中文提交信息，预览确认后一键提交。

## 安装

```bash
cd luobi
npm install
npm run build
npm link
```

## 使用

```bash
# 1. 像往常一样暂存改动
git add src/foo.ts

# 2. 运行落笔
lb

# 3. AI 分析 diff，生成中文提交信息
#    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#    📝 提交信息:  feat: 新增用户登录功能
#    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#    确认提交? (y/n)

# 4. 确认后自动提交！
```

## 命令

| 命令 | 说明 |
|------|------|
| `lb` | 生成提交信息并提交 |
| `luobi` | 同 `lb` |
| `lb --dry-run` | 仅预览提交信息，不实际提交 |
| `lb --amend` | 修改上一次提交的信息 |
| `lb --push` | 提交后自动推送到远程仓库 |

## 配置

首次运行时会引导你配置 API：

```bash
lb
# 🔧  首次使用落笔，需要配置 API 信息
# 📝 请输入 API Key: sk-xxx...
# 🤖 模型名称 (默认 gpt-4o-mini):
# 🌐 API 地址 (默认 https://api.openai.com/v1):
```

配置文件保存在 `~/.luobi/config.json`：

```json
{
  "apiKey": "sk-xxx...",
  "model": "gpt-4o-mini",
  "baseUrl": "https://api.openai.com/v1"
}
```

修改配置可以直接编辑该文件。

## 支持的 API

落笔使用 OpenAI 兼容的 Chat Completions API，支持：

- **OpenAI** — 默认，使用 gpt-4o-mini
- **DeepSeek** — `baseUrl: "https://api.deepseek.com/v1"`
- **Anthropic** — 通过兼容网关
- **任何兼容 OpenAI API 的服务** — 只需配置 baseUrl 和 model

## 提交信息格式

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范，类型包括：

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `refactor` | 代码重构 |
| `chore` | 杂项（依赖、构建、工具） |
| `docs` | 文档 |
| `style` | 代码风格 |
| `test` | 测试 |
| `perf` | 性能优化 |
| `ci` | CI/CD |
| `build` | 构建系统 |

描述使用中文，控制在 50 字以内。

## 技术栈

- TypeScript + tsup 打包
- commander — CLI 框架
- chalk — 彩色输出
- ora — 加载动画
- execa — Git 命令执行
- openai — LLM API 调用
