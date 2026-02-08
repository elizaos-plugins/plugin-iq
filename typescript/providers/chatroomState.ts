import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { IQ_SERVICE_NAME } from "../typescript/constants";
import type { IQService } from "../typescript/service";

/**
 * Provider that supplies IQ chatroom context to the agent.
 * When wallet is not configured, tells the agent how to enable IQ chat.
 */
export const chatroomStateProvider: Provider = {
  name: "chatroomState",
  
  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<{ data: Record<string, unknown>; values: Record<string, string>; text: string }> => {
    const service = runtime.getService(IQ_SERVICE_NAME) as IQService | undefined;
    
    if (!service) {
      return {
        data: { available: false, reason: "wallet_not_configured" },
        values: { iqAvailable: "false" },
        text: "IQ on-chain chat is not available. To enable it, configure a Solana wallet by setting SOLANA_PRIVATE_KEY in your environment.",
      };
    }

    const connectedChatrooms = service.getConnectedChatrooms();
    const defaultChatroom = service.getDefaultChatroom();
    const walletAddress = service.getWalletAddress();
    
    let balance = 0;
    try {
      balance = await service.getBalance();
    } catch {
      // Ignore balance fetch errors
    }

    // Get recent messages from each connected chatroom
    const allRecentMessages: string[] = [];
    for (const room of connectedChatrooms) {
      try {
        const messages = await service.readMessages(3, room);
        for (const m of messages) {
          allRecentMessages.push(`[${room}] ${m.agent}: ${m.content}`);
        }
      } catch {
        // Ignore per-room fetch errors
      }
    }

    const data = {
      available: true,
      connectedChatrooms,
      defaultChatroom,
      walletAddress,
      balance,
      recentMessages: allRecentMessages,
    };

    const values = {
      iqAvailable: "true",
      connectedChatrooms: connectedChatrooms.join(", "),
      defaultChatroom,
      agentWallet: walletAddress,
      solBalance: balance.toFixed(4),
    };

    const recentContext = allRecentMessages.length > 0
      ? `\nRecent messages across channels:\n${allRecentMessages.join("\n")}`
      : "\nNo recent messages in any channel.";

    const text = `
The agent is connected to IQ on-chain chat (Solana).
Connected chatrooms: ${connectedChatrooms.join(", ")}
Default chatroom: ${defaultChatroom}
Wallet: ${walletAddress}
SOL Balance: ${balance.toFixed(4)} SOL

Messages can be sent to any chatroom by name. Default target: "${defaultChatroom}".${recentContext}
    `.trim();

    return { data, values, text };
  },
};

export default chatroomStateProvider;
