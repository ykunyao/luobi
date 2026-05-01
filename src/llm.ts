import OpenAI from "openai";
import type { LuobiConfig, CommitMessageResult, CommitType } from "./types.js";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt.js";

/**
 * Call the LLM to generate a commit message based on the staged diff.
 *
 * @param config  The user's API configuration
 * @param diff    The full or truncated staged diff text
 * @param files   The list of staged files (for additional context)
 * @param type    Optional: force a specific Conventional Commits type
 * @param scope   Optional: add a scope to the Conventional Commits format
 * @returns       The generated commit message
 */
export async function generateCommitMessage(
  config: LuobiConfig,
  diff: string,
  files: string[],
  type?: CommitType,
  scope?: string,
): Promise<CommitMessageResult> {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: 20000, // 20-second timeout
    maxRetries: 1,
  });

  const userMessage = buildUserMessage(diff, files, type, scope);

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 200,
      top_p: 0.95,
    });

    const content = response.choices[0]?.message?.content;
    if (!content || content.trim() === "") {
      throw new Error("LLM 返回了空内容，请重试");
    }

    // Clean up: remove quotes, backticks, leading/trailing whitespace
    let message = content.trim();
    // Remove surrounding backticks (code block markers)
    message = message.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "");
    // Remove surrounding quotes
    message = message.replace(/^["']/, "").replace(/["']$/, "");
    // Remove any leading "commit message:" or similar prefixes
    message = message.replace(/^(commit message|提交信息|commit)[：:]\s*/i, "");
    message = message.trim();

    if (!message) {
      throw new Error("LLM 返回的内容无法解析，请重试");
    }

    return { message, truncated: false };
  } catch (error: unknown) {
    // Handle connection/network errors
    if (error instanceof OpenAI.APIConnectionError) {
      throw new Error(`无法连接到 API 服务器 (${config.baseUrl})，请检查网络和 API 地址`);
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new Error("API 请求超时，请检查网络或稍后重试");
    }
    // Re-throw OpenAI-specific errors with user-friendly messages
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        throw new Error("API Key 无效，请检查配置 (~/.luobi/config.json)");
      }
      if (error.status === 429) {
        throw new Error("API 请求频率过高，请稍后重试");
      }
      if (error.status === 404) {
        throw new Error(`模型 "${config.model}" 不存在，请检查模型名称`);
      }
      throw new Error(`API 错误 (${error.status}): ${error.message}`);
    }
    throw error;
  }
}
