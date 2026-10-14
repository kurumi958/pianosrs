import type { GrandStyle } from './music/phrase';
import type { CardState, Grade } from './srs/scheduler';
import type { CourseState } from './srs/study';

/** "alternate" rotates through treble, bass and grand staff phrases. */
export type SightClef = 'treble' | 'bass' | 'grand' | 'alternate';

export interface Settings {
  enabledDecks: string[];
  newPerDay: number;
  easyMs: number;
  goodMs: number;
  /** Accept the right note in any octave (handy for small 25/32-key controllers). */
  ignoreOctave: boolean;
  phraseLength: number;
  sightClef: SightClef;
  /** Bar patterns used for two-handed grand-staff phrases. */
  grandStyle: GrandStyle;
  /** Phrases move mostly by step and skip, like real melodies, instead of leaping anywhere. */
  melodic: boolean;
  /** Key for sight-reading phrases: a major key, or "learned" for a random key you've studied. */
  sightKey: string;
  /** Metronome tempo for rhythm cards. */
  rhythmBpm: number;
  /** Sight-reading: wait for each note, or keep going in time with a metronome. */
  sightMode: 'wait' | 'tempo';
  sightBpm: number;
  /** Use rhythms from rhythm cards you've learned in sight-reading (otherwise plain quarter notes). */
  sightRhythms: boolean;
  /** Extra timing compensation in ms if your taps consistently register late (positive) or early (negative). */
  latencyMs: number;
  /** Label the C keys on the on-screen piano. Off by default so you read the staff, not the keyboard. */
  showKeyLabels: boolean;
  /** "all" listens to every connected MIDI input. */
  midiInput: string;
  /** Play a tone for on-screen / computer-keyboard input (a real piano makes its own sound). */
  onscreenSound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  // Nothing is studied until you pick a course or decks: beginners and experienced readers start in different places.
  enabledDecks: [],
  newPerDay: 10,
  easyMs: 2000,
  goodMs: 5000,
  ignoreOctave: false,
  phraseLength: 8,
  sightClef: 'treble',
  grandStyle: 'mixed',
  melodic: true,
  sightKey: 'learned',
  showKeyLabels: false,
  rhythmBpm: 72,
  sightMode: 'wait',
  sightBpm: 60,
  sightRhythms: true,
  latencyMs: 0,
  midiInput: 'all',
  onscreenSound: true,
};

export interface ReviewLogEntry {
  id: string;
  t: number;
  grade: Grade;
  ms: number;
}

export interface AppData {
  version: 1;
  cards: Record<string, CardState>;
  settings: Settings;
  /** Progress through each course, by course id. */
  courses: Record<string, CourseState>;
  /** Day key → number of new cards introduced that day. */
  newByDay: Record<string, number>;
  log: ReviewLogEntry[];
}

const KEY = 'pianosrs:v1';
const MAX_LOG = 20_000;

export function emptyData(): AppData {
  return { version: 1, cards: {}, settings: { ...DEFAULT_SETTINGS }, courses: {}, newByDay: {}, log: [] };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    return normalize(JSON.parse(raw));
  } catch {
    return emptyData();
  }
}

export function saveData(d: AppData): void {
  if (d.log.length > MAX_LOG) d.log = d.log.slice(-MAX_LOG);
  localStorage.setItem(KEY, JSON.stringify(d));
}

export function normalize(raw: unknown): AppData {
  const d = raw as Partial<AppData>;
  if (!d || typeof d !== 'object' || d.version !== 1) throw new Error('Not a PianoSRS backup');
  return {
    version: 1,
    cards: d.cards ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
    courses: d.courses ?? {},
    newByDay: d.newByDay ?? {},
    log: d.log ?? [],
  };
}

/** Days roll over at 4am local time, like Anki, so late-night sessions count as the same day. */
export function dayKey(now: number): string {
  const d = new Date(now - 4 * 3_600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
