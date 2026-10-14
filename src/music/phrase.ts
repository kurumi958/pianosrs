import type { Card } from '../srs/deck';
import type { CardState } from '../srs/scheduler';
import type { Pitch } from './notes';

/** How much a card should be favoured in sight-reading practice: weak and recently learned cards come up more. */
export function practiceWeight(state: CardState | undefined): number {
  if (!state) return 1;
  let w = 1 + 2 * state.lapses + Math.max(0, 2.5 - state.ease) * 4;
  if (state.status !== 'review') w += 2;
  else if (state.interval < 3) w += 1;
  return w;
}

/** Build a phrase of `length` cards, sampled by weight, never repeating the same card back to back. */
export function generatePhrase(
  pool: Card[],
  states: Record<string, CardState>,
  length: number,
  rnd: () => number = Math.random,
): Card[] {
  if (!pool.length) return [];
  const weights = pool.map((c) => practiceWeight(states[c.id]));
  const out: Card[] = [];
  for (let i = 0; i < length; i++) {
    const prev = out[out.length - 1];
    const ws = pool.map((c, j) => (pool.length > 1 && c === prev ? 0 : weights[j]));
    const total = ws.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    let k = 0;
    while (k < pool.length - 1 && r >= ws[k]) r -= ws[k++];
    out.push(pool[k]);
  }
  return out;
}

export type DrawnAccidental = '#' | 'b' | 'n' | null;

/**
 * Accidentals carry through the bar, so work out which ones actually need printing:
 * an accidental is drawn when it differs from what that line/space currently implies (naturals included).
 */
export function accidentalsToDraw(measure: Pitch[][]): DrawnAccidental[][] {
  const current = new Map<string, string>();
  return measure.map((chord) =>
    chord.map((p) => {
      const key = `${p.letter}${p.octave}`;
      const prev = current.get(key) ?? '';
      if (prev === p.acc) return null;
      current.set(key, p.acc);
      return p.acc === '' ? 'n' : p.acc;
    }),
  );
}
