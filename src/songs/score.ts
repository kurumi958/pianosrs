import { MAJOR_KEYS, MINOR_KEYS, type Pitch } from '../music/notes';
import type { Meter } from '../music/rhythm';

/** Right hand (the top staff) or left hand (the bottom staff). */
export type Hand = 'rh' | 'lh';
export type Hands = Hand | 'both';

/** One written note of a song (a chord is several notes starting together). */
export interface ScoreNote {
  /** Bar index, from 0 (a pickup bar counts). */
  measure: number;
  /** Ticks (24 a quarter) from the start of the bar, and from the start of the song. */
  tick: number;
  time: number;
  dur: number;
  midi: number;
  pitch: Pitch;
  /** Staff index across the score, from 0 (top). */
  staff: number;
  hand: Hand;
  /** Held over from the note before by a tie: not played again. */
  tiedOver: boolean;
  voice: string;
}

export interface ScoreMeasure {
  index: number;
  /** The bar number as printed ("0" for a pickup). */
  number: string;
  /** Ticks from the start of the song. */
  start: number;
  /** Actual length in ticks (shorter than the time signature for a pickup). */
  length: number;
  meter: Meter;
  /** Key, as the app names keys: "G", "Bb", "F#m". */
  key: string;
}

export interface Score {
  title: string;
  composer: string;
  measures: ScoreMeasure[];
  notes: ScoreNote[];
  /** Number of staves (2 for piano). */
  staves: number;
  /** Suggested tempo, quarter notes per minute. */
  tempo?: number;
}

/** The app's name for a MusicXML key: fifths (sharps +, flats −) and mode. */
export function keyFromFifths(fifths: number, mode = 'major'): string {
  const list = mode === 'minor' ? MINOR_KEYS : MAJOR_KEYS;
  return list.find((k) => k.count === fifths)?.key ?? 'C';
}

export function fifthsOf(key: string): { fifths: number; mode: 'major' | 'minor' } {
  const minor = MINOR_KEYS.find((k) => k.key === key);
  if (minor) return { fifths: minor.count, mode: 'minor' };
  return { fifths: MAJOR_KEYS.find((k) => k.key === key)?.count ?? 0, mode: 'major' };
}

/** Everything played at one moment: the notes struck together (not those held over by ties). */
export interface ScoreEvent {
  time: number;
  measure: number;
  tick: number;
  notes: ScoreNote[];
  /** Distinct keys to press, low to high. */
  midis: number[];
}

const inHands = (n: ScoreNote, hands: Hands) => hands === 'both' || n.hand === hands;

/** The events to play in bars `from`–`to` (inclusive) with the given hands. */
export function scoreEvents(score: Score, from: number, to: number, hands: Hands): ScoreEvent[] {
  const byTime = new Map<number, ScoreEvent>();
  for (const n of score.notes) {
    if (n.measure < from || n.measure > to || n.tiedOver || !inHands(n, hands)) continue;
    const e = byTime.get(n.time) ?? { time: n.time, measure: n.measure, tick: n.tick, notes: [], midis: [] };
    e.notes.push(n);
    if (!e.midis.includes(n.midi)) e.midis.push(n.midi);
    byTime.set(n.time, e);
  }
  const events = [...byTime.values()].sort((a, b) => a.time - b.time);
  events.forEach((e) => e.midis.sort((a, b) => a - b));
  return events;
}

/** Whether a hand plays anything in bars `from`–`to`. */
export function handPlays(score: Score, from: number, to: number, hand: Hand): boolean {
  return score.notes.some((n) => n.measure >= from && n.measure <= to && n.hand === hand && !n.tiedOver);
}

/** "Bar 3", "Bars 3–4", using the printed bar numbers. */
export function barsLabel(score: Score, from: number, to: number): string {
  const a = score.measures[from]?.number ?? String(from + 1);
  const b = score.measures[to]?.number ?? String(to + 1);
  return from === to ? `Bar ${a}` : `Bars ${a}–${b}`;
}

export const HANDS_LABEL: Record<Hands, string> = { rh: 'Right hand', lh: 'Left hand', both: 'Hands together' };
