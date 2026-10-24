import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_WORD_ROWS, parseCsv, parseWordCsv } from '../../src/core/csv';
import sampleWords from '../../src/data/sample-words.csv';

describe('parseCsv', () => {
  it('handles quoted commas, doubled quotes, CRLF and a byte-order mark', () => {
    const rows = parseCsv('﻿word,meaning\r\n"a, b","say ""hi"""\r\n');
    assert.deepEqual(rows, [
      ['word', 'meaning'],
      ['a, b', 'say "hi"'],
    ]);
  });

  it('rejects a quote in the middle of an unquoted field', () => {
    const result = parseWordCsv('word,meaning\nab"c,释义\n');
    assert.deepEqual(result, { ok: false, issues: [{ code: 'syntax' }] });
  });

  it('rejects an unterminated quote', () => {
    const result = parseWordCsv('word,meaning\n"abc,释义\n');
    assert.deepEqual(result, { ok: false, issues: [{ code: 'syntax' }] });
  });
});

describe('parseWordCsv', () => {
  it('imports valid rows and counts case-insensitive duplicates without failing', () => {
    const result = parseWordCsv('word,meaning\nHello,你好\nhello,重复\nworld,世界\n');
    assert.deepEqual(result, {
      ok: true,
      rows: [
        { word: 'Hello', meaning: '你好' },
        { word: 'world', meaning: '世界' },
      ],
      duplicates: 1,
    });
  });

  it('accepts the columns in any order and ignores extra columns', () => {
    const result = parseWordCsv('meaning,note,word\n你好,x,hello\n');
    assert.deepEqual(result, {
      ok: true,
      rows: [{ word: 'hello', meaning: '你好' }],
      duplicates: 0,
    });
  });

  it('rejects an empty file', () => {
    assert.deepEqual(parseWordCsv('\n  \n'), { ok: false, issues: [{ code: 'empty' }] });
  });

  it('rejects a file without the word and meaning columns', () => {
    assert.deepEqual(parseWordCsv('term,definition\nhi,hello\n'), {
      ok: false,
      issues: [{ code: 'missing_columns' }],
    });
  });

  it('reports the record number of an empty field and rejects the whole file', () => {
    const result = parseWordCsv('word,meaning\nok,好\n,缺失\n');
    assert.deepEqual(result, { ok: false, issues: [{ code: 'missing_field', record: 2 }] });
  });

  it('rejects over-long words and control characters', () => {
    const long = parseWordCsv(`word,meaning\n${'x'.repeat(61)},释义\n`);
    assert.deepEqual(long, { ok: false, issues: [{ code: 'too_long', record: 1 }] });
    const control = parseWordCsv('word,meaning\nab\u0007c,释义\n');
    assert.deepEqual(control, { ok: false, issues: [{ code: 'control_character', record: 1 }] });
  });

  it('rejects files with more rows than the limit', () => {
    const lines = Array.from({ length: MAX_WORD_ROWS + 1 }, (_, i) => `w${i},m${i}`);
    const result = parseWordCsv(`word,meaning\n${lines.join('\n')}\n`);
    assert.deepEqual(result, { ok: false, issues: [{ code: 'too_many_rows' }] });
  });

  it('ships a valid, duplicate-free sample word list', () => {
    const result = parseWordCsv(sampleWords);
    assert.ok(result.ok);
    assert.ok(result.rows.length >= 40);
    assert.equal(result.duplicates, 0);
  });
});
