import chalk from "chalk";
import ora from "ora";

import { getConfig } from "./config.js";
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
import {
  truncateDiff,
  filterLockfileDiff,
  isExcludedFile,
  buildUserMessage,
  SYSTEM_PROMPT,
} from "./prompt.js";
import {
  confirmAction,
  validateType,
  editMessage,
} from "./helpers.js";
import { MAX_DIFF_LENGTH, type CommitType } from "./types.js";

export interface RunOptions {
  dryRun: boolean;
  amend: boolean;
  push: boolean;
  yes: boolean;
  type?: string;
  scope?: string;
  verbose: boolean;
}

export async function run(options: RunOptions) {
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
  let lockfileOnly = false;
  if (excludedFiles.length > 0) {
    spinner.text = "读取暂存区改动（已过滤 lockfile）…";
    diff = filterLockfileDiff(diff);
    // Check if filtered diff is empty or near-empty (all changes were lockfiles)
    if (!diff.trim() || diff.trim().length < 10) {
      lockfileOnly = true;
    } else {
      console.log(
        chalk.dim(
          `  已自动跳过 ${excludedFiles.length} 个文件: ${excludedFiles.slice(0, 3).join(", ")}${excludedFiles.length > 3 ? " ..." : ""}`,
        ),
      );
    }
  }
  spinner.succeed(`读取到 ${chalk.cyan(files.length)} 个暂存文件`);

  // If all changes are in lockfiles, ask user if they still want to commit
  let result: { message: string; truncated: boolean };
  if (lockfileOnly) {
    console.log(
      chalk.yellow(
        "\n⚠ 暂存区所有改动均在锁文件中，已自动跳过。",
      ),
    );
    const stillCommit = await confirmAction("是否仍要提交？(y/n) ");
    if (!stillCommit) {
      console.log(chalk.yellow("\n🚫 已取消，未提交"));
      process.exit(0);
    }
    result = { message: "chore: 更新依赖锁文件", truncated: false };
  } else {
    // 3. Get git status for context
    const status = await getStatus();

    // 4. Truncate diff if necessary
    const { text: diffToSend, truncated } = truncateDiff(diff, MAX_DIFF_LENGTH);
    if (truncated) {
      console.log(
        chalk.yellow(
          `⚠  暂存内容较大（${diff.length} 字符），已截断至 ${MAX_DIFF_LENGTH} 字符发送给 AI`,
        ),
      );
    }

    // 5. Load config
    const config = await getConfig();

    // 6. Verbose output (if enabled)
    if (options.verbose) {
      const userMsgPreview = buildUserMessage(
        diffToSend,
        files,
        commitType,
        options.scope,
      );
      console.log(chalk.dim("\n[verbose] SYSTEM_PROMPT:"));
      console.log(
        chalk.dim(
          SYSTEM_PROMPT.slice(0, 500) +
            (SYSTEM_PROMPT.length > 500 ? "…" : ""),
        ),
      );
      console.log(chalk.dim("\n[verbose] User Message (diff truncated to 500 chars for readability):"));
      console.log(
        chalk.dim(
          userMsgPreview.slice(0, 500) +
            (userMsgPreview.length > 500 ? "…" : ""),
        ),
      );
    }

    // 7. Call LLM
    const aiSpinner = ora({
      text: `正在调用 ${config.model} 生成提交信息…`,
      color: "cyan",
    }).start();

    try {
      result = await generateCommitMessage(
        config,
        diffToSend,
        files,
        commitType,
        options.scope,
      );
      aiSpinner.succeed("提交信息已生成");
    } catch (error: unknown) {
      aiSpinner.fail("AI 生成提交信息失败");
      const msg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`   ${msg}`));
      process.exit(1);
    }

    // Verbose: confirm prompt was sent
    if (options.verbose) {
      console.log(chalk.dim("[verbose] 提示词已发送"));
    }
  }

  // 8. Preview the message
  console.log("");
  console.log(chalk.bold("━".repeat(60)));
  console.log("");
  if (commitType) {
    console.log(`  ${chalk.dim("指定类型:")} ${chalk.magenta(commitType)}`);
  }
  if (options.scope) {
    console.log(
      `  ${chalk.dim("指定范围:")} ${chalk.magenta(options.scope)}`,
    );
  }
  console.log(
    `  ${chalk.cyan.bold("📝 提交信息:")}  ${chalk.green(result.message)}`,
  );
  console.log("");
  console.log(
    chalk.dim(
      `  涉及文件: ${files.slice(0, 5).join(", ")}${files.length > 5 ? ` ... 等 ${files.length} 个文件` : ""}`,
    ),
  );
  if (result.truncated) {
    console.log(chalk.yellow("  ⚠  diff 内容已截断，提交信息可能不完整"));
  }
  console.log("");
  console.log(chalk.bold("━".repeat(60)));

  // 9. Handle --dry-run
  if (options.dryRun) {
    console.log("");
    console.log(chalk.cyan("🔍 预览模式 — 未实际提交（使用 --dry-run）"));
    console.log(chalk.dim("   去掉 --dry-run 参数即可正常提交"));
    return;
  }

  // 10. Confirm with interactive edit (skip if --yes)
  let finalMessage: string;
  if (!options.yes) {
    const edited = await editMessage(result.message);
    if (edited === null) {
      // User cancelled with Ctrl+C
      console.log(chalk.yellow("\n🚫 已取消，未提交"));
      process.exit(0);
    }
    finalMessage = edited;
  } else {
    console.log(chalk.dim("\n  (-y 已跳过确认)"));
    finalMessage = result.message;
  }

  // 11. Commit
  const commitSpinner = ora({
    text: options.amend ? "正在修改提交信息…" : "正在提交…",
    color: "green",
  }).start();

  try {
    if (options.amend) {
      await amendCommit(finalMessage);
    } else {
      await commit(finalMessage);
    }

    const hash = await getHeadShortHash();
    commitSpinner.succeed("提交成功！");

    console.log("");
    if (options.amend) {
      console.log(
        `  ${chalk.green("✔")}  提交信息已修改  ${chalk.dim(`[${hash}]`)}`,
      );
    } else {
      console.log(
        `  ${chalk.green("✔")}  提交成功  ${chalk.dim(`[${hash}]`)}`,
      );
    }
    console.log(`  ${chalk.dim("  " + finalMessage)}`);
    console.log("");

    // 12. Push if requested
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
        console.log(
          chalk.yellow(
            "\n💡 提交已成功，但推送失败。可以稍后手动 git push",
          ),
        );
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
