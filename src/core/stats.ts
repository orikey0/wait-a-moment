import type { DayStats, SiteCounters, StatsData } from '../shared/types';

export type StatsEvent =
  | { type: 'shown'; host: string }
  | { type: 'abandoned'; host: string }
  | { type: 'granted'; host: string; minutes: number }
  | { type: 'word' };

export interface Totals extends SiteCounters {
  wordActions: number;
}

export function emptyStats(): StatsData {
  return { days: {} };
}

function emptyCounters(): SiteCounters {
  return { shown: 0, abandoned: 0, granted: 0, grantedMinutes: 0 };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Local calendar day as YYYY-MM-DD. Statistics are bucketed by the user's local day. */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function shiftDay(key: string, delta: number): string {
  const [year = 1970, month = 1, day = 1] = key.split('-').map(Number);
  return dayKey(new Date(year, month - 1, day + delta).getTime());
}

export function recordEvent(data: StatsData, event: StatsEvent, timestamp: number): StatsData {
  const key = dayKey(timestamp);
  const day: DayStats = data.days[key] ?? { wordActions: 0, sites: {} };
  const next: DayStats =
    event.type === 'word'
      ? { ...day, wordActions: day.wordActions + 1 }
      : {
          ...day,
          sites: {
            ...day.sites,
            [event.host]: bump(day.sites[event.host] ?? emptyCounters(), event),
          },
        };
  return { days: { ...data.days, [key]: next } };
}

function bump(counters: SiteCounters, event: Exclude<StatsEvent, { type: 'word' }>): SiteCounters {
  switch (event.type) {
    case 'shown':
      return { ...counters, shown: counters.shown + 1 };
    case 'abandoned':
      return { ...counters, abandoned: counters.abandoned + 1 };
    case 'granted':
      return {
        ...counters,
        granted: counters.granted + 1,
        grantedMinutes: counters.grantedMinutes + event.minutes,
      };
  }
}

/** Totals for the inclusive day range [from, to]. */
export function summarize(data: StatsData, from: string, to: string): Totals {
  const totals: Totals = { ...emptyCounters(), wordActions: 0 };
  for (const [key, day] of Object.entries(data.days)) {
    if (key < from || key > to) continue;
    totals.wordActions += day.wordActions;
    for (const counters of Object.values(day.sites)) {
      totals.shown += counters.shown;
      totals.abandoned += counters.abandoned;
      totals.granted += counters.granted;
      totals.grantedMinutes += counters.grantedMinutes;
    }
  }
  return totals;
}

/**
 * Abandon ratio = abandoned / (abandoned + granted): only interceptions with a definite outcome
 * count. Returns null when there are none.
 */
export function abandonRatio(counters: Pick<SiteCounters, 'abandoned' | 'granted'>): number | null {
  const decided = counters.abandoned + counters.granted;
  return decided === 0 ? null : counters.abandoned / decided;
}

export function siteBreakdown(
  data: StatsData,
  from: string,
  to: string,
): Array<SiteCounters & { host: string }> {
  const bySite = new Map<string, SiteCounters>();
  for (const [key, day] of Object.entries(data.days)) {
    if (key < from || key > to) continue;
    for (const [host, counters] of Object.entries(day.sites)) {
      const total = bySite.get(host) ?? emptyCounters();
      bySite.set(host, {
        shown: total.shown + counters.shown,
        abandoned: total.abandoned + counters.abandoned,
        granted: total.granted + counters.granted,
        grantedMinutes: total.grantedMinutes + counters.grantedMinutes,
      });
    }
  }
  return [...bySite.entries()]
    .map(([host, counters]) => ({ host, ...counters }))
    .sort((a, b) => b.shown - a.shown || a.host.localeCompare(b.host));
}

export interface DailyPoint {
  day: string;
  shown: number;
  abandoned: number;
  granted: number;
}

/** One point per day for the last `days` days, oldest first, ending at `endKey`. */
export function dailySeries(data: StatsData, endKey: string, days: number): DailyPoint[] {
  const series: DailyPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = shiftDay(endKey, -offset);
    const totals = summarize(data, day, day);
    series.push({
      day,
      shown: totals.shown,
      abandoned: totals.abandoned,
      granted: totals.granted,
    });
  }
  return series;
}

export function pruneStats(data: StatsData, todayKey: string, keepDays = 400): StatsData {
  const oldest = shiftDay(todayKey, 1 - keepDays);
  return {
    days: Object.fromEntries(Object.entries(data.days).filter(([key]) => key >= oldest)),
  };
}

/**
 * CSV export. Each row is one site on one day. Word actions are not tied to a site and appear on
 * a row whose site column is "*".
 */
export function statsToCsv(data: StatsData): string {
  const lines = ['date,site,shown,abandoned,granted,granted_minutes,word_actions'];
  for (const day of Object.keys(data.days).sort()) {
    const entry = data.days[day];
    if (!entry) continue;
    for (const host of Object.keys(entry.sites).sort()) {
      const counters = entry.sites[host];
      if (!counters) continue;
      lines.push(
        [
          day,
          host,
          counters.shown,
          counters.abandoned,
          counters.granted,
          counters.grantedMinutes,
          0,
        ].join(','),
      );
    }
    if (entry.wordActions > 0) {
      lines.push([day, '*', 0, 0, 0, 0, entry.wordActions].join(','));
    }
  }
  return `${lines.join('\n')}\n`;
}
