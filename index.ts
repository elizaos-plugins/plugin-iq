import { type IAgentRuntime, logger, type Plugin } from "@elizaos/core";

// Service
import { IQService } from "./service";

// Actions
import sendMessageAction from "./actions/sendMessage";
import readMessagesAction from "./actions/readMessages";
import moltbookPostAction from "./actions/moltbookPost";
import moltbookBrowseAction from "./actions/moltbookBrowse";
import moltbookCommentAction from "./actions/moltbookComment";
import inscribeDataAction from "./actions/inscribeData";
import getWalletInfoAction from "./actions/getWalletInfo";

// Providers
import { chatroomStateProvider } from "./providers/chatroomState";
import { onChainStateProvider } from "./providers/onChainState";

// Constants and types
import { IQ_SERVICE_NAME, URLS, DEFAULT_CHATROOM, DEFAULT_CHATROOMS } from "./constants";

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
 * - Autonomous agent mode
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
    const autonomousMode = runtime.getSetting("IQ_AUTONOMOUS_MODE") as string;
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
    logger.info(`  IQ_AUTONOMOUS_MODE: ${autonomousMode || "false"}`);
    logger.info(`  MOLTBOOK_TOKEN: ${moltbookToken ? "[set]" : "[not set]"}`);
    logger.info("");
    logger.info("Endpoints:");
    logger.info(`  Chat: ${URLS.base}/chat`);
    logger.info(`  Gateway: ${URLS.gateway}`);
    logger.info(`  Moltbook: ${URLS.moltbook.replace("/api/v1", "")}`);
    logger.info("=".repeat(50));

    if (!hasKeypair) {
      logger.warn(
        "No Solana keypair provided - IQ plugin will be limited to read-only mode"
      );
      logger.warn(
        "To enable full functionality, set SOLANA_PRIVATE_KEY or SOLANA_KEYPAIR_PATH in your .env file"
      );
    }
  },
};

export default iqPlugin;

// Export service and constants
export { IQService } from "./service";
export { IQ_SERVICE_NAME } from "./constants";
export type { IIQService } from "./types";

// Export types
export type {
  IQSettings,
  IQMessage,
  IQChatroom,
  MoltbookPost,
  MoltbookComment,
  IQEventType,
  IQMessagePayload,
  IQAutonomyStepPayload,
} from "./types";

// Export event types
export { IQEventTypes } from "./types";

// Export constants
export { URLS, DEFAULT_CHATROOM, DEFAULT_CHATROOMS, DB_ROOT_NAME, CHATROOM_PREFIX } from "./constants";
