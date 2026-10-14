import type { Grade } from './scheduler';

export interface GradingConfig {
  /** Answers faster than this (per note, scaled for chords) count as Easy. */
  easyMs: number;
  /** Answers faster than this count as Good; slower ones as Hard. */
  goodMs: number;
}

/** Turn a played answer into an SRS grade: wrong → Again, otherwise by reaction time. */
export function autoGrade(correct: boolean, ms: number, noteCount: number, cfg: GradingConfig): Grade {
  if (!correct) return 1;
  const scale = 1 + 0.5 * (noteCount - 1);
  if (ms <= cfg.easyMs * scale) return 4;
  if (ms <= cfg.goodMs * scale) return 3;
  return 2;
}
