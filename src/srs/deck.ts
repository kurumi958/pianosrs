import {
  type Accidental,
  type Clef,
  type Pitch,
  diatonicIndex,
  fromDiatonicIndex,
  naturalRange,
  parsePitch,
  pitchName,
  sortPitches,
  toMidi,
} from '../music/notes';

/** Which staff a card is drawn on. Grand-staff cards use both hands. */
export type StaffKind = Clef | 'grand';

export interface Card {
  id: string;
  deck: string;
  staff: StaffKind;
  /** Every note to play, sorted low → high. */
  notes: Pitch[];
  /** Notes written on each staff (right hand = treble, left hand = bass). One side is empty for single-clef cards. */
  hands: Record<Clef, Pitch[]>;
}

export interface DeckDef {
  id: string;
  name: string;
  description: string;
  cards: Card[];
}

function makeCard(deck: string, clef: Clef, notes: Pitch[]): Card {
  const sorted = sortPitches(notes);
  const hands = { treble: [] as Pitch[], bass: [] as Pitch[] };
  hands[clef] = sorted;
  return { id: `${clef}:${sorted.map(pitchName).join('+')}`, deck, staff: clef, notes: sorted, hands };
}

/** A grand-staff card. Its id lists the right-hand notes, then the left-hand notes: "grand:E4+G4|C3". */
function makeGrandCard(deck: string, treble: Pitch[], bass: Pitch[]): Card {
  const t = sortPitches(treble);
  const b = sortPitches(bass);
  return {
    id: `grand:${t.map(pitchName).join('+')}|${b.map(pitchName).join('+')}`,
    deck,
    staff: 'grand',
    notes: sortPitches([...t, ...b]),
    hands: { treble: t, bass: b },
  };
}

/** Deterministic PRNG so the introduction order is stable between sessions. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Landmark notes first (they anchor everything else), the rest in a stable shuffled order. */
function ordered(cards: Card[], landmarks: string[], seed: number): Card[] {
  const first = landmarks.map((l) => cards.find((c) => c.id === l)).filter((c): c is Card => !!c);
  const rest = cards.filter((c) => !first.includes(c));
  return [...first, ...shuffle(rest, seed)];
}

function singles(deck: string, clef: Clef, pitches: Pitch[]): Card[] {
  return pitches.map((p) => makeCard(deck, clef, [p]));
}

function accidentals(deck: string, clef: Clef, from: string, to: string): Card[] {
  const out: Card[] = [];
  for (const p of naturalRange(from, to)) {
    const sharps: Accidental[] = p.letter === 'E' || p.letter === 'B' ? [] : ['#'];
    const flats: Accidental[] = p.letter === 'C' || p.letter === 'F' ? [] : ['b'];
    for (const acc of [...sharps, ...flats]) out.push(makeCard(deck, clef, [{ ...p, acc }]));
  }
  return out;
}

/** Diatonic (white-key) stacks: each entry of `steps` is a distance in staff steps from the root. */
function stacks(deck: string, clef: Clef, from: string, to: string, shapes: number[][], top: string): Card[] {
  const maxTop = toMidi(parsePitch(top));
  const out: Card[] = [];
  for (const root of naturalRange(from, to)) {
    const r = diatonicIndex(root);
    for (const shape of shapes) {
      const notes = [root, ...shape.map((s) => fromDiatonicIndex(r + s))];
      if (notes.every((n) => toMidi(n) <= maxTop)) out.push(makeCard(deck, clef, notes));
    }
  }
  return out;
}

/** Drop later duplicates (overlapping hand positions can produce the same card twice). */
function uniqueById(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter((c) => !seen.has(c.id) && seen.add(c.id));
}

/** Single notes across the whole grand staff, so you learn to tell which staff you're reading. Middle C appears on both. */
function grandSingles(deck: string): Card[] {
  return [
    ...naturalRange('C4', 'G5').map((p) => makeGrandCard(deck, [p], [])),
    ...naturalRange('F2', 'C4').map((p) => makeGrandCard(deck, [], [p])),
  ];
}

/** One note in each hand within a five-finger position, e.g. C position = LH C3–G3, RH C4–G4. */
function handsTogether(deck: string, lhFrom: string, rhFrom: string, seed: number): Card[] {
  const lh = diatonicIndex(parsePitch(lhFrom));
  const rh = diatonicIndex(parsePitch(rhFrom));
  const out: Card[] = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) out.push(makeGrandCard(deck, [fromDiatonicIndex(rh + j)], [fromDiatonicIndex(lh + i)]));
  // Start with the thumbs and fifth fingers lining up (the easiest shapes), then the rest.
  const anchors = [out[0], out[24], out[4], out[20]];
  return [...anchors, ...shuffle(out.filter((c) => !anchors.includes(c)), seed)];
}

/** Left-hand bass note (or root + fifth) under a right-hand root-position triad on the same root. */
function bassAndChord(deck: string): Card[] {
  const out: Card[] = [];
  for (const root of naturalRange('C4', 'B4')) {
    const r = diatonicIndex(root);
    const triad = [0, 2, 4].map((s) => fromDiatonicIndex(r + s));
    out.push(makeGrandCard(deck, triad, [fromDiatonicIndex(r - 7)]));
  }
  for (const root of naturalRange('C3', 'F3')) {
    const r = diatonicIndex(root);
    const triad = [7, 9, 11].map((s) => fromDiatonicIndex(r + s));
    out.push(makeGrandCard(deck, triad, [root, fromDiatonicIndex(r + 4)]));
  }
  return out;
}

const INTERVALS = [[2], [3], [4], [7]]; // 3rd, 4th, 5th, octave
const TRIADS = [[2, 4]];

export const DECKS: DeckDef[] = [
  {
    id: 'treble-staff',
    name: 'Treble clef: on the staff',
    description: 'Middle C up to G above the staff.',
    cards: ordered(singles('treble-staff', 'treble', naturalRange('C4', 'G5')), ['treble:C4', 'treble:G4', 'treble:F5'], 1),
  },
  {
    id: 'bass-staff',
    name: 'Bass clef: on the staff',
    description: 'F below the staff up to middle C.',
    cards: ordered(singles('bass-staff', 'bass', naturalRange('F2', 'C4')), ['bass:C4', 'bass:F3', 'bass:G2'], 2),
  },
  {
    id: 'grand-staff',
    name: 'Grand staff: which staff?',
    description: 'Single notes on either staff of the grand staff — learn to switch clefs at a glance.',
    cards: ordered(grandSingles('grand-staff'), ['grand:C4|', 'grand:|C4', 'grand:G4|', 'grand:|F3'], 11),
  },
  {
    id: 'grand-hands',
    name: 'Grand staff: hands together',
    description: 'One note in each hand, in C position then G position.',
    cards: uniqueById([...handsTogether('grand-hands', 'C3', 'C4', 12), ...handsTogether('grand-hands', 'G2', 'G4', 13)]),
  },
  {
    id: 'treble-ledger',
    name: 'Treble clef: ledger lines',
    description: 'G3–B3 below and A5–D6 above.',
    cards: ordered(
      [...singles('treble-ledger', 'treble', naturalRange('G3', 'B3')), ...singles('treble-ledger', 'treble', naturalRange('A5', 'D6'))],
      ['treble:C6', 'treble:A3'],
      3,
    ),
  },
  {
    id: 'bass-ledger',
    name: 'Bass clef: ledger lines',
    description: 'C2–E2 below and D4–G4 above.',
    cards: ordered(
      [...singles('bass-ledger', 'bass', naturalRange('C2', 'E2')), ...singles('bass-ledger', 'bass', naturalRange('D4', 'G4'))],
      ['bass:C2', 'bass:E4'],
      4,
    ),
  },
  {
    id: 'treble-accidentals',
    name: 'Treble clef: sharps & flats',
    description: 'Sharps and flats from middle C to G5.',
    cards: ordered(accidentals('treble-accidentals', 'treble', 'C4', 'G5'), [], 5),
  },
  {
    id: 'bass-accidentals',
    name: 'Bass clef: sharps & flats',
    description: 'Sharps and flats from F2 to middle C.',
    cards: ordered(accidentals('bass-accidentals', 'bass', 'F2', 'C4'), [], 6),
  },
  {
    id: 'treble-intervals',
    name: 'Treble clef: intervals',
    description: 'Two notes at once: 3rds, 4ths, 5ths and octaves.',
    cards: ordered(stacks('treble-intervals', 'treble', 'C4', 'C5', INTERVALS, 'G5'), [], 7),
  },
  {
    id: 'bass-intervals',
    name: 'Bass clef: intervals',
    description: 'Two notes at once: 3rds, 4ths, 5ths and octaves.',
    cards: ordered(stacks('bass-intervals', 'bass', 'F2', 'F3', INTERVALS, 'C4'), [], 8),
  },
  {
    id: 'treble-triads',
    name: 'Treble clef: triads',
    description: 'Root-position white-key triads.',
    cards: ordered(stacks('treble-triads', 'treble', 'C4', 'D5', TRIADS, 'A5'), [], 9),
  },
  {
    id: 'bass-triads',
    name: 'Bass clef: triads',
    description: 'Root-position white-key triads.',
    cards: ordered(stacks('bass-triads', 'bass', 'F2', 'G3', TRIADS, 'D4'), [], 10),
  },
  {
    id: 'grand-chords',
    name: 'Grand staff: bass note + chord',
    description: 'A left-hand root (or root and fifth) under a right-hand triad.',
    cards: bassAndChord('grand-chords'),
  },
];

export const ALL_CARDS: Card[] = DECKS.flatMap((d) => d.cards);
export const CARD_BY_ID: Map<string, Card> = new Map(ALL_CARDS.map((c) => [c.id, c]));

export function cardLabel(card: Card): string {
  if (card.staff !== 'grand') return card.notes.map(pitchName).join(' + ');
  const hand = (ps: Pitch[]) => ps.map(pitchName).join('+');
  const { treble, bass } = card.hands;
  if (!bass.length) return `${hand(treble)} (RH)`;
  if (!treble.length) return `${hand(bass)} (LH)`;
  return `LH ${hand(bass)} · RH ${hand(treble)}`;
}

export const STAFF_LABEL: Record<StaffKind, string> = { treble: 'treble clef', bass: 'bass clef', grand: 'grand staff' };
