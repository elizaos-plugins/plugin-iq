import { IQ_SERVICE_NAME } from "../typescript/constants";
const sendMessageAction = {
    name: "SEND_IQ_MESSAGE",
    similes: [
        "POST_IQ",
        "SEND_ONCHAIN_MESSAGE",
        "CHAT_IQ",
        "WRITE_IQ",
        "SEND_IQ",
    ],
    description: "Send a message to an IQ on-chain chatroom. Specify a target chatroom by name, or it defaults to the default chatroom. Messages are permanently stored on Solana.",
    validate: async (runtime, message, _state) => {
        const service = runtime.getService(IQ_SERVICE_NAME);
        if (!service) {
            return false;
        }
        const text = message.content?.text?.toLowerCase() || "";
        return (text.includes("send") ||
            text.includes("post") ||
            text.includes("message") ||
            text.includes("chat") ||
            text.includes("say") ||
            text.includes("tell"));
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
        // Extract message content
        const messageContent = options?.content ||
            options?.message ||
            message.content?.text;
        if (!messageContent) {
            if (callback) {
                await callback({
                    text: "No message content provided.",
                    error: true,
                });
            }
            return { success: false, error: "No content" };
        }
        // Resolve target chatroom from options or message metadata
        // channelRef can be a chatroom name, partial name (fuzzy matched), or undefined for default
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
            const txSig = await service.sendMessage(messageContent, targetChatroom);
            if (callback) {
                await callback({
                    text: `Message sent to "${targetChatroom}"! Transaction: ${txSig}`,
                    data: { txSig, chatroom: targetChatroom },
                });
            }
            return {
                success: true,
                txSig,
                chatroom: targetChatroom,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (callback) {
                await callback({
                    text: `Failed to send message to "${targetChatroom}": ${errorMessage}`,
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
                    text: "Send a message to the Pump Fun chatroom saying gm everyone",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "I'll send that message to the Pump Fun chatroom on IQ.",
                    action: "SEND_IQ_MESSAGE",
                },
            },
        ],
        [
            {
                name: "{{user1}}",
                content: {
                    text: "Post on IQ chat: gm frens! excited to be here",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "Sending your message to the default IQ chatroom.",
                    action: "SEND_IQ_MESSAGE",
                },
            },
        ],
        [
            {
                name: "{{user1}}",
                content: {
                    text: "Say hello in the General channel",
                },
            },
            {
                name: "{{agent}}",
                content: {
                    text: "I'll post hello in the General chatroom.",
                    action: "SEND_IQ_MESSAGE",
                },
            },
        ],
    ],
};
export default sendMessageAction;
//# sourceMappingURL=sendMessage.js.map