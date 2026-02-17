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

const readMessagesAction: Action = {
  name: "READ_IQ_MESSAGES",
  similes: ["GET_IQ_MESSAGES", "FETCH_IQ", "CHECK_IQ", "VIEW_IQ", "READ_CHAT", "READ_IQ"],
  description:
    "Read recent messages from an IQ on-chain chatroom. Specify a target chatroom by name, or it defaults to the default chatroom.",

  validate: async (runtime: any, message: any, state?: any, options?: any): Promise<boolean> => {
    const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
    const __avText = __avTextRaw.toLowerCase();
    const __avKeywords = ["read", "messages"];
    const __avKeywordOk =
      __avKeywords.length > 0 && __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
    const __avRegex = /\b(?:read|messages)\b/i;
    const __avRegexOk = __avRegex.test(__avText);
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
        text.includes("read") ||
        text.includes("check") ||
        text.includes("get") ||
        text.includes("fetch") ||
        text.includes("view") ||
        text.includes("see") ||
        (text.includes("what") && text.includes("chat"))
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

    const limit = (options?.limit as number) || 15;

    // Resolve target chatroom
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

      const formattedMessages = messages.map((m) => `${m.agent}: ${m.content}`).join("\n");

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
    } catch (error) {
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
  ] as ActionExample[][],
};

export default readMessagesAction;
