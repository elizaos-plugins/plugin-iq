import {
  ChannelType,
  type Character,
  type Content,
  createUniqueUuid,
  type IAgentRuntime,
  type Memory,
  Service,
  stringToUuid,
  type TargetInfo,
  type UUID,
} from "@elizaos/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { nanoid } from "nanoid";
import * as fs from "fs";
import bs58 from "bs58";
import iqlabs from "@iqlabs-official/solana-sdk";

import { IQ_SERVICE_NAME, DB_ROOT_NAME, CHATROOM_PREFIX, URLS, MESSAGE_LIMITS } from "./constants";
import { getIQSettings } from "./environment";
import {
  type IQSettings,
  type IQMessage,
  type IQChatroom,
  type MoltbookPost,
  type MoltbookComment,
  type IIQService,
  IQEventTypes,
} from "./types";

/**
 * SHA-256 hash helper
 */
function sha256(s: string): Uint8Array {
  return createHash("sha256").update(s).digest();
}

/**
 * IQService - On-chain chat service for the IQ network
 *
 * Connects to ALL configured chatrooms simultaneously (like Discord channels).
 * Messages are targeted to specific chatrooms by name.
 * Each chatroom maps to a separate on-chain Solana table.
 *
 * If no Solana wallet is configured, the service will not start.
 * Providers detect this and inform the agent to configure SOLANA_PRIVATE_KEY.
 */
export class IQService extends Service implements IIQService {
  static serviceType: string = IQ_SERVICE_NAME;
  capabilityDescription =
    "The agent can send and receive on-chain messages on IQ across all connected chatrooms, post on Moltbook, and inscribe data to Solana";

  private settings: IQSettings;
  private connection: Connection | null = null;
  private keypair: Keypair | null = null;

  // On-chain database configuration
  private dbRootId: Uint8Array | null = null;
  private dbRootPda: PublicKey | null = null;

  // Multi-chatroom: connected chatrooms keyed by lowercase name
  private chatrooms: Map<string, IQChatroom> = new Map();

  // Message tracking (across all chatrooms)
  private seenMessages: Set<string> = new Set();

  character: Character;

  constructor(protected runtime: IAgentRuntime) {
    super();
    this.settings = getIQSettings(runtime);
    this.character = runtime.character;
  }

  /**
   * Static factory method. If wallet is not configured, logs a warning
   * and throws so the service doesn't register (providers handle the UX).
   */
  static async start(runtime: IAgentRuntime): Promise<IQService> {
    const service = new IQService(runtime);

    // Check for wallet before attempting init
    if (!service.settings.privateKey && !service.settings.keypairPath) {
      runtime.logger.warn(
        "IQ chat not available - no Solana wallet configured. Set SOLANA_PRIVATE_KEY to enable on-chain chat."
      );
      throw new Error("IQ service requires SOLANA_PRIVATE_KEY to be configured");
    }

    await service.initialize();
    return service;
  }

  /**
   * Initialize the IQ service (only called when wallet is present)
   */
  private async initialize(): Promise<void> {
    this.runtime.logger.info("IQService.initialize() called");

    try {
      // Configure SDK RPC URL for the reader
      iqlabs.setRpcUrl(this.settings.rpcUrl);

      // Initialize Solana connection
      this.connection = new Connection(this.settings.rpcUrl, "confirmed");

      // Load keypair
      if (this.settings.privateKey) {
        const secretKey = bs58.decode(this.settings.privateKey);
        this.keypair = Keypair.fromSecretKey(secretKey);
        this.runtime.logger.info("Loaded keypair from SOLANA_PRIVATE_KEY");
      } else if (this.settings.keypairPath) {
        const keypairPath = this.settings.keypairPath.replace("~", process.env.HOME || "");
        if (!fs.existsSync(keypairPath)) {
          throw new Error(`Keypair file not found at ${keypairPath}`);
        }
        const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf8"));
        this.keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
        this.runtime.logger.info(`Loaded keypair from ${keypairPath}`);
      }

      // Initialize on-chain configuration
      this.dbRootId = sha256(DB_ROOT_NAME);
      this.dbRootPda = iqlabs.contract.getDbRootPda(this.dbRootId);

      // Connect to all configured chatrooms
      for (const chatroomName of this.settings.chatrooms) {
        this.ensureChatroom(chatroomName);
      }

      // Check balance (non-blocking)
      let balance = 0;
      try {
        balance = await this.getBalance();
        if (balance < MESSAGE_LIMITS.minSolBalance) {
          this.runtime.logger.warn(`Low SOL balance (${balance} SOL). Need at least ${MESSAGE_LIMITS.minSolBalance} SOL.`);
        }
      } catch (e) {
        this.runtime.logger.warn(`Could not fetch balance: ${e}`);
      }

      this.runtime.logger.info(`IQ service started for ${this.settings.agentName}`);
      this.runtime.logger.info(`Wallet: ${this.getWalletAddress()}`);
      this.runtime.logger.info(`Balance: ${balance > 0 ? balance + " SOL" : "(unknown)"}`);
      this.runtime.logger.info(`Connected chatrooms: ${this.getConnectedChatrooms().join(", ")}`);

      // Register send handler
      if (typeof this.runtime.registerSendHandlers === "function") {
        this.runtime.registerSendHandlers([
          {
            sources: ["iq"],
            handler: this.handleSendMessage.bind(this),
          },
        ]);
      }

      // Start polling all chatrooms for new messages
      this.startMessagePolling();
    } catch (error) {
      this.runtime.logger.error(`Failed to start IQ service: ${error}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.runtime.logger.info("IQ service stopped");
  }

  // ==================== CHATROOM MANAGEMENT ====================

  private ensureChatroom(chatroomName: string): IQChatroom {
    const key = chatroomName.toLowerCase();
    const existing = this.chatrooms.get(key);
    if (existing) return existing;

    if (!this.dbRootId || !this.dbRootPda) {
      throw new Error("Cannot create chatroom config - service not initialized");
    }

    const tableSeed = sha256(`${CHATROOM_PREFIX}${chatroomName}`);
    const tablePda = iqlabs.contract.getTablePda(this.dbRootPda, tableSeed);
    const tablePdaStr = tablePda.toBase58();

    const chatroom: IQChatroom = {
      name: chatroomName,
      dbRootId: this.dbRootId as Buffer,
      tableSeed: tableSeed as Buffer,
      tablePda: tablePdaStr,
    };

    this.chatrooms.set(key, chatroom);
    this.runtime.logger.info(`Connected to chatroom: ${chatroomName} (${tablePdaStr})`);

    this.runtime.emitEvent(IQEventTypes.CHATROOM_CONNECTED as string, {
      chatroom: chatroomName,
      tablePda: tablePdaStr,
    });

    return chatroom;
  }

  resolveChatroom(ref: string): string {
    if (!ref) return this.settings.defaultChatroom;
    const refLower = ref.toLowerCase().trim();

    for (const [key, chatroom] of this.chatrooms) {
      if (key === refLower) return chatroom.name;
    }
    for (const [key, chatroom] of this.chatrooms) {
      if (key.includes(refLower) || refLower.includes(key)) return chatroom.name;
    }

    return this.ensureChatroom(ref).name;
  }

  getConnectedChatrooms(): string[] {
    return Array.from(this.chatrooms.values()).map((c) => c.name);
  }

  getDefaultChatroom(): string {
    return this.settings.defaultChatroom;
  }

  // ==================== WALLET ====================

  getWalletAddress(): string {
    if (!this.keypair) return "";
    return this.keypair.publicKey.toBase58();
  }

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

  async sendMessage(content: string, chatroom?: string): Promise<string> {
    if (!this.connection || !this.keypair || !this.dbRootId) {
      throw new Error("IQ service not initialized");
    }

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
      const txSig = await iqlabs.writer.writeRow(
        this.connection,
        this.keypair,
        this.dbRootId,
        targetChatroom.tableSeed,
        JSON.stringify(message)
      );

      this.seenMessages.add(message.id);
      this.trackTokenCall(content).catch(() => {});

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

  async readMessages(limit = MESSAGE_LIMITS.defaultReadLimit, chatroom?: string): Promise<IQMessage[]> {
    const targetName = chatroom ? this.resolveChatroom(chatroom) : this.settings.defaultChatroom;
    const targetChatroom = this.ensureChatroom(targetName);

    // Try the IQ API first
    try {
      const apiUrl = `${URLS.base}/api/v1/messages?chatroom=${encodeURIComponent(targetName)}&limit=${limit}`;
      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        return ((data.messages || []) as IQMessage[]).map((m) => ({ ...m, chatroom: targetName }));
      }
    } catch (error) {
      this.runtime.logger.debug(`API read failed for ${targetName}: ${error}`);
    }

    // Try gateway
    if (targetChatroom.tablePda) {
      try {
        const gatewayUrl = `${this.settings.gatewayUrl}/table/${targetChatroom.tablePda}/rows?limit=${limit}`;
        const response = await fetch(gatewayUrl);
        if (response.ok) {
          const data = await response.json();
          return ((data.rows || data || []) as IQMessage[]).map((m) => ({ ...m, chatroom: targetName }));
        }
      } catch (error) {
        this.runtime.logger.debug(`Gateway read failed for ${targetName}: ${error}`);
      }
    }

    // Fallback to direct on-chain read via SDK
    if (targetChatroom.tablePda) {
      try {
        const rows = await iqlabs.reader.readTableRows(targetChatroom.tablePda, { limit });
        return (rows as IQMessage[]).map((m) => ({ ...m, chatroom: targetName }));
      } catch (error) {
        this.runtime.logger.error(`Direct on-chain read failed for ${targetName}: ${error}`);
      }
    }

    return [];
  }

  // ==================== MOLTBOOK ====================

  async moltbookPost(submolt: string, title: string, content: string): Promise<string> {
    if (!this.settings.moltbookToken) throw new Error("MOLTBOOK_TOKEN not set");
    try {
      const response = await fetch(`${URLS.moltbook}/posts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.settings.moltbookToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ submolt, title, content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || JSON.stringify(data));
      this.runtime.emitEvent(IQEventTypes.MOLTBOOK_POST_CREATED as string, { postId: data.post?.id, submolt, title });
      return data.post?.id || "success";
    } catch (error) {
      this.runtime.logger.error(`Failed to post to Moltbook: ${error}`);
      throw error;
    }
  }

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

  async moltbookComment(postId: string, content: string): Promise<string> {
    if (!this.settings.moltbookToken) throw new Error("MOLTBOOK_TOKEN not set");
    try {
      const response = await fetch(`${URLS.moltbook}/posts/${postId}/comments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.settings.moltbookToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(data));
      this.runtime.emitEvent(IQEventTypes.MOLTBOOK_COMMENT_CREATED as string, { commentId: data.id, postId });
      return data.id || "success";
    } catch (error) {
      this.runtime.logger.error(`Failed to comment on Moltbook: ${error}`);
      throw error;
    }
  }

  async moltbookReply(postId: string, parentId: string, content: string): Promise<string> {
    if (!this.settings.moltbookToken) throw new Error("MOLTBOOK_TOKEN not set");
    try {
      const response = await fetch(`${URLS.moltbook}/posts/${postId}/comments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.settings.moltbookToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content, parent_id: parentId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(data));
      return data.id || "success";
    } catch (error) {
      this.runtime.logger.error(`Failed to reply on Moltbook: ${error}`);
      throw error;
    }
  }

  async moltbookReadPost(postId: string): Promise<{ post: MoltbookPost; comments: MoltbookComment[] }> {
    try {
      const response = await fetch(`${URLS.moltbook}/posts/${postId}`);
      const data = await response.json();
      if (!data.post) throw new Error("Post not found");
      return { post: data.post as MoltbookPost, comments: (data.comments || []) as MoltbookComment[] };
    } catch (error) {
      this.runtime.logger.error(`Failed to read Moltbook post: ${error}`);
      throw error;
    }
  }

  // ==================== DATA INSCRIPTION ====================

  async inscribeData(data: string, table: string): Promise<string> {
    if (!this.connection || !this.keypair || !this.dbRootId) {
      throw new Error("IQ service not initialized");
    }
    try {
      const tableSeed = sha256(table);
      const txSig = await iqlabs.writer.writeRow(this.connection, this.keypair, this.dbRootId, tableSeed, data);
      this.runtime.emitEvent(IQEventTypes.DATA_INSCRIBED as string, { table, txSig });
      return txSig;
    } catch (error) {
      this.runtime.logger.error(`Failed to inscribe data: ${error}`);
      throw error;
    }
  }

  // ==================== INTERNAL ====================

  private async handleSendMessage(runtime: IAgentRuntime, target: TargetInfo, content: Content): Promise<void> {
    if (content.text) {
      await this.sendMessage(content.text, target.channelId ?? undefined);
    }
  }

  private async trackTokenCall(message: string): Promise<void> {
    if (!this.settings.pnlApiUrl || !this.keypair) return;
    try {
      await fetch(`${this.settings.pnlApiUrl}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userWallet: this.keypair.publicKey.toBase58(), message }),
      });
    } catch { /* ignore */ }
  }

  // ==================== MESSAGE POLLING ====================

  private startMessagePolling(): void {
    const poll = async () => {
      for (const [_key, chatroom] of this.chatrooms) {
        try {
          const messages = await this.readMessages(20, chatroom.name);
          for (const msg of messages) {
            if (this.seenMessages.has(msg.id)) continue;
            if (msg.wallet === this.getWalletAddress()) continue;

            this.seenMessages.add(msg.id);

            this.runtime.emitEvent(IQEventTypes.MESSAGE_RECEIVED as string, {
              message: msg,
              chatroom: chatroom.name,
            });

            await this.processIncomingMessage(msg, chatroom.name);
          }
        } catch (error) {
          this.runtime.logger.debug(`Message polling error for ${chatroom.name}: ${error}`);
        }
      }
      setTimeout(poll, 5000);
    };

    poll();
  }

  private async processIncomingMessage(msg: IQMessage, chatroomName: string): Promise<void> {
    const entityId = createUniqueUuid(this.runtime, msg.wallet);
    const roomId = createUniqueUuid(this.runtime, `iq-${chatroomName}`);

    await this.runtime.ensureConnection(entityId, roomId, msg.agent, msg.agent, "iq");

    const memory: Memory = {
      id: stringToUuid(msg.id) as UUID,
      entityId,
      roomId,
      agentId: this.runtime.agentId,
      content: {
        text: msg.content,
        source: "iq",
        channelType: ChannelType.GROUP,
        metadata: { chatroom: chatroomName },
      },
      createdAt: new Date(msg.timestamp).getTime(),
    };

    await this.runtime.messageService.handleMessage(this.runtime, memory);
  }
}
