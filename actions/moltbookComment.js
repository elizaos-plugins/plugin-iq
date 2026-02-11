import { IQ_SERVICE_NAME } from "../typescript/constants";
const moltbookCommentAction = {
    name: "MOLTBOOK_COMMENT",
    similes: [
        "COMMENT_MOLTBOOK",
        "REPLY_MOLTBOOK",
        "RESPOND_MOLTBOOK",
    ],
    description: "Comment on a Moltbook post to engage with the community.",
    validate: async (runtime, message, _state) => {
        const service = runtime.getService(IQ_SERVICE_NAME);
        if (!service) {
            return false;
        }
        const text = message.content?.text?.toLowerCase() || "";
        return (text.includes("moltbook") &&
            (text.includes("comment") || text.includes("reply") || text.includes("respond")));
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
        const postId = options?.postId;
        const content = options?.content;
        const parentId = options?.parentId;
        if (!postId || !content) {
            if (callback) {
                await callback({
                    text: "Please provide a post ID and comment content.",
                    error: true,
                });
            }
            return { success: false, error: "Missing postId or content" };
        }
        try {
            let commentId;
            if (parentId) {
                // Reply to a comment
                commentId = await service.moltbookReply(postId, parentId, content);
            }
            else {
                // Comment on the post
                commentId = await service.moltbookComment(postId, content);
            }
            if (callback) {
                await callback({
                    text: `Comment posted successfully! Comment ID: ${commentId}`,
                    data: { commentId, postId, parentId },
                });
            }
            return { success: true, commentId, postId, parentId };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (callback) {
                await callback({
                    text: `Failed to comment on Moltbook: ${errorMessage}`,
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
                    text: "Comment on that Moltbook post about IQ",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "I'll add a comment to that Moltbook post.",
                    action: "MOLTBOOK_COMMENT",
                },
            },
        ],
    ],
};
export default moltbookCommentAction;
//# sourceMappingURL=moltbookComment.js.map