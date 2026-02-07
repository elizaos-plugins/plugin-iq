import type { UUID } from "@elizaos/core";

/**
 * IQ service settings from environment/character config
 */
export interface IQSettings {
  /** Solana RPC URL */
  rpcUrl: string;
  /** Path to Solana keypair JSON file (optional if privateKey is set) */
  keypairPath?: string;
  /** Solana private key in base58 format (optional if keypairPath is set) */
  privateKey?: string;
  /** Agent display name in chat */
  agentName: string;
  /** Default chatroom (used when no target is specified) */
  defaultChatroom: string;
  /** Chatrooms to connect to and poll on startup (comma-separated names) */
  chatrooms: string[];
  /** LLM API key (OpenRouter) */
  llmApiKey?: string;
  /** LLM base URL */
  llmBaseUrl?: string;
  /** LLM model identifier */
  model?: string;
  /** Moltbook API token for social engagement */
  moltbookToken?: string;
  /** Agent personality/system prompt extension */
  personality?: string;
  /** PnL API URL for token call tracking */
  pnlApiUrl?: string;
  /** Gateway URL for reading on-chain data */
  gatewayUrl?: string;
  /** Autonomy loop interval in ms */
  autonomyIntervalMs?: number;
  /** Maximum autonomy steps before stopping */
  autonomyMaxSteps?: number;
  /** Whether to run in autonomous mode */
  autonomousMode?: boolean;
}

/**
 * On-chain message structure
 */
export interface IQMessage {
  /** Unique message ID (nanoid) */
  id: string;
  /** Agent/user display name */
  agent: string;
  /** Solana wallet address of sender */
  wallet: string;
  /** Message content */
  content: string;
  /** ISO timestamp */
  timestamp: string;
  /** Chatroom this message belongs to (set during polling) */
  chatroom?: string;
  /** Optional media transaction signature */
  media_tx?: string;
  /** Transaction signature (set by gateway) */
  tx_sig?: string;
}

/**
 * Chatroom configuration (on-chain table mapping)
 */
export interface IQChatroom {
  /** Chatroom name */
  name: string;
  /** Database root ID (sha256 hash) */
  dbRootId: Buffer;
  /** Table seed (sha256 hash) */
  tableSeed: Buffer;
  /** Table PDA on Solana */
  tablePda: string;
}

/**
 * Moltbook post structure
 */
export interface MoltbookPost {
  id: string;
  title: string;
  content?: string;
  body?: string;
  submolt?: { name: string };
  author?: { name: string };
  upvotes?: number;
  comment_count?: number;
  created_at?: string;
}

/**
 * Moltbook comment structure
 */
export interface MoltbookComment {
  id: string;
  content: string;
  author?: { name: string };
  created_at?: string;
  parent_id?: string;
}

/**
 * Event types emitted by the IQ service
 */
export const IQEventTypes = {
  MESSAGE_RECEIVED: "iq.message.received",
  MESSAGE_SENT: "iq.message.sent",
  CHATROOM_CONNECTED: "iq.chatroom.connected",
  MOLTBOOK_POST_CREATED: "iq.moltbook.post.created",
  MOLTBOOK_COMMENT_CREATED: "iq.moltbook.comment.created",
  AUTONOMY_STEP_COMPLETED: "iq.autonomy.step.completed",
  AUTONOMY_STARTED: "iq.autonomy.started",
  AUTONOMY_STOPPED: "iq.autonomy.stopped",
  DATA_INSCRIBED: "iq.data.inscribed",
} as const;

export type IQEventType = (typeof IQEventTypes)[keyof typeof IQEventTypes];

/**
 * Payload for message events
 */
export interface IQMessagePayload {
  message: IQMessage;
  chatroom: string;
  txSig?: string;
}

/**
 * Payload for autonomy step events
 */
export interface IQAutonomyStepPayload {
  stepNumber: number;
  action: string;
  result: string;
  timestamp: string;
}

/**
 * IIQService interface for type-safe service access
 */
export interface IIQService {
  /** Service type identifier */
  readonly serviceType: string;
  /** Send a message to a chatroom (target resolved by name/fuzzy match, defaults to default chatroom) */
  sendMessage(content: string, chatroom?: string): Promise<string>;
  /** Read recent messages from a chatroom (defaults to default chatroom) */
  readMessages(limit?: number, chatroom?: string): Promise<IQMessage[]>;
  /** Get list of connected chatroom names */
  getConnectedChatrooms(): string[];
  /** Get the default chatroom name */
  getDefaultChatroom(): string;
  /** Resolve a chatroom reference (name, fuzzy match) to an exact chatroom name */
  resolveChatroom(ref: string): string;
  /** Post to Moltbook */
  moltbookPost(submolt: string, title: string, content: string): Promise<string>;
  /** Browse Moltbook posts */
  moltbookBrowse(submolt?: string, sort?: string): Promise<MoltbookPost[]>;
  /** Comment on a Moltbook post */
  moltbookComment(postId: string, content: string): Promise<string>;
  /** Reply to a Moltbook comment */
  moltbookReply(postId: string, parentId: string, content: string): Promise<string>;
  /** Read a Moltbook post with comments */
  moltbookReadPost(postId: string): Promise<{ post: MoltbookPost; comments: MoltbookComment[] }>;
  /** Inscribe data permanently on Solana */
  inscribeData(data: string, table: string): Promise<string>;
  /** Get wallet public key */
  getWalletAddress(): string;
  /** Get SOL balance */
  getBalance(): Promise<number>;
  /** Start autonomous loop */
  startAutonomyLoop(): void;
  /** Stop autonomous loop */
  stopAutonomyLoop(): void;
  /** Check if autonomy is running */
  isAutonomyRunning(): boolean;
}
