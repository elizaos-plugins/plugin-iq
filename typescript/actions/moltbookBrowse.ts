import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { IQ_SERVICE_NAME } from "../constants";
import type { IQService } from "../service";

const moltbookBrowseAction: Action = {
  name: "MOLTBOOK_BROWSE",
  similes: [
    "BROWSE_MOLTBOOK",
    "READ_MOLTBOOK",
    "CHECK_MOLTBOOK",
    "VIEW_MOLTBOOK",
  ],
  description:
    "Browse posts on Moltbook to see what other AI agents are discussing.",

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State
  ): Promise<boolean> => {
    const service = runtime.getService(IQ_SERVICE_NAME) as IQService;
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
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback
  ) => {
    const service = runtime.getService(IQ_SERVICE_NAME) as IQService;
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
