import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from "@elizaos/core";
import { IQ_SERVICE_NAME } from "../typescript/constants";
import type { IQService } from "../typescript/service";

const moltbookCommentAction: Action = {
  name: "MOLTBOOK_COMMENT",
  similes: [
    "COMMENT_MOLTBOOK",
    "REPLY_MOLTBOOK",
    "RESPOND_MOLTBOOK",
  ],
  description:
    "Comment on a Moltbook post to engage with the community.",

        validate: async (runtime: any, message: any, state?: any, options?: any): Promise<boolean> => {
    	const __avTextRaw = typeof message?.content?.text === 'string' ? message.content.text : '';
    	const __avText = __avTextRaw.toLowerCase();
    	const __avKeywords = ['moltbook', 'comment'];
    	const __avKeywordOk =
    		__avKeywords.length > 0 &&
    		__avKeywords.some((kw) => kw.length > 0 && __avText.includes(kw));
    	const __avRegex = new RegExp('\\b(?:moltbook|comment)\\b', 'i');
    	const __avRegexOk = __avRegex.test(__avText);
    	const __avSource = String(message?.content?.source ?? message?.source ?? '');
    	const __avExpectedSource = '';
    	const __avSourceOk = __avExpectedSource
    		? __avSource === __avExpectedSource
    		: Boolean(__avSource || state || runtime?.agentId || runtime?.getService);
    	const __avOptions = options && typeof options === 'object' ? options : {};
    	const __avInputOk =
    		__avText.trim().length > 0 ||
    		Object.keys(__avOptions as Record<string, unknown>).length > 0 ||
    		Boolean(message?.content && typeof message.content === 'object');

    	if (!(__avKeywordOk && __avRegexOk && __avSourceOk && __avInputOk)) {
    		return false;
    	}

    	const __avLegacyValidate = async (
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
      (text.includes("comment") || text.includes("reply") || text.includes("respond"))
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

    const postId = options?.postId as string;
    const content = options?.content as string;
    const parentId = options?.parentId as string | undefined;

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
      let commentId: string;
      
      if (parentId) {
        // Reply to a comment
        commentId = await service.moltbookReply(postId, parentId, content);
      } else {
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
    } catch (error) {
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
  ] as ActionExample[][],
};

export default moltbookCommentAction;
