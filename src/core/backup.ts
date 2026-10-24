import type {
  DayStats,
  SiteCounters,
  Settings,
  SiteRule,
  StatsData,
  WordEntry,
} from '../shared/types';
import { MAX_MEANING_LENGTH, MAX_WORD_LENGTH, MAX_WORD_ROWS } from './csv';
import { MAX_RULES, normalizeRuleInput } from './rules';
import { normalizeSettings } from './settings';
import { isWordEntry } from './words';

export const BACKUP_APP = 'wait-a-moment';
export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_LENGTH = 8_000_000;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface BackupData {
  rules: SiteRule[];
  settings: Settings;
  words: Record<string, WordEntry>;
  stats: StatsData;
}

export type BackupParseResult =
  { ok: true; data: BackupData } | { ok: false; error: 'invalid_backup' | 'incompatible_store' };

export function buildBackup(data: BackupData, exportedAt: number): string {
  const payload = {
    app: BACKUP_APP,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    data,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** Validates a backup file end to end. Nothing is trusted just because it came from this extension. */
export function parseBackup(text: string): BackupParseResult {
  if (text.length > MAX_BACKUP_LENGTH) return invalid();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return invalid();
  }
  if (!isRecord(payload) || payload.app !== BACKUP_APP) return invalid();
  if (payload.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    const found = payload.schemaVersion;
    return typeof found === 'number' && found > BACKUP_SCHEMA_VERSION
      ? { ok: false, error: 'incompatible_store' }
      : invalid();
  }
  if (!isRecord(payload.data)) return invalid();

  const rules = parseRules(payload.data.rules);
  const words = parseWords(payload.data.words);
  const stats = parseStats(payload.data.stats);
  if (!rules || !words || !stats) return invalid();
  return {
    ok: true,
    data: { rules, settings: normalizeSettings(payload.data.settings), words, stats },
  };
}

function invalid(): BackupParseResult {
  return { ok: false, error: 'invalid_backup' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function parseRules(value: unknown): SiteRule[] | null {
  if (!Array.isArray(value) || value.length > MAX_RULES) return null;
  const items: unknown[] = value;
  const rules: SiteRule[] = [];
  const ids = new Set<string>();
  for (const item of items) {
    if (!isRecord(item)) return null;
    const { id, host, pathPrefix, includeSubdomains, enabled, createdAt } = item;
    if (
      typeof id !== 'string' ||
      id === '' ||
      ids.has(id) ||
      typeof host !== 'string' ||
      typeof pathPrefix !== 'string' ||
      typeof includeSubdomains !== 'boolean' ||
      typeof enabled !== 'boolean' ||
      typeof createdAt !== 'number'
    ) {
      return null;
    }
    // The stored host and path must already be in normalised form, or the file is rejected.
    const normalized = normalizeRuleInput(`${host}${pathPrefix}`);
    if (!normalized.ok || normalized.host !== host || normalized.pathPrefix !== pathPrefix) {
      return null;
    }
    ids.add(id);
    rules.push({ id, host, pathPrefix, includeSubdomains, enabled, createdAt });
  }
  return rules;
}

function parseWords(value: unknown): Record<string, WordEntry> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_WORD_ROWS) return null;
  const words: Record<string, WordEntry> = {};
  for (const [key, entry] of entries) {
    if (!isWordEntry(entry) || key !== entry.word.toLowerCase()) return null;
    if (entry.word.length > MAX_WORD_LENGTH || entry.meaning.length > MAX_MEANING_LENGTH) {
      return null;
    }
    words[key] = entry;
  }
  return words;
}

function parseStats(value: unknown): StatsData | null {
  if (!isRecord(value) || !isRecord(value.days)) return null;
  const days: Record<string, DayStats> = {};
  for (const [key, day] of Object.entries(value.days)) {
    if (!DAY_KEY.test(key) || !isRecord(day) || !isCount(day.wordActions)) return null;
    if (!isRecord(day.sites)) return null;
    const sites: Record<string, SiteCounters> = {};
    for (const [host, counters] of Object.entries(day.sites)) {
      if (!isRecord(counters)) return null;
      const { shown, abandoned, granted, grantedMinutes } = counters;
      if (!isCount(shown) || !isCount(abandoned) || !isCount(granted) || !isCount(grantedMinutes)) {
        return null;
      }
      sites[host] = { shown, abandoned, granted, grantedMinutes };
    }
    days[key] = { wordActions: day.wordActions, sites };
  }
  return { days };
}
