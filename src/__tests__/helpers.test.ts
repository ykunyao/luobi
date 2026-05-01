import { describe, it, expect, vi } from "vitest";
import { validateType, maskKey } from "../helpers.js";

describe("validateType", () => {
  it("returns undefined for undefined input", () => {
    expect(validateType(undefined)).toBeUndefined();
  });

  it("returns feat for 'feat'", () => {
    expect(validateType("feat")).toBe("feat");
  });

  it("returns fix for 'FIX' (case insensitive)", () => {
    expect(validateType("FIX")).toBe("fix");
  });

  it("returns chore for 'chore'", () => {
    expect(validateType("chore")).toBe("chore");
  });

  it("returns refactor for 'refactor'", () => {
    expect(validateType("refactor")).toBe("refactor");
  });

  it("returns docs for 'docs'", () => {
    expect(validateType("docs")).toBe("docs");
  });

  it("returns test for 'test'", () => {
    expect(validateType("test")).toBe("test");
  });

  it("exits for invalid type", () => {
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const mockConsole = vi
      .spyOn(console, "log")
      .mockImplementation(() => {});

    validateType("invalid-type");

    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockConsole.mockRestore();
  });
});

describe("maskKey", () => {
  it("masks a normal key showing prefix and suffix", () => {
    const key = "sk-abcdefghij1234567890xyz";
    const masked = maskKey(key);
    expect(masked).toBe("sk-abc...0xyz");
    expect(masked.length).toBeLessThan(key.length);
    expect(masked).toContain("...");
  });

  it("returns '***' for keys shorter than 8 characters", () => {
    expect(maskKey("short")).toBe("***");
    expect(maskKey("1234567")).toBe("***");
  });

  it("returns '***' for exactly 8 character keys", () => {
    // length 8 → <= 8 → "***"
    expect(maskKey("12345678")).toBe("***");
  });

  it("works for a 9-character key", () => {
    const masked = maskKey("123456789");
    expect(masked).toBe("123456...6789");
  });
});
