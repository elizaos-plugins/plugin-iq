import { IQ_SERVICE_NAME, URLS } from "../typescript/constants";
/**
 * Provider that supplies on-chain and Moltbook context to the agent.
 * When wallet is not configured, tells the agent how to enable IQ chat.
 */
export const onChainStateProvider = {
    name: "onChainState",
    get: async (runtime, message, state) => {
        const service = runtime.getService(IQ_SERVICE_NAME);
        if (!service) {
            return {
                data: { available: false, reason: "wallet_not_configured" },
                values: { onChainAvailable: "false" },
                text: "On-chain services are not available. Set SOLANA_PRIVATE_KEY to enable IQ chat and Moltbook.",
            };
        }
        const connectedChatrooms = service.getConnectedChatrooms();
        // Get recent Moltbook posts for context
        let moltbookPosts = [];
        try {
            const posts = await service.moltbookBrowse(undefined, "hot");
            moltbookPosts = posts.slice(0, 5).map((p) => `[${p.submolt?.name || "general"}] ${p.title} (${p.upvotes || 0} votes)`);
        }
        catch {
            // Ignore Moltbook fetch errors
        }
        const data = {
            available: true,
            connectedChatrooms,
            moltbookPosts,
            gatewayUrl: URLS.gateway,
            baseUrl: URLS.base,
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
On-chain services:
- IQ chat: connected to ${connectedChatrooms.join(", ")}
- Moltbook: ${URLS.moltbook.replace("/api/v1", "")}${moltbookContext}

The agent can send/read messages to any chatroom by name, and interact with Moltbook.
    `.trim();
        return { data, values, text };
    },
};
export default onChainStateProvider;
//# sourceMappingURL=onChainState.js.map