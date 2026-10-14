import { COLORS } from '../music/notation';
import type { Score, ScoreEvent, ScoreNote } from './score';

const key = (n: ScoreNote) => `${n.measure}:${n.staff}:${n.tick}:${n.midi}`;

/** For each struck note, the notes it's tied on to (held, not played again), so they colour along with it. */
export function tieChains(score: Score): Map<ScoreNote, ScoreNote[]> {
  const held = new Map<string, ScoreNote>();
  for (const n of score.notes) if (n.tiedOver) held.set(`${n.staff}:${n.midi}:${n.time}`, n);
  const chains = new Map<ScoreNote, ScoreNote[]>();
  for (const n of score.notes) {
    if (n.tiedOver) continue;
    const chain: ScoreNote[] = [];
    let end = n.time + n.dur;
    for (let next = held.get(`${n.staff}:${n.midi}:${end}`); next; next = held.get(`${n.staff}:${n.midi}:${end}`)) {
      chain.push(next);
      end = next.time + next.dur;
    }
    if (chain.length) chains.set(n, chain);
  }
  return chains;
}

export interface PlayState {
  /** The event to play next (events.length when finished). */
  cursor: number;
  /** Events where a wrong key was played. */
  missed: Set<number>;
  /** In time mode: events played right and on time. */
  ok?: Set<number>;
}

/** Note colours for the score: played right (sage), with a slip (brick), the one to play now (burgundy). */
export function playColors(events: ScoreEvent[], chains: Map<ScoreNote, ScoreNote[]>, s: PlayState): Map<string, string> {
  const out = new Map<string, string>();
  events.forEach((e, i) => {
    let color: string | undefined;
    if (s.ok) {
      // In time: each event is judged as its moment passes.
      color = s.ok.has(i) ? COLORS.ok : s.missed.has(i) ? COLORS.miss : i === s.cursor ? COLORS.current : undefined;
    } else {
      // Waiting: everything before the cursor has been played, with or without a slip.
      color = i < s.cursor ? (s.missed.has(i) ? COLORS.miss : COLORS.ok) : i === s.cursor ? COLORS.current : undefined;
    }
    if (!color) return;
    for (const n of e.notes) {
      out.set(key(n), color);
      for (const t of chains.get(n) ?? []) out.set(key(t), color);
    }
  });
  return out;
}

/** Which bars had a slip: bar index → true if any event in it was missed. */
export function barOutcomes(events: ScoreEvent[], missed: Set<number>): Map<number, boolean> {
  const out = new Map<number, boolean>();
  events.forEach((e, i) => out.set(e.measure, (out.get(e.measure) ?? false) || missed.has(i)));
  return out;
}

/** How many recent play-throughs of each bar are remembered. */
export const BAR_HISTORY = 5;

/** Bars to work on: two or more slips in their recent play-throughs. */
export function weakBars(history: Record<number, number[]> | undefined): number[] {
  if (!history) return [];
  return Object.entries(history)
    .filter(([, r]) => r.reduce((a, b) => a + b, 0) >= 2)
    .map(([m]) => Number(m))
    .sort((a, b) => a - b);
}
