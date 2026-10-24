import type { CsvIssue } from '../core/csv';
import type { Grant, Mark, Motion, Settings, SiteRule, StatsData, Theme, WordEntry } from './types';

export type ErrorCode =
  | 'internal'
  | 'invalid_request'
  | 'unknown_block'
  | 'wait_pending'
  | 'invalid_minutes'
  | 'already_resolved'
  | 'not_in_block'
  | 'unknown_word'
  | 'empty'
  | 'unsafe_protocol'
  | 'invalid_host'
  | 'invalid_path'
  | 'duplicate'
  | 'too_many_rules'
  | 'not_found'
  | 'invalid_settings'
  | 'invalid_words'
  | 'invalid_backup'
  | 'incompatible_store'
  | 'storage_failed';

export interface WordView extends WordEntry {
  id: string;
}

export interface BlockWordView {
  id: string;
  word: string;
  meaning: string;
  mark: Mark | null;
}

/** Everything the blocked page needs. Timing is sent as timestamps so the page can count down itself. */
export interface BlockView {
  host: string;
  targetUrl: string;
  waitStartedAt: number;
  waitMs: number;
  outcome: 'abandoned' | 'granted' | null;
  grantMinutes: number[];
  moveButtons: boolean;
  motion: Motion;
  theme: Theme;
  wordsEnabled: boolean;
  words: BlockWordView[];
}

export interface Snapshot {
  now: number;
  rules: SiteRule[];
  settings: Settings;
  words: WordView[];
  stats: StatsData;
  grants: Record<string, Grant>;
}

export type Failure = {
  ok: false;
  error: ErrorCode;
  remainingMs?: number;
  issues?: CsvIssue[];
};

export type Result<T extends object = object> = ({ ok: true } & T) | Failure;

export type Request =
  | { type: 'block.get'; blockId: string }
  | { type: 'block.shown'; blockId: string }
  | { type: 'block.abandon'; blockId: string }
  | { type: 'block.grant'; blockId: string; minutes: number }
  | { type: 'block.markWord'; blockId: string; wordId: string; mark: Mark }
  | { type: 'admin.snapshot' }
  | { type: 'rules.add'; input: string; includeSubdomains: boolean }
  | { type: 'rules.update'; id: string; enabled?: boolean; includeSubdomains?: boolean }
  | { type: 'rules.remove'; id: string }
  | { type: 'settings.update'; patch: Partial<Settings> }
  | { type: 'words.import'; text: string }
  | { type: 'words.restoreSample' }
  | { type: 'words.clear' }
  | { type: 'stats.clear' }
  | { type: 'data.clear' }
  | { type: 'data.restore'; text: string };

export interface Replies {
  'block.get': Result<{ block: BlockView }>;
  'block.shown': Result;
  'block.abandon': Result<{ returnUrl: string | null }>;
  'block.grant': Result<{ targetUrl: string }>;
  'block.markWord': Result<{ duplicate: boolean }>;
  'admin.snapshot': Result<{ snapshot: Snapshot }>;
  'rules.add': Result<{ rule: SiteRule }>;
  'rules.update': Result;
  'rules.remove': Result;
  'settings.update': Result<{ settings: Settings }>;
  'words.import': Result<{ added: number; existing: number; duplicates: number }>;
  'words.restoreSample': Result<{ added: number }>;
  'words.clear': Result;
  'stats.clear': Result;
  'data.clear': Result;
  'data.restore': Result<{ rules: number; words: number }>;
}

export type Reply<R extends Request> = Replies[R['type']];
