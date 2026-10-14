import type { GrandStyle } from './music/phrase';
import { type CardState, DEFAULT_SCHEDULER, type Grade, type SchedulerConfig } from './srs/scheduler';
import type { CourseState } from './srs/study';

/** "alternate" rotates through treble, bass and grand staff phrases. */
export type SightClef = 'treble' | 'bass' | 'grand' | 'alternate';

/** Scheduling options, like an Anki deck preset. */
export interface SrsSettings extends SchedulerConfig {
  maxReviewsPerDay: number;
  /** Hour (0–23) when a new day starts, so late-night study counts as the same day. */
  dayStartHour: number;
  /** When nothing else is due, learning cards due within this many minutes are shown early. */
  learnAheadMin: number;
}

export const DEFAULT_SRS: SrsSettings = { ...DEFAULT_SCHEDULER, maxReviewsPerDay: 200, dayStartHour: 4, learnAheadMin: 20 };

export interface Settings {
  enabledDecks: string[];
  newPerDay: number;
  srs: SrsSettings;
  easyMs: number;
  goodMs: number;
  /** Allow Easy on new, learning and relearning cards (off: they top out at Good). */
  easyWhileLearning: boolean;
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
  /** Colour theme: follow the device, or always light / dark. */
  theme: 'system' | 'light' | 'dark';
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
  srs: DEFAULT_SRS,
  easyMs: 1000,
  goodMs: 5000,
  easyWhileLearning: false,
  ignoreOctave: false,
  phraseLength: 8,
  sightClef: 'treble',
  grandStyle: 'mixed',
  melodic: true,
  sightKey: 'learned',
  showKeyLabels: false,
  theme: 'system',
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
  /** Set for the Good answers recorded when a new card is marked Known (not real answers). */
  known?: boolean;
}

export interface AppData {
  version: 1;
  cards: Record<string, CardState>;
  settings: Settings;
  /** Progress through each course, by course id. */
  courses: Record<string, CourseState>;
  /** Day key → number of new cards introduced that day. */
  newByDay: Record<string, number>;
  /** Day key → number of review cards answered that day (for the daily review limit). */
  reviewsByDay: Record<string, number>;
  log: ReviewLogEntry[];
}

const KEY = 'pianosrs:v1';
const MAX_LOG = 20_000;

export function emptyData(): AppData {
  return { version: 1, cards: {}, settings: { ...DEFAULT_SETTINGS, srs: { ...DEFAULT_SRS } }, courses: {}, newByDay: {}, reviewsByDay: {}, log: [] };
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

/** The Easy threshold used to be 2 seconds; saves still on that old default move to the new, stricter one. */
function migrateSettings(s: Settings): Settings {
  return s.easyMs === 2000 ? { ...s, easyMs: DEFAULT_SETTINGS.easyMs } : s;
}

export function normalize(raw: unknown): AppData {
  const d = raw as Partial<AppData>;
  if (!d || typeof d !== 'object' || d.version !== 1) throw new Error('Not a PianoSRS backup');
  return {
    version: 1,
    cards: d.cards ?? {},
    settings: migrateSettings({ ...DEFAULT_SETTINGS, ...(d.settings ?? {}), srs: { ...DEFAULT_SRS, ...(d.settings?.srs ?? {}) } }),
    courses: d.courses ?? {},
    newByDay: d.newByDay ?? {},
    reviewsByDay: d.reviewsByDay ?? {},
    log: d.log ?? [],
  };
}

let dayStartHour = DEFAULT_SRS.dayStartHour;

/** Set the hour a new day starts (from settings). */
export function setDayStartHour(h: number): void {
  dayStartHour = Math.min(23, Math.max(0, Math.round(h)));
}

/** The next time a new day starts after `now`. */
export function nextDayStart(now: number): number {
  const d = new Date(now);
  d.setHours(dayStartHour, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** Days roll over at 4am local time by default, like Anki, so late-night sessions count as the same day. */
export function dayKey(now: number): string {
  const d = new Date(now - dayStartHour * 3_600_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
