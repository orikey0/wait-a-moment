import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  abandonRatio,
  dailySeries,
  dayKey,
  emptyStats,
  pruneStats,
  recordEvent,
  shiftDay,
  siteBreakdown,
  statsToCsv,
  summarize,
} from '../../src/core/stats';
import type { StatsData } from '../../src/shared/types';

// Local-time timestamps, so the day buckets are the same in every time zone.
const day1 = new Date(2026, 9, 10, 9, 0).getTime();
const day1Later = new Date(2026, 9, 10, 21, 30).getTime();
const day2 = new Date(2026, 9, 11, 10, 0).getTime();

function replay(): StatsData {
  let data = emptyStats();
  data = recordEvent(data, { type: 'shown', host: 'zhihu.com' }, day1);
  data = recordEvent(data, { type: 'shown', host: 'zhihu.com' }, day1);
  data = recordEvent(data, { type: 'shown', host: 'zhihu.com' }, day1Later);
  data = recordEvent(data, { type: 'abandoned', host: 'zhihu.com' }, day1);
  data = recordEvent(data, { type: 'granted', host: 'zhihu.com', minutes: 5 }, day1Later);
  data = recordEvent(data, { type: 'word' }, day1);
  data = recordEvent(data, { type: 'word' }, day1);
  data = recordEvent(data, { type: 'shown', host: 'x.com' }, day2);
  data = recordEvent(data, { type: 'granted', host: 'x.com', minutes: 10 }, day2);
  return data;
}

describe('day buckets', () => {
  it('uses local calendar days and steps across month boundaries', () => {
    assert.equal(dayKey(day1), '2026-10-10');
    assert.equal(shiftDay('2026-10-01', -1), '2026-09-30');
    assert.equal(shiftDay('2026-10-10', 1), '2026-10-11');
  });
});

describe('statistics against a known sequence of actions', () => {
  it('totals each metric exactly for a given range', () => {
    const totals = summarize(replay(), '2026-10-10', '2026-10-10');
    assert.deepEqual(totals, {
      shown: 3,
      abandoned: 1,
      granted: 1,
      grantedMinutes: 5,
      wordActions: 2,
    });
  });

  it('computes the abandon ratio over interceptions with a definite outcome', () => {
    const total = summarize(replay(), '2026-10-10', '2026-10-11');
    assert.equal(total.abandoned, 1);
    assert.equal(total.granted, 2);
    assert.equal(abandonRatio(total), 1 / 3);
    assert.equal(abandonRatio({ abandoned: 0, granted: 0 }), null);
  });

  it('breaks totals down by site, busiest site first', () => {
    const rows = siteBreakdown(replay(), '2026-10-10', '2026-10-11');
    assert.deepEqual(
      rows.map((row) => [row.host, row.shown, row.abandoned, row.granted, row.grantedMinutes]),
      [
        ['zhihu.com', 3, 1, 1, 5],
        ['x.com', 1, 0, 1, 10],
      ],
    );
  });

  it('returns one point per day, oldest first, with zeros for quiet days', () => {
    const series = dailySeries(replay(), '2026-10-11', 3);
    assert.deepEqual(
      series.map((point) => [point.day, point.shown]),
      [
        ['2026-10-09', 0],
        ['2026-10-10', 3],
        ['2026-10-11', 1],
      ],
    );
  });

  it('exports one CSV row per site and day, plus a row for word actions', () => {
    const csv = statsToCsv(replay());
    assert.equal(
      csv,
      [
        'date,site,shown,abandoned,granted,granted_minutes,word_actions',
        '2026-10-10,zhihu.com,3,1,1,5,0',
        '2026-10-10,*,0,0,0,0,2',
        '2026-10-11,x.com,1,0,1,10,0',
        '',
      ].join('\n'),
    );
  });

  it('drops days older than the retention window', () => {
    const pruned = pruneStats(replay(), '2026-10-11', 1);
    assert.deepEqual(Object.keys(pruned.days), ['2026-10-11']);
  });
});
