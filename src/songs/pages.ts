import type { Score } from './score';

/**
 * Sheet music as pages: a fixed number of bars per line (set from how busy the music is, so lines aren't crammed) and
 * of lines per page. Practicing a long stretch shows one page at a time and turns it as you play, like a page turner
 * at a recital: at the end of the page, at the start of its last bar, or halfway through it, after an optional countdown.
 */

export type TurnAt = 'end' | 'lastBar' | 'halfLastBar';

export interface PageTurnSettings {
  /** Lines (systems) per page. */
  lines: number;
  at: TurnAt;
  /** Seconds of countdown shown before the page turns (0 = none). */
  countdown: number;
}

export const DEFAULT_PAGE_TURN: PageTurnSettings = { lines: 4, at: 'halfLastBar', countdown: 3 };

export const TURN_AT_LABEL: Record<TurnAt, string> = {
  end: 'At the end of the page',
  lastBar: 'At the start of the last bar',
  halfLastBar: 'Halfway through the last bar',
};

/**
 * How many bars fit on a line without crowding: about a dozen notes (both hands, counting chords as one) per line,
 * between 2 and 6 bars.
 */
export function barsPerLine(score: Score, from = 0, to = score.measures.length - 1): number {
  const onsets = new Set<string>();
  for (const n of score.notes) if (n.measure >= from && n.measure <= to && !n.tiedOver) onsets.add(`${n.staff}:${n.time}`);
  const perBar = onsets.size / Math.max(1, to - from + 1);
  return Math.min(6, Math.max(2, Math.round(24 / Math.max(1, perBar))));
}

/** The pages of bars `from`–`to`: [first bar, last bar] each. */
export function pagesOf(from: number, to: number, perLine: number, lines: number): [number, number][] {
  const per = Math.max(1, perLine * lines);
  const out: [number, number][] = [];
  for (let a = from; a <= to; a += per) out.push([a, Math.min(to, a + per - 1)]);
  return out;
}

/** The score time (ticks) at which a page is turned. */
export function turnTick(score: Score, page: [number, number], at: TurnAt): number {
  const last = score.measures[page[1]];
  if (at === 'lastBar') return last.start;
  if (at === 'halfLastBar') return last.start + last.length / 2;
  return last.start + last.length;
}

/**
 * Which page to show when you're at score time `tick` (the next note to play, or the beat being played): the page
 * the time falls on, or the next one once its turn point is passed.
 */
export function pageAt(score: Score, pages: [number, number][], tick: number, at: TurnAt): number {
  for (let i = 0; i < pages.length - 1; i++) if (tick < turnTick(score, pages[i], at)) return i;
  return pages.length - 1;
}
