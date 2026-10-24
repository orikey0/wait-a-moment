/** Relative position of the proceed button inside its play field: 0 = start edge, 1 = far edge. */
export interface Spot {
  fx: number;
  fy: number;
}

/** The button only moves when the pointer comes this close to it. */
export const MOVE_RADIUS_PX = 72;

/** Minimum distance between two spots, so each move is clearly visible. */
const MIN_JUMP = 0.35;

export function nextSpot(current: Spot, random: () => number): Spot {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = { fx: random(), fy: random() };
    if (distance(candidate, current) >= MIN_JUMP) return candidate;
  }
  // Fallback: the opposite corner is always far enough from the current spot.
  return { fx: current.fx < 0.5 ? 1 : 0, fy: current.fy < 0.5 ? 1 : 0 };
}

/** Pixel offset for a spot. The result always stays inside [0, available]. */
export function offsetPx(available: number, fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.max(0, available) * clamped;
}

function distance(a: Spot, b: Spot): number {
  return Math.hypot(a.fx - b.fx, a.fy - b.fy);
}
