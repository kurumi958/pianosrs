import type { CardStatus, Grade } from './scheduler';

export interface GradingConfig {
  /** Answers faster than this (per note, scaled for chords) count as Easy. Kept short: Easy should mean instant. */
  easyMs: number;
  /** Answers faster than this count as Good; slower ones as Okay. */
  goodMs: number;
}

export interface NewCardGrading {
  /** A new card answered right within this long is Good… */
  newGoodMs: number;
  /** …within this long, Okay; slower than that, Again (it wasn't really read). */
  newOkayMs: number;
  /** A new card answered right this fast is marked Known straight away (0 = never). */
  autoKnownMs: number;
}

/**
 * Grade the first answer to a new card. You've never seen it, so you look, work it out, then play: timing matters
 * much less than playing it right. Speed is judged on later reviews. Returns "known" for an instant answer when
 * auto-Known is on (you could already read it).
 */
export function gradeNewCard(correct: boolean, ms: number, noteCount: number, cfg: NewCardGrading): Grade | 'known' {
  if (!correct) return 1;
  const scale = 1 + 0.5 * (noteCount - 1);
  if (cfg.autoKnownMs > 0 && ms <= cfg.autoKnownMs * scale) return 'known';
  if (ms <= cfg.newGoodMs * scale) return 3;
  if (ms <= cfg.newOkayMs * scale) return 2;
  return 1;
}

/** Turn a played answer into an SRS grade: wrong → Again, otherwise by reaction time. */
export function autoGrade(correct: boolean, ms: number, noteCount: number, cfg: GradingConfig): Grade {
  if (!correct) return 1;
  const scale = 1 + 0.5 * (noteCount - 1);
  if (ms <= cfg.easyMs * scale) return 4;
  if (ms <= cfg.goodMs * scale) return 3;
  return 2;
}

/**
 * Easy on a card you're still learning skips the remaining steps and jumps to a long interval, so by default
 * new, learning and relearning cards top out at Good; Easy is kept for cards you already know.
 */
export function limitEasy(grade: Grade, status: CardStatus, easyWhileLearning: boolean): Grade {
  return grade === 4 && !easyWhileLearning && status !== 'review' ? 3 : grade;
}

/**
 * Grade a played-through passage. Mistakes decide it: more than one in ten notes (and more than one) is Again,
 * any at all is Okay. A clean run is Good, or Easy if it flowed: no stop longer than `easyMs` × 1.5 between notes,
 * and none longer than `goodMs` (a long stop makes even a clean run Okay). A new passage (first time through) is
 * graded on the notes alone: clean is Good, however long it took.
 */
export function gradePassage(events: number, wrongEvents: number, gapsMs: number[], cfg: GradingConfig, isNew = false): Grade {
  if (wrongEvents > Math.max(1, Math.floor(events / 10))) return 1;
  if (wrongEvents > 0) return 2;
  if (isNew) return 3;
  const longest = Math.max(0, ...gapsMs);
  if (longest > cfg.goodMs) return 2;
  if (longest <= cfg.easyMs * 1.5) return 4;
  return 3;
}
