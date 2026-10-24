import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BOX,
  RETRY_MS,
  applyMark,
  isMark,
  isWordEntry,
  mergeWords,
  pickWords,
} from '../../src/core/words';
import type { WordEntry } from '../../src/shared/types';

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const TEN_MINUTES = 10 * 60_000;
const FOURTEEN_DAYS = 14 * 24 * 60 * 60_000;

function word(text: string, overrides: Partial<WordEntry> = {}): WordEntry {
  return {
    word: text,
    meaning: `${text} 的释义`,
    source: 'builtin',
    box: 0,
    dueAt: 0,
    reviewCount: 0,
    addedAt: 0,
    ...overrides,
  };
}

describe('applyMark', () => {
  it('moves a known word up one box and schedules the next review further out', () => {
    const first = applyMark(word('a'), 'know', NOW);
    assert.equal(first.box, 1);
    assert.equal(first.dueAt, NOW + TEN_MINUTES);
    assert.equal(first.reviewCount, 1);

    const second = applyMark(first, 'know', NOW);
    assert.equal(second.box, 2);
    assert.ok(second.dueAt - NOW > first.dueAt - NOW);
  });

  it('never climbs past the last box', () => {
    const top = applyMark(word('a', { box: MAX_BOX, reviewCount: 9 }), 'know', NOW);
    assert.equal(top.box, MAX_BOX);
    assert.equal(top.dueAt, NOW + FOURTEEN_DAYS);
  });

  it('resets an unknown word to box 0 with a short retry', () => {
    const reset = applyMark(word('a', { box: 4, reviewCount: 3 }), 'unknown', NOW);
    assert.equal(reset.box, 0);
    assert.equal(reset.dueAt, NOW + RETRY_MS);
    assert.equal(reset.reviewCount, 4);
  });

  it('keeps the box when the user asks for a review', () => {
    const again = applyMark(word('a', { box: 3, reviewCount: 2 }), 'review', NOW);
    assert.equal(again.box, 3);
    assert.equal(again.dueAt, NOW + RETRY_MS);
  });
});

describe('pickWords', () => {
  it('shows due reviews first, most overdue first, then new words', () => {
    const entries: Array<[string, WordEntry]> = [
      ['new-a', word('new-a', { addedAt: 1 })],
      ['due-late', word('due-late', { reviewCount: 1, dueAt: NOW - 1_000 })],
      ['due-early', word('due-early', { reviewCount: 1, dueAt: NOW - 9_000 })],
      ['future', word('future', { reviewCount: 1, dueAt: NOW + 60_000 })],
      ['new-b', word('new-b', { addedAt: 2 })],
    ];
    assert.deepEqual(pickWords(entries, NOW, 4, new Set()), [
      'due-early',
      'due-late',
      'new-a',
      'new-b',
    ]);
  });

  it('skips words shown recently while other candidates exist', () => {
    const entries: Array<[string, WordEntry]> = [
      ['a', word('a', { addedAt: 1 })],
      ['b', word('b', { addedAt: 2 })],
      ['c', word('c', { addedAt: 3 })],
    ];
    assert.deepEqual(pickWords(entries, NOW, 2, new Set(['a'])), ['b', 'c']);
  });

  it('still fills the card from a small list by repeating words', () => {
    const entries: Array<[string, WordEntry]> = [['only', word('only', { addedAt: 1 })]];
    assert.deepEqual(pickWords(entries, NOW, 4, new Set(['only'])), ['only']);
  });

  it('returns nothing for an empty bank', () => {
    assert.deepEqual(pickWords([], NOW, 4, new Set()), []);
  });
});

describe('mergeWords', () => {
  it('adds new words, keeps existing progress, and counts both', () => {
    const existing = { hello: word('hello', { reviewCount: 3, box: 2 }) };
    const merged = mergeWords(
      existing,
      [
        { word: 'Hello', meaning: '你好' },
        { word: 'world', meaning: '世界' },
      ],
      'custom',
      NOW,
    );
    assert.equal(merged.added, 1);
    assert.equal(merged.existing, 1);
    const hello = merged.bank['hello'];
    const world = merged.bank['world'];
    assert.ok(hello && world);
    assert.equal(hello.reviewCount, 3);
    assert.equal(world.source, 'custom');
    assert.equal(world.addedAt, NOW);
  });
});

describe('validation helpers', () => {
  it('accepts only the three marks', () => {
    assert.equal(isMark('know'), true);
    assert.equal(isMark('unknown'), true);
    assert.equal(isMark('review'), true);
    assert.equal(isMark('delete'), false);
  });

  it('rejects stored entries with impossible boxes or missing fields', () => {
    assert.equal(isWordEntry(word('ok')), true);
    assert.equal(isWordEntry(word('bad', { box: MAX_BOX + 1 })), false);
    assert.equal(isWordEntry({ word: 'x' }), false);
    assert.equal(isWordEntry(word(' ')), false);
  });
});
