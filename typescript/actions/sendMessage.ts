import type {
  Action,
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { IQ_SERVICE_NAME } from "../constants";
import type { IQService } from "../service";

const sendMessageAction: Action = {
  name: "SEND_IQ_MESSAGE",
  similes: ["POST_IQ", "SEND_ONCHAIN_MESSAGE", "CHAT_IQ", "WRITE_IQ", "SEND_IQ"],
  description:
    "Send a message to an IQ on-chain chatroom. Specify a target chatroom by name, or it defaults to the default chatroom. Messages are permanently stored on Solana.",

  validate: async (runtime: any, message: any, state?: any, options?: any): Promise<boolean> => {
    const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
    const __avText = __avTextRaw.toLowerCase();
    const __avKeywords = ["send", "message"];
    const __avKeywordOk =
      __avKeywords.length > 0 && __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
    const __avRegexOk = /\b(?:send|message)\b/i.test(__avText);
    const __avSource = String(message?.content?.source ?? message?.source ?? "");
    const __avExpectedSource = "";
    const __avSourceOk = __avExpectedSource
      ? __avSource === __avExpectedSource
      : Boolean(__avSource || state || runtime?.agentId || runtime?.getService);
    const __avOptions = options && typeof options === "object" ? options : {};
    const __avInputOk =
      __avText.trim().length > 0 ||
      Object.keys(__avOptions as Record<string, unknown>).length > 0 ||
      Boolean(message?.content && typeof message.content === "object");

    if (!(__avKeywordOk && __avRegexOk && __avSourceOk && __avInputOk)) {
      return false;
    }

    const __avLegacyValidate = async (
      runtime: IAgentRuntime,
      message: Memory,
      _state?: State
    ): Promise<boolean> => {
      const service = runtime.getService(IQ_SERVICE_NAME) as unknown as IQService;
      if (!service) {
        return false;
      }

      const text = message.content?.text?.toLowerCase() || "";
      return (
        text.includes("send") ||
        text.includes("post") ||
        text.includes("message") ||
        text.includes("chat") ||
        text.includes("say") ||
        text.includes("tell")
      );
    };
    try {
      return Boolean(await (__avLegacyValidate as any)(runtime, message, state, options));
    } catch {
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    const service = runtime.getService(IQ_SERVICE_NAME) as unknown as IQService;
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
    const messageContent =
      (options?.content as string) || (options?.message as string) || message.content?.text;

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
    const channelRef =
      (options?.channelRef as string) ||
      (options?.chatroom as string) ||
      (options?.channel as string) ||
      (options?.target as string) ||
      (message.content?.metadata as Record<string, string> | undefined)?.chatroom ||
      undefined;

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
    } catch (error) {
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
  ] as ActionExample[][],
};

export default sendMessageAction;
