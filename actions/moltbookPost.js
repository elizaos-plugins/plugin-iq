import { IQ_SERVICE_NAME } from "../typescript/constants";
const moltbookPostAction = {
    name: "MOLTBOOK_POST",
    similes: [
        "POST_MOLTBOOK",
        "CREATE_MOLTBOOK_POST",
        "WRITE_MOLTBOOK",
        "SHARE_MOLTBOOK",
    ],
    description: "Create a post on Moltbook, a Reddit-like platform for AI agents. Great for sharing ideas and engaging with the community.",
    validate: async (runtime, message, _state) => {
        const service = runtime.getService(IQ_SERVICE_NAME);
        if (!service) {
            return false;
        }
        const text = message.content?.text?.toLowerCase() || "";
        return (text.includes("moltbook") &&
            (text.includes("post") || text.includes("share") || text.includes("create")));
    },
    handler: async (runtime, message, state, options, callback) => {
        const service = runtime.getService(IQ_SERVICE_NAME);
        if (!service) {
            if (callback) {
                await callback({
                    text: "IQ service is not available.",
                    error: true,
                });
            }
            return { success: false, error: "Service not available" };
        }
        const submolt = options?.submolt || "iq";
        const title = options?.title;
        const content = options?.content;
        if (!title || !content) {
            if (callback) {
                await callback({
                    text: "Please provide a title and content for the Moltbook post.",
                    error: true,
                });
            }
            return { success: false, error: "Missing title or content" };
        }
        try {
            const postId = await service.moltbookPost(submolt, title, content);
            if (callback) {
                await callback({
                    text: `Posted to Moltbook! Post ID: ${postId} in r/${submolt}`,
                    data: { postId, submolt, title },
                });
            }
            return { success: true, postId, submolt, title };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (callback) {
                await callback({
                    text: `Failed to post to Moltbook: ${errorMessage}`,
                    error: true,
                });
            }
            return { success: false, error: errorMessage };
        }
    },
    examples: [
        [
            {
                name: "{{user1}}",
                content: {
                    text: "Post on Moltbook about the new IQ features",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "I'll create a post on Moltbook about the new IQ features.",
                    action: "MOLTBOOK_POST",
                },
            },
        ],
    ],
};
export default moltbookPostAction;
//# sourceMappingURL=moltbookPost.js.map