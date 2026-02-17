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

const inscribeDataAction: Action = {
  name: "INSCRIBE_DATA",
  similes: ["WRITE_ONCHAIN", "STORE_ONCHAIN", "SAVE_SOLANA", "INSCRIBE_SOLANA"],
  description:
    "Inscribe arbitrary data permanently to Solana using IQLabs SDK. Data is stored on-chain forever.",

  validate: async (runtime: any, message: any, state?: any, options?: any): Promise<boolean> => {
    const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
    const __avText = __avTextRaw.toLowerCase();
    const __avKeywords = ["inscribe", "data"];
    const __avKeywordOk =
      __avKeywords.length > 0 && __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
    const __avRegexOk = /\b(?:inscribe|data)\b/i.test(__avText);
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
        text.includes("inscribe") ||
        (text.includes("store") && text.includes("chain")) ||
        (text.includes("write") && text.includes("solana")) ||
        (text.includes("save") && text.includes("onchain"))
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

    const data = options?.data as string;
    const table = (options?.table as string) || "default";

    if (!data) {
      if (callback) {
        await callback({
          text: "Please provide data to inscribe.",
          error: true,
        });
      }
      return { success: false, error: "Missing data" };
    }

    try {
      const txSig = await service.inscribeData(data, table);

      if (callback) {
        await callback({
          text: `Data inscribed successfully! Transaction: ${txSig}`,
          data: { txSig, table },
        });
      }

      return { success: true, txSig, table };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (callback) {
        await callback({
          text: `Failed to inscribe data: ${errorMessage}`,
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
          text: 'Inscribe this data to Solana: {"key": "value"}',
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll inscribe that data permanently to Solana.",
          action: "INSCRIBE_DATA",
        },
      },
    ],
  ] as ActionExample[][],
};

export default inscribeDataAction;
