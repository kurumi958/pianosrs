/**
 * Spaced-repetition scheduling, with the same two choices Anki offers:
 * - FSRS (via ts-fsrs): models each card's memory (stability, difficulty) and picks the interval that
 *   keeps your chance of remembering it at the desired retention.
 * - SM-2: Anki's classic algorithm, driven by an ease factor per card.
 * Both use learning steps for new cards and relearning steps after a lapse.
 * Pure functions: given a card state, a grade and "now", returns the next state.
 */
import {
  type Card as FsrsCard,
  createEmptyCard,
  default_w,
  fsrs,
  type FSRS,
  generatorParameters,
  get_fuzz_range,
  type Grade as FsrsGrade,
  State,
  type Steps,
} from 'ts-fsrs';

/** Again, Okay, Good, Easy (Okay is Anki's "Hard": right, but with effort). */
export type Grade = 1 | 2 | 3 | 4;
export const GRADE_LABELS: Record<Grade, string> = { 1: 'Again', 2: 'Okay', 3: 'Good', 4: 'Easy' };

export type CardStatus = 'new' | 'learning' | 'review' | 'relearning';

export interface CardState {
  id: string;
  status: CardStatus;
  /** Epoch ms when the card is next due. */
  due: number;
  /** Current review interval in days (0 while learning). */
  interval: number;
  /** SM-2 ease factor. */
  ease: number;
  /** Index into the learning / relearning steps. */
  step: number;
  reps: number;
  lapses: number;
  lastReview?: number;
  /** FSRS memory: days until recall drops to 90%. */
  stability?: number;
  /** FSRS memory: 1 (easy) to 10 (hard). */
  difficulty?: number;
}

export type Algorithm = 'fsrs' | 'sm2';

export interface SchedulerConfig {
  algorithm: Algorithm;
  /** Space-separated delays, e.g. "1m 10m". Units: m, h, d. */
  learningSteps: string;
  relearningSteps: string;
  maxIntervalDays: number;
  /** Spread intervals by a few percent so cards learned together don't stay bunched up. */
  fuzz: boolean;
  // FSRS
  /** Chance of remembering a card when it comes due (0.7–0.99). */
  desiredRetention: number;
  /** FSRS model parameters (21 numbers for FSRS-6). */
  fsrsParams: number[];
  // SM-2
  graduatingIntervalDays: number;
  easyIntervalDays: number;
  startingEase: number;
  easyBonus: number;
  /** Multiplies every review interval (1 = unchanged). */
  intervalModifier: number;
  /** Interval multiplier for Hard. */
  hardMultiplier: number;
  /** Multiplier applied to the interval after a lapse ("New interval" in Anki). */
  lapseMultiplier: number;
  minimumLapseIntervalDays: number;
}

/** Anki's defaults, with FSRS on. */
export const DEFAULT_SCHEDULER: SchedulerConfig = {
  algorithm: 'fsrs',
  learningSteps: '1m 10m',
  relearningSteps: '10m',
  maxIntervalDays: 36500,
  fuzz: true,
  desiredRetention: 0.9,
  fsrsParams: [...default_w],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  intervalModifier: 1,
  hardMultiplier: 1.2,
  lapseMultiplier: 0,
  minimumLapseIntervalDays: 1,
};

const MIN_EASE = 1.3;
const MIN = 60_000;
const DAY = 86_400_000;

const UNIT_MIN: Record<string, number> = { m: 1, h: 60, d: 1440 };

/** Parse "1m 10m 1d" into minutes; null if any part is invalid. */
export function parseSteps(steps: string): number[] | null {
  const parts = steps.trim().split(/\s+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const m = /^(\d+(?:\.\d+)?)([mhd])$/.exec(p);
    if (!m || Number(m[1]) <= 0) return null;
    out.push(Number(m[1]) * UNIT_MIN[m[2]]);
  }
  return out;
}

const stepsOrDefault = (s: string, fallback: string) => parseSteps(s) ?? parseSteps(fallback)!;

export function newCardState(id: string, cfg: Pick<SchedulerConfig, 'startingEase'> = DEFAULT_SCHEDULER): CardState {
  return { id, status: 'new', due: 0, interval: 0, ease: cfg.startingEase, step: 0, reps: 0, lapses: 0 };
}

export function schedule(card: CardState, grade: Grade, now: number, cfg: SchedulerConfig = DEFAULT_SCHEDULER): CardState {
  return cfg.algorithm === 'fsrs' ? scheduleFsrs(card, grade, now, cfg) : scheduleSm2(card, grade, now, cfg);
}

// ---------------------------------------------------------------------------------------------
// SM-2

function sm2Fuzz(days: number, cfg: SchedulerConfig): number {
  if (!cfg.fuzz || days < 2.5) return days;
  const { min_ivl, max_ivl } = get_fuzz_range(days, 0, cfg.maxIntervalDays);
  return min_ivl + Math.random() * (max_ivl - min_ivl);
}

function clampInterval(days: number, cfg: SchedulerConfig, min = 1): number {
  return Math.min(cfg.maxIntervalDays, Math.max(min, Math.round(days)));
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

function graduate(c: CardState, days: number, now: number, cfg: SchedulerConfig): CardState {
  const interval = clampInterval(sm2Fuzz(days, cfg), cfg);
  return { ...c, status: 'review', step: 0, interval, due: now + interval * DAY };
}

function scheduleSm2(card: CardState, grade: Grade, now: number, cfg: SchedulerConfig): CardState {
  const c: CardState = { ...card, reps: card.reps + 1, lastReview: now };

  if (card.status === 'new' || card.status === 'learning') {
    const steps = stepsOrDefault(cfg.learningSteps, DEFAULT_SCHEDULER.learningSteps);
    const step = card.status === 'new' ? 0 : card.step;
    const base = card.status === 'new' ? { ...c, ease: cfg.startingEase } : c;
    if (grade === 4 || !steps.length) return graduate(base, grade === 4 ? cfg.easyIntervalDays : cfg.graduatingIntervalDays, now, cfg);
    if (grade === 1) return { ...base, status: 'learning', step: 0, due: now + steps[0] * MIN };
    if (grade === 2) return { ...base, status: 'learning', step, due: now + stepDelay(steps, step, 2) };
    const nextStep = step + 1;
    if (nextStep >= steps.length) return graduate(base, cfg.graduatingIntervalDays, now, cfg);
    return { ...base, status: 'learning', step: nextStep, due: now + steps[nextStep] * MIN };
  }

  if (card.status === 'relearning') {
    const steps = parseSteps(cfg.relearningSteps) ?? [];
    if (!steps.length || grade === 4) return graduate(c, grade === 4 ? card.interval + 1 : card.interval, now, cfg);
    if (grade === 1) return { ...c, step: 0, due: now + steps[0] * MIN };
    if (grade === 2) return { ...c, due: now + stepDelay(steps, card.step, 2) };
    const nextStep = card.step + 1;
    if (nextStep >= steps.length) return graduate(c, card.interval, now, cfg);
    return { ...c, step: nextStep, due: now + steps[nextStep] * MIN };
  }

  // Review card.
  if (grade === 1) {
    const interval = clampInterval(card.interval * cfg.lapseMultiplier, cfg, cfg.minimumLapseIntervalDays);
    const steps = parseSteps(cfg.relearningSteps) ?? [];
    const lapsed = { ...c, lapses: card.lapses + 1, ease: Math.max(MIN_EASE, card.ease - 0.2), interval };
    if (!steps.length) return { ...lapsed, status: 'review', step: 0, due: now + interval * DAY };
    return { ...lapsed, status: 'relearning', step: 0, due: now + steps[0] * MIN };
  }
  let ease = card.ease;
  let interval: number;
  if (grade === 2) {
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = card.interval * cfg.hardMultiplier * cfg.intervalModifier;
  } else if (grade === 3) {
    interval = card.interval * ease * cfg.intervalModifier;
  } else {
    ease += 0.15;
    interval = card.interval * ease * cfg.easyBonus * cfg.intervalModifier;
  }
  interval = clampInterval(sm2Fuzz(Math.max(card.interval + 1, interval), cfg), cfg);
  return { ...c, ease, interval, due: now + interval * DAY };
}

// ---------------------------------------------------------------------------------------------
// FSRS

let cached: { key: string; f: FSRS } | null = null;

/** The ts-fsrs scheduler for these settings (cached while the settings stay the same). */
export function fsrsFor(cfg: SchedulerConfig): FSRS {
  const key = JSON.stringify([cfg.desiredRetention, cfg.maxIntervalDays, cfg.fuzz, cfg.fsrsParams, cfg.learningSteps, cfg.relearningSteps]);
  if (cached?.key !== key) {
    const toSteps = (s: string) => (parseSteps(s) ?? []).map((m) => `${m}m`) as unknown as Steps;
    cached = {
      key,
      f: fsrs(
        generatorParameters({
          request_retention: cfg.desiredRetention,
          maximum_interval: cfg.maxIntervalDays,
          enable_fuzz: cfg.fuzz,
          w: cfg.fsrsParams.length ? cfg.fsrsParams : default_w,
          enable_short_term: true,
          learning_steps: toSteps(cfg.learningSteps),
          relearning_steps: toSteps(cfg.relearningSteps),
        }),
      ),
    };
  }
  return cached.f;
}

const STATE: Record<CardStatus, State> = { new: State.New, learning: State.Learning, review: State.Review, relearning: State.Relearning };
const STATUS: Record<State, CardStatus> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

/**
 * A rough FSRS memory for a card that only has SM-2 history: stability from its interval, difficulty from
 * its ease (ease 2.5 ≈ difficulty 5; lower ease means harder). Used only when there's no review log to replay.
 */
export function memoryFromSm2(card: CardState): { stability: number; difficulty: number } {
  return {
    stability: Math.max(0.5, card.interval || 1),
    difficulty: Math.min(10, Math.max(1, 5 + (2.5 - card.ease) * 4)),
  };
}

function toFsrsCard(s: CardState, now: number): FsrsCard {
  if (s.status === 'new') return createEmptyCard(new Date(now));
  const mem = s.stability !== undefined && s.difficulty !== undefined ? { stability: s.stability, difficulty: s.difficulty } : memoryFromSm2(s);
  const last = s.lastReview ?? now;
  return {
    due: new Date(s.due),
    stability: mem.stability,
    difficulty: mem.difficulty,
    elapsed_days: Math.max(0, Math.floor((now - last) / DAY)),
    scheduled_days: s.interval,
    learning_steps: s.step,
    reps: s.reps,
    lapses: s.lapses,
    state: STATE[s.status],
    last_review: new Date(last),
  };
}

function scheduleFsrs(card: CardState, grade: Grade, now: number, cfg: SchedulerConfig): CardState {
  const next = fsrsFor(cfg).next(toFsrsCard(card, now), new Date(now), grade as FsrsGrade).card;
  return {
    ...card,
    status: STATUS[next.state],
    due: next.due.getTime(),
    interval: next.scheduled_days,
    step: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    lastReview: now,
    stability: next.stability,
    difficulty: next.difficulty,
  };
}

/** Replay a card's answers through FSRS to recover its memory, as Anki does when FSRS is switched on. */
export function memoryFromHistory(history: { t: number; grade: Grade }[], cfg: SchedulerConfig): { stability: number; difficulty: number } | null {
  if (!history.length) return null;
  const f = fsrsFor({ ...cfg, fuzz: false });
  let c = createEmptyCard(new Date(history[0].t));
  for (const h of [...history].sort((a, b) => a.t - b.t)) c = f.next(c, new Date(h.t), h.grade as FsrsGrade).card;
  return { stability: c.stability, difficulty: c.difficulty };
}

/** Probability of recalling a card right now (FSRS), or null if it has no memory yet. */
export function retrievability(card: CardState, now: number, cfg: SchedulerConfig): number | null {
  if (card.status === 'new' || card.stability === undefined) return null;
  return fsrsFor(cfg).get_retrievability(toFsrsCard(card, now), new Date(now), false);
}

/** Human readable "time until" for showing next intervals on grade buttons. */
export function formatDelay(ms: number): string {
  if (ms < MIN) return '<1m';
  if (ms < 60 * MIN) return `${Math.round(ms / MIN)}m`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}h`;
  const d = ms / DAY;
  // One decimal for months and years, like Anki, so Hard/Good/Easy stay distinguishable.
  const oneDp = (x: number) => String(Math.round(x * 10) / 10);
  if (d < 30) return `${Math.round(d)}d`;
  if (d < 365) return `${oneDp(d / 30)}mo`;
  return `${oneDp(d / 365)}y`;
}

/** Days FSRS would schedule a review card with this stability for, at the desired retention (no fuzz). */
export function fsrsInterval(stability: number, cfg: SchedulerConfig): number {
  return fsrsFor({ ...cfg, fuzz: false }).next_interval(stability, 0);
}

/**
 * "Known" for a new card (as in JPDB): treat it as answered Good through its learning steps and then once more,
 * all now. The card graduates and comes back in a few days to check it really is known. Returns the new state
 * and how many Good answers that took (for the review log).
 */
export function markKnown(card: CardState, now: number, cfg: SchedulerConfig = DEFAULT_SCHEDULER): { state: CardState; goods: number } {
  let state = schedule(card, 3, now, cfg);
  let goods = 1;
  while (state.status !== 'review' && goods < 20) {
    state = schedule(state, 3, now, cfg);
    goods++;
  }
  state = schedule(state, 3, now, cfg);
  return { state, goods: goods + 1 };
}
