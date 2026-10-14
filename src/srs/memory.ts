import type { AppData } from '../storage';
import { fsrsInterval, type Grade, memoryFromHistory, memoryFromSm2 } from './scheduler';

const DAY = 86_400_000;

/** Cards that have been studied but have no FSRS memory yet (e.g. learned while SM-2 was on). */
export function needsFsrsMemory(data: AppData): boolean {
  return Object.values(data.cards).some((c) => c.status !== 'new' && c.stability === undefined);
}

/**
 * Give every studied card an FSRS memory: replay its answers from the review log, or estimate one from
 * its SM-2 interval and ease when there's no history. Due dates are left as they are.
 */
export function fillFsrsMemory(d: AppData): number {
  const history = new Map<string, { t: number; grade: Grade }[]>();
  for (const l of d.log) {
    if (!history.has(l.id)) history.set(l.id, []);
    history.get(l.id)!.push({ t: l.t, grade: l.grade });
  }
  let filled = 0;
  for (const c of Object.values(d.cards)) {
    if (c.status === 'new' || c.stability !== undefined) continue;
    const mem = memoryFromHistory(history.get(c.id) ?? [], d.settings.srs) ?? memoryFromSm2(c);
    c.stability = mem.stability;
    c.difficulty = mem.difficulty;
    filled++;
  }
  return filled;
}

/**
 * After changing desired retention or FSRS parameters: move every review card's due date to what FSRS
 * would now choose, counted from its last review. Returns how many cards moved.
 */
export function rescheduleReviews(d: AppData, now = Date.now()): number {
  let moved = 0;
  for (const c of Object.values(d.cards)) {
    if (c.status !== 'review' || c.stability === undefined) continue;
    const interval = fsrsInterval(c.stability, d.settings.srs);
    const due = (c.lastReview ?? now) + interval * DAY;
    if (interval !== c.interval || due !== c.due) {
      c.interval = interval;
      c.due = due;
      moved++;
    }
  }
  return moved;
}
