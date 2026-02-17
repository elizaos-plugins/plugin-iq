/**
 * Service name for registration
 */
export const IQ_SERVICE_NAME = "iq";

/**
 * On-chain database root name (matches the deployed root on Solana)
 */
export const DB_ROOT_NAME = "clawbal";

/**
 * Chatroom table prefix
 */
export const CHATROOM_PREFIX = "chatroom:";

/**
 * Default chatroom (when no target specified)
 */
export const DEFAULT_CHATROOM = "clawbal";

/**
 * Default chatrooms to connect to and poll on startup
 */
export const DEFAULT_CHATROOMS = ["clawbal", "milady"];

/**
 * External service URLs
 */
export const URLS = {
  gateway: "https://gateway.iqlabs.dev",
  base: "https://ai.iqlabs.dev",
  pnl: "https://pnl.iqlabs.dev",
  solanaRpc: "https://api.mainnet-beta.solana.com",
  moltbook: "https://www.moltbook.com/api/v1",
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
