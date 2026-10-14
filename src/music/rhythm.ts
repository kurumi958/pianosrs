import type { Grade } from '../srs/scheduler';

/**
 * Time is counted in ticks: 24 to a quarter note, so sixteenths (6), triplet eighths (8) and dotted values
 * are all whole numbers and adding them up is exact.
 */
export const TPQ = 24;

/** Written note value: whole, half, quarter, eighth, sixteenth. */
export type Base = 'w' | 'h' | 'q' | 'e' | 's';
const BASE_TICKS: Record<Base, number> = { w: 96, h: 48, q: 24, e: 12, s: 6 };

/** How a note or rest is written (and so how long it lasts). */
export interface NoteValue {
  base: Base;
  dots: 0 | 1;
  /** Notes in the same bar sharing this number form one triplet: three in the time of two. */
  triplet?: number;
  /** Tied to the next note: held on through it, not played again. */
  tie?: boolean;
}

export interface RhythmNote extends NoteValue {
  rest?: boolean;
}

/** A time signature, e.g. { num: 6, den: 8 }. */
export interface Meter {
  num: number;
  den: number;
}

/** One bar of rhythm. */
export interface RhythmPattern {
  meter: Meter;
  notes: RhythmNote[];
}

export const v = (base: Base, dots: 0 | 1 = 0): NoteValue => ({ base, dots });

export function ticksOf(n: NoteValue): number {
  const t = BASE_TICKS[n.base] * (n.dots ? 1.5 : 1);
  return n.triplet === undefined ? t : (t * 2) / 3;
}

export const meterName = (m: Meter) => `${m.num}/${m.den}`;

export function parseMeter(s: string): Meter {
  const m = /^(\d+)\/(\d+)$/.exec(s);
  if (!m || ![2, 4, 8].includes(Number(m[2]))) throw new Error(`Bad time signature: ${s}`);
  return { num: Number(m[1]), den: Number(m[2]) };
}

export const sameMeter = (a: Meter, b: Meter) => a.num === b.num && a.den === b.den;

export function barTicks(m: Meter): number {
  return (m.num * TPQ * 4) / m.den;
}

/** 6/8, 9/8 and 12/8: beats are dotted quarters, each split in three. */
export function isCompound(m: Meter): boolean {
  return m.den === 8 && m.num % 3 === 0 && m.num > 3;
}

/** The beat you count (and the metronome clicks): a dotted quarter in compound time, otherwise the bottom number's note. */
export function pulseTicks(m: Meter): number {
  return isCompound(m) ? TPQ * 1.5 : (TPQ * 4) / m.den;
}

export function pulsesPerBar(m: Meter): number {
  return barTicks(m) / pulseTicks(m);
}

/**
 * Milliseconds per tick. Tempo is always given as quarter notes per minute, so an eighth note lasts as long in
 * 6/8 as in 4/4 and switching meters doesn't change how fast you read.
 */
export function tickMs(quarterBpm: number): number {
  return 60_000 / quarterBpm / TPQ;
}

/** Beats per minute of the pulse at this quarter-note tempo (e.g. dotted quarters in 6/8), for the metronome. */
export function pulseBpm(m: Meter, quarterBpm: number): number {
  return (quarterBpm * TPQ) / pulseTicks(m);
}

const TOKEN = /^([whqes])(\.?)(r?)(~?)$/;

/**
 * Parse a compact rhythm: "q q h", "h. q", "e e q qr q" (an "r" makes a rest), "s s e q h" (sixteenths),
 * "q~ e e q q" (a "~" ties a note to the next), "3[e e e] q h" (a triplet).
 * The meter is a time signature ("6/8") or, for x/4, just the number of beats. Throws if the bar doesn't add up.
 */
export function parseRhythm(spec: string, meter: Meter | number | string): RhythmPattern {
  const m = typeof meter === 'number' ? { num: meter, den: 4 } : typeof meter === 'string' ? parseMeter(meter) : meter;
  const tokens = spec.replace(/3\[/g, ' 3[ ').replace(/\]/g, ' ] ').trim().split(/\s+/);
  const notes: RhythmNote[] = [];
  let group: number | undefined;
  let groups = 0;
  for (const tok of tokens) {
    if (tok === '3[') {
      if (group !== undefined) throw new Error(`Nested triplet in "${spec}"`);
      group = groups++;
      continue;
    }
    if (tok === ']') {
      if (group === undefined) throw new Error(`Unopened "]" in "${spec}"`);
      group = undefined;
      continue;
    }
    const t = TOKEN.exec(tok);
    if (!t) throw new Error(`Bad rhythm token "${tok}" in "${spec}"`);
    const n: RhythmNote = { base: t[1] as Base, dots: t[2] ? 1 : 0 };
    if (t[3]) n.rest = true;
    if (t[4]) n.tie = true;
    if (group !== undefined) n.triplet = group;
    if (n.rest && n.tie) throw new Error(`A rest can't be tied in "${spec}"`);
    notes.push(n);
  }
  if (group !== undefined) throw new Error(`Unclosed triplet in "${spec}"`);
  notes.forEach((n, i) => {
    if (n.tie && (i === notes.length - 1 || notes[i + 1].rest)) throw new Error(`Tie to nothing in "${spec}"`);
  });
  for (let g = 0; g < groups; g++) {
    const ticks = notes.filter((n) => n.triplet === g).reduce((a, n) => a + ticksOf(n), 0);
    // A triplet fills one plain note value: a quarter (3 eighths), a half (3 quarters), an eighth (3 sixteenths).
    if (![TPQ / 2, TPQ, TPQ * 2].includes(ticks)) throw new Error(`Triplet ${g + 1} in "${spec}" doesn't fill a beat`);
  }
  const total = notes.reduce((a, n) => a + ticksOf(n), 0);
  if (total !== barTicks(m)) throw new Error(`"${spec}" lasts ${total / TPQ} quarters, but a bar of ${meterName(m)} lasts ${barTicks(m) / TPQ}`);
  return { meter: m, notes };
}

export function rhythmSpec(p: RhythmPattern): string {
  const out: string[] = [];
  p.notes.forEach((n, i) => {
    const tok = n.base + (n.dots ? '.' : '') + (n.rest ? 'r' : '') + (n.tie ? '~' : '');
    const opens = n.triplet !== undefined && p.notes[i - 1]?.triplet !== n.triplet;
    const closes = n.triplet !== undefined && p.notes[i + 1]?.triplet !== n.triplet;
    out.push((opens ? '3[' : '') + tok + (closes ? ']' : ''));
  });
  return out.join(' ');
}

/** Tick offsets (from the start of the bar) where notes are played. Rests and tied-over notes don't count. */
export function onsets(p: RhythmPattern): number[] {
  const out: number[] = [];
  let t = 0;
  p.notes.forEach((n, i) => {
    if (!n.rest && !p.notes[i - 1]?.tie) out.push(t);
    t += ticksOf(n);
  });
  return out;
}

/** Whether a pattern uses anything beyond plain notes, rests and dots: ties, triplets or sixteenths. */
export function features(p: RhythmPattern): { ties: boolean; triplets: boolean; sixteenths: boolean } {
  return {
    ties: p.notes.some((n) => n.tie),
    triplets: p.notes.some((n) => n.triplet !== undefined),
    sixteenths: p.notes.some((n) => n.base === 's'),
  };
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

/**
 * Timing window for a hit: a quarter of a beat, but never wider than 180ms or tighter than 80ms. With
 * `shortestGapMs` (the closest two notes come), it also stays under half that gap, so fast sixteenths
 * can't be confused with their neighbours.
 */
export function hitWindow(quarterMs: number, shortestGapMs = Infinity): number {
  const w = Math.min(180, Math.max(80, quarterMs * 0.25));
  return Math.max(50, Math.min(w, shortestGapMs * 0.45));
}

/** The smallest gap between consecutive times (Infinity with fewer than two). */
export function shortestGap(times: number[]): number {
  const s = [...times].sort((a, b) => a - b);
  let g = Infinity;
  for (let i = 1; i < s.length; i++) if (s[i] > s[i - 1]) g = Math.min(g, s[i] - s[i - 1]);
  return g;
}

/**
 * Grade a rhythm attempt: any missed or extra note is Again, otherwise by average timing error relative to the beat.
 * Easy needs near-metronomic timing (within 5% of a beat on average), so most clean attempts are Good.
 */
export function gradeTaps(r: TapResult, beatMs: number): Grade {
  if (r.extra > 0 || r.errors.some((e) => e === null)) return 1;
  const errs = r.errors as number[];
  const mean = errs.reduce((a, e) => a + Math.abs(e), 0) / Math.max(1, errs.length);
  if (mean <= beatMs * 0.05) return 4;
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
