import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { nextSpot, offsetPx, type Spot } from '../../src/core/motion';

/** Deterministic pseudo-random sequence in [0, 1). */
function sequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

function distance(a: Spot, b: Spot): number {
  return Math.hypot(a.fx - b.fx, a.fy - b.fy);
}

describe('button placement', () => {
  it('keeps the button inside the play field for any fraction', () => {
    for (const fraction of [-1, 0, 0.25, 0.5, 1, 2]) {
      const px = offsetPx(200, fraction);
      assert.ok(px >= 0 && px <= 200, `fraction ${fraction} gave ${px}`);
    }
    assert.equal(offsetPx(-30, 0.5), 0);
  });

  it('moves to a clearly different spot on every step', () => {
    const current: Spot = { fx: 0.5, fy: 0.5 };
    const next = nextSpot(current, sequence([0.52, 0.49, 0.1, 0.9]));
    assert.ok(distance(current, next) >= 0.35);
    assert.ok(next.fx >= 0 && next.fx < 1 && next.fy >= 0 && next.fy < 1);
  });

  it('falls back to a far corner when the random source keeps repeating the current spot', () => {
    const current: Spot = { fx: 0.5, fy: 0.5 };
    const next = nextSpot(current, () => 0.5);
    assert.ok(distance(current, next) >= 0.35);
    assert.ok(next.fx === 0 || next.fx === 1);
    assert.ok(next.fy === 0 || next.fy === 1);
  });

  it('stays inside the bounds across many random steps', () => {
    let spot: Spot = { fx: 0.5, fy: 0.5 };
    let state = 12345;
    const random = (): number => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    for (let step = 0; step < 500; step += 1) {
      const previous = spot;
      spot = nextSpot(spot, random);
      assert.ok(spot.fx >= 0 && spot.fx <= 1 && spot.fy >= 0 && spot.fy <= 1);
      assert.ok(distance(previous, spot) >= 0.35);
    }
  });
});
