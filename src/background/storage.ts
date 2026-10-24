import { isSiteRule } from '../core/rules';
import { normalizeSettings } from '../core/settings';
import { emptyStats } from '../core/stats';
import { isWordEntry } from '../core/words';
import type {
  BlockRecord,
  Grant,
  Settings,
  SiteRule,
  StatsData,
  TabState,
  WordEntry,
} from '../shared/types';

/** Thrown when the browser refuses a write, for example when storage quota is exhausted. */
export class StorageFailure extends Error {
  constructor() {
    super('storage write failed');
    this.name = 'StorageFailure';
  }
}

type Bag = Record<string, unknown>;

let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs read-modify-write sequences one at a time. Several tabs can report navigations at once, and
 * without this two updates could read the same old value and one would be lost.
 */
export function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => undefined);
  return result;
}

async function readLocal(key: string): Promise<unknown> {
  const bag: Bag = await chrome.storage.local.get(key);
  return bag[key];
}

async function readSession(key: string): Promise<unknown> {
  const bag: Bag = await chrome.storage.session.get(key);
  return bag[key];
}

function asRecord<T>(value: unknown): Record<string, T> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, T>;
}

export async function writeLocal(entries: Bag): Promise<void> {
  try {
    await chrome.storage.local.set(entries);
  } catch {
    throw new StorageFailure();
  }
}

export async function writeSession(entries: Bag): Promise<void> {
  try {
    await chrome.storage.session.set(entries);
  } catch {
    throw new StorageFailure();
  }
}

export async function clearLocal(): Promise<void> {
  try {
    await chrome.storage.local.clear();
  } catch {
    throw new StorageFailure();
  }
}

export async function clearSession(): Promise<void> {
  try {
    await chrome.storage.session.clear();
  } catch {
    throw new StorageFailure();
  }
}

export function readSchemaVersion(): Promise<unknown> {
  return readLocal('schemaVersion');
}

// Persisted data (survives browser restarts): rules, settings, words, statistics and grants.

export async function loadRules(): Promise<SiteRule[]> {
  const raw = await readLocal('rules');
  return Array.isArray(raw) ? (raw as unknown[]).filter(isSiteRule) : [];
}

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await readLocal('settings'));
}

export async function loadWords(): Promise<Record<string, WordEntry>> {
  const words: Record<string, WordEntry> = {};
  for (const [id, entry] of Object.entries(asRecord<unknown>(await readLocal('words')))) {
    if (isWordEntry(entry)) words[id] = entry;
  }
  return words;
}

export async function loadStats(): Promise<StatsData> {
  const raw = await readLocal('stats');
  return typeof raw === 'object' && raw !== null && 'days' in raw
    ? (raw as StatsData)
    : emptyStats();
}

export async function loadGrants(): Promise<Record<string, Grant>> {
  return asRecord<Grant>(await readLocal('grants'));
}

// Session data (cleared when the browser restarts): interceptions, tab state and word rotation.

export async function loadBlocks(): Promise<Record<string, BlockRecord>> {
  return asRecord<BlockRecord>(await readSession('blocks'));
}

export async function loadTabs(): Promise<Record<string, TabState>> {
  return asRecord<TabState>(await readSession('tabs'));
}

export async function loadRecentWords(): Promise<string[]> {
  const raw = await readSession('recentWords');
  return Array.isArray(raw)
    ? (raw as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];
}
