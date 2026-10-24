import type { Grant } from '../shared/types';

export const MINUTE_MS = 60_000;

/** Small clock jitter (NTP steps and similar) that must not invalidate a grant or a wait. */
export const CLOCK_TOLERANCE_MS = 2_000;

/**
 * A grant is active until `expiresAt`. If the clock was turned back before the grant started, its
 * end time can no longer be trusted, so the grant counts as inactive instead of lasting arbitrarily long.
 */
export function isGrantActive(grant: Grant | undefined, now: number): boolean {
  if (!grant) return false;
  if (now < grant.grantedAt - CLOCK_TOLERANCE_MS) return false;
  return now < grant.expiresAt;
}

export function grantRemainingMs(grant: Grant | undefined, now: number): number {
  if (!grant || !isGrantActive(grant, now)) return 0;
  return grant.expiresAt - now;
}

/**
 * Creates a grant. When a grant is already running for the same rule, the new end time is the later
 * of the two, so two tabs granting at the same moment never shorten or stack the window.
 */
export function mergeGrant(existing: Grant | undefined, now: number, minutes: number): Grant {
  const runningUntil = existing && isGrantActive(existing, now) ? existing.expiresAt : 0;
  return { grantedAt: now, expiresAt: Math.max(runningUntil, now + minutes * MINUTE_MS), minutes };
}

export interface WaitWindow {
  waitStartedAt: number;
  waitMs: number;
}

/**
 * If the clock was set back before the recorded start, the wait restarts from now. Without this
 * the wait could be pending for an arbitrary amount of time.
 */
export function reconcileWaitWindow(window: WaitWindow, now: number): WaitWindow {
  return now < window.waitStartedAt ? { waitStartedAt: now, waitMs: window.waitMs } : window;
}

export function remainingWaitMs(window: WaitWindow, now: number): number {
  return Math.max(0, window.waitStartedAt + window.waitMs - now);
}
