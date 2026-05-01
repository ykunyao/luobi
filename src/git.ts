import { execa } from "execa";

/**
 * Run a git command and return stdout as trimmed string.
 * Throws with a user-friendly message on failure.
 */
async function git(args: string[], cwd?: string): Promise<string> {
  try {
    const result = await execa("git", args, { cwd, all: true });
    return result.all?.trim() ?? "";
  } catch (err: unknown) {
    const error = err as Error & { stderr?: string; exitCode?: number };
    const msg = error.stderr ?? error.message ?? String(err);
    throw new Error(`Git 命令失败: git ${args.join(" ")}\n${msg}`);
  }
}

/**
 * Returns true if the current working directory is inside a git repository.
 */
export async function isGitRepo(): Promise<boolean> {
  try {
    await execa("git", ["rev-parse", "--git-dir"], { all: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the full staged diff (git diff --staged or --cached).
 * Returns an empty string if there are no staged changes.
 */
export async function getStagedDiff(): Promise<string> {
  // --staged is preferred, --cached is a fallback (they're synonyms)
  try {
    return await git(["diff", "--staged"]);
  } catch {
    return await git(["diff", "--cached"]);
  }
}

/**
 * Get the list of staged file paths (--name-only).
 */
export async function getStagedFiles(): Promise<string[]> {
  const output = await git(["diff", "--staged", "--name-only"]);
  if (!output) return [];
  return output.split("\n").filter((line) => line.trim() !== "");
}

/**
 * Get short git status (porcelain format) for additional context.
 */
export async function getStatus(): Promise<string> {
  return git(["status", "--porcelain"]);
}

/**
 * Commit staged changes with the given message.
 */
export async function commit(message: string): Promise<string> {
  return git(["commit", "-m", message]);
}

/**
 * Amend the most recent commit with a new message.
 */
export async function amendCommit(message: string): Promise<string> {
  return git(["commit", "--amend", "-m", message]);
}

/**
 * Push current branch to remote.
 */
export async function push(): Promise<string> {
  return git(["push"]);
}

/**
 * Get the short hash (first 7 chars) of HEAD.
 */
export async function getHeadShortHash(): Promise<string> {
  const output = await git(["rev-parse", "--short=7", "HEAD"]);
  return output.trim();
}
