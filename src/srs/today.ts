import { type AppData, dayKey } from '../storage';
import { COURSE_DECKS } from './deck';
import { countQueue } from './session';
import { reviewCards, unitToLearn } from './learn';
import { courseProgress, studyCards } from './study';

const DAY = 86_400_000;

/** How many more new and review cards today's limits allow. */
export function dailyLimits(data: AppData, now: number) {
  const day = dayKey(now);
  return {
    newRemaining: data.settings.newPerDay - (data.newByDay[day] ?? 0),
    reviewRemaining: data.settings.srs.maxReviewsPerDay - (data.reviewsByDay[day] ?? 0),
    learnAheadMs: data.settings.srs.learnAheadMin * 60_000,
  };
}

/** Days in a row with at least one review, ending today (or yesterday, if today hasn't started yet). */
export function studyStreak(log: { t: number }[], now: number): number {
  const days = new Set(log.map((l) => dayKey(l.t)));
  let t = days.has(dayKey(now)) ? now : now - DAY;
  let streak = 0;
  while (days.has(dayKey(t))) {
    streak++;
    t -= DAY;
  }
  return streak;
}

export interface CourseSpot {
  id: string;
  name: string;
  unit: string;
  summary: string;
  learned: number;
  total: number;
  unitIndex: number;
  units: number;
  /** The unit with cards still to learn (the open one, or an earlier one not finished), or null if all are learned. */
  learnIndex: number | null;
}

/** Today's plan for the home page. */
export function todayPlan(data: AppData, now = Date.now()) {
  const input = { enabledDecks: data.settings.enabledDecks, courses: data.courses, states: data.cards };
  // Review shows learned cards only; new ones are met in learning sessions.
  const cards = reviewCards(input);
  const counts = countQueue({ cards, states: data.cards, now, ...dailyLimits(data, now), newRemaining: 0 });
  const total = counts.newCount + counts.learning + counts.review;
  const nextDue = cards
    .map((c) => data.cards[c.id])
    .filter((s) => s && s.status !== 'new' && s.due > now)
    .reduce((m, s) => Math.min(m, s!.due), Infinity);
  const courses: CourseSpot[] = COURSE_DECKS.filter((c) => data.settings.enabledDecks.includes(c.id)).map((c) => {
    const p = courseProgress(c, data.cards, data.courses[c.id]);
    const learnIndex = unitToLearn(c, data.cards, data.courses[c.id]);
    const at = learnIndex ?? p.open;
    const u = c.units![at];
    return {
      id: c.id,
      name: c.name,
      unit: u.title,
      summary: u.summary,
      learned: p.units[at].learned,
      total: p.units[at].total,
      unitIndex: at,
      units: c.units!.length,
      learnIndex,
    };
  });
  // Answers recorded by "Known" aren't real answers, so they don't count here.
  const answers = data.log.filter((l) => !l.known);
  const todayLog = answers.filter((l) => dayKey(l.t) === dayKey(now));
  const week = answers.filter((l) => l.t > now - 7 * DAY);
  return {
    counts,
    total,
    /** Rough time: about 8 seconds a card. */
    minutes: Math.max(1, Math.round((total * 8) / 60)),
    nextDue: Number.isFinite(nextDue) ? nextDue : null,
    courses,
    reviewedToday: todayLog.length,
    accuracy: week.length ? week.filter((l) => l.grade > 1).length / week.length : null,
    streak: studyStreak(answers, now),
    hasDecks: studyCards(input).length > 0,
  };
}
