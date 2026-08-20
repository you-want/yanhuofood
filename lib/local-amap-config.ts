import { z } from "zod";
import {
  localAmapConfigSchema,
  type LocalAmapConfig,
} from "@/lib/schemas/nearby";

export const LOCAL_AMAP_CONFIG_KEY = "yanhuofood.localAmapConfig";

const localAmapConfigEnvelopeSchema = z.object({
  version: z.literal(1),
  data: localAmapConfigSchema,
});

export const DEFAULT_LOCAL_AMAP_CONFIG: LocalAmapConfig = {
  enabled: true,
  webServiceKey: "",
};

export function readLocalAmapConfig(): LocalAmapConfig {
  if (typeof window === "undefined") return DEFAULT_LOCAL_AMAP_CONFIG;

  try {
    const raw = window.localStorage.getItem(LOCAL_AMAP_CONFIG_KEY);
    if (!raw) return DEFAULT_LOCAL_AMAP_CONFIG;
    const parsed = localAmapConfigEnvelopeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.data : DEFAULT_LOCAL_AMAP_CONFIG;
  } catch {
    return DEFAULT_LOCAL_AMAP_CONFIG;
  }
}

export function saveLocalAmapConfig(config: LocalAmapConfig) {
  if (typeof window === "undefined") return;
  const parsed = localAmapConfigSchema.parse(config);
  window.localStorage.setItem(
    LOCAL_AMAP_CONFIG_KEY,
    JSON.stringify({ version: 1, data: parsed })
  );
}

export function clearLocalAmapConfig() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LOCAL_AMAP_CONFIG_KEY);
}
