import { type IAgentRuntime, logger, type Plugin } from "@elizaos/core";
import getWalletInfoAction from "./actions/getWalletInfo";
import inscribeDataAction from "./actions/inscribeData";
import moltbookBrowseAction from "./actions/moltbookBrowse";
import moltbookCommentAction from "./actions/moltbookComment";
import moltbookPostAction from "./actions/moltbookPost";
import readMessagesAction from "./actions/readMessages";
// Actions
import sendMessageAction from "./actions/sendMessage";
// Constants and types
import { DEFAULT_CHATROOM, DEFAULT_CHATROOMS, URLS } from "./constants";

// Providers
import { chatroomStateProvider } from "./providers/chatroomState";
import { onChainStateProvider } from "./providers/onChainState";
// Service
import { IQService } from "./service";

/**
 * IQ Plugin
 *
 * Enables Eliza agents to communicate on the IQ on-chain chat platform.
 * Connects to all configured chatrooms simultaneously - no need to switch.
 * Actions target specific chatrooms by name (fuzzy matched).
 *
 * Features:
 * - On-chain messaging via Solana transactions
 * - Multi-channel: connected to all chatrooms at once
 * - Channel targeting: send/read to any chatroom by name
 * - Moltbook integration (social platform for AI agents)
 * - Data inscription to Solana
 */
const iqPlugin: Plugin = {
  name: "iq",
  description:
    "IQ on-chain chat plugin for Solana. Connects to all chatrooms simultaneously. Send/read messages to any channel by name, post on Moltbook, and inscribe data permanently.",

  services: [IQService],

  actions: [
    sendMessageAction,
    readMessagesAction,
    moltbookPostAction,
    moltbookBrowseAction,
    moltbookCommentAction,
    inscribeDataAction,
    getWalletInfoAction,
  ],

  providers: [chatroomStateProvider, onChainStateProvider],

  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    const keypairPath = runtime.getSetting("SOLANA_KEYPAIR_PATH") as string;
    const privateKey = runtime.getSetting("SOLANA_PRIVATE_KEY") as string;
    const rpcUrl = runtime.getSetting("SOLANA_RPC_URL") as string;
    const agentName = runtime.getSetting("IQ_AGENT_NAME") as string;
    const defaultChatroom = runtime.getSetting("IQ_DEFAULT_CHATROOM") as string;
    const chatrooms = runtime.getSetting("IQ_CHATROOMS") as string;
    const moltbookToken = runtime.getSetting("MOLTBOOK_TOKEN") as string;

    const hasKeypair = !!(keypairPath || privateKey);

    // Log plugin initialization
    logger.info("=".repeat(50));
    logger.info("IQ Plugin - On-Chain Chat for Solana");
    logger.info("=".repeat(50));
    logger.info("");
    logger.info("Settings:");
    logger.info(`  SOLANA_PRIVATE_KEY: ${privateKey ? "[set]" : "[not set]"}`);
    logger.info(`  SOLANA_KEYPAIR_PATH: ${keypairPath ? "[set]" : "[not set]"}`);
    logger.info(`  SOLANA_RPC_URL: ${rpcUrl || URLS.solanaRpc}`);
    logger.info(`  IQ_AGENT_NAME: ${agentName || runtime.character?.name || "Agent"}`);
    logger.info(`  IQ_DEFAULT_CHATROOM: ${defaultChatroom || DEFAULT_CHATROOM}`);
    logger.info(`  IQ_CHATROOMS: ${chatrooms || DEFAULT_CHATROOMS.join(", ")}`);
    logger.info(`  MOLTBOOK_TOKEN: ${moltbookToken ? "[set]" : "[not set]"}`);
    logger.info("");
    logger.info("Endpoints:");
    logger.info(`  Chat: ${URLS.base}/chat`);
    logger.info(`  Gateway: ${URLS.gateway}`);
    logger.info(`  Moltbook: ${URLS.moltbook.replace("/api/v1", "")}`);
    logger.info("=".repeat(50));

    if (!hasKeypair) {
      logger.warn("No Solana keypair provided - IQ plugin will be limited to read-only mode");
      logger.warn(
        "To enable full functionality, set SOLANA_PRIVATE_KEY or SOLANA_KEYPAIR_PATH in your .env file"
      );
    }
  },
};

export default iqPlugin;

// Export constants
export {
  CHATROOM_PREFIX,
  DB_ROOT_NAME,
  DEFAULT_CHATROOM,
  DEFAULT_CHATROOMS,
  IQ_SERVICE_NAME,
  URLS,
} from "./constants";
// Export service and constants
export { IQService } from "./service";
// Export types
export type {
  IIQService,
  IQChatroom,
  IQEventType,
  IQMessage,
  IQMessagePayload,
  IQSettings,
  MoltbookComment,
  MoltbookPost,
} from "./types";
// Export event types
export { IQEventTypes } from "./types";
