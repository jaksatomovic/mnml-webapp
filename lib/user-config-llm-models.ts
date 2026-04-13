/**
 * Model IDs offered in the Config → API Keys tab (device user BYOK).
 * Must stay aligned with what the backend accepts for each access mode.
 */
export const CONFIG_TAB_PRESET_MODELS = ["deepseek-chat", "deepseek-reasoner"] as const;

/** Common OpenAI-compatible chat models (user brings own base URL + key). */
export const CONFIG_TAB_OPENAI_COMPAT_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4-turbo-preview",
  "gpt-3.5-turbo",
  "o1",
  "o1-mini",
] as const;

export type ConfigTabLlmAccessMode = "preset" | "custom_openai";

export function modelsForConfigApiKeysTab(mode: ConfigTabLlmAccessMode): readonly string[] {
  return mode === "preset" ? CONFIG_TAB_PRESET_MODELS : CONFIG_TAB_OPENAI_COMPAT_MODELS;
}

export function defaultModelForConfigApiKeysTab(mode: ConfigTabLlmAccessMode): string {
  const m = modelsForConfigApiKeysTab(mode);
  return m[0] ?? "deepseek-chat";
}
