import type { LocalModelConfig } from "@/lib/types";

export const LOCAL_MODEL_CONFIG_KEY = "yanhuofood.localModelConfig";

export const DEFAULT_LOCAL_MODEL_CONFIG: LocalModelConfig = {
  enabled: false,
  provider: "openai",
  api_key: "",
  base_url: "",
  model: "gpt-4o-mini",
};

export function readLocalModelConfig(): LocalModelConfig {
  if (typeof window === "undefined") return DEFAULT_LOCAL_MODEL_CONFIG;
  try {
    const raw = window.localStorage.getItem(LOCAL_MODEL_CONFIG_KEY);
    if (!raw) return DEFAULT_LOCAL_MODEL_CONFIG;
    return { ...DEFAULT_LOCAL_MODEL_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LOCAL_MODEL_CONFIG;
  }
}

export function saveLocalModelConfig(config: LocalModelConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_MODEL_CONFIG_KEY, JSON.stringify(config));
}

export function clearLocalModelConfig() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_MODEL_CONFIG_KEY);
}
