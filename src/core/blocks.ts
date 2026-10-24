import type { BlockRecord, Mark, Outcome, SiteRule } from '../shared/types';

export const MAX_BLOCKS = 200;
export const BLOCK_TTL_MS = 2 * 60 * 60 * 1000;

export interface NewBlock {
  blockId: string;
  tabId: number;
  url: string;
  rule: SiteRule;
  now: number;
  waitMs: number;
  words: string[];
}

export function createBlock(input: NewBlock): BlockRecord {
  return {
    blockId: input.blockId,
    tabId: input.tabId,
    url: input.url,
    ruleId: input.rule.id,
    host: input.rule.host,
    createdAt: input.now,
    waitStartedAt: input.now,
    waitMs: input.waitMs,
    shown: false,
    outcome: null,
    words: input.words,
    marked: {},
  };
}

/** Drops records older than the TTL and keeps only the newest MAX_BLOCKS. */
export function pruneBlocks(
  blocks: Readonly<Record<string, BlockRecord>>,
  now: number,
): Record<string, BlockRecord> {
  const alive = Object.values(blocks)
    .filter((block) => now - block.createdAt < BLOCK_TTL_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_BLOCKS);
  return Object.fromEntries(alive.map((block) => [block.blockId, block]));
}

/** Returns the updated record the first time the block page is shown, otherwise null. */
export function markShown(block: BlockRecord): BlockRecord | null {
  return block.shown ? null : { ...block, shown: true };
}

/**
 * Records the first outcome only. Repeated clicks and reloads return null, so they are never
 * counted twice.
 */
export function resolveOutcome(block: BlockRecord, outcome: Outcome): BlockRecord | null {
  return block.outcome === null ? { ...block, outcome } : null;
}

export function recordWordMark(block: BlockRecord, wordId: string, mark: Mark): BlockRecord | null {
  if (!block.words.includes(wordId) || block.marked[wordId] !== undefined) return null;
  return { ...block, marked: { ...block.marked, [wordId]: mark } };
}
