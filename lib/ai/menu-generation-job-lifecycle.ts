const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

export function menuGenerationJobStaleAfterMs() {
  const configured = Number(process.env.MENU_GENERATION_JOB_STALE_MS);
  return Number.isFinite(configured) && configured >= 60_000 ? configured : DEFAULT_STALE_AFTER_MS;
}

export function isMenuGenerationJobStale(
  job: { status?: string | null; heartbeat_at?: string | null; started_at?: string | null; created_at?: string | null },
  now = Date.now(),
  staleAfterMs = menuGenerationJobStaleAfterMs()
) {
  if (job.status !== "queued" && job.status !== "running") return false;
  const timestamp = job.heartbeat_at || job.started_at || job.created_at;
  if (!timestamp) return false;
  const lastActivityAt = Date.parse(timestamp);
  return Number.isFinite(lastActivityAt) && now - lastActivityAt > staleAfterMs;
}
