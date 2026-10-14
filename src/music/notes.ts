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

/** Accidentals implied by each supported key signature. */
export const KEY_SIGNATURES: Record<string, Partial<Record<Letter, Accidental>>> = {
  C: {},
  G: { F: '#' },
  D: { F: '#', C: '#' },
  F: { B: 'b' },
};

/** What accidental must be printed for this pitch in a key: null if the key signature already implies it. */
export function accidentalInKey(p: Pitch, key = 'C'): '#' | 'b' | 'n' | null {
  const implied = KEY_SIGNATURES[key]?.[p.letter] ?? '';
  if (p.acc === implied) return null;
  return p.acc === '' ? 'n' : p.acc;
}
