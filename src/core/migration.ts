export const CURRENT_SCHEMA_VERSION = 1;

export type MigrationPlan =
  | { kind: 'fresh' }
  | { kind: 'current' }
  | { kind: 'upgrade'; from: number }
  | { kind: 'incompatible' };

/**
 * Version policy: stored data carries an integer `schemaVersion`. Older versions are upgraded in
 * place by migrations registered in this module. A version this build cannot read (unreadable, or
 * newer than this build) is never overwritten, so installing an older build cannot destroy data.
 */
export function planMigration(storedVersion: unknown): MigrationPlan {
  if (storedVersion === undefined || storedVersion === null) return { kind: 'fresh' };
  if (typeof storedVersion !== 'number' || !Number.isInteger(storedVersion) || storedVersion < 1) {
    return { kind: 'incompatible' };
  }
  if (storedVersion === CURRENT_SCHEMA_VERSION) return { kind: 'current' };
  if (storedVersion < CURRENT_SCHEMA_VERSION) return { kind: 'upgrade', from: storedVersion };
  return { kind: 'incompatible' };
}
