import chalk from "chalk";
import { COMMIT_TYPES, type CommitType } from "./types.js";

/**
 * Simple readline confirmation prompt.
 * Returns true if user enters 'y' or 'Y'.
 * Falls back gracefully when not in a TTY (e.g., piped input).
 */
export function confirmAction(prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Not a TTY — can't do interactive confirm. Auto-reject safely.
    if (!process.stdin.isTTY) {
      console.log(
        chalk.yellow(`\n⚠  非交互终端，无法确认。请使用 -y 跳过确认`),
      );
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

/**
 * Interactive message editing prompt.
 * Shows: "回车确认，输入新内容可修改，Ctrl+C 取消"
 * - Empty input + Enter → returns the original AI message
 * - User types something + Enter → returns the user's custom message
 * - Ctrl+C → returns null (cancelled)
 */
export function editMessage(aiMessage: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve(aiMessage);
      return;
    }

    const { stdin, stdout } = process;

    const onSigInt = () => {
      process.off("SIGINT", onSigInt);
      stdin.setRawMode(false);
      stdin.resume();
      stdout.write("\n");
      resolve(null);
    };
    process.once("SIGINT", onSigInt);

    stdout.write(
      "\n" + chalk.dim("回车确认，输入新内容可修改，Ctrl+C 取消") + "\n> ",
    );

    stdin.setRawMode(true);
    stdin.resume();

    let input = "";

    const onData = (data: Buffer) => {
      const str = data.toString();

      if (str === "\r" || str === "\n") {
        // Enter pressed
        stdin.removeListener("data", onData);
        stdin.setRawMode(false);
        stdin.pause();
        process.off("SIGINT", onSigInt);
        stdout.write("\n");
        resolve(input.trim() === "" ? aiMessage : input.trim());
      } else if (str === "\u0003") {
        // Ctrl+C
        onSigInt();
      } else if (str === "\b" || str === "\x7f") {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          stdout.write("\b \b");
        }
      } else if (str.charCodeAt(0) >= 32) {
        // Printable character
        input += str;
        stdout.write(str);
      }
      // Ignore other control characters
    };

    stdin.on("data", onData);
  });
}

/** Validate --type option returns a valid CommitType or undefined */
export function validateType(type?: string): CommitType | undefined {
  if (!type) return undefined;
  const t = type.toLowerCase();
  if (!(COMMIT_TYPES as readonly string[]).includes(t)) {
    console.log(chalk.red(`\n✗ 无效的提交类型: "${type}"`));
    console.log(chalk.dim(`  可选类型: ${COMMIT_TYPES.join(", ")}`));
    process.exit(1);
  }
  return t as CommitType;
}

/** Mask API key for display: sk-...xxxx */
export function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

/** Mask value for set command display — hide full API key */
export function maskValue(field: string, value: string): string {
  if (field === "apiKey") return maskKey(value);
  return value;
}
