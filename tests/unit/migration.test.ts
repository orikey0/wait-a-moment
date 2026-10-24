import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_SCHEMA_VERSION, planMigration } from '../../src/core/migration';

describe('storage version policy', () => {
  it('seeds defaults when nothing is stored yet', () => {
    assert.deepEqual(planMigration(undefined), { kind: 'fresh' });
  });

  it('leaves current data alone', () => {
    assert.deepEqual(planMigration(CURRENT_SCHEMA_VERSION), { kind: 'current' });
  });

  it('never overwrites data from a newer build or an unreadable version', () => {
    assert.deepEqual(planMigration(CURRENT_SCHEMA_VERSION + 1), { kind: 'incompatible' });
    assert.deepEqual(planMigration('1'), { kind: 'incompatible' });
    assert.deepEqual(planMigration(0), { kind: 'incompatible' });
    assert.deepEqual(planMigration(-3), { kind: 'incompatible' });
    assert.deepEqual(planMigration(1.5), { kind: 'incompatible' });
  });
});
