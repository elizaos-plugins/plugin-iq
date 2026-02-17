import type { IAgentRuntime, Memory, Provider, ProviderResult, State } from "@elizaos/core";
import { IQ_SERVICE_NAME, URLS } from "../constants";
import type { IQService } from "../service";

/**
 * Provider that supplies on-chain and Moltbook context to the agent.
 */
export const onChainStateProvider: Provider = {
  name: "onChainState",
  dynamic: true,
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State): Promise<ProviderResult> => {
    const service = runtime.getService(IQ_SERVICE_NAME) as unknown as IQService | undefined;

    if (!service) {
      return {
        data: { available: false, reason: "wallet_not_configured" },
        values: { onChainAvailable: "false" },
        text: "On-chain services are not available. Set SOLANA_PRIVATE_KEY to enable IQ chat and Moltbook.",
      };
    }

    const connectedChatrooms = service.getConnectedChatrooms();

    let moltbookPosts: string[] = [];
    try {
      const posts = await service.moltbookBrowse(undefined, "hot");
      moltbookPosts = posts
        .slice(0, 5)
        .map((p) => `[${p.submolt?.name || "general"}] ${p.title} (${p.upvotes || 0} votes)`);
    } catch {
      // Ignore Moltbook fetch errors
    }

    const moltbookContext =
      moltbookPosts.length > 0 ? `\nTrending on Moltbook:\n${moltbookPosts.join("\n")}` : "";

    return {
      data: {
        available: true,
        connectedChatrooms,
        moltbookPosts,
        gatewayUrl: URLS.gateway,
        baseUrl: URLS.base,
      },
      values: {
        onChainAvailable: "true",
        moltbookHasActivity: moltbookPosts.length > 0 ? "true" : "false",
        chatroomCount: String(connectedChatrooms.length),
      },
      text: `
On-chain services:
- IQ chat: connected to ${connectedChatrooms.join(", ")}
- Moltbook: ${URLS.moltbook.replace("/api/v1", "")}${moltbookContext}

The agent can send/read messages to any chatroom by name, and interact with Moltbook.
      `.trim(),
    };
  },
};

export default onChainStateProvider;
