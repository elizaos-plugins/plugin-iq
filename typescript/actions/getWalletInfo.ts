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

const getWalletInfoAction: Action = {
  name: "GET_WALLET_INFO",
  similes: ["CHECK_WALLET", "WALLET_INFO", "GET_BALANCE", "CHECK_BALANCE", "MY_WALLET"],
  description: "Get wallet information including address and SOL balance for the IQ agent.",

  validate: async (runtime: any, message: any, state?: any, options?: any): Promise<boolean> => {
    const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
    const __avText = __avTextRaw.toLowerCase();
    const __avKeywords = ["get", "wallet", "info"];
    const __avKeywordOk =
      __avKeywords.length > 0 && __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
    const __avRegex = /\b(?:get|wallet|info)\b/i;
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
        text.includes("wallet") ||
        text.includes("balance") ||
        text.includes("sol") ||
        text.includes("address")
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
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
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

    try {
      const address = service.getWalletAddress();
      const balance = await service.getBalance();

      if (callback) {
        await callback({
          text: `Wallet Address: ${address}\nSOL Balance: ${balance.toFixed(4)} SOL`,
          data: { address, balance },
        });
      }

      return { success: true, address, balance };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (callback) {
        await callback({
          text: `Failed to get wallet info: ${errorMessage}`,
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
          text: "What's my wallet address?",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me get your wallet information.",
          action: "GET_WALLET_INFO",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "Check my SOL balance",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Checking your SOL balance now.",
          action: "GET_WALLET_INFO",
        },
      },
    ],
  ] as ActionExample[][],
};

export default getWalletInfoAction;
