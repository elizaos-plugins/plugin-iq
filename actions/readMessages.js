import { IQ_SERVICE_NAME } from "../typescript/constants";
const readMessagesAction = {
    name: "READ_IQ_MESSAGES",
    similes: [
        "GET_IQ_MESSAGES",
        "FETCH_IQ",
        "CHECK_IQ",
        "VIEW_IQ",
        "READ_CHAT",
        "READ_IQ",
    ],
    description: "Read recent messages from an IQ on-chain chatroom. Specify a target chatroom by name, or it defaults to the default chatroom.",
    validate: async (runtime, message, _state) => {
        const service = runtime.getService(IQ_SERVICE_NAME);
        if (!service) {
            return false;
        }
        const text = message.content?.text?.toLowerCase() || "";
        return (text.includes("read") ||
            text.includes("check") ||
            text.includes("get") ||
            text.includes("fetch") ||
            text.includes("view") ||
            text.includes("see") ||
            text.includes("what") && text.includes("chat"));
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
        const limit = options?.limit || 15;
        // Resolve target chatroom
        const channelRef = options?.channelRef
            || options?.chatroom
            || options?.channel
            || options?.target
            || message.content?.metadata?.chatroom
            || undefined;
        const targetChatroom = channelRef
            ? service.resolveChatroom(channelRef)
            : service.getDefaultChatroom();
        try {
            const messages = await service.readMessages(limit, targetChatroom);
            if (messages.length === 0) {
                if (callback) {
                    await callback({
                        text: `No messages found in "${targetChatroom}".`,
                        data: { messages: [], chatroom: targetChatroom },
                    });
                }
                return { success: true, messages: [], chatroom: targetChatroom };
            }
            const formattedMessages = messages
                .map((m) => `${m.agent}: ${m.content}`)
                .join("\n");
            if (callback) {
                await callback({
                    text: `Recent messages from "${targetChatroom}":\n\n${formattedMessages}`,
                    data: { messages, chatroom: targetChatroom },
                });
            }
            return {
                success: true,
                messages,
                chatroom: targetChatroom,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (callback) {
                await callback({
                    text: `Failed to read messages from "${targetChatroom}": ${errorMessage}`,
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
                    text: "Read the recent messages from Pump Fun",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Let me fetch the recent messages from the Pump Fun chatroom.",
                    action: "READ_IQ_MESSAGES",
                },
            },
        ],
        [
            {
                name: "{{user1}}",
                content: {
                    text: "What's happening in the General chat?",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "I'll check what's being discussed in the General chatroom on IQ.",
                    action: "READ_IQ_MESSAGES",
                },
            },
        ],
        [
            {
                name: "{{user1}}",
                content: {
                    text: "Check the IQ messages",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "I'll read the latest messages from the default chatroom.",
                    action: "READ_IQ_MESSAGES",
                },
            },
        ],
    ],
};
export default readMessagesAction;
//# sourceMappingURL=readMessages.js.map