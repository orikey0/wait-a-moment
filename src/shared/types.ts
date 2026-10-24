// Persisted and shared data shapes. Keep this file free of runtime code.

export type Motion = 'system' | 'reduced' | 'full';
export type Theme = 'system' | 'light' | 'dark';
export type Mark = 'know' | 'unknown' | 'review';
export type Outcome = 'abandoned' | 'granted';

export interface SiteRule {
  id: string;
  host: string;
  pathPrefix: string;
  includeSubdomains: boolean;
  enabled: boolean;
  createdAt: number;
}

export interface Settings {
  waitSeconds: number;
  grantMinutes: number[];
  moveButtons: boolean;
  motion: Motion;
  wordsEnabled: boolean;
  statsEnabled: boolean;
  paused: boolean;
  theme: Theme;
}

export interface Grant {
  grantedAt: number;
  expiresAt: number;
  minutes: number;
}

export interface WordEntry {
  word: string;
  meaning: string;
  source: 'builtin' | 'custom';
  box: number;
  dueAt: number;
  reviewCount: number;
  addedAt: number;
}

/** One interception. Lives in session storage, so it is cleared when the browser restarts. */
export interface BlockRecord {
  blockId: string;
  tabId: number;
  url: string;
  ruleId: string;
  host: string;
  createdAt: number;
  waitStartedAt: number;
  waitMs: number;
  shown: boolean;
  outcome: Outcome | null;
  words: string[];
  marked: Record<string, Mark>;
}

export interface TabState {
  path?: string;
  safeUrl?: string;
  lastBlock?: { url: string; at: number };
}

export interface SiteCounters {
  shown: number;
  abandoned: number;
  granted: number;
  grantedMinutes: number;
}

export interface DayStats {
  wordActions: number;
  sites: Record<string, SiteCounters>;
}

export interface StatsData {
  days: Record<string, DayStats>;
}

/** A daily memo. `day` is the local calendar day the task belongs to (YYYY-MM-DD). */
export interface MemoTask {
  id: string;
  text: string;
  day: string;
  done: boolean;
  createdAt: number;
  doneAt?: number;
}
