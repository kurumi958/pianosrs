export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type Accidental = '' | '#' | 'b';
export type Clef = 'treble' | 'bass';

/** A spelled pitch. Spelling matters for notation (C# and Db are the same key but different notes on the staff). */
export interface Pitch {
  letter: Letter;
  acc: Accidental;
  octave: number;
}

export const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC_OFFSET: Record<Accidental, number> = { '': 0, '#': 1, b: -1 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function toMidi(p: Pitch): number {
  return 12 * (p.octave + 1) + LETTER_PC[p.letter] + ACC_OFFSET[p.acc];
}

/** Parse "C4", "F#3", "Bb5". */
export function parsePitch(s: string): Pitch {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`Bad pitch: ${s}`);
  return { letter: m[1] as Letter, acc: m[2] as Accidental, octave: Number(m[3]) };
}

export function pitchName(p: Pitch): string {
  return `${p.letter}${p.acc}${p.octave}`;
}

/** Name for a raw MIDI number (used to describe what the player pressed). */
export function midiName(midi: number): string {
  return `${SHARP_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Diatonic step index (C0 = 0, D0 = 1, ...). Useful for staff position maths. */
export function diatonicIndex(p: Pitch): number {
  return p.octave * 7 + LETTERS.indexOf(p.letter);
}

export function fromDiatonicIndex(i: number, acc: Accidental = ''): Pitch {
  return { letter: LETTERS[((i % 7) + 7) % 7], acc, octave: Math.floor(i / 7) };
}

/** VexFlow key string, e.g. "c#/4". */
export function vexKey(p: Pitch): string {
  return `${p.letter.toLowerCase()}${p.acc}/${p.octave}`;
}

export function sortPitches(ps: Pitch[]): Pitch[] {
  return [...ps].sort((a, b) => toMidi(a) - toMidi(b));
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

/** Inclusive range of natural pitches between two pitches. */
export function naturalRange(from: string, to: string): Pitch[] {
  const a = diatonicIndex(parsePitch(from));
  const b = diatonicIndex(parsePitch(to));
  const out: Pitch[] = [];
  for (let i = a; i <= b; i++) out.push(fromDiatonicIndex(i));
  return out;
}

const SHARP_ORDER: Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Major keys by number of sharps (positive) or flats (negative). */
export const MAJOR_KEYS: { key: string; count: number }[] = [
  { key: 'C', count: 0 },
  { key: 'G', count: 1 },
  { key: 'F', count: -1 },
  { key: 'D', count: 2 },
  { key: 'Bb', count: -2 },
  { key: 'A', count: 3 },
  { key: 'Eb', count: -3 },
  { key: 'E', count: 4 },
  { key: 'Ab', count: -4 },
  { key: 'B', count: 5 },
  { key: 'Db', count: -5 },
  { key: 'F#', count: 6 },
  { key: 'Gb', count: -6 },
  { key: 'C#', count: 7 },
  { key: 'Cb', count: -7 },
];

/** The minor key sharing a major key's signature, a minor third below: C → Am, Bb → Gm, F# → D#m. */
function relativeMinor(major: string): string {
  const t = tonic(major, 4);
  const p = fromDiatonicIndex(diatonicIndex(t) - 2);
  const want = toMidi(t) - 3;
  const acc: Accidental = toMidi(p) === want ? '' : toMidi(p) + 1 === want ? '#' : 'b';
  return `${p.letter}${acc}m`;
}

/** Minor keys by number of sharps or flats, each sharing its relative major's signature. */
export const MINOR_KEYS: { key: string; count: number }[] = MAJOR_KEYS.map(({ key, count }) => ({ key: relativeMinor(key), count }));

export const isMinor = (key: string) => key.endsWith('m');

/** Minor keys phrases can be written in: those whose raised 7th needs no double sharp (up to C♯ minor). */
export const SIGHT_MINOR_KEYS = MINOR_KEYS.filter((k) => k.count <= 4);

/** The major key with the same signature (itself for a major key). */
export function signatureKey(key: string): string {
  return isMinor(key) ? MAJOR_KEYS[MINOR_KEYS.findIndex((k) => k.key === key)].key : key;
}

/** Accidentals implied by each key signature, major and minor. */
export const KEY_SIGNATURES: Record<string, Partial<Record<Letter, Accidental>>> = Object.fromEntries(
  [...MAJOR_KEYS, ...MINOR_KEYS].map(({ key, count }) => [
    key,
    Object.fromEntries((count >= 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, Math.abs(count)).map((l) => [l, count >= 0 ? '#' : 'b'])),
  ]),
);

/** The accidental a letter gets from the key signature ('' if none). */
export function keyAccidental(key: string, letter: Letter): Accidental {
  return KEY_SIGNATURES[key]?.[letter] ?? '';
}

/** Whether a key signature has any sharps or flats (C major and A minor don't). */
export const hasSignature = (key: string) => Object.keys(KEY_SIGNATURES[key] ?? {}).length > 0;

/** The tonic of a key as a pitch in the given octave, e.g. ("Bb", 4) → Bb4, ("F#m", 3) → F#3. */
export function tonic(key: string, octave: number): Pitch {
  const m = /^([A-G])([#b]?)m?$/.exec(key);
  if (!m) throw new Error(`Bad key: ${key}`);
  return { letter: m[1] as Letter, acc: m[2] as Accidental, octave };
}

/**
 * The accidental a letter takes in the key's scale. Major keys use their signature; minor keys use harmonic
 * minor, where the 7th note is raised (G♯ in A minor, B♮ in C minor). Null where that would need a double
 * sharp (G♯ minor and beyond), which the app doesn't write.
 */
export function scaleAccidental(key: string, letter: Letter): Accidental | null {
  const sig = keyAccidental(key, letter);
  if (!isMinor(key)) return sig;
  const leading = LETTERS[(LETTERS.indexOf(tonic(key, 4).letter) + 6) % 7];
  if (letter !== leading) return sig;
  return sig === 'b' ? '' : sig === '' ? '#' : null;
}

/** "B♭ major", "F♯ minor". */
export function keyLabel(key: string): string {
  const name = key.replace(/m$/, '').replace('b', '♭').replace('#', '♯');
  return `${name} ${isMinor(key) ? 'minor' : 'major'}`;
}

/** What accidental must be printed for this pitch in a key: null if the key signature already implies it. */
export function accidentalInKey(p: Pitch, key = 'C'): '#' | 'b' | 'n' | null {
  const implied = keyAccidental(key, p.letter);
  if (p.acc === implied) return null;
  return p.acc === '' ? 'n' : p.acc;
}
