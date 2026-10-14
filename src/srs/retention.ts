import { dayKey, nextDayStart, type ReviewLogEntry } from '../storage';

const DAY = 86_400_000;

/** Cards whose interval is at least this many days count as mature ("known"), as in Anki. */
export const MATURE_DAYS = 21;

export interface Tally {
  passed: number;
  total: number;
}

export interface RetentionRow {
  label: string;
  /** Young cards (interval under 21 days): the "learning" retention. */
  young: Tally;
  /** Mature cards (21 days or more): the "known" retention. */
  mature: Tally;
  all: Tally;
}

/** Pass rate, or null when there's nothing to judge. */
export const rate = (t: Tally): number | null => (t.total ? t.passed / t.total : null);

/**
 * True retention, as in Anki: of the answers to cards that were already in review (past their learning steps),
 * how many weren't Again. Split by whether the card was young or mature at the time, over several periods.
 * Answers from before card state was recorded, and the ones "Known" adds, are left out.
 */
export function retentionTable(log: ReviewLogEntry[], now: number): RetentionRow[] {
  const startOfToday = nextDayStart(now) - DAY;
  const today = dayKey(now);
  const yesterday = dayKey(startOfToday - 1);
  const periods: { label: string; includes: (t: number) => boolean }[] = [
    { label: 'Today', includes: (t) => dayKey(t) === today },
    { label: 'Yesterday', includes: (t) => dayKey(t) === yesterday },
    { label: 'Last 7 days', includes: (t) => t >= startOfToday - 6 * DAY },
    { label: 'Last 30 days', includes: (t) => t >= startOfToday - 29 * DAY },
    { label: 'Last year', includes: (t) => t >= startOfToday - 364 * DAY },
    { label: 'All time', includes: () => true },
  ];
  const reviews = log.filter((l) => !l.known && l.prevStatus === 'review' && l.prevInterval !== undefined);
  return periods.map(({ label, includes }) => {
    const row: RetentionRow = { label, young: { passed: 0, total: 0 }, mature: { passed: 0, total: 0 }, all: { passed: 0, total: 0 } };
    for (const l of reviews) {
      if (!includes(l.t)) continue;
      const pass = l.grade > 1 ? 1 : 0;
      const bucket = l.prevInterval! >= MATURE_DAYS ? row.mature : row.young;
      bucket.passed += pass;
      bucket.total++;
      row.all.passed += pass;
      row.all.total++;
    }
    return row;
  });
}
