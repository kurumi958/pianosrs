import {
  type Accidental,
  type Clef,
  type Pitch,
  diatonicIndex,
  fromDiatonicIndex,
  keyAccidental,
  MAJOR_KEYS,
  MINOR_KEYS,
  naturalRange,
  parsePitch,
  scaleAccidental,
  toMidi,
} from '../music/notes';
import { parseRhythm } from '../music/rhythm';
import { type Card, makeCard, makeGrandCard, makeKeyCard, makeRhythmCard, shuffle, uniqueById } from './cards';
import { type DeckDef, setCustomDecks } from './deck';

/** What a custom deck drills. */
export type CustomKind = 'notes' | 'intervals' | 'chords' | 'keys' | 'rhythms';

/** A deck you build yourself, stored as the choices that make it so its cards can be rebuilt (and backed up) exactly. */
export interface CustomDeckSpec {
  /** "custom:" and a random suffix. */
  id: string;
  name: string;
  kind: CustomKind;
  /** Notes can use the grand staff; intervals and chords one staff. */
  staff: Clef | 'grand';
  /** Lowest and highest written note, e.g. "C4" and "G5". */
  low: string;
  high: string;
  /** Keys the notes are written in (major "D", minor "Bm"). Notes, intervals and chords take the key's scale. */
  keys: string[];
  /** Notes: also the sharps, flats and naturals outside the key. */
  chromatic: boolean;
  /** Intervals: sizes, 2 (a 2nd) to 8 (an octave). */
  intervals: number[];
  /** Chords: triads or seventh chords built on each note of the key's scale, in these inversions (0 = root position). */
  chord: 'triads' | 'sevenths';
  inversions: number[];
  /** Key signatures: which to name, and up to how many sharps or flats. */
  keyMode: 'major' | 'minor' | 'both';
  maxAccidentals: number;
  /** Rhythms: one bar per line, in the app's rhythm notation, in this time signature. */
  meter: string;
  rhythms: string;
}

/** Cards a custom deck may hold, so a wide range in many keys can't make an endless deck. */
export const MAX_CUSTOM_CARDS = 400;

export function newCustomDeck(): CustomDeckSpec {
  return {
    id: `custom:${Math.random().toString(36).slice(2, 10)}`,
    name: 'My deck',
    kind: 'notes',
    staff: 'treble',
    low: 'C4',
    high: 'G5',
    keys: ['C'],
    chromatic: false,
    intervals: [3, 5],
    chord: 'triads',
    inversions: [0],
    keyMode: 'major',
    maxAccidentals: 2,
    meter: '4/4',
    rhythms: 'q q h\nq e e q q',
  };
}

/** A note on this staff position as the key spells it (minor keys take harmonic minor's raised 7th). */
function inKey(p: Pitch, key: string): Pitch {
  return { ...p, acc: scaleAccidental(key, p.letter) ?? keyAccidental(key, p.letter) };
}

/** E♯, B♯, C♭ and F♭ only turn up as part of a key; as extra chromatic notes they'd just be confusing. */
const odd = (p: Pitch) =>
  (p.acc === '#' && (p.letter === 'E' || p.letter === 'B')) || (p.acc === 'b' && (p.letter === 'C' || p.letter === 'F'));

function range(spec: CustomDeckSpec): Pitch[] {
  try {
    const [a, b] = [parsePitch(spec.low), parsePitch(spec.high)];
    return diatonicIndex(a) <= diatonicIndex(b) ? naturalRange(spec.low, spec.high) : [];
  } catch {
    return [];
  }
}

function noteCards(spec: CustomDeckSpec, key: string): Card[] {
  const out: Card[] = [];
  for (const pos of range(spec)) {
    const own = inKey(pos, key);
    const variants: Pitch[] = [own];
    if (spec.chromatic)
      for (const acc of ['', '#', 'b'] as Accidental[]) if (acc !== own.acc && !odd({ ...pos, acc })) variants.push({ ...pos, acc });
    for (const p of variants) {
      if (spec.staff !== 'grand') out.push(makeCard(spec.staff, [p], key));
      else {
        // Middle C is written on both staves; everything else on the staff it sits in.
        if (diatonicIndex(p) >= diatonicIndex(parsePitch('C4'))) out.push(makeGrandCard([p], [], key));
        if (diatonicIndex(p) <= diatonicIndex(parsePitch('C4'))) out.push(makeGrandCard([], [p], key));
      }
    }
  }
  return out;
}

function intervalCards(spec: CustomDeckSpec, clef: Clef, key: string): Card[] {
  const top = range(spec).at(-1);
  if (!top) return [];
  const out: Card[] = [];
  for (const pos of range(spec))
    for (const size of [...spec.intervals].sort((a, b) => a - b)) {
      const upper = fromDiatonicIndex(diatonicIndex(pos) + size - 1);
      if (diatonicIndex(upper) <= diatonicIndex(top)) out.push(makeCard(clef, [inKey(pos, key), inKey(upper, key)], key));
    }
  return out;
}

function chordCards(spec: CustomDeckSpec, clef: Clef, key: string): Card[] {
  const notes = range(spec);
  if (!notes.length) return [];
  const [lo, hi] = [diatonicIndex(notes[0]), diatonicIndex(notes.at(-1)!)];
  const steps = spec.chord === 'triads' ? [0, 2, 4] : [0, 2, 4, 6];
  const out: Card[] = [];
  // Roots from an octave below the range, so inversions can start anywhere inside it.
  for (let root = lo - 7; root <= hi; root++)
    for (const inv of spec.inversions) {
      if (inv >= steps.length) continue;
      const voicing = steps.map((s, i) => root + s + (i < inv ? 7 : 0)).sort((a, b) => a - b);
      if (voicing[0] < lo || voicing.at(-1)! > hi) continue;
      out.push(
        makeCard(
          clef,
          voicing.map((i) => inKey(fromDiatonicIndex(i), key)),
          key,
        ),
      );
    }
  return out;
}

/** Problems with a rhythm deck's lines, by line (1-based), for the editor to show. */
export function rhythmProblems(spec: CustomDeckSpec): { line: number; message: string }[] {
  return spec.rhythms
    .split('\n')
    .map((l, i) => ({ l: l.trim(), line: i + 1 }))
    .filter(({ l }) => l)
    .flatMap(({ l, line }) => {
      try {
        parseRhythm(l, spec.meter);
        return [];
      } catch (e) {
        return [{ line, message: e instanceof Error ? e.message : String(e) }];
      }
    });
}

/** The cards a spec makes, in introduction order (key by key, shuffled within each), at most MAX_CUSTOM_CARDS. */
export function customCards(spec: CustomDeckSpec): Card[] {
  const seed = [...spec.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const clef: Clef = spec.staff === 'grand' ? 'treble' : spec.staff;
  let cards: Card[];
  switch (spec.kind) {
    case 'notes':
      cards = spec.keys.flatMap((k, i) => shuffle(noteCards(spec, k), seed + i));
      break;
    case 'intervals':
      cards = spec.keys.flatMap((k, i) => shuffle(intervalCards(spec, clef, k), seed + i));
      break;
    case 'chords':
      cards = spec.keys.flatMap((k, i) => shuffle(chordCards(spec, clef, k), seed + i));
      break;
    case 'keys': {
      const pick = (list: { key: string; count: number }[]) =>
        list.filter((k) => Math.abs(k.count) <= spec.maxAccidentals).map((k) => k.key);
      const keys = [...(spec.keyMode !== 'minor' ? pick(MAJOR_KEYS) : []), ...(spec.keyMode !== 'major' ? pick(MINOR_KEYS) : [])];
      cards = keys.map(makeKeyCard);
      break;
    }
    case 'rhythms':
      cards = spec.rhythms
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .flatMap((l) => {
          try {
            return [makeRhythmCard(l, spec.meter)];
          } catch {
            return [];
          }
        });
      break;
  }
  return uniqueById(cards.filter((c) => c.notes.every((n) => toMidi(n) >= 21 && toMidi(n) <= 108))).slice(0, MAX_CUSTOM_CARDS);
}

const KIND_LABEL: Record<CustomKind, string> = {
  notes: 'notes',
  intervals: 'intervals',
  chords: 'chords',
  keys: 'key signatures',
  rhythms: 'rhythms',
};

/** A one-line summary of a spec, for the deck list. */
export function describeCustom(spec: CustomDeckSpec): string {
  if (spec.kind === 'keys')
    return `Name the key: ${spec.keyMode === 'both' ? 'major and minor' : spec.keyMode} keys up to ${spec.maxAccidentals} sharps or flats`;
  if (spec.kind === 'rhythms') return `Rhythms in ${spec.meter}`;
  const staff = spec.staff === 'grand' ? 'grand staff' : `${spec.staff} clef`;
  const keys = spec.keys.length > 3 ? `${spec.keys.length} keys` : spec.keys.join(', ');
  const what =
    spec.kind === 'intervals'
      ? `intervals (${[...spec.intervals]
          .sort((a, b) => a - b)
          .map((n) => (n === 8 ? 'octave' : ordinal(n)))
          .join(', ')})`
      : spec.kind === 'chords'
        ? `${spec.chord === 'triads' ? 'triads' : 'seventh chords'} (${spec.inversions.map((i) => (i ? `${ordinal(i)} inv.` : 'root')).join(', ')})`
        : `${KIND_LABEL[spec.kind]}${spec.chromatic ? ' with accidentals' : ''}`;
  return `${what[0].toUpperCase()}${what.slice(1)}, ${staff} ${spec.low}–${spec.high}, in ${keys}`;
}

export function ordinal(n: number): string {
  return `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
}

export function customDeck(spec: CustomDeckSpec): DeckDef {
  return { id: spec.id, name: spec.name || 'My deck', description: describeCustom(spec), kind: 'topic', cards: customCards(spec) };
}

let synced = '';

/** Rebuild the custom decks when their specs change (cheap to call on every render). */
export function syncCustomDecks(specs: CustomDeckSpec[]): void {
  const sig = JSON.stringify(specs);
  if (sig === synced) return;
  synced = sig;
  setCustomDecks(specs.map(customDeck));
}
