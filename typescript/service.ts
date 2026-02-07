import {
  ChannelType,
  type Character,
  type Content,
  createUniqueUuid,
  EventType,
  type IAgentRuntime,
  type Memory,
  MemoryType,
  Role,
  Service,
  stringToUuid,
  type TargetInfo,
  type UUID,
  logger,
} from "@elizaos/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import * as fs from "fs";
import bs58 from "bs58";

import { IQ_SERVICE_NAME, DB_ROOT_NAME, CHATROOM_PREFIX, URLS, AUTONOMY_DEFAULTS, MESSAGE_LIMITS } from "./constants";
import { getIQSettings, validateIQSettings } from "./environment";
import {
  type IQSettings,
  type IQMessage,
  type IQChatroom,
  type MoltbookPost,
  type MoltbookComment,
  type IIQService,
  IQEventTypes,
} from "./types";

// Note: iqlabs-sdk is imported dynamically to handle optional dependency
// If not available, the service will fall back to read-only mode via gateway

/**
 * SHA-256 hash helper
 */
function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

// IQLabs SDK type (when available)
interface IQLabsSDK {
  contract: {
    getProgramId(): PublicKey;
    getDbRootPda(dbRootId: Buffer, programId: PublicKey): PublicKey;
    getTablePda(dbRootPda: PublicKey, tableSeed: Buffer, programId: PublicKey): PublicKey;
  };
  writer: {
    writeRow(
      connection: Connection,
      keypair: Keypair,
      dbRootId: Buffer,
      tableSeed: Buffer,
      data: string
    ): Promise<string>;
  };
  reader: {
    readTableRows(tablePda: PublicKey, options: { limit: number }): Promise<IQMessage[]>;
  };
}

/**
 * IQService - On-chain chat service for the IQ network
 *
 * Connects to ALL configured chatrooms simultaneously (like Discord channels).
 * Messages are targeted to specific chatrooms - no need to "switch" between them.
 * Each chatroom maps to a separate on-chain Solana table.
 */
export class IQService extends Service implements IIQService {
  static serviceType: string = IQ_SERVICE_NAME;
  capabilityDescription =
    "The agent can send and receive on-chain messages on IQ across all connected chatrooms, post on Moltbook, and inscribe data to Solana";

  private settings: IQSettings;
  private connection: Connection | null = null;
  private keypair: Keypair | null = null;
  private iqlabs: IQLabsSDK | null = null;
  private sdkAvailable = false;

  // On-chain database configuration
  private dbRootId: Buffer | null = null;
  private programId: PublicKey | null = null;
  private dbRootPda: PublicKey | null = null;

  // Multi-chatroom: connected chatrooms keyed by lowercase name
  private chatrooms: Map<string, IQChatroom> = new Map();

  // Message tracking (across all chatrooms)
  private seenMessages: Set<string> = new Set();
  private memory: string[] = [];

  // Autonomy loop
  private autonomyRunning = false;
  private autonomyStepCount = 0;
  private autonomyTimeout: ReturnType<typeof setTimeout> | null = null;

  character: Character;

  constructor(protected runtime: IAgentRuntime) {
    super();
    this.settings = getIQSettings(runtime);
    this.character = runtime.character;
  }

  /**
   * Static factory method to create and initialize the service
   */
  static async start(runtime: IAgentRuntime): Promise<IQService> {
    const service = new IQService(runtime);
    await service.initialize();
    return service;
  }

  /**
   * Initialize the IQ service
   */
  private async initialize(): Promise<void> {
    this.runtime.logger.info("IQService.initialize() called");
    this.runtime.logger.info(`Settings: privateKey=${this.settings.privateKey ? "[set]" : "[not set]"}, keypairPath=${this.settings.keypairPath || "[not set]"}`);

    const validation = validateIQSettings(this.settings);
    if (!validation.valid) {
      this.runtime.logger.warn(
        `IQ service not starting: ${validation.errors.join(", ")}`
      );
      throw new Error(`IQ service validation failed: ${validation.errors.join(", ")}`);
    }

    this.runtime.logger.info("Validation passed, proceeding with initialization");

    try {
      // Import iqlabs-sdk dynamically
      try {
        this.iqlabs = await import("iqlabs-sdk").then((m) => m.default || m) as IQLabsSDK;
        this.sdkAvailable = true;
        this.runtime.logger.info("iqlabs-sdk loaded - full write capability enabled");
      } catch {
        this.runtime.logger.warn(
          "iqlabs-sdk not available - running in read-only mode via gateway API"
        );
        this.runtime.logger.warn(
          "To enable write capability, install iqlabs-sdk: link:path/to/iqlabs-solana-sdk"
        );
        this.sdkAvailable = false;
      }

      // Initialize Solana connection
      this.connection = new Connection(this.settings.rpcUrl, "confirmed");

      // Load keypair from private key (base58) or keypair file
      if (this.settings.privateKey) {
        try {
          const secretKey = bs58.decode(this.settings.privateKey);
          this.keypair = Keypair.fromSecretKey(secretKey);
          this.runtime.logger.info("Loaded keypair from SOLANA_PRIVATE_KEY");
        } catch (e) {
          this.runtime.logger.error(`Invalid SOLANA_PRIVATE_KEY format: ${e}`);
          throw new Error(`Invalid SOLANA_PRIVATE_KEY format: ${e}`);
        }
      } else if (this.settings.keypairPath) {
        const keypairPath = this.settings.keypairPath.replace(
          "~",
          process.env.HOME || ""
        );
        
        if (!fs.existsSync(keypairPath)) {
          this.runtime.logger.error(`Keypair file not found at ${keypairPath}`);
          throw new Error(`Keypair file not found at ${keypairPath}`);
        }

        const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
        this.keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
        this.runtime.logger.info(`Loaded keypair from ${keypairPath}`);
      } else {
        this.runtime.logger.error("No keypair configured - SOLANA_PRIVATE_KEY or SOLANA_KEYPAIR_PATH required");
        throw new Error("No keypair configured");
      }

      // Initialize on-chain configuration
      this.dbRootId = sha256(DB_ROOT_NAME);
      
      if (this.sdkAvailable && this.iqlabs) {
        this.programId = this.iqlabs.contract.getProgramId();
        this.dbRootPda = this.iqlabs.contract.getDbRootPda(
          this.dbRootId,
          this.programId
        );
      }

      // Connect to all configured chatrooms
      for (const chatroomName of this.settings.chatrooms) {
        this.ensureChatroom(chatroomName);
      }

      // Check balance (non-blocking)
      let balance = 0;
      try {
        balance = await this.getBalance();
        if (balance < MESSAGE_LIMITS.minSolBalance) {
          this.runtime.logger.warn(
            `Low SOL balance (${balance} SOL). Need at least ${MESSAGE_LIMITS.minSolBalance} SOL for operations.`
          );
        }
      } catch (e) {
        this.runtime.logger.warn(`Could not fetch balance (RPC may be rate limited): ${e}`);
      }

      this.runtime.logger.info(
        `IQ service started for ${this.settings.agentName}`
      );
      this.runtime.logger.info(`Wallet: ${this.getWalletAddress()}`);
      this.runtime.logger.info(`Balance: ${balance > 0 ? balance + " SOL" : "(unknown)"}`);
      this.runtime.logger.info(`Connected chatrooms: ${this.getConnectedChatrooms().join(", ")}`);
      this.runtime.logger.info(`Default chatroom: ${this.settings.defaultChatroom}`);

      // Register send handler - uses target.channelId for chatroom routing
      if (typeof this.runtime.registerSendHandlers === "function") {
        this.runtime.registerSendHandlers([
          {
            sources: ["iq"],
            handler: this.handleSendMessage.bind(this),
          },
        ]);
      }

      // Start autonomy loop if enabled
      if (this.settings.autonomousMode) {
        this.startAutonomyLoop();
      }

      // Start polling all chatrooms for new messages
      this.startMessagePolling();
    } catch (error) {
      this.runtime.logger.error(`Failed to start IQ service: ${error}`);
    }
  }

  /**
   * Stop the IQ service
   */
  async stop(): Promise<void> {
    this.stopAutonomyLoop();
    this.runtime.logger.info("IQ service stopped");
  }

  // ==================== CHATROOM MANAGEMENT ====================

  /**
   * Ensure a chatroom config exists (lazily create if needed).
   * Every chatroom name maps to a unique on-chain table.
   */
  private ensureChatroom(chatroomName: string): IQChatroom {
    const key = chatroomName.toLowerCase();
    const existing = this.chatrooms.get(key);
    if (existing) return existing;

    if (!this.dbRootId) {
      throw new Error("Cannot create chatroom config - service not initialized");
    }

    const tableSeed = sha256(`${CHATROOM_PREFIX}${chatroomName}`);
    let tablePdaStr = "";

    if (this.sdkAvailable && this.iqlabs && this.dbRootPda && this.programId) {
      const tablePda = this.iqlabs.contract.getTablePda(
        this.dbRootPda,
        tableSeed,
        this.programId
      );
      tablePdaStr = tablePda.toBase58();
    }

    const chatroom: IQChatroom = {
      name: chatroomName,
      dbRootId: this.dbRootId,
      tableSeed,
      tablePda: tablePdaStr,
    };

    this.chatrooms.set(key, chatroom);
    this.runtime.logger.info(`Connected to chatroom: ${chatroomName}`);

    this.runtime.emitEvent(IQEventTypes.CHATROOM_CONNECTED as string, {
      chatroom: chatroomName,
      tablePda: tablePdaStr,
    });

    return chatroom;
  }

  /**
   * Resolve a chatroom reference to an exact chatroom name.
   * Supports: exact match, case-insensitive match, fuzzy substring match.
   * If no match, creates a new chatroom with the given name.
   */
  resolveChatroom(ref: string): string {
    if (!ref) return this.settings.defaultChatroom;

    const refLower = ref.toLowerCase().trim();

    // Exact case-insensitive match against connected chatrooms
    for (const [key, chatroom] of this.chatrooms) {
      if (key === refLower) return chatroom.name;
    }

    // Fuzzy substring match
    for (const [key, chatroom] of this.chatrooms) {
      if (key.includes(refLower) || refLower.includes(key)) {
        return chatroom.name;
      }
    }

    // No match found - treat the ref as a new chatroom name and connect to it
    const newChatroom = this.ensureChatroom(ref);
    return newChatroom.name;
  }

  /**
   * Get list of all connected chatroom names
   */
  getConnectedChatrooms(): string[] {
    return Array.from(this.chatrooms.values()).map((c) => c.name);
  }

  /**
   * Get the default chatroom name
   */
  getDefaultChatroom(): string {
    return this.settings.defaultChatroom;
  }

  // ==================== WALLET ====================

  /**
   * Get wallet public key address
   */
  getWalletAddress(): string {
    if (!this.keypair) return "";
    return this.keypair.publicKey.toBase58();
  }

  /**
   * Get SOL balance
   */
  async getBalance(): Promise<number> {
    if (!this.connection || !this.keypair) return 0;
    try {
      const balance = await this.connection.getBalance(this.keypair.publicKey);
      return balance / 1e9;
    } catch {
      return 0;
    }
  }

  // ==================== MESSAGING ====================

  /**
   * Send a message to a chatroom (on-chain).
   * @param content - Message text
   * @param chatroom - Target chatroom name (resolved via fuzzy match). Defaults to default chatroom.
   */
  async sendMessage(content: string, chatroom?: string): Promise<string> {
    if (!this.sdkAvailable || !this.iqlabs) {
      throw new Error(
        "On-chain message sending requires iqlabs-sdk. Install it with: link:path/to/iqlabs-solana-sdk"
      );
    }

    if (!this.connection || !this.keypair) {
      throw new Error("IQ service not initialized");
    }

    // Resolve target chatroom
    const targetName = chatroom ? this.resolveChatroom(chatroom) : this.settings.defaultChatroom;
    const targetChatroom = this.ensureChatroom(targetName);

    const message: IQMessage = {
      id: nanoid(),
      agent: this.settings.agentName,
      wallet: this.keypair.publicKey.toBase58(),
      content,
      timestamp: new Date().toISOString(),
      chatroom: targetName,
    };

    try {
      const txSig = await this.iqlabs.writer.writeRow(
        this.connection,
        this.keypair,
        targetChatroom.dbRootId,
        targetChatroom.tableSeed,
        JSON.stringify(message)
      );

      this.seenMessages.add(message.id);

      // Fire-and-forget PnL tracking
      this.trackTokenCall(content).catch(() => {});

      // Emit event
      this.runtime.emitEvent(IQEventTypes.MESSAGE_SENT as string, {
        message,
        chatroom: targetName,
        txSig,
      });

      this.runtime.logger.debug(`Sent message to ${targetName}: ${txSig}`);
      return txSig;
    } catch (error) {
      this.runtime.logger.error(`Failed to send message to ${targetName}: ${error}`);
      throw error;
    }
  }

  /**
   * Read recent messages from a chatroom.
   * @param limit - Max messages to read
   * @param chatroom - Target chatroom name (resolved via fuzzy match). Defaults to default chatroom.
   */
  async readMessages(limit = MESSAGE_LIMITS.defaultReadLimit, chatroom?: string): Promise<IQMessage[]> {
    const targetName = chatroom ? this.resolveChatroom(chatroom) : this.settings.defaultChatroom;
    const targetChatroom = this.ensureChatroom(targetName);

    // Try the IQ API first (works without SDK)
    try {
      const apiUrl = `${URLS.base}/api/v1/messages?chatroom=${encodeURIComponent(targetName)}&limit=${limit}`;
      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        const messages = (data.messages || []) as IQMessage[];
        return messages.map((m) => ({ ...m, chatroom: targetName }));
      }
    } catch (error) {
      this.runtime.logger.debug(`API read failed for ${targetName}, trying gateway: ${error}`);
    }

    // Try gateway if we have table PDA
    if (targetChatroom.tablePda) {
      try {
        const gatewayUrl = `${this.settings.gatewayUrl}/table/${targetChatroom.tablePda}/rows?limit=${limit}`;
        const response = await fetch(gatewayUrl);
        if (response.ok) {
          const data = await response.json();
          const messages = (data.rows || data || []) as IQMessage[];
          return messages.map((m) => ({ ...m, chatroom: targetName }));
        }
      } catch (error) {
        this.runtime.logger.debug(`Gateway read failed for ${targetName}: ${error}`);
      }
    }

    // Fallback to direct on-chain read if SDK available
    if (this.sdkAvailable && this.iqlabs && targetChatroom.tablePda) {
      try {
        const tablePda = new PublicKey(targetChatroom.tablePda);
        const rows = await this.iqlabs.reader.readTableRows(tablePda, { limit });
        return (rows as IQMessage[]).map((m) => ({ ...m, chatroom: targetName }));
      } catch (error) {
        this.runtime.logger.error(`Direct on-chain read failed for ${targetName}: ${error}`);
      }
    }

    return [];
  }

  // ==================== MOLTBOOK ====================

  /**
   * Post to Moltbook
   */
  async moltbookPost(submolt: string, title: string, content: string): Promise<string> {
    if (!this.settings.moltbookToken) {
      throw new Error("MOLTBOOK_TOKEN not set");
    }

    try {
      const response = await fetch(`${URLS.moltbook}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.moltbookToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ submolt, title, content }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || JSON.stringify(data));
      }

      this.runtime.emitEvent(IQEventTypes.MOLTBOOK_POST_CREATED as string, {
        postId: data.post?.id,
        submolt,
        title,
      });

      return data.post?.id || "success";
    } catch (error) {
      this.runtime.logger.error(`Failed to post to Moltbook: ${error}`);
      throw error;
    }
  }

  /**
   * Browse Moltbook posts
   */
  async moltbookBrowse(submolt?: string, sort = "hot"): Promise<MoltbookPost[]> {
    try {
      const url = submolt
        ? `${URLS.moltbook}/submolts/${submolt}/feed?sort=${sort}&limit=10`
        : `${URLS.moltbook}/posts?sort=${sort}&limit=10`;

      const response = await fetch(url);
      const data = await response.json();
      return (data.posts || []) as MoltbookPost[];
    } catch (error) {
      this.runtime.logger.error(`Failed to browse Moltbook: ${error}`);
      return [];
    }
  }

  /**
   * Comment on a Moltbook post
   */
  async moltbookComment(postId: string, content: string): Promise<string> {
    if (!this.settings.moltbookToken) {
      throw new Error("MOLTBOOK_TOKEN not set");
    }

    try {
      const response = await fetch(`${URLS.moltbook}/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.moltbookToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(JSON.stringify(data));
      }

      this.runtime.emitEvent(IQEventTypes.MOLTBOOK_COMMENT_CREATED as string, {
        commentId: data.id,
        postId,
      });

      return data.id || "success";
    } catch (error) {
      this.runtime.logger.error(`Failed to comment on Moltbook: ${error}`);
      throw error;
    }
  }

  /**
   * Reply to a Moltbook comment
   */
  async moltbookReply(postId: string, parentId: string, content: string): Promise<string> {
    if (!this.settings.moltbookToken) {
      throw new Error("MOLTBOOK_TOKEN not set");
    }

    try {
      const response = await fetch(`${URLS.moltbook}/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.moltbookToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content, parent_id: parentId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(JSON.stringify(data));
      }

      return data.id || "success";
    } catch (error) {
      this.runtime.logger.error(`Failed to reply on Moltbook: ${error}`);
      throw error;
    }
  }

  /**
   * Read a Moltbook post with comments
   */
  async moltbookReadPost(
    postId: string
  ): Promise<{ post: MoltbookPost; comments: MoltbookComment[] }> {
    try {
      const response = await fetch(`${URLS.moltbook}/posts/${postId}`);
      const data = await response.json();

      if (!data.post) {
        throw new Error("Post not found");
      }

      return {
        post: data.post as MoltbookPost,
        comments: (data.comments || []) as MoltbookComment[],
      };
    } catch (error) {
      this.runtime.logger.error(`Failed to read Moltbook post: ${error}`);
      throw error;
    }
  }

  // ==================== DATA INSCRIPTION ====================

  /**
   * Inscribe arbitrary data to Solana
   */
  async inscribeData(data: string, table: string): Promise<string> {
    if (!this.sdkAvailable || !this.iqlabs) {
      throw new Error(
        "On-chain data inscription requires iqlabs-sdk. Install it with: link:path/to/iqlabs-solana-sdk"
      );
    }

    if (!this.connection || !this.keypair || !this.dbRootId) {
      throw new Error("IQ service not initialized");
    }

    try {
      const tableSeed = sha256(table);
      const txSig = await this.iqlabs.writer.writeRow(
        this.connection,
        this.keypair,
        this.dbRootId,
        tableSeed,
        data
      );

      this.runtime.emitEvent(IQEventTypes.DATA_INSCRIBED as string, {
        table,
        txSig,
      });

      return txSig;
    } catch (error) {
      this.runtime.logger.error(`Failed to inscribe data: ${error}`);
      throw error;
    }
  }

  // ==================== INTERNAL HANDLERS ====================

  /**
   * Handle send message from runtime.
   * Uses target.channelId as the chatroom name for routing.
   */
  private async handleSendMessage(
    runtime: IAgentRuntime,
    target: TargetInfo,
    content: Content
  ): Promise<void> {
    if (content.text) {
      // target.channelId carries the chatroom name for IQ
      const chatroom = target.channelId ?? undefined;
      await this.sendMessage(content.text, chatroom);
    }
  }

  /**
   * Track token calls for PnL API
   */
  private async trackTokenCall(message: string): Promise<void> {
    if (!this.settings.pnlApiUrl || !this.keypair) return;

    try {
      await fetch(`${this.settings.pnlApiUrl}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: this.keypair.publicKey.toBase58(),
          message,
        }),
      });
    } catch {
      // Ignore PnL tracking errors
    }
  }

  // ==================== MESSAGE POLLING ====================

  /**
   * Start polling ALL connected chatrooms for new messages
   */
  private startMessagePolling(): void {
    const poll = async () => {
      // Poll each connected chatroom
      for (const [_key, chatroom] of this.chatrooms) {
        try {
          const messages = await this.readMessages(20, chatroom.name);
          
          for (const msg of messages) {
            // Skip messages we've already seen or sent
            if (this.seenMessages.has(msg.id)) continue;
            if (msg.wallet === this.getWalletAddress()) continue;

            this.seenMessages.add(msg.id);

            // Emit event for new message (includes chatroom name)
            this.runtime.emitEvent(IQEventTypes.MESSAGE_RECEIVED as string, {
              message: msg,
              chatroom: chatroom.name,
            });

            // Process through message service if not in autonomous mode
            if (!this.settings.autonomousMode) {
              await this.processIncomingMessage(msg, chatroom.name);
            }
          }
        } catch (error) {
          this.runtime.logger.debug(`Message polling error for ${chatroom.name}: ${error}`);
        }
      }

      // Poll every 5 seconds
      setTimeout(poll, 5000);
    };

    poll();
  }

  /**
   * Process an incoming message through the agent runtime
   */
  private async processIncomingMessage(msg: IQMessage, chatroomName: string): Promise<void> {
    const entityId = createUniqueUuid(this.runtime, msg.wallet);
    // Each chatroom gets its own room ID (like Discord channels)
    const roomId = createUniqueUuid(this.runtime, `iq-${chatroomName}`);

    // Ensure connection exists for this chatroom
    await this.runtime.ensureConnection(
      entityId,
      roomId,
      msg.agent,
      msg.agent,
      "iq"
    );

    const memory: Memory = {
      id: stringToUuid(msg.id) as UUID,
      entityId,
      roomId,
      agentId: this.runtime.agentId,
      content: {
        text: msg.content,
        source: "iq",
        channelType: ChannelType.GROUP,
        // Store chatroom name so actions know where the message came from
        metadata: { chatroom: chatroomName },
      },
      createdAt: new Date(msg.timestamp).getTime(),
    };

    await this.runtime.messageService.handleMessage(this.runtime, memory);
  }

  // ==================== AUTONOMY LOOP ====================

  /**
   * Check if autonomy loop is running
   */
  isAutonomyRunning(): boolean {
    return this.autonomyRunning;
  }

  /**
   * Start the autonomous agent loop
   */
  startAutonomyLoop(): void {
    if (this.autonomyRunning) {
      this.runtime.logger.warn("Autonomy loop already running");
      return;
    }

    this.autonomyRunning = true;
    this.autonomyStepCount = 0;

    this.runtime.emitEvent(IQEventTypes.AUTONOMY_STARTED as string, {
      agentName: this.settings.agentName,
      chatrooms: this.getConnectedChatrooms(),
    });

    this.runtime.logger.info("Autonomy loop started");
    this.runAutonomyStep();
  }

  /**
   * Stop the autonomous agent loop
   */
  stopAutonomyLoop(): void {
    if (!this.autonomyRunning) return;

    this.autonomyRunning = false;
    if (this.autonomyTimeout) {
      clearTimeout(this.autonomyTimeout);
      this.autonomyTimeout = null;
    }

    this.runtime.emitEvent(IQEventTypes.AUTONOMY_STOPPED as string, {
      agentName: this.settings.agentName,
      stepCount: this.autonomyStepCount,
    });

    this.runtime.logger.info("Autonomy loop stopped");
  }

  /**
   * Execute one autonomy step
   */
  private async runAutonomyStep(): Promise<void> {
    if (!this.autonomyRunning) return;

    if (
      this.settings.autonomyMaxSteps &&
      this.autonomyStepCount >= this.settings.autonomyMaxSteps
    ) {
      this.runtime.logger.info(`Reached max autonomy steps (${this.settings.autonomyMaxSteps})`);
      this.stopAutonomyLoop();
      return;
    }

    this.autonomyStepCount++;

    try {
      const roomId = createUniqueUuid(this.runtime, "iq-autonomy");
      const entityId = createUniqueUuid(this.runtime, "autonomy-system");

      // Read recent messages from default chatroom for context
      const recentMessages = await this.readMessages(10);
      const contextText = recentMessages
        .map((m) => `[${m.chatroom || "?"}] ${m.agent}: ${m.content}`)
        .join("\n");

      const chatroomsList = this.getConnectedChatrooms().join(", ");

      const autonomyPrompt = `
You are an autonomous AI agent connected to IQ chat (on-chain, Solana).
You are connected to these chatrooms: ${chatroomsList}

Recent messages:
${contextText || "(no recent messages)"}

Your memory:
${this.memory.slice(-10).join("\n") || "(empty)"}

What action do you want to take? You can:
- Send a message to any chatroom (specify which one)
- Browse or post on Moltbook
- Read messages from any chatroom
- Think about something
- Wait

Respond with your decision and rationale.
      `.trim();

      const memory: Memory = {
        id: stringToUuid(`autonomy-${this.autonomyStepCount}`) as UUID,
        entityId,
        roomId,
        agentId: this.runtime.agentId,
        content: {
          text: autonomyPrompt,
          source: "iq",
          channelType: ChannelType.DM,
          metadata: { isAutonomous: true },
        },
        createdAt: Date.now(),
      };

      const result = await this.runtime.messageService.handleMessage(
        this.runtime,
        memory
      );

      if (result?.responseContent?.text) {
        this.memory.push(`Step ${this.autonomyStepCount}: ${result.responseContent.text.slice(0, 200)}`);
      }

      this.runtime.emitEvent(IQEventTypes.AUTONOMY_STEP_COMPLETED as string, {
        stepNumber: this.autonomyStepCount,
        action: "think",
        result: result?.responseContent?.text?.slice(0, 100) || "no response",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.runtime.logger.error(`Autonomy step error: ${error}`);
    }

    if (this.autonomyRunning) {
      const delay =
        AUTONOMY_DEFAULTS.minIntervalMs +
        Math.random() * (AUTONOMY_DEFAULTS.maxIntervalMs - AUTONOMY_DEFAULTS.minIntervalMs);
      
      this.autonomyTimeout = setTimeout(() => this.runAutonomyStep(), delay);
    }
  }

  /**
   * Add a thought to memory
   */
  addThought(thought: string): void {
    this.memory.push(thought);
    if (this.memory.length > 100) {
      this.memory = this.memory.slice(-50);
    }
  }
}
