import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCK_TTL_MS,
  MAX_BLOCKS,
  createBlock,
  markShown,
  pruneBlocks,
  recordWordMark,
  resolveOutcome,
} from '../../src/core/blocks';
import type { BlockRecord, SiteRule } from '../../src/shared/types';

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const rule: SiteRule = {
  id: 'r1',
  host: 'zhihu.com',
  pathPrefix: '/',
  includeSubdomains: true,
  enabled: true,
  createdAt: 0,
};

function block(id: string, createdAt: number): BlockRecord {
  return createBlock({
    blockId: id,
    tabId: 1,
    url: 'https://zhihu.com/',
    rule,
    now: createdAt,
    waitMs: 10_000,
    words: ['abandon'],
  });
}

describe('block lifecycle', () => {
  it('starts pending, with the wait window and words attached', () => {
    const created = block('b1', NOW);
    assert.equal(created.outcome, null);
    assert.equal(created.shown, false);
    assert.equal(created.waitStartedAt, NOW);
    assert.equal(created.host, 'zhihu.com');
    assert.deepEqual(created.words, ['abandon']);
  });

  it('counts the first display only, so a reload is not counted again', () => {
    const first = markShown(block('b1', NOW));
    assert.ok(first);
    assert.equal(first.shown, true);
    assert.equal(markShown(first), null);
  });

  it('records the first outcome only', () => {
    const abandoned = resolveOutcome(block('b1', NOW), 'abandoned');
    assert.ok(abandoned);
    assert.equal(abandoned.outcome, 'abandoned');
    assert.equal(resolveOutcome(abandoned, 'abandoned'), null);
    assert.equal(resolveOutcome(abandoned, 'granted'), null);
  });

  it('records a word mark once per word, and only for words in this card', () => {
    const created = block('b1', NOW);
    const marked = recordWordMark(created, 'abandon', 'know');
    assert.ok(marked);
    assert.equal(marked.marked['abandon'], 'know');
    assert.equal(recordWordMark(marked, 'abandon', 'unknown'), null);
    assert.equal(recordWordMark(created, 'not-in-card', 'know'), null);
  });

  it('prunes expired records and keeps only the newest MAX_BLOCKS', () => {
    const records: Record<string, BlockRecord> = {};
    records['old'] = block('old', NOW - BLOCK_TTL_MS - 1);
    for (let i = 0; i < MAX_BLOCKS + 10; i += 1) {
      records[`n${i}`] = block(`n${i}`, NOW - i);
    }
    const pruned = pruneBlocks(records, NOW);
    assert.equal(pruned['old'], undefined);
    assert.equal(Object.keys(pruned).length, MAX_BLOCKS);
    assert.ok(pruned['n0']);
    assert.equal(pruned[`n${MAX_BLOCKS + 9}`], undefined);
  });
});
