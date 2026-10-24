import { parseWordCsv } from '../core/csv';
import { CURRENT_SCHEMA_VERSION, planMigration } from '../core/migration';
import { createDefaultRules } from '../core/rules';
import { defaultSettings } from '../core/settings';
import { emptyStats } from '../core/stats';
import { mergeWords } from '../core/words';
import sampleWordsCsv from '../data/sample-words.csv';
import { exclusive, readSchemaVersion, writeLocal } from './storage';

/**
 * Runs on install, update and browser start. Writes defaults only when nothing is stored yet.
 * Data written by a newer or unreadable version is left untouched.
 */
export function ensureStoreVersion(): Promise<void> {
  return exclusive(async () => {
    const plan = planMigration(await readSchemaVersion());
    if (plan.kind === 'fresh') await seedDefaults();
  });
}

/** Writes the first-run state: example sites, default settings, the sample word list, empty statistics. */
export async function seedDefaults(): Promise<void> {
  const now = Date.now();
  const parsed = parseWordCsv(sampleWordsCsv);
  const words = parsed.ok ? mergeWords({}, parsed.rows, 'builtin', now).bank : {};
  await writeLocal({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rules: createDefaultRules(() => crypto.randomUUID(), now),
    settings: defaultSettings(),
    words,
    stats: emptyStats(),
    grants: {},
    memos: [],
  });
}
