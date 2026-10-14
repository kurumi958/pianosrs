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

export interface Card {
  id: string;
  deck: string;
  clef: Clef;
  /** Sorted low → high. */
  notes: Pitch[];
}

export interface DeckDef {
  id: string;
  name: string;
  description: string;
  cards: Card[];
}

function makeCard(deck: string, clef: Clef, notes: Pitch[]): Card {
  const sorted = sortPitches(notes);
  return { id: `${clef}:${sorted.map(pitchName).join('+')}`, deck, clef, notes: sorted };
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
];

export const ALL_CARDS: Card[] = DECKS.flatMap((d) => d.cards);
export const CARD_BY_ID: Map<string, Card> = new Map(ALL_CARDS.map((c) => [c.id, c]));

export function cardLabel(card: Card): string {
  return card.notes.map(pitchName).join(' + ');
}
