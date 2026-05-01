import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import type { LuobiConfig } from "./types.js";
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from "./types.js";

/** Path to the config file: ~/.luobi/config.json */
function configFilePath(): string {
  return path.join(os.homedir(), ".luobi", "config.json");
}

/** Ensure the ~/.luobi directory exists */
function ensureConfigDir(): void {
  const dir = path.join(os.homedir(), ".luobi");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Read config from disk. Returns null if file doesn't exist or is invalid. */
export function readConfig(): LuobiConfig | null {
  const filePath = configFilePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    // Validate required fields
    if (typeof parsed.apiKey !== "string" || parsed.apiKey.trim() === "") {
      return null;
    }
    return {
      apiKey: parsed.apiKey,
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : DEFAULT_BASE_URL,
      model: typeof parsed.model === "string" ? parsed.model : DEFAULT_MODEL,
    };
  } catch {
    return null;
  }
}

/** Write config to disk */
export function writeConfig(config: LuobiConfig): void {
  ensureConfigDir();
  const filePath = configFilePath();
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

/** Prompt user for config values interactively using readline. */
export async function promptForConfig(): Promise<LuobiConfig> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });

  console.log("");
  console.log("🔧  首次使用落笔，需要配置 API 信息");
  console.log("");

  let apiKey = "";
  while (!apiKey) {
    apiKey = await question("📝 请输入 API Key: ");
    if (!apiKey) {
      console.log("   ⚠️  API Key 不能为空");
    }
  }

  let model = await question(`🤖 模型名称 (默认 ${DEFAULT_MODEL}): `);
  if (!model) {
    model = DEFAULT_MODEL;
  }

  let baseUrl = await question(`🌐 API 地址 (默认 ${DEFAULT_BASE_URL}): `);
  if (!baseUrl) {
    baseUrl = DEFAULT_BASE_URL;
  }

  rl.close();

  const config: LuobiConfig = { apiKey, model, baseUrl };
  writeConfig(config);
  return config;
}

/** Get config — either read from disk or prompt user interactively. */
export async function getConfig(): Promise<LuobiConfig> {
  const existing = readConfig();
  if (existing) {
    return existing;
  }
  return promptForConfig();
}
