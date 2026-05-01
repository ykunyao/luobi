import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as readline from "node:readline";

import { getConfig, updateConfigField, readConfig } from "./config.js";
import {
  isGitRepo,
  getStagedDiff,
  getStagedFiles,
  getStatus,
  commit,
  amendCommit,
  getHeadShortHash,
  push,
} from "./git.js";
import { generateCommitMessage } from "./llm.js";
import { truncateDiff, filterLockfileDiff, isExcludedFile } from "./prompt.js";
import { MAX_DIFF_LENGTH, COMMIT_TYPES, type CommitType } from "./types.js";

const program = new Command();

program
  .name("lb")
  .alias("luobi")
  .description("落笔 — AI 驱动的 Git 提交信息助手")
  .version("1.0.0")
  .option("--dry-run", "仅预览提交信息，不实际提交", false)
  .option("--amend", "修改上一次提交的信息（git commit --amend）", false)
  .option("--push", "提交后自动推送到远程仓库", false)
  .option("-y, --yes", "跳过确认，直接提交", false)
  .option("--type <type>", "指定提交类型（feat/fix/chore/...）")
  .action(async (options) => {
    try {
      await run(options);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n✗ 错误: ${msg}`));
      process.exit(1);
    }
  });

// ─── Config Subcommand ──────────────────────────────────────────────────────

const configCmd = program
  .command("config")
  .description("查看或修改配置");

configCmd
  .command("show")
  .description("显示当前配置")
  .action(() => {
    const config = readConfig();
    if (!config) {
      console.log(chalk.yellow("⚠ 尚未配置，请先运行 lb 进行首次配置"));
      process.exit(0);
    }
    console.log("");
    console.log(chalk.bold("落笔配置:"));
    console.log(chalk.dim("─".repeat(40)));
    console.log(`  API Key   ${chalk.dim(":")} ${maskKey(config.apiKey)}`);
    console.log(`  模型      ${chalk.dim(":")} ${chalk.cyan(config.model)}`);
    console.log(`  API 地址  ${chalk.dim(":")} ${chalk.cyan(config.baseUrl)}`);
    console.log(chalk.dim("─".repeat(40)));
    console.log("");
  });

configCmd
  .command("set <field> <value>")
  .description("修改配置项（key/model/url）")
  .action((field: string, value: string) => {
    const fieldMap: Record<string, keyof import("./types.js").LuobiConfig> = {
      key: "apiKey",
      apikey: "apiKey",
      model: "model",
      url: "baseUrl",
    };

    const mapped = fieldMap[field.toLowerCase()];
    if (!mapped) {
      console.log(chalk.red(`✗ 未知配置项: ${field}`));
      console.log(chalk.dim("  可用项: key, model, url"));
      process.exit(1);
    }

    try {
      const updated = updateConfigField(mapped, value);
      console.log(chalk.green(`✔ 已更新 ${mapped}: ${maskValue(mapped, value)}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`✗ ${msg}`));
      process.exit(1);
    }
  });

// ─── Main Flow ───────────────────────────────────────────────────────────────

interface RunOptions {
  dryRun: boolean;
  amend: boolean;
  push: boolean;
  yes: boolean;
  type?: string;
}

async function run(options: RunOptions) {
  // Validate --type
  const commitType = validateType(options.type);

  // 1. Check we're in a git repo
  {
    const spinner = ora("检查 Git 仓库…").start();
    const inRepo = await isGitRepo();
    if (!inRepo) {
      spinner.fail("不在 Git 仓库中");
      console.log(chalk.yellow("\n💡 请在 Git 项目目录中运行此命令"));
      process.exit(1);
    }
    spinner.succeed("已确认当前目录是 Git 仓库");
  }

  // 2. Check for staged changes
  const spinner = ora("读取暂存区改动…").start();
  let diff = await getStagedDiff();
  let files = await getStagedFiles();

  // Filter out lockfiles/minified from files list
  const excludedFiles = files.filter(isExcludedFile);
  files = files.filter((f) => !isExcludedFile(f));

  if (!diff || files.length === 0) {
    spinner.fail("暂存区没有改动");
    console.log(chalk.yellow("\n💡 请先用 git add 暂存需要提交的文件"));
    console.log(chalk.dim("   → 运行 git add <file> 或 git add . 来暂存改动"));
    process.exit(0);
  }

  // Filter lockfile sections from diff
  if (excludedFiles.length > 0) {
    spinner.text = "读取暂存区改动（已过滤 lockfile）…";
    diff = filterLockfileDiff(diff);
    console.log(chalk.dim(`  已自动跳过 ${excludedFiles.length} 个文件: ${excludedFiles.slice(0, 3).join(", ")}${excludedFiles.length > 3 ? " ..." : ""}`));
  }
  spinner.succeed(`读取到 ${chalk.cyan(files.length)} 个暂存文件`);

  // 3. Get git status for context
  const status = await getStatus();

  // 4. Truncate diff if necessary
  const { text: diffToSend, truncated } = truncateDiff(diff, MAX_DIFF_LENGTH);
  if (truncated) {
    console.log(chalk.yellow(`⚠  暂存内容较大（${diff.length} 字符），已截断至 ${MAX_DIFF_LENGTH} 字符发送给 AI`));
  }

  // 5. Load config
  const config = await getConfig();

  // 6. Call LLM
  const aiSpinner = ora({
    text: `正在调用 ${config.model} 生成提交信息…`,
    color: "cyan",
  }).start();

  let result;
  try {
    result = await generateCommitMessage(config, diffToSend, files, commitType);
    aiSpinner.succeed("提交信息已生成");
  } catch (error: unknown) {
    aiSpinner.fail("AI 生成提交信息失败");
    const msg = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`   ${msg}`));
    process.exit(1);
  }

  // 7. Preview the message
  console.log("");
  console.log(chalk.bold("━".repeat(60)));
  console.log("");
  if (commitType) {
    console.log(`  ${chalk.dim("指定类型:")} ${chalk.magenta(commitType)}`);
  }
  console.log(`  ${chalk.cyan.bold("📝 提交信息:")}  ${chalk.green(result.message)}`);
  console.log("");
  console.log(chalk.dim(`  涉及文件: ${files.slice(0, 5).join(", ")}${files.length > 5 ? ` ... 等 ${files.length} 个文件` : ""}`));
  if (result.truncated) {
    console.log(chalk.yellow("  ⚠  diff 内容已截断，提交信息可能不完整"));
  }
  console.log("");
  console.log(chalk.bold("━".repeat(60)));

  // 8. Handle --dry-run
  if (options.dryRun) {
    console.log("");
    console.log(chalk.cyan("🔍 预览模式 — 未实际提交（使用 --dry-run）"));
    console.log(chalk.dim("   去掉 --dry-run 参数即可正常提交"));
    return;
  }

  // 9. Confirm with user (skip if --yes)
  if (!options.yes) {
    console.log("");
    const action = options.amend ? "修改上一次提交信息" : "提交";
    const confirmed = await confirmAction(`确认${action}? (y/n) `);

    if (!confirmed) {
      console.log(chalk.yellow("\n🚫 已取消，未提交"));
      process.exit(0);
    }
  } else {
    console.log(chalk.dim("\n  (-y 已跳过确认)"));
  }

  // 10. Commit
  const commitSpinner = ora({
    text: options.amend ? "正在修改提交信息…" : "正在提交…",
    color: "green",
  }).start();

  try {
    if (options.amend) {
      await amendCommit(result.message);
    } else {
      await commit(result.message);
    }

    const hash = await getHeadShortHash();
    commitSpinner.succeed("提交成功！");

    console.log("");
    if (options.amend) {
      console.log(`  ${chalk.green("✔")}  提交信息已修改  ${chalk.dim(`[${hash}]`)}`);
    } else {
      console.log(`  ${chalk.green("✔")}  提交成功  ${chalk.dim(`[${hash}]`)}`);
    }
    console.log(`  ${chalk.dim("  " + result.message)}`);
    console.log("");

    // 11. Push if requested
    if (options.push) {
      const pushSpinner = ora({
        text: "正在推送到远程仓库…",
        color: "green",
      }).start();

      try {
        await push();
        pushSpinner.succeed("推送成功！");
        console.log(`  ${chalk.green("✔")}  已推送至远程仓库`);
        console.log("");
      } catch (error: unknown) {
        pushSpinner.fail("推送失败");
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`   ${msg}`));
        console.log(chalk.yellow("\n💡 提交已成功，但推送失败。可以稍后手动 git push"));
        process.exit(1);
      }
    }
  } catch (error: unknown) {
    commitSpinner.fail("提交失败");
    const msg = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`   ${msg}`));
    process.exit(1);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Validate --type option returns a valid CommitType or undefined */
function validateType(type?: string): CommitType | undefined {
  if (!type) return undefined;
  const t = type.toLowerCase();
  if (!(COMMIT_TYPES as readonly string[]).includes(t)) {
    console.log(chalk.red(`\n✗ 无效的提交类型: "${type}"`));
    console.log(chalk.dim(`  可选类型: ${COMMIT_TYPES.join(", ")}`));
    process.exit(1);
  }
  return t as CommitType;
}

/**
 * Simple readline confirmation prompt.
 * Returns true if user enters 'y' or 'Y'.
 * Falls back gracefully when not in a TTY (e.g., piped input).
 */
function confirmAction(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Not a TTY — can't do interactive confirm. Auto-reject safely.
    if (!process.stdin.isTTY) {
      console.log(chalk.yellow(`\n⚠  非交互终端，无法确认。请使用 -y 跳过确认`));
      resolve(false);
      return;
    }

    const { stdin, stdout } = process;

    // Handle Ctrl+C gracefully — just resolve as false
    const onSigInt = () => {
      process.off("SIGINT", onSigInt);
      stdout.write("\n");
      resolve(false);
    };
    process.once("SIGINT", onSigInt);

    stdout.write(chalk.dim(prompt));

    const onData = (data: Buffer) => {
      const answer = data.toString().trim().toLowerCase();
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.resume();
      process.off("SIGINT", onSigInt);
      stdout.write("\n");
      resolve(answer === "y" || answer === "yes" || answer === "是");
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.once("data", onData);
  });
}

/** Mask API key for display: sk-...xxxx */
function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

/** Mask value for set command display — hide full API key */
function maskValue(field: string, value: string): string {
  if (field === "apiKey") return maskKey(value);
  return value;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

// Global error handler for unhandled rejections — don't show stack traces
process.on("unhandledRejection", (reason: unknown) => {
  console.error(chalk.red("\n✗ 未处理的错误:"));
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error(chalk.red(`  ${msg}`));
  process.exit(1);
});

// Handle Ctrl+C at top level
process.on("SIGINT", () => {
  console.log(chalk.yellow("\n\n👋 已取消"));
  process.exit(0);
});

program.parseAsync().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`\n✗ 错误: ${msg}`));
  process.exit(1);
});
