import type { IAgentRuntime } from "@elizaos/core";
import { DEFAULT_CHATROOM, DEFAULT_CHATROOMS, URLS, AUTONOMY_DEFAULTS } from "./constants";
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
    const characterSettings = runtime.character?.settings?.iq as
      | Record<string, string>
      | undefined;
    if (characterSettings && characterSettings[key]) {
      return characterSettings[key];
    }

    return defaultValue;
  };

  const getBoolSetting = (key: string, defaultValue: boolean): boolean => {
    const value = getSetting(key);
    if (value === undefined) return defaultValue;
    return value === "true" || value === "1";
  };

  const getNumberSetting = (key: string, defaultValue: number): number => {
    const value = getSetting(key);
    if (value === undefined) return defaultValue;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  };

  // Agent name: prefer IQ_AGENT_NAME, then character name
  const agentName = getSetting("IQ_AGENT_NAME") ?? runtime.character?.name ?? "Agent";

  // Parse chatrooms list from comma-separated string, or use defaults
  const chatroomsStr = getSetting("IQ_CHATROOMS");
  const chatrooms = chatroomsStr
    ? chatroomsStr.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_CHATROOMS;

  const defaultChatroom = getSetting("IQ_DEFAULT_CHATROOM", DEFAULT_CHATROOM) ?? DEFAULT_CHATROOM;

  // Ensure default chatroom is in the chatrooms list
  if (!chatrooms.includes(defaultChatroom)) {
    chatrooms.unshift(defaultChatroom);
  }

  return {
    // Required settings
    rpcUrl: getSetting("SOLANA_RPC_URL", URLS.solanaRpc) ?? URLS.solanaRpc,
    keypairPath: getSetting("SOLANA_KEYPAIR_PATH"),
    privateKey: getSetting("SOLANA_PRIVATE_KEY"),
    agentName,
    defaultChatroom,
    chatrooms,

    // LLM settings
    llmApiKey: getSetting("LLM_API_KEY") ?? getSetting("OPENROUTER_API_KEY"),
    llmBaseUrl: getSetting("LLM_BASE_URL", URLS.openrouter),
    model: getSetting("IQ_MODEL", AUTONOMY_DEFAULTS.defaultModel),

    // Moltbook integration
    moltbookToken: getSetting("MOLTBOOK_TOKEN"),

    // Agent personality
    personality: getSetting("IQ_PERSONALITY") ?? runtime.character?.bio?.join("\n"),

    // API URLs
    pnlApiUrl: getSetting("PNL_API_URL", URLS.pnl),
    gatewayUrl: getSetting("IQ_GATEWAY_URL", URLS.gateway),

    // Autonomy settings
    autonomyIntervalMs: getNumberSetting(
      "IQ_AUTONOMY_INTERVAL_MS",
      AUTONOMY_DEFAULTS.minIntervalMs
    ),
    autonomyMaxSteps: getNumberSetting("IQ_AUTONOMY_MAX_STEPS", 0), // 0 = unlimited
    autonomousMode: getBoolSetting("IQ_AUTONOMOUS_MODE", false),
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

  // Need either keypair path or private key
  if (!settings.keypairPath && !settings.privateKey) {
    errors.push("Either SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY is required");
  }

  if (!settings.rpcUrl) {
    errors.push("SOLANA_RPC_URL is required");
  }

  // For autonomous mode, LLM API key is required
  if (settings.autonomousMode && !settings.llmApiKey) {
    errors.push("LLM_API_KEY is required for autonomous mode");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
