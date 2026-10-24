export const MAX_WORD_ROWS = 5000;
export const MAX_WORD_LENGTH = 60;
export const MAX_MEANING_LENGTH = 200;

export type CsvIssueCode =
  | 'syntax'
  | 'empty'
  | 'missing_columns'
  | 'too_many_rows'
  | 'missing_field'
  | 'too_long'
  | 'control_character';

/** `record` is the 1-based data row. The header row is not counted. */
export interface CsvIssue {
  code: CsvIssueCode;
  record?: number;
}

export interface WordRow {
  word: string;
  meaning: string;
}

export type WordCsvResult =
  { ok: true; rows: WordRow[]; duplicates: number } | { ok: false; issues: CsvIssue[] };

class CsvSyntaxError extends Error {}

/** RFC 4180 style parser: quoted fields, doubled quotes, and CRLF or LF line endings. */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch !== '"') {
        field += ch;
      } else if (text.charAt(i + 1) === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = false;
      }
    } else if (ch === '"') {
      if (field !== '') throw new CsvSyntaxError('quote inside an unquoted field');
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (inQuotes) throw new CsvSyntaxError('unterminated quote');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Validates a vocabulary file. Any problem rejects the whole file, so a partial import never happens. */
export function parseWordCsv(text: string): WordCsvResult {
  let table: string[][];
  try {
    table = parseCsv(text).filter((cells) => cells.some((cell) => cell.trim() !== ''));
  } catch (error) {
    if (error instanceof CsvSyntaxError) return { ok: false, issues: [{ code: 'syntax' }] };
    throw error;
  }
  if (table.length === 0) return { ok: false, issues: [{ code: 'empty' }] };

  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase());
  const wordColumn = header.indexOf('word');
  const meaningColumn = header.indexOf('meaning');
  if (wordColumn === -1 || meaningColumn === -1) {
    return { ok: false, issues: [{ code: 'missing_columns' }] };
  }
  const body = table.slice(1);
  if (body.length > MAX_WORD_ROWS) return { ok: false, issues: [{ code: 'too_many_rows' }] };

  const issues: CsvIssue[] = [];
  const rows: WordRow[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  body.forEach((cells, index) => {
    const record = index + 1;
    const word = (cells[wordColumn] ?? '').trim();
    const meaning = (cells[meaningColumn] ?? '').trim();
    if (word === '' || meaning === '') {
      issues.push({ code: 'missing_field', record });
    } else if (word.length > MAX_WORD_LENGTH || meaning.length > MAX_MEANING_LENGTH) {
      issues.push({ code: 'too_long', record });
    } else if (/\p{Cc}/u.test(`${word}${meaning}`)) {
      issues.push({ code: 'control_character', record });
    } else if (seen.has(word.toLowerCase())) {
      duplicates += 1;
    } else {
      seen.add(word.toLowerCase());
      rows.push({ word, meaning });
    }
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, rows, duplicates };
}
