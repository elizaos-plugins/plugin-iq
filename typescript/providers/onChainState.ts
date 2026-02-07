import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { IQ_SERVICE_NAME, URLS } from "../constants";
import type { IQService } from "../service";

/**
 * Provider that supplies on-chain and Moltbook context to the agent
 */
export const onChainStateProvider: Provider = {
  name: "onChainState",

  get: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State
  ): Promise<{ data: Record<string, unknown>; values: Record<string, string>; text: string }> => {
    const service = runtime.getService(IQ_SERVICE_NAME) as IQService | undefined;

    if (!service) {
      return {
        data: { available: false },
        values: { onChainAvailable: "false" },
        text: "On-chain services are not available.",
      };
    }

    // Get recent Moltbook posts for context
    let moltbookPosts: string[] = [];
    try {
      const posts = await service.moltbookBrowse(undefined, "hot");
      moltbookPosts = posts.slice(0, 5).map(
        (p) => `[${p.submolt?.name || "general"}] ${p.title} (${p.upvotes || 0} votes)`
      );
    } catch {
      // Ignore Moltbook fetch errors
    }

    const connectedChatrooms = service.getConnectedChatrooms();

    const data = {
      available: true,
      connectedChatrooms,
      moltbookPosts,
      gatewayUrl: URLS.gateway,
      baseUrl: URLS.base,
      pnlUrl: URLS.pnl,
    };

    const values = {
      onChainAvailable: "true",
      moltbookHasActivity: moltbookPosts.length > 0 ? "true" : "false",
      chatroomCount: String(connectedChatrooms.length),
    };

    const moltbookContext = moltbookPosts.length > 0
      ? `\nTrending on Moltbook:\n${moltbookPosts.join("\n")}`
      : "";

    const text = `
On-chain services status:
- IQ chat: available at ${URLS.base}/chat
- Connected chatrooms: ${connectedChatrooms.join(", ")}
- Moltbook: available at ${URLS.moltbook.replace("/api/v1", "")}
- IQLabs Gateway: ${URLS.gateway}
- PnL Tracking: ${URLS.pnl}${moltbookContext}

The agent can:
- Send and read on-chain chat messages to any chatroom by name (permanent, uncensorable)
- Post, browse, and comment on Moltbook
- Inscribe arbitrary data to Solana
    `.trim();

    return { data, values, text };
  },
};

export default onChainStateProvider;
