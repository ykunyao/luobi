import { Command } from "commander";
import chalk from "chalk";

import { readConfig, updateConfigField, resetConfig } from "./config.js";
import { maskKey, maskValue, confirmAction } from "./helpers.js";
import { run } from "./flow.js";

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
  .option("--scope <scope>", "指定影响范围，格式 type(scope): description")
  .option("-v, --verbose", "打印发送给 AI 的提示词内容")
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
      console.log(
        chalk.yellow("⚠ 尚未配置，请先运行 lb 进行首次配置"),
      );
      process.exit(0);
    }
    console.log("");
    console.log(chalk.bold("落笔配置:"));
    console.log(chalk.dim("─".repeat(40)));
    console.log(`  API Key   ${chalk.dim(":")} ${maskKey(config.apiKey)}`);
    console.log(
      `  模型      ${chalk.dim(":")} ${chalk.cyan(config.model)}`,
    );
    console.log(
      `  API 地址  ${chalk.dim(":")} ${chalk.cyan(config.baseUrl)}`,
    );
    console.log(chalk.dim("─".repeat(40)));
    console.log("");
  });

configCmd
  .command("set <field> <value>")
  .description("修改配置项（key/model/url）")
  .action((field: string, value: string) => {
    const fieldMap: Record<
      string,
      keyof import("./types.js").LuobiConfig
    > = {
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
      console.log(
        chalk.green(`✔ 已更新 ${mapped}: ${maskValue(mapped, value)}`),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`✗ ${msg}`));
      process.exit(1);
    }
  });

configCmd
  .command("reset")
  .description("重置配置文件（删除 ~/.luobi/config.json）")
  .action(async () => {
    const confirmed = await confirmAction(
      "确认删除配置文件 ~/.luobi/config.json？(y/n) ",
    );
    if (confirmed) {
      try {
        resetConfig();
        console.log(chalk.green("✔ 配置文件已删除"));
      } catch {
        console.log(chalk.yellow("⚠ 配置文件不存在，无需重置"));
      }
    } else {
      console.log(chalk.yellow("已取消"));
    }
  });

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
