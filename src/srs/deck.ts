import {
  type Accidental,
  type Clef,
  type Pitch,
  diatonicIndex,
  fromDiatonicIndex,
  keyAccidental,
  MAJOR_KEYS,
  naturalRange,
  parsePitch,
  toMidi,
} from '../music/notes';
import { type Card, makeCard, makeGrandCard, makeKeyCard, shuffle, uniqueById } from './cards';
import { COURSES } from './course';

export { type Card, type StaffKind, cardLabel, makeCard, makeGrandCard, mulberry32, STAFF_LABEL } from './cards';

export interface CourseUnit {
  id: string;
  title: string;
  /** What this unit adds, in a few words. */
  summary: string;
  cards: Card[];
}

export interface DeckDef {
  id: string;
  name: string;
  description: string;
  /** Topic decks drill one skill; a course is a sequence of units that unlock as you progress. */
  kind: 'topic' | 'course';
  /** All cards, in introduction order. */
  cards: Card[];
  units?: CourseUnit[];
}

/** Landmark notes first (they anchor everything else), the rest in a stable shuffled order. */
function ordered(cards: Card[], landmarks: string[], seed: number): Card[] {
  const first = landmarks.map((l) => cards.find((c) => c.id === l)).filter((c): c is Card => !!c);
  const rest = cards.filter((c) => !first.includes(c));
  return [...first, ...shuffle(rest, seed)];
}

function singles(clef: Clef, pitches: Pitch[]): Card[] {
  return pitches.map((p) => makeCard(clef, [p]));
}

function accidentals(clef: Clef, from: string, to: string): Card[] {
  const out: Card[] = [];
  for (const p of naturalRange(from, to)) {
    const sharps: Accidental[] = p.letter === 'E' || p.letter === 'B' ? [] : ['#'];
    const flats: Accidental[] = p.letter === 'C' || p.letter === 'F' ? [] : ['b'];
    for (const acc of [...sharps, ...flats]) out.push(makeCard(clef, [{ ...p, acc }]));
  }
  return out;
}

/** Diatonic (white-key) stacks: each entry of `steps` is a distance in staff steps from the root. */
function stacks(clef: Clef, from: string, to: string, shapes: number[][], top: string): Card[] {
  const maxTop = toMidi(parsePitch(top));
  const out: Card[] = [];
  for (const root of naturalRange(from, to)) {
    const r = diatonicIndex(root);
    for (const shape of shapes) {
      const notes = [root, ...shape.map((s) => fromDiatonicIndex(r + s))];
      if (notes.every((n) => toMidi(n) <= maxTop)) out.push(makeCard(clef, notes));
    }
  }
  return out;
}

/** Single notes across the whole grand staff, so you learn to tell which staff you're reading. Middle C appears on both. */
function grandSingles(): Card[] {
  return [
    ...naturalRange('C4', 'G5').map((p) => makeGrandCard([p], [])),
    ...naturalRange('F2', 'C4').map((p) => makeGrandCard([], [p])),
  ];
}

/** One note in each hand within a five-finger position, e.g. C position = LH C3–G3, RH C4–G4. */
function handsTogether(lhFrom: string, rhFrom: string, seed: number): Card[] {
  const lh = diatonicIndex(parsePitch(lhFrom));
  const rh = diatonicIndex(parsePitch(rhFrom));
  const out: Card[] = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) out.push(makeGrandCard([fromDiatonicIndex(rh + j)], [fromDiatonicIndex(lh + i)]));
  // Start with the thumbs and fifth fingers lining up (the easiest shapes), then the rest.
  const anchors = [out[0], out[24], out[4], out[20]];
  return [...anchors, ...shuffle(out.filter((c) => !anchors.includes(c)), seed)];
}

/** Left-hand bass note (or root + fifth) under a right-hand root-position triad on the same root. */
function bassAndChord(): Card[] {
  const out: Card[] = [];
  for (const root of naturalRange('C4', 'B4')) {
    const r = diatonicIndex(root);
    const triad = [0, 2, 4].map((s) => fromDiatonicIndex(r + s));
    out.push(makeGrandCard(triad, [fromDiatonicIndex(r - 7)]));
  }
  for (const root of naturalRange('C3', 'F3')) {
    const r = diatonicIndex(root);
    const triad = [7, 9, 11].map((s) => fromDiatonicIndex(r + s));
    out.push(makeGrandCard(triad, [root, fromDiatonicIndex(r + 4)]));
  }
  return out;
}

/**
 * Notes the key signature changes, read on the grand staff: each altered letter on the treble staff (E4–F5)
 * and the bass staff (G2–A3). Keys come in order, each one's cards together.
 */
function notesInKeys(keys: string[], seed: number): Card[] {
  return keys.flatMap((key, k) => {
    const altered = (p: Pitch) => keyAccidental(key, p.letter) !== '';
    const inKey = (p: Pitch): Pitch => ({ ...p, acc: keyAccidental(key, p.letter) });
    const rh = naturalRange('E4', 'F5').filter(altered).map((p) => makeGrandCard([inKey(p)], [], key));
    const lh = naturalRange('G2', 'A3').filter(altered).map((p) => makeGrandCard([], [inKey(p)], key));
    return shuffle([...rh, ...lh], seed + k);
  });
}

const SHARP_KEYS = MAJOR_KEYS.filter((k) => k.count > 0 && k.count <= 6).map((k) => k.key);
const FLAT_KEYS = MAJOR_KEYS.filter((k) => k.count < 0 && k.count >= -6).map((k) => k.key);

const INTERVALS = [[2], [3], [4], [7]]; // 3rd, 4th, 5th, octave
const TRIADS = [[2, 4]];

export const TOPIC_DECKS: DeckDef[] = [
  {
    id: 'treble-staff',
    name: 'Treble clef: on the staff',
    kind: 'topic',
    description: 'Middle C up to G above the staff.',
    cards: ordered(singles('treble', naturalRange('C4', 'G5')), ['treble:C4', 'treble:G4', 'treble:F5'], 1),
  },
  {
    id: 'bass-staff',
    name: 'Bass clef: on the staff',
    kind: 'topic',
    description: 'F below the staff up to middle C.',
    cards: ordered(singles('bass', naturalRange('F2', 'C4')), ['bass:C4', 'bass:F3', 'bass:G2'], 2),
  },
  {
    id: 'grand-staff',
    name: 'Grand staff: which staff?',
    kind: 'topic',
    description: 'Single notes on either staff of the grand staff — learn to switch clefs at a glance.',
    cards: ordered(grandSingles(), ['grand:C4|', 'grand:|C4', 'grand:G4|', 'grand:|F3'], 11),
  },
  {
    id: 'grand-hands',
    name: 'Grand staff: hands together',
    kind: 'topic',
    description: 'One note in each hand, in C position then G position.',
    cards: uniqueById([...handsTogether('C3', 'C4', 12), ...handsTogether('G2', 'G4', 13)]),
  },
  {
    id: 'treble-ledger',
    name: 'Treble clef: ledger lines',
    kind: 'topic',
    description: 'G3–B3 below and A5–D6 above.',
    cards: ordered(
      [...singles('treble', naturalRange('G3', 'B3')), ...singles('treble', naturalRange('A5', 'D6'))],
      ['treble:C6', 'treble:A3'],
      3,
    ),
  },
  {
    id: 'bass-ledger',
    name: 'Bass clef: ledger lines',
    kind: 'topic',
    description: 'C2–E2 below and D4–G4 above.',
    cards: ordered(
      [...singles('bass', naturalRange('C2', 'E2')), ...singles('bass', naturalRange('D4', 'G4'))],
      ['bass:C2', 'bass:E4'],
      4,
    ),
  },
  {
    id: 'treble-accidentals',
    name: 'Treble clef: sharps & flats',
    kind: 'topic',
    description: 'Sharps and flats from middle C to G5.',
    cards: ordered(accidentals('treble', 'C4', 'G5'), [], 5),
  },
  {
    id: 'bass-accidentals',
    name: 'Bass clef: sharps & flats',
    kind: 'topic',
    description: 'Sharps and flats from F2 to middle C.',
    cards: ordered(accidentals('bass', 'F2', 'C4'), [], 6),
  },
  {
    id: 'key-signatures',
    name: 'Key signatures: name the key',
    kind: 'topic',
    description: 'A key signature on its own — play the major key\'s tonic in any octave. Fewest sharps and flats first.',
    cards: MAJOR_KEYS.map((k) => makeKeyCard(k.key)),
  },
  {
    id: 'key-notes-sharp',
    name: 'Key signatures: reading in sharp keys',
    kind: 'topic',
    description: 'Notes the signature sharpens, from G major (F♯) up to F♯ major.',
    cards: notesInKeys(SHARP_KEYS, 20),
  },
  {
    id: 'key-notes-flat',
    name: 'Key signatures: reading in flat keys',
    kind: 'topic',
    description: 'Notes the signature flattens, from F major (B♭) up to G♭ major.',
    cards: notesInKeys(FLAT_KEYS, 30),
  },
  {
    id: 'treble-intervals',
    name: 'Treble clef: intervals',
    kind: 'topic',
    description: 'Two notes at once: 3rds, 4ths, 5ths and octaves.',
    cards: ordered(stacks('treble', 'C4', 'C5', INTERVALS, 'G5'), [], 7),
  },
  {
    id: 'bass-intervals',
    name: 'Bass clef: intervals',
    kind: 'topic',
    description: 'Two notes at once: 3rds, 4ths, 5ths and octaves.',
    cards: ordered(stacks('bass', 'F2', 'F3', INTERVALS, 'C4'), [], 8),
  },
  {
    id: 'treble-triads',
    name: 'Treble clef: triads',
    kind: 'topic',
    description: 'Root-position white-key triads.',
    cards: ordered(stacks('treble', 'C4', 'D5', TRIADS, 'A5'), [], 9),
  },
  {
    id: 'bass-triads',
    name: 'Bass clef: triads',
    kind: 'topic',
    description: 'Root-position white-key triads.',
    cards: ordered(stacks('bass', 'F2', 'G3', TRIADS, 'D4'), [], 10),
  },
  {
    id: 'grand-chords',
    name: 'Grand staff: bass note + chord',
    kind: 'topic',
    description: 'A left-hand root (or root and fifth) under a right-hand triad.',
    cards: bassAndChord(),
  },
];

/** Every distinct card. Courses reuse topic-deck cards by id, so review history is shared between them. */
export const ALL_CARDS: Card[] = uniqueById([...TOPIC_DECKS, ...COURSES].flatMap((d) => d.cards));
export const CARD_BY_ID: Map<string, Card> = new Map(ALL_CARDS.map((c) => [c.id, c]));

// Point every deck at the single shared object for each card id.
const canonical = (cards: Card[]) => cards.map((c) => CARD_BY_ID.get(c.id)!);
export const DECKS: DeckDef[] = [...COURSES, ...TOPIC_DECKS].map((d) => ({
  ...d,
  cards: canonical(d.cards),
  units: d.units?.map((u) => ({ ...u, cards: canonical(u.cards) })),
}));


/** Courses, with their cards resolved to the shared card objects. */
export const COURSE_DECKS: DeckDef[] = DECKS.filter((d) => d.kind === 'course');
