import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOCK_TOLERANCE_MS,
  MINUTE_MS,
  grantRemainingMs,
  isGrantActive,
  mergeGrant,
  reconcileWaitWindow,
  remainingWaitMs,
} from '../../src/core/timing';

const T0 = Date.UTC(2026, 9, 24, 12, 0, 0);

describe('grants', () => {
  it('is active until the expiry instant and no longer afterwards', () => {
    const grant = { grantedAt: T0, expiresAt: T0 + 2 * MINUTE_MS, minutes: 2 };
    assert.equal(isGrantActive(grant, T0 + 1), true);
    assert.equal(isGrantActive(grant, T0 + 2 * MINUTE_MS - 1), true);
    assert.equal(isGrantActive(grant, T0 + 2 * MINUTE_MS), false);
    assert.equal(isGrantActive(undefined, T0), false);
  });

  it('reports the remaining time in milliseconds', () => {
    const grant = { grantedAt: T0, expiresAt: T0 + MINUTE_MS, minutes: 1 };
    assert.equal(grantRemainingMs(grant, T0 + 10_000), 50_000);
    assert.equal(grantRemainingMs(grant, T0 + MINUTE_MS + 1), 0);
  });

  it('treats a grant as inactive when the clock was set well before it started', () => {
    const grant = { grantedAt: T0, expiresAt: T0 + MINUTE_MS, minutes: 1 };
    assert.equal(isGrantActive(grant, T0 - CLOCK_TOLERANCE_MS - 1), false);
    // Small jitter inside the tolerance does not invalidate the grant.
    assert.equal(isGrantActive(grant, T0 - CLOCK_TOLERANCE_MS + 1), true);
  });

  it('never shortens or stacks a grant that is still running', () => {
    const running = { grantedAt: T0, expiresAt: T0 + 5 * MINUTE_MS, minutes: 5 };
    const merged = mergeGrant(running, T0 + MINUTE_MS, 1);
    assert.equal(merged.expiresAt, T0 + 5 * MINUTE_MS);

    const extended = mergeGrant(running, T0 + MINUTE_MS, 10);
    assert.equal(extended.expiresAt, T0 + 11 * MINUTE_MS);
  });

  it('starts a fresh window when there is no running grant', () => {
    const expired = { grantedAt: T0, expiresAt: T0 + MINUTE_MS, minutes: 1 };
    const fresh = mergeGrant(expired, T0 + 10 * MINUTE_MS, 2);
    assert.equal(fresh.grantedAt, T0 + 10 * MINUTE_MS);
    assert.equal(fresh.expiresAt, T0 + 12 * MINUTE_MS);
    assert.equal(fresh.minutes, 2);
  });
});

describe('waits', () => {
  it('counts the remaining time from the recorded start, so a reload does not reset it', () => {
    const window = { waitStartedAt: T0, waitMs: 10_000 };
    assert.equal(remainingWaitMs(window, T0 + 4_000), 6_000);
    assert.equal(remainingWaitMs(window, T0 + 4_000), 6_000);
    assert.equal(remainingWaitMs(window, T0 + 60_000), 0);
  });

  it('restarts the wait when the clock was moved back before its start', () => {
    const window = { waitStartedAt: T0 + 60_000, waitMs: 10_000 };
    const reconciled = reconcileWaitWindow(window, T0);
    assert.equal(reconciled.waitStartedAt, T0);
    assert.equal(remainingWaitMs(reconciled, T0), 10_000);
  });

  it('leaves a normal wait window unchanged', () => {
    const window = { waitStartedAt: T0, waitMs: 10_000 };
    assert.equal(reconcileWaitWindow(window, T0 + 1_000), window);
  });
});
