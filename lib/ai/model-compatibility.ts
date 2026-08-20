function requiresThinking(normalizedModel: string) {
  // qwen3.x-plus and qwen3-max are thinking models; qwen3.x-flash is not
  return /^qwen3\.(?:5|6|7)-plus(?:[-.]|$)/.test(normalizedModel)
    || /^qwen3-max(?:[-.]|$)/.test(normalizedModel);
}

export function modelCompatibilityOptions(model: string) {
  const normalizedModel = model.trim().toLowerCase();
  return requiresThinking(normalizedModel) ? { enable_thinking: true } : {};
}

/**
 * Whether the model spends significant time on hidden reasoning tokens before
 * emitting an answer. Such models are much slower per call, so both the request
 * path and the per-call timeout budget need to account for them.
 *
 * Covers DashScope qwen thinking variants (which also set `enable_thinking`) and
 * OpenAI reasoning families (o1/o3/o4, gpt-5 reasoning tiers).
 */
export function isThinkingModel(model: string) {
  const normalizedModel = model.trim().toLowerCase();
  return (
    requiresThinking(normalizedModel) ||
    /^o[134](?:[-.]|$)/.test(normalizedModel) ||
    /^gpt-5/.test(normalizedModel)
  );
}

// Default per-call timeout budgets (ms). Thinking models need a much larger
// budget because hidden reasoning tokens are emitted before the answer.
// DashScope qwen models (even fast variants) are often slower than OpenAI's
// API, so the default is tuned conservatively.
const DEFAULT_TIMEOUT_MS = 60_000;
const THINKING_TIMEOUT_MS = 120_000;

/**
 * Resolves the per-call model timeout in ms.
 *
 * Priority: explicit `OPENAI_REQUEST_TIMEOUT_MS` env override (>=5000) wins for
 * all models. Otherwise thinking models get a larger default than fast models.
 */
export function resolveModelTimeoutMs(model: string) {
  const configured = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 5_000) return configured;
  return isThinkingModel(model) ? THINKING_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

/**
 * Returns `{ response_format: { type: "json_object" } }` when the model is known
 * to support JSON mode, otherwise `{}`.
 *
 * Enabling JSON mode drastically reduces malformed/truncated JSON, which is a
 * major cause of repair round-trips and outright failures. But it is not
 * universally supported:
 *  - DashScope (aliyun) rejects `json_object` when `enable_thinking: true`, so
 *    thinking models (qwen3.5/6/7, qwen3-max) are excluded by default.
 *  - Unknown providers may not implement it at all.
 *
 * Default policy: enabled for OpenAI gpt/o-series, disabled for thinking models
 * and unknown providers. Override with the `OPENAI_JSON_MODE` env var
 * (`on` forces it everywhere, `off` disables it everywhere).
 */
export function jsonResponseFormatOptions(model: string) {
  const normalizedModel = model.trim().toLowerCase();
  const mode = (process.env.OPENAI_JSON_MODE || "").trim().toLowerCase();

  if (mode === "off") return {};
  if (mode === "on") return { response_format: { type: "json_object" as const } };

  // Auto policy: never combine json_object with thinking (DashScope rejects it).
  if (requiresThinking(normalizedModel)) return {};

  const supportsJsonMode =
    normalizedModel.startsWith("gpt-") ||
    normalizedModel.startsWith("gpt4") ||
    normalizedModel.startsWith("o1") ||
    normalizedModel.startsWith("o3") ||
    normalizedModel.startsWith("o4");

  return supportsJsonMode ? { response_format: { type: "json_object" as const } } : {};
}
