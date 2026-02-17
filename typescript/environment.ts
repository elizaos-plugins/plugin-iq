import type { IAgentRuntime } from "@elizaos/core";
import { DEFAULT_CHATROOM, DEFAULT_CHATROOMS, URLS } from "./constants";
import type { IQSettings } from "./types";

/**
 * Get IQ settings from runtime with proper priority:
 * Environment variables > Character settings > Defaults
 */
export function getIQSettings(runtime: IAgentRuntime): IQSettings {
  const getSetting = (key: string, defaultValue?: string): string | undefined => {
    const envValue = runtime.getSetting(key) as string | undefined;
    if (envValue && typeof envValue === "string" && envValue.trim()) {
      return envValue.trim();
    }

    // Check character settings
    const characterSettings = runtime.character?.settings?.iq as Record<string, string> | undefined;
    if (characterSettings?.[key]) {
      return characterSettings[key];
    }

    return defaultValue;
  };

  // Agent name: prefer IQ_AGENT_NAME, then character name
  const agentName = getSetting("IQ_AGENT_NAME") ?? runtime.character?.name ?? "Agent";

  // Parse chatrooms list from comma-separated string, or use defaults
  const chatroomsStr = getSetting("IQ_CHATROOMS");
  const chatrooms = chatroomsStr
    ? chatroomsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_CHATROOMS;

  const defaultChatroom = getSetting("IQ_DEFAULT_CHATROOM", DEFAULT_CHATROOM) ?? DEFAULT_CHATROOM;

  // Ensure default chatroom is in the chatrooms list
  if (!chatrooms.includes(defaultChatroom)) {
    chatrooms.unshift(defaultChatroom);
  }

  return {
    rpcUrl: getSetting("SOLANA_RPC_URL", URLS.solanaRpc) ?? URLS.solanaRpc,
    keypairPath: getSetting("SOLANA_KEYPAIR_PATH"),
    privateKey: getSetting("SOLANA_PRIVATE_KEY"),
    agentName,
    defaultChatroom,
    chatrooms,
    moltbookToken: getSetting("MOLTBOOK_TOKEN"),
    pnlApiUrl: getSetting("PNL_API_URL", URLS.pnl),
    gatewayUrl: getSetting("IQ_GATEWAY_URL", URLS.gateway),
  };
}

/**
 * Validate that required settings are present
 */
export function validateIQSettings(settings: IQSettings): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!settings.keypairPath && !settings.privateKey) {
    errors.push("Either SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY is required");
  }

  if (!settings.rpcUrl) {
    errors.push("SOLANA_RPC_URL is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
