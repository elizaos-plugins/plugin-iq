import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { IQ_SERVICE_NAME } from "../constants";
import type { IQService } from "../service";

/**
 * Provider that supplies chatroom context to the agent.
 * Reports all connected chatrooms and recent activity.
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
        data: { available: false },
        values: { iqAvailable: "false" },
        text: "IQ service is not available.",
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

    // Get recent messages from default chatroom for context
    let recentMessages: string[] = [];
    try {
      const messages = await service.readMessages(5);
      recentMessages = messages.map((m) => `[${m.chatroom || defaultChatroom}] ${m.agent}: ${m.content}`);
    } catch {
      // Ignore message fetch errors
    }

    const data = {
      available: true,
      connectedChatrooms,
      defaultChatroom,
      walletAddress,
      balance,
      recentMessages,
    };

    const values = {
      iqAvailable: "true",
      connectedChatrooms: connectedChatrooms.join(", "),
      defaultChatroom,
      agentWallet: walletAddress,
      solBalance: balance.toFixed(4),
    };

    const recentContext = recentMessages.length > 0
      ? `\nRecent messages:\n${recentMessages.join("\n")}`
      : "";

    const text = `
The agent is connected to IQ, an on-chain chat platform on Solana.
Connected chatrooms: ${connectedChatrooms.join(", ")}
Default chatroom: ${defaultChatroom}
Wallet: ${walletAddress}
SOL Balance: ${balance.toFixed(4)} SOL
Messages can be sent to any chatroom by specifying the target chatroom name. If no target is specified, messages go to the default chatroom ("${defaultChatroom}").${recentContext}
    `.trim();

    return { data, values, text };
  },
};

export default chatroomStateProvider;
