import { recordWordMark, markShown as markBlockShown, resolveOutcome } from '../core/blocks';
import { MAX_BACKUP_LENGTH, parseBackup } from '../core/backup';
import { parseWordCsv } from '../core/csv';
import { CURRENT_SCHEMA_VERSION } from '../core/migration';
import { MAX_RULES, createRule, findDuplicate, normalizeRuleInput } from '../core/rules';
import { applySettingsPatch } from '../core/settings';
import { dayKey, emptyStats, pruneStats, recordEvent, type StatsEvent } from '../core/stats';
import { mergeGrant, reconcileWaitWindow, remainingWaitMs } from '../core/timing';
import { applyMark, isMark, mergeWords } from '../core/words';
import sampleWordsCsv from '../data/sample-words.csv';
import type { BlockView, ErrorCode, Failure, Replies, Request, WordView } from '../shared/messages';
import type { BlockRecord, Mark, Settings, SiteRule, WordEntry } from '../shared/types';
import { seedDefaults } from './lifecycle';
import {
  StorageFailure,
  clearLocal,
  clearSession,
  exclusive,
  loadBlocks,
  loadGrants,
  loadRules,
  loadSettings,
  loadStats,
  loadTabs,
  loadWords,
  writeLocal,
  writeSession,
} from './storage';

type AnyReply = Replies[keyof Replies];

const REQUEST_TYPES: readonly string[] = [
  'block.get',
  'block.shown',
  'block.abandon',
  'block.grant',
  'block.markWord',
  'admin.snapshot',
  'rules.add',
  'rules.update',
  'rules.remove',
  'settings.update',
  'words.import',
  'words.restoreSample',
  'words.clear',
  'stats.clear',
  'data.clear',
  'data.restore',
];

const MAX_CSV_CHARS = 2_000_000;

/** Every request runs inside the same queue as navigation handling, so writes never interleave. */
export async function handleRequest(message: unknown): Promise<AnyReply> {
  if (!isRequest(message)) return fail('invalid_request');
  try {
    return await exclusive(() => dispatch(message));
  } catch (error) {
    if (error instanceof StorageFailure) return fail('storage_failed');
    return fail('internal');
  }
}

function isRequest(value: unknown): value is Request {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && REQUEST_TYPES.includes(type);
}

function fail(error: ErrorCode): Failure {
  return { ok: false, error };
}

async function dispatch(request: Request): Promise<AnyReply> {
  switch (request.type) {
    case 'block.get':
      return getBlock(request.blockId);
    case 'block.shown':
      return markShownAction(request.blockId);
    case 'block.abandon':
      return abandonBlock(request.blockId);
    case 'block.grant':
      return grantBlock(request.blockId, request.minutes);
    case 'block.markWord':
      return markWord(request.blockId, request.wordId, request.mark);
    case 'admin.snapshot':
      return snapshot();
    case 'rules.add':
      return addRule(request.input, request.includeSubdomains);
    case 'rules.update':
      return updateRule(request.id, request);
    case 'rules.remove':
      return removeRule(request.id);
    case 'settings.update':
      return updateSettings(request.patch);
    case 'words.import':
      return importWords(request.text);
    case 'words.restoreSample':
      return restoreSample();
    case 'words.clear':
      return clearWords();
    case 'stats.clear':
      return clearStats();
    case 'data.clear':
      return clearAll();
    case 'data.restore':
      return restoreBackup(request.text);
  }
}

// Interception pages

async function getBlock(blockId: string): Promise<Replies['block.get']> {
  const now = Date.now();
  const [blocks, settings, words] = await Promise.all([loadBlocks(), loadSettings(), loadWords()]);
  const block = blocks[blockId];
  if (!block) return fail('unknown_block');

  const window = reconcileWaitWindow(
    { waitStartedAt: block.waitStartedAt, waitMs: block.waitMs },
    now,
  );
  if (window.waitStartedAt !== block.waitStartedAt) {
    await writeSession({
      blocks: { ...blocks, [blockId]: { ...block, waitStartedAt: window.waitStartedAt } },
    });
  }
  return { ok: true, block: toBlockView(block, window.waitStartedAt, settings, words) };
}

function toBlockView(
  block: BlockRecord,
  waitStartedAt: number,
  settings: Settings,
  words: Record<string, WordEntry>,
): BlockView {
  return {
    host: block.host,
    targetUrl: block.url,
    waitStartedAt,
    waitMs: block.waitMs,
    outcome: block.outcome,
    grantMinutes: settings.grantMinutes,
    moveButtons: settings.moveButtons,
    motion: settings.motion,
    theme: settings.theme,
    wordsEnabled: settings.wordsEnabled,
    words: block.words.flatMap((id) => {
      const entry = words[id];
      return entry
        ? [{ id, word: entry.word, meaning: entry.meaning, mark: block.marked[id] ?? null }]
        : [];
    }),
  };
}

async function markShownAction(blockId: string): Promise<Replies['block.shown']> {
  const [blocks, settings] = await Promise.all([loadBlocks(), loadSettings()]);
  const block = blocks[blockId];
  if (!block) return fail('unknown_block');
  const updated = markBlockShown(block);
  if (updated) {
    await writeSession({ blocks: { ...blocks, [blockId]: updated } });
    await recordStat({ type: 'shown', host: block.host }, settings.statsEnabled);
  }
  return { ok: true };
}

async function abandonBlock(blockId: string): Promise<Replies['block.abandon']> {
  const [blocks, tabs, settings] = await Promise.all([loadBlocks(), loadTabs(), loadSettings()]);
  const block = blocks[blockId];
  if (!block) return { ok: true, returnUrl: null };
  const resolved = resolveOutcome(block, 'abandoned');
  if (resolved) {
    await writeSession({ blocks: { ...blocks, [blockId]: resolved } });
    await recordStat({ type: 'abandoned', host: block.host }, settings.statsEnabled);
  }
  return { ok: true, returnUrl: tabs[String(block.tabId)]?.safeUrl ?? null };
}

async function grantBlock(blockId: string, minutes: number): Promise<Replies['block.grant']> {
  const now = Date.now();
  const [blocks, settings, grants] = await Promise.all([
    loadBlocks(),
    loadSettings(),
    loadGrants(),
  ]);
  const block = blocks[blockId];
  if (!block) return fail('unknown_block');
  if (block.outcome !== null) return fail('already_resolved');
  if (!settings.grantMinutes.includes(minutes)) return fail('invalid_minutes');

  const window = reconcileWaitWindow(
    { waitStartedAt: block.waitStartedAt, waitMs: block.waitMs },
    now,
  );
  const remaining = remainingWaitMs(window, now);
  if (remaining > 0) return { ok: false, error: 'wait_pending', remainingMs: remaining };

  const resolved = resolveOutcome(block, 'granted');
  if (!resolved) return fail('already_resolved');

  // The grant is written before the outcome. If the grant write fails, the block stays open.
  await writeLocal({
    grants: { ...grants, [block.ruleId]: mergeGrant(grants[block.ruleId], now, minutes) },
  });
  await writeSession({
    blocks: { ...blocks, [blockId]: { ...resolved, waitStartedAt: window.waitStartedAt } },
  });
  await recordStat({ type: 'granted', host: block.host, minutes }, settings.statsEnabled);
  return { ok: true, targetUrl: block.url };
}

async function markWord(
  blockId: string,
  wordId: string,
  mark: Mark,
): Promise<Replies['block.markWord']> {
  if (!isMark(mark)) return fail('invalid_request');
  const now = Date.now();
  const [blocks, words, settings] = await Promise.all([loadBlocks(), loadWords(), loadSettings()]);
  const block = blocks[blockId];
  if (!block) return fail('unknown_block');
  if (!block.words.includes(wordId)) return fail('not_in_block');
  const entry = words[wordId];
  if (!entry) return fail('unknown_word');

  const updated = recordWordMark(block, wordId, mark);
  if (!updated) return { ok: true, duplicate: true };
  await writeLocal({ words: { ...words, [wordId]: applyMark(entry, mark, now) } });
  await writeSession({ blocks: { ...blocks, [blockId]: updated } });
  await recordStat({ type: 'word' }, settings.statsEnabled);
  return { ok: true, duplicate: false };
}

async function recordStat(event: StatsEvent, enabled: boolean): Promise<void> {
  if (!enabled) return;
  const now = Date.now();
  const stats = await loadStats();
  await writeLocal({ stats: pruneStats(recordEvent(stats, event, now), dayKey(now)) });
}

// Options page

async function snapshot(): Promise<Replies['admin.snapshot']> {
  const [rules, settings, words, stats, grants] = await Promise.all([
    loadRules(),
    loadSettings(),
    loadWords(),
    loadStats(),
    loadGrants(),
  ]);
  const views: WordView[] = Object.entries(words).map(([id, entry]) => ({ ...entry, id }));
  return { ok: true, snapshot: { now: Date.now(), rules, settings, words: views, stats, grants } };
}

async function addRule(input: string, includeSubdomains: boolean): Promise<Replies['rules.add']> {
  if (typeof input !== 'string' || typeof includeSubdomains !== 'boolean') {
    return fail('invalid_request');
  }
  const normalized = normalizeRuleInput(input);
  if (!normalized.ok) return fail(normalized.error);
  const rules = await loadRules();
  if (rules.length >= MAX_RULES) return fail('too_many_rules');

  const scope = { host: normalized.host, pathPrefix: normalized.pathPrefix, includeSubdomains };
  if (findDuplicate(rules, scope)) return fail('duplicate');
  const rule = createRule(scope, crypto.randomUUID(), Date.now());
  await writeLocal({ rules: [...rules, rule] });
  return { ok: true, rule };
}

async function updateRule(
  id: string,
  patch: { enabled?: boolean; includeSubdomains?: boolean },
): Promise<Replies['rules.update']> {
  const rules = await loadRules();
  const current = rules.find((rule) => rule.id === id);
  if (!current) return fail('not_found');
  const next: SiteRule = {
    ...current,
    enabled: patch.enabled ?? current.enabled,
    includeSubdomains: patch.includeSubdomains ?? current.includeSubdomains,
  };
  if (
    findDuplicate(
      rules.filter((rule) => rule.id !== id),
      next,
    )
  )
    return fail('duplicate');
  await writeLocal({ rules: rules.map((rule) => (rule.id === id ? next : rule)) });
  return { ok: true };
}

async function removeRule(id: string): Promise<Replies['rules.remove']> {
  const rules = await loadRules();
  if (!rules.some((rule) => rule.id === id)) return fail('not_found');
  const grants = await loadGrants();
  await writeLocal({
    rules: rules.filter((rule) => rule.id !== id),
    grants: Object.fromEntries(Object.entries(grants).filter(([ruleId]) => ruleId !== id)),
  });
  return { ok: true };
}

async function updateSettings(patch: Partial<Settings>): Promise<Replies['settings.update']> {
  const next = applySettingsPatch(await loadSettings(), patch);
  if (!next) return fail('invalid_settings');
  await writeLocal({ settings: next });
  return { ok: true, settings: next };
}

async function importWords(text: string): Promise<Replies['words.import']> {
  if (typeof text !== 'string') return fail('invalid_request');
  if (text.length > MAX_CSV_CHARS) return fail('invalid_words');
  const parsed = parseWordCsv(text);
  if (!parsed.ok) return { ok: false, error: 'invalid_words', issues: parsed.issues };
  const merged = mergeWords(await loadWords(), parsed.rows, 'custom', Date.now());
  await writeLocal({ words: merged.bank });
  return {
    ok: true,
    added: merged.added,
    existing: merged.existing,
    duplicates: parsed.duplicates,
  };
}

async function restoreSample(): Promise<Replies['words.restoreSample']> {
  const parsed = parseWordCsv(sampleWordsCsv);
  if (!parsed.ok) return fail('invalid_words');
  const merged = mergeWords(await loadWords(), parsed.rows, 'builtin', Date.now());
  await writeLocal({ words: merged.bank });
  return { ok: true, added: merged.added };
}

async function clearWords(): Promise<Replies['words.clear']> {
  await writeLocal({ words: {} });
  await writeSession({ recentWords: [] });
  return { ok: true };
}

async function clearStats(): Promise<Replies['stats.clear']> {
  await writeLocal({ stats: emptyStats() });
  return { ok: true };
}

async function clearAll(): Promise<Replies['data.clear']> {
  await clearLocal();
  await clearSession();
  await seedDefaults();
  return { ok: true };
}

async function restoreBackup(text: string): Promise<Replies['data.restore']> {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_LENGTH) return fail('invalid_backup');
  const parsed = parseBackup(text);
  if (!parsed.ok) return fail(parsed.error);
  const { rules, settings, words, stats } = parsed.data;
  await writeLocal({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rules,
    settings,
    words,
    stats,
    grants: {},
  });
  await clearSession();
  return { ok: true, rules: rules.length, words: Object.keys(words).length };
}
