import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_APP,
  MAX_BACKUP_LENGTH,
  buildBackup,
  parseBackup,
  type BackupData,
} from '../../src/core/backup';
import { defaultSettings } from '../../src/core/settings';
import { emptyStats, recordEvent } from '../../src/core/stats';

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const INVALID = { ok: false, error: 'invalid_backup' };

/** The exported JSON shape, loosened so that tests can damage individual fields. */
interface Payload {
  app: string;
  schemaVersion: number;
  data: {
    rules: Array<Record<string, unknown>>;
    words: Record<string, Record<string, unknown>>;
    stats: { days: Record<string, { wordActions: number; sites: Record<string, unknown> }> };
  };
}

function sample(): BackupData {
  return {
    rules: [
      {
        id: 'r1',
        host: 'zhihu.com',
        pathPrefix: '/',
        includeSubdomains: true,
        enabled: true,
        createdAt: NOW,
      },
      {
        id: 'r2',
        host: 'x.com',
        pathPrefix: '/hot',
        includeSubdomains: false,
        enabled: false,
        createdAt: NOW,
      },
    ],
    settings: { ...defaultSettings(), waitSeconds: 20 },
    words: {
      abandon: {
        word: 'abandon',
        meaning: '放弃',
        source: 'builtin',
        box: 2,
        dueAt: NOW,
        reviewCount: 3,
        addedAt: NOW,
      },
    },
    stats: recordEvent(emptyStats(), { type: 'shown', host: 'zhihu.com' }, NOW),
  };
}

/** Exports the sample, lets the test damage it, and returns the resulting JSON text. */
function damaged(mutate: (payload: Payload) => void): string {
  const payload = JSON.parse(buildBackup(sample(), NOW)) as Payload;
  mutate(payload);
  return JSON.stringify(payload);
}

describe('backup round trip', () => {
  it('restores exactly what was exported', () => {
    const data = sample();
    const parsed = parseBackup(buildBackup(data, NOW));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.data.rules, data.rules);
    assert.deepEqual(parsed.data.words, data.words);
    assert.deepEqual(parsed.data.stats, data.stats);
    assert.equal(parsed.data.settings.waitSeconds, 20);
  });
});

describe('backup validation', () => {
  it('rejects text that is not JSON, or a file from another app', () => {
    assert.deepEqual(parseBackup('{not json'), INVALID);
    const foreign = JSON.stringify({ app: 'other', schemaVersion: 1, data: {} });
    assert.deepEqual(parseBackup(foreign), INVALID);
    assert.equal(BACKUP_APP, 'wait-a-moment');
  });

  it('refuses backups from a newer version rather than guessing', () => {
    const payload = JSON.parse(buildBackup(sample(), NOW)) as Payload;
    payload.schemaVersion = 2;
    assert.deepEqual(parseBackup(JSON.stringify(payload)), {
      ok: false,
      error: 'incompatible_store',
    });
  });

  it('rejects oversized files', () => {
    const padded = `${buildBackup(sample(), NOW)}${' '.repeat(MAX_BACKUP_LENGTH)}`;
    assert.deepEqual(parseBackup(padded), INVALID);
  });

  it('rejects rules whose host is a URL rather than a normalised host', () => {
    const text = damaged((payload) => {
      const [first] = payload.data.rules;
      if (first) first['host'] = 'https://evil.example';
    });
    assert.deepEqual(parseBackup(text), INVALID);
  });

  it('rejects duplicate rule ids', () => {
    const text = damaged((payload) => {
      const [, second] = payload.data.rules;
      if (second) second['id'] = 'r1';
    });
    assert.deepEqual(parseBackup(text), INVALID);
  });

  it('rejects a word stored under the wrong key', () => {
    const text = damaged((payload) => {
      const entry = payload.data.words['abandon'];
      if (entry) payload.data.words['wrong-key'] = entry;
      delete payload.data.words['abandon'];
    });
    assert.deepEqual(parseBackup(text), INVALID);
  });

  it('rejects statistics with malformed day keys', () => {
    const text = damaged((payload) => {
      const [day] = Object.values(payload.data.stats.days);
      if (day) payload.data.stats.days['10/24/2026'] = day;
    });
    assert.deepEqual(parseBackup(text), INVALID);
  });

  it('rejects statistics with negative counters', () => {
    const text = damaged((payload) => {
      for (const day of Object.values(payload.data.stats.days)) day.wordActions = -1;
    });
    assert.deepEqual(parseBackup(text), INVALID);
  });
});
