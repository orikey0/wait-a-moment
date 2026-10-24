import type { Mark, WordEntry } from '../shared/types';
import type { WordRow } from './csv';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * A simple Leitner-style schedule: each "know" mark moves a word one box up and waits longer
 * before the next review; "unknown" resets it to box 0. This is a heuristic, not a memory guarantee.
 */
export const BOX_INTERVALS_MS: readonly number[] = [
  0,
  10 * MINUTE_MS,
  DAY_MS,
  3 * DAY_MS,
  7 * DAY_MS,
  14 * DAY_MS,
];
export const RETRY_MS = 10 * MINUTE_MS;
export const MAX_BOX = BOX_INTERVALS_MS.length - 1;

const MARKS: readonly string[] = ['know', 'unknown', 'review'];

export function isMark(value: unknown): value is Mark {
  return typeof value === 'string' && MARKS.includes(value);
}

export function isNewWord(entry: WordEntry): boolean {
  return entry.reviewCount === 0;
}

export function applyMark(entry: WordEntry, mark: Mark, now: number): WordEntry {
  const reviewCount = entry.reviewCount + 1;
  switch (mark) {
    case 'know': {
      const box = Math.min(entry.box + 1, MAX_BOX);
      return { ...entry, box, dueAt: now + (BOX_INTERVALS_MS[box] ?? RETRY_MS), reviewCount };
    }
    case 'unknown':
      return { ...entry, box: 0, dueAt: now + RETRY_MS, reviewCount };
    case 'review':
      return { ...entry, dueAt: now + RETRY_MS, reviewCount };
  }
}

/**
 * Chooses the words for one card: due reviews first (most overdue first), then new words. Words
 * shown recently are skipped while other candidates remain, so the same batch does not keep coming back.
 */
export function pickWords(
  entries: ReadonlyArray<readonly [string, WordEntry]>,
  now: number,
  count: number,
  recent: ReadonlySet<string>,
): string[] {
  const due = entries
    .filter(([, entry]) => !isNewWord(entry) && entry.dueAt <= now)
    .sort(([idA, a], [idB, b]) => a.dueAt - b.dueAt || compareText(idA, idB));
  const fresh = entries
    .filter(([, entry]) => isNewWord(entry))
    .sort(([idA, a], [idB, b]) => a.addedAt - b.addedAt || compareText(idA, idB));
  const ordered = [...due, ...fresh].map(([id]) => id);

  const picked: string[] = [];
  for (const id of ordered) {
    if (picked.length < count && !recent.has(id)) picked.push(id);
  }
  // Small word lists may have to repeat recent words to fill the card.
  for (const id of ordered) {
    if (picked.length < count && !picked.includes(id)) picked.push(id);
  }
  return picked;
}

/** Adds rows that are not in the bank yet. Existing words keep their progress. */
export function mergeWords(
  bank: Readonly<Record<string, WordEntry>>,
  rows: readonly WordRow[],
  source: WordEntry['source'],
  now: number,
): { bank: Record<string, WordEntry>; added: number; existing: number } {
  const next: Record<string, WordEntry> = { ...bank };
  let added = 0;
  let existing = 0;
  for (const row of rows) {
    const id = row.word.toLowerCase();
    if (next[id]) {
      existing += 1;
      continue;
    }
    next[id] = {
      word: row.word,
      meaning: row.meaning,
      source,
      box: 0,
      dueAt: 0,
      reviewCount: 0,
      addedAt: now,
    };
    added += 1;
  }
  return { bank: next, added, existing };
}

export function isWordEntry(value: unknown): value is WordEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<Record<keyof WordEntry, unknown>>;
  return (
    typeof entry.word === 'string' &&
    entry.word.trim() !== '' &&
    typeof entry.meaning === 'string' &&
    entry.meaning.trim() !== '' &&
    (entry.source === 'builtin' || entry.source === 'custom') &&
    typeof entry.box === 'number' &&
    Number.isInteger(entry.box) &&
    entry.box >= 0 &&
    entry.box <= MAX_BOX &&
    typeof entry.dueAt === 'number' &&
    typeof entry.reviewCount === 'number' &&
    typeof entry.addedAt === 'number'
  );
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
