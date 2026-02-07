/**
 * Service name for registration
 */
export const IQ_SERVICE_NAME = "iq";

/**
 * On-chain database root name
 */
export const DB_ROOT_NAME = "iq";

/**
 * Chatroom table prefix
 */
export const CHATROOM_PREFIX = "chatroom:";

/**
 * Default chatroom (when no target specified)
 */
export const DEFAULT_CHATROOM = "General";

/**
 * Default chatrooms to connect to and poll on startup
 */
export const DEFAULT_CHATROOMS = ["General", "Bags App", "Pump Fun"];

/**
 * External service URLs
 */
export const URLS = {
  gateway: "https://gateway.iqlabs.dev",
  base: "https://ai.iqlabs.dev",
  pnl: "https://pnl.iqlabs.dev",
  solanaRpc: "https://api.devnet.solana.com",
  moltbook: "https://www.moltbook.com/api/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

/**
 * Default autonomy settings
 */
export const AUTONOMY_DEFAULTS = {
  /** Interval between autonomy cycles (30-90 seconds random) */
  minIntervalMs: 30000,
  maxIntervalMs: 90000,
  /** Maximum tool calls per cycle */
  maxToolCalls: 5,
  /** Default LLM model */
  defaultModel: "deepseek/deepseek-chat-v3-0324",
} as const;

/**
 * Message limits
 */
export const MESSAGE_LIMITS = {
  /** Default number of messages to read */
  defaultReadLimit: 15,
  /** Maximum message content length */
  maxContentLength: 2000,
  /** Minimum SOL balance required */
  minSolBalance: 0.01,
} as const;
