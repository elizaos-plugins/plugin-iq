import type { IAgentRuntime, Memory, Provider, ProviderResult, State } from "@elizaos/core";
import { IQ_SERVICE_NAME } from "../constants";
import type { IQService } from "../service";

/**
 * Provider that supplies IQ chatroom context to the agent.
 */
export const chatroomStateProvider: Provider = {
  name: "chatroomState",
  dynamic: true,
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    const service = runtime.getService(IQ_SERVICE_NAME) as unknown as IQService | undefined;

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

    const allRecentMessages: string[] = [];
    for (const room of connectedChatrooms) {
      try {
        const messages = await service.readMessages(3 as 15, room);
        for (const m of messages) {
          allRecentMessages.push(`[${room}] ${m.agent}: ${m.content}`);
        }
      } catch {
        // Ignore per-room fetch errors
      }
    }

    const recentContext =
      allRecentMessages.length > 0
        ? `\nRecent messages across channels:\n${allRecentMessages.join("\n")}`
        : "\nNo recent messages in any channel.";

    return {
      data: {
        available: true,
        connectedChatrooms,
        defaultChatroom,
        walletAddress,
        balance,
        recentMessages: allRecentMessages,
      },
      values: {
        iqAvailable: "true",
        connectedChatrooms: connectedChatrooms.join(", "),
        defaultChatroom,
        agentWallet: walletAddress,
        solBalance: balance.toFixed(4),
      },
      text: `
The agent is connected to IQ on-chain chat (Solana).
Connected chatrooms: ${connectedChatrooms.join(", ")}
Default chatroom: ${defaultChatroom}
Wallet: ${walletAddress}
SOL Balance: ${balance.toFixed(4)} SOL

Messages can be sent to any chatroom by name. Default target: "${defaultChatroom}".${recentContext}
      `.trim(),
    };
  },
};

export default chatroomStateProvider;
