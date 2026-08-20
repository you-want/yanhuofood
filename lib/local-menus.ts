import type { Menu, MenuRecord } from "@/lib/types";
import { getMenuStartDate, normalizeMenu } from "@/lib/domain/menu";

export const LOCAL_MENUS_KEY = "yanhuofood.localMenus";
const LOCAL_CLIENT_ID = "local-browser";
const MAX_LOCAL_MENUS = 24;

export type LocalMenuRecord = MenuRecord & {
  source?: "local" | "ai" | "sample" | "cache";
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function sortMenus(menus: LocalMenuRecord[]) {
  return [...menus].sort((a, b) => getRecordStartDate(b).localeCompare(getRecordStartDate(a)));
}

function getRecordStartDate(record: Pick<LocalMenuRecord, "week_start" | "start_date" | "data">) {
  return record.start_date || getMenuStartDate(record.data) || record.week_start;
}

function normalizeLocalRecord(record: LocalMenuRecord): LocalMenuRecord {
  const data = normalizeMenu(record.data);
  const startDate = record.start_date || getMenuStartDate(data);
  return {
    ...record,
    id: record.id || `local-${startDate}`,
    week_start: record.week_start || startDate,
    start_date: startDate,
    end_date: record.end_date || data.end_date,
    period_type: record.period_type || data.period_type,
    schema_version: record.schema_version || data.schema_version,
    data,
  };
}

export function readLocalMenus(): LocalMenuRecord[] {
  if (!canUseLocalStorage()) return [];

  try {
    const raw = window.localStorage.getItem(LOCAL_MENUS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return sortMenus(
      parsed
        .filter((item): item is LocalMenuRecord => {
          return !!item && !!item.data?.days && (!!item.week_start || !!item.start_date || !!item.data?.start_date || !!item.data?.week_start);
        })
        .map(normalizeLocalRecord)
    );
  } catch {
    return [];
  }
}

export function writeLocalMenus(menus: LocalMenuRecord[]) {
  if (!canUseLocalStorage()) return [];

  const next = sortMenus(menus).slice(0, MAX_LOCAL_MENUS);
  window.localStorage.setItem(LOCAL_MENUS_KEY, JSON.stringify(next));
  return next;
}

export function saveLocalMenu(menu: Menu, source: LocalMenuRecord["source"] = "local") {
  const now = new Date().toISOString();
  const normalized = normalizeMenu(menu);
  const startDate = getMenuStartDate(normalized);
  const existing = readLocalMenus();
  const existingRecord = existing.find((item) => getRecordStartDate(item) === startDate);
  const record: LocalMenuRecord = {
    id: `local-${startDate}`,
    client_id: LOCAL_CLIENT_ID,
    week_start: normalized.week_start,
    start_date: startDate,
    end_date: normalized.end_date,
    period_type: normalized.period_type,
    schema_version: normalized.schema_version,
    data: normalized,
    source,
    created_at: existingRecord?.created_at || now,
    updated_at: now,
  };

  return writeLocalMenus([
    record,
    ...existing.filter((item) => getRecordStartDate(item) !== startDate),
  ]);
}

export function mergeMenuRecords(serverMenus: LocalMenuRecord[], localMenus: LocalMenuRecord[]) {
  const byStartDate = new Map<string, LocalMenuRecord>();

  for (const menu of serverMenus) {
    const normalized = normalizeLocalRecord(menu);
    byStartDate.set(getRecordStartDate(normalized), normalized);
  }
  for (const menu of localMenus) {
    const normalized = normalizeLocalRecord(menu);
    const startDate = getRecordStartDate(normalized);
    const existing = byStartDate.get(startDate);
    const existingUpdatedAt = existing?.updated_at || existing?.created_at || "";
    const localUpdatedAt = normalized.updated_at || normalized.created_at || "";

    if (!existing || !existingUpdatedAt || !localUpdatedAt || localUpdatedAt >= existingUpdatedAt) {
      byStartDate.set(startDate, normalized);
    }
  }

  return sortMenus(Array.from(byStartDate.values()));
}
