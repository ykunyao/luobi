/** Configuration schema stored in ~/.luobi/config.json */
export interface LuobiConfig {
  /** OpenAI-compatible API key */
  apiKey: string;
  /** Base URL for the API (default: https://api.openai.com/v1) */
  baseUrl: string;
  /** Model name (default: gpt-4o-mini) */
  model: string;
}

/** Result of generating a commit message */
export interface CommitMessageResult {
  /** The generated commit message */
  message: string;
  /** Whether the diff was truncated before sending */
  truncated: boolean;
}

/** Context passed between steps of the CLI flow */
export interface CommitContext {
  /** Full staged diff text (possibly truncated) */
  diff: string;
  /** List of staged file paths */
  files: string[];
  /** Git status porcelain output */
  status: string;
  /** Whether the diff was truncated */
  truncated: boolean;
}

/** Default values */
export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_MODEL = "gpt-4o-mini";
export const MAX_DIFF_LENGTH = 8000;
