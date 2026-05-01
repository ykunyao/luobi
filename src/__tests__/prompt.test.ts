import { describe, it, expect } from "vitest";
import {
  truncateDiff,
  isExcludedFile,
  filterLockfileDiff,
  buildUserMessage,
} from "../prompt.js";

describe("truncateDiff", () => {
  it("returns diff unchanged when under the limit", () => {
    const diff = "small diff";
    const result = truncateDiff(diff, 100);
    expect(result.text).toBe("small diff");
    expect(result.truncated).toBe(false);
  });

  it("returns diff unchanged when exactly at the limit", () => {
    const diff = "1234567890";
    const result = truncateDiff(diff, 10);
    expect(result.text).toBe("1234567890");
    expect(result.truncated).toBe(false);
  });

  it("truncates diff and adds note when over limit", () => {
    const diff = "1234567890abcdef";
    const result = truncateDiff(diff, 10);
    expect(result.text).toContain("1234567890");
    expect(result.text).toContain("已截断至 10 字符");
    expect(result.truncated).toBe(true);
  });
});

describe("isExcludedFile", () => {
  it("returns true for package-lock.json", () => {
    expect(isExcludedFile("package-lock.json")).toBe(true);
  });

  it("returns true for nested package-lock.json", () => {
    expect(isExcludedFile("subdir/package-lock.json")).toBe(true);
  });

  it("returns true for yarn.lock", () => {
    expect(isExcludedFile("yarn.lock")).toBe(true);
  });

  it("returns true for pnpm-lock.yaml", () => {
    expect(isExcludedFile("pnpm-lock.yaml")).toBe(true);
  });

  it("returns false for normal source file", () => {
    expect(isExcludedFile("src/index.ts")).toBe(false);
  });

  it("returns false for package.json (not a lockfile)", () => {
    expect(isExcludedFile("package.json")).toBe(false);
  });

  it("returns true for .min.js files", () => {
    expect(isExcludedFile("bundle.min.js")).toBe(true);
  });
});

describe("filterLockfileDiff", () => {
  it("removes lockfile sections from diff", () => {
    const diff = [
      "diff --git a/package-lock.json b/package-lock.json",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1,3 +1,3 @@",
      " some changes",
      "diff --git a/src/index.ts b/src/index.ts",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
      "diff --git a/yarn.lock b/yarn.lock",
      "--- a/yarn.lock",
      "+++ b/yarn.lock",
      "@@ -5,1 +5,1 @@",
      " lock change",
    ].join("\n");

    const result = filterLockfileDiff(diff);
    expect(result).toContain("src/index.ts");
    expect(result).not.toContain("package-lock.json");
    expect(result).not.toContain("yarn.lock");
  });

  it("returns original if no lockfiles", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      " some change",
    ].join("\n");

    const result = filterLockfileDiff(diff);
    expect(result).toBe(diff);
  });

  it("handles empty diff", () => {
    const result = filterLockfileDiff("");
    expect(result).toBe("");
  });
});

describe("buildUserMessage", () => {
  const diff = "some diff content";
  const files = ["src/a.ts", "src/b.ts"];

  it("builds message without type or scope", () => {
    const msg = buildUserMessage(diff, files);
    expect(msg).toContain("some diff content");
    expect(msg).toContain("涉及文件 (2)");
    expect(msg).toContain("src/a.ts");
    expect(msg).toContain("src/b.ts");
  });

  it("builds message with type constraint", () => {
    const msg = buildUserMessage(diff, files, "feat");
    expect(msg).toContain('请使用 `feat` 类型生成提交信息');
    expect(msg).toContain("some diff content");
  });

  it("builds message with scope constraint", () => {
    const msg = buildUserMessage(diff, files, undefined, "auth");
    expect(msg).toContain("`(auth):`");
    expect(msg).toContain("标注影响范围");
    expect(msg).toContain("some diff content");
  });

  it("builds message with both type and scope", () => {
    const msg = buildUserMessage(diff, files, "feat", "auth");
    expect(msg).toContain("请使用 `feat(auth):` 格式生成提交信息");
    expect(msg).toContain("some diff content");
  });
});
