/**
 * Anki-style SM-2 scheduler with learning / relearning steps.
 * Pure functions: given a card state, a grade and "now", returns the next state.
 */

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy
export const GRADE_LABELS: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

export type CardStatus = 'new' | 'learning' | 'review' | 'relearning';

export interface CardState {
  id: string;
  status: CardStatus;
  /** Epoch ms when the card is next due. */
  due: number;
  /** Current review interval in days (0 while learning). */
  interval: number;
  ease: number;
  /** Index into the learning / relearning steps. */
  step: number;
  reps: number;
  lapses: number;
  lastReview?: number;
}

export interface SchedulerConfig {
  learningStepsMin: number[];
  relearningStepsMin: number[];
  graduatingIntervalDays: number;
  easyIntervalDays: number;
  startingEase: number;
  easyBonus: number;
  hardMultiplier: number;
  lapseMultiplier: number;
  minEase: number;
  maxIntervalDays: number;
}

export const DEFAULT_SCHEDULER: SchedulerConfig = {
  learningStepsMin: [1, 10],
  relearningStepsMin: [10],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  hardMultiplier: 1.2,
  lapseMultiplier: 0.5,
  minEase: 1.3,
  maxIntervalDays: 365,
};

const MIN = 60_000;
const DAY = 86_400_000;

export function newCardState(id: string, cfg = DEFAULT_SCHEDULER): CardState {
  return { id, status: 'new', due: 0, interval: 0, ease: cfg.startingEase, step: 0, reps: 0, lapses: 0 };
}

function clampInterval(days: number, cfg: SchedulerConfig): number {
  return Math.min(cfg.maxIntervalDays, Math.max(1, Math.round(days)));
}

function stepDelay(steps: number[], step: number, grade: Grade): number {
  const cur = steps[Math.min(step, steps.length - 1)];
  if (grade === 2) {
    // Hard: halfway between this step and the next (or 1.5x if this is the last one).
    const next = steps[step + 1];
    return (next !== undefined ? (cur + next) / 2 : cur * 1.5) * MIN;
  }
  return cur * MIN;
}

export function schedule(card: CardState, grade: Grade, now: number, cfg = DEFAULT_SCHEDULER): CardState {
  const c: CardState = { ...card, reps: card.reps + 1, lastReview: now };

  if (card.status === 'new' || card.status === 'learning') {
    const steps = cfg.learningStepsMin;
    const step = card.status === 'new' ? 0 : card.step;
    if (grade === 4) return graduate(c, cfg.easyIntervalDays, now, cfg);
    if (grade === 1) return { ...c, status: 'learning', step: 0, due: now + steps[0] * MIN };
    if (grade === 2) return { ...c, status: 'learning', step, due: now + stepDelay(steps, step, 2) };
    const nextStep = step + 1;
    if (nextStep >= steps.length) return graduate(c, cfg.graduatingIntervalDays, now, cfg);
    return { ...c, status: 'learning', step: nextStep, due: now + steps[nextStep] * MIN };
  }

  if (card.status === 'relearning') {
    const steps = cfg.relearningStepsMin;
    if (grade === 1) return { ...c, step: 0, due: now + steps[0] * MIN };
    if (grade === 2) return { ...c, due: now + stepDelay(steps, card.step, 2) };
    if (grade === 4) return graduate(c, card.interval + 1, now, cfg);
    const nextStep = card.step + 1;
    if (nextStep >= steps.length) return graduate(c, card.interval, now, cfg);
    return { ...c, step: nextStep, due: now + steps[nextStep] * MIN };
  }

  // Review card.
  if (grade === 1) {
    const interval = clampInterval(card.interval * cfg.lapseMultiplier, cfg);
    return {
      ...c,
      status: 'relearning',
      step: 0,
      lapses: card.lapses + 1,
      ease: Math.max(cfg.minEase, card.ease - 0.2),
      interval,
      due: now + cfg.relearningStepsMin[0] * MIN,
    };
  }
  let ease = card.ease;
  let interval: number;
  if (grade === 2) {
    ease = Math.max(cfg.minEase, ease - 0.15);
    interval = card.interval * cfg.hardMultiplier;
  } else if (grade === 3) {
    interval = card.interval * ease;
  } else {
    ease += 0.15;
    interval = card.interval * ease * cfg.easyBonus;
  }
  interval = clampInterval(Math.max(card.interval + 1, interval), cfg);
  return { ...c, ease, interval, due: now + interval * DAY };
}

function graduate(c: CardState, days: number, now: number, cfg: SchedulerConfig): CardState {
  const interval = clampInterval(days, cfg);
  return { ...c, status: 'review', step: 0, interval, due: now + interval * DAY };
}

/** Human readable "time until" for showing next intervals on grade buttons. */
export function formatDelay(ms: number): string {
  if (ms < MIN) return '<1m';
  if (ms < 60 * MIN) return `${Math.round(ms / MIN)}m`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}h`;
  const d = ms / DAY;
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}
