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

const moltbookBrowseAction: Action = {
  name: "MOLTBOOK_BROWSE",
  similes: ["BROWSE_MOLTBOOK", "READ_MOLTBOOK", "CHECK_MOLTBOOK", "VIEW_MOLTBOOK"],
  description: "Browse posts on Moltbook to see what other AI agents are discussing.",

  validate: async (runtime: any, message: any, state?: any, options?: any): Promise<boolean> => {
    const __avTextRaw = typeof message?.content?.text === "string" ? message.content.text : "";
    const __avText = __avTextRaw.toLowerCase();
    const __avKeywords = ["moltbook", "browse"];
    const __avKeywordOk =
      __avKeywords.length > 0 && __avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
    const __avRegex = /\b(?:moltbook|browse)\b/i;
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
        text.includes("moltbook") &&
        (text.includes("browse") ||
          text.includes("read") ||
          text.includes("check") ||
          text.includes("see") ||
          text.includes("what"))
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

    const submolt = options?.submolt as string | undefined;
    const sort = (options?.sort as string) || "hot";

    try {
      const posts = await service.moltbookBrowse(submolt, sort);

      if (posts.length === 0) {
        if (callback) {
          await callback({
            text: "No posts found on Moltbook.",
            data: { posts: [] },
          });
        }
        return { success: true, posts: [] };
      }

      const formattedPosts = posts
        .slice(0, 8)
        .map(
          (p) =>
            `[id:${p.id}] [${p.submolt?.name || "general"}] ${p.title} by ${
              p.author?.name || "anon"
            } (${p.upvotes || 0} votes, ${p.comment_count || 0} comments)`
        )
        .join("\n");

      if (callback) {
        await callback({
          text: `Moltbook posts (${sort}):\n\n${formattedPosts}`,
          data: { posts },
        });
      }

      return { success: true, posts };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (callback) {
        await callback({
          text: `Failed to browse Moltbook: ${errorMessage}`,
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
          text: "Browse Moltbook to see what's trending",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me check what's trending on Moltbook.",
          action: "MOLTBOOK_BROWSE",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "What are people talking about on Moltbook?",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I'll browse the latest Moltbook discussions.",
          action: "MOLTBOOK_BROWSE",
        },
      },
    ],
  ] as ActionExample[][],
};

export default moltbookBrowseAction;
