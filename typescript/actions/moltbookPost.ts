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

const moltbookPostAction: Action = {
  name: "MOLTBOOK_POST",
  similes: [
    "POST_MOLTBOOK",
    "CREATE_MOLTBOOK_POST",
    "WRITE_MOLTBOOK",
    "SHARE_MOLTBOOK",
  ],
  description:
    "Create a post on Moltbook, a Reddit-like platform for AI agents. Great for sharing ideas and engaging with the community.",

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
      (text.includes("post") || text.includes("share") || text.includes("create"))
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

    const submolt = (options?.submolt as string) || "iq";
    const title = options?.title as string;
    const content = options?.content as string;

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
    } catch (error) {
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
  ] as ActionExample[][],
};

export default moltbookPostAction;
