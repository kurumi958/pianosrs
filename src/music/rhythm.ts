import type { Grade } from '../srs/scheduler';

/** Note length in quarter-note beats: eighth, quarter, dotted quarter, half, dotted half, whole. */
export type Dur = 0.5 | 1 | 1.5 | 2 | 3 | 4;

export interface RhythmNote {
  dur: Dur;
  rest?: boolean;
}

/** One bar of rhythm. `beats` is the top of the time signature (always over 4 here). */
export interface RhythmPattern {
  beats: number;
  notes: RhythmNote[];
}

const TOKENS: Record<string, Dur> = { e: 0.5, q: 1, 'q.': 1.5, h: 2, 'h.': 3, w: 4 };

/**
 * Parse a compact rhythm: "q q h", "h. q", "e e q qr q" (an "r" suffix makes a rest).
 * Throws if the bar doesn't add up to `beats`.
 */
export function parseRhythm(spec: string, beats: number): RhythmPattern {
  const notes = spec
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const rest = tok.endsWith('r');
      const dur = TOKENS[rest ? tok.slice(0, -1) : tok];
      if (!dur) throw new Error(`Bad rhythm token "${tok}" in "${spec}"`);
      return rest ? { dur, rest } : { dur };
    });
  const total = notes.reduce((a, n) => a + n.dur, 0);
  if (total !== beats) throw new Error(`"${spec}" has ${total} beats, expected ${beats}`);
  return { beats, notes };
}

export function rhythmSpec(p: RhythmPattern): string {
  const names = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [v, k]));
  return p.notes.map((n) => names[n.dur] + (n.rest ? 'r' : '')).join(' ');
}

/** Beat offsets (from the start of the bar) where notes begin. Rests don't count. */
export function onsets(p: RhythmPattern): number[] {
  const out: number[] = [];
  let t = 0;
  for (const n of p.notes) {
    if (!n.rest) out.push(t);
    t += n.dur;
  }
  return out;
}

export interface TapResult {
  /** Timing error in ms for each expected onset (positive = late), or null if it was missed. */
  errors: (number | null)[];
  /** Taps that didn't belong to any expected onset. */
  extra: number;
}

/**
 * Match taps to expected onset times (both in ms). Each tap pairs with the nearest unclaimed
 * expected onset within `windowMs`, in order; anything left over is missed or extra.
 */
export function matchTaps(expected: number[], taps: number[], windowMs: number): TapResult {
  const errors: (number | null)[] = expected.map(() => null);
  let extra = 0;
  let next = 0;
  for (const tap of [...taps].sort((a, b) => a - b)) {
    // Skip expected onsets this tap is already too late for.
    while (next < expected.length && tap - expected[next] > windowMs) next++;
    if (next < expected.length && Math.abs(tap - expected[next]) <= windowMs) {
      errors[next] = tap - expected[next];
      next++;
    } else {
      extra++;
    }
  }
  return { errors, extra };
}

/** Timing window for a hit: a quarter of a beat, but never wider than 180ms or tighter than 80ms. */
export function hitWindow(beatMs: number): number {
  return Math.min(180, Math.max(80, beatMs * 0.25));
}

/** Grade a rhythm attempt: any missed or extra note is Again, otherwise by average timing error relative to the beat. */
export function gradeTaps(r: TapResult, beatMs: number): Grade {
  if (r.extra > 0 || r.errors.some((e) => e === null)) return 1;
  const errs = r.errors as number[];
  const mean = errs.reduce((a, e) => a + Math.abs(e), 0) / Math.max(1, errs.length);
  if (mean <= beatMs * 0.08) return 4;
  if (mean <= beatMs * 0.15) return 3;
  return 2;
}

export function describeTaps(r: TapResult): string {
  const missed = r.errors.filter((e) => e === null).length;
  const hits = r.errors.filter((e): e is number => e !== null);
  const parts: string[] = [];
  if (hits.length) {
    const mean = hits.reduce((a, e) => a + e, 0) / hits.length;
    const spread = hits.reduce((a, e) => a + Math.abs(e), 0) / hits.length;
    parts.push(`±${Math.round(spread)}ms${Math.abs(mean) > 25 ? (mean > 0 ? ', a bit late' : ', a bit early') : ''}`);
  }
  if (missed) parts.push(`${missed} missed`);
  if (r.extra) parts.push(`${r.extra} extra`);
  return parts.join(' · ');
}
