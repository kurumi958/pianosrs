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
import { asTest, type Card, makeCard, makeGrandCard, makeKeyCard, makeRhythmCard, shuffle, uniqueById } from './cards';
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
  /** For topic decks: the group it's listed under on the Decks page. */
  group?: string;
}

/** Topic deck groups, in display order. */
export const DECK_GROUPS: { name: string; decks: string[] }[] = [
  { name: 'Reading the staff', decks: ['test-staff', 'treble-staff', 'bass-staff', 'treble-ledger', 'bass-ledger'] },
  { name: 'Grand staff', decks: ['test-grand', 'grand-staff', 'grand-hands', 'grand-chords'] },
  {
    name: 'Sharps, flats & key signatures',
    decks: ['test-keys', 'treble-accidentals', 'bass-accidentals', 'key-signatures', 'key-notes-sharp', 'key-notes-flat'],
  },
  { name: 'Intervals & chords', decks: ['test-chords', 'treble-intervals', 'bass-intervals', 'treble-triads', 'bass-triads'] },
  { name: 'Rhythm', decks: ['test-rhythm', 'rhythm-basics', 'rhythm-three', 'rhythm-rests', 'rhythm-eighths', 'rhythm-dotted'] },
];

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

/** Rhythm cards from "beats: pattern, pattern; beats: ..." e.g. "4: q q h, w; 3: h." */
function rhythms(spec: string): Card[] {
  return spec.split(';').flatMap((group) => {
    const [beats, patterns] = group.split(':');
    return patterns.split(',').map((p) => makeRhythmCard(p, Number(beats)));
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
    id: 'rhythm-basics',
    name: 'Rhythm: quarter, half & whole notes',
    kind: 'topic',
    description: 'Tap one-bar rhythms in 4/4 in time with the metronome.',
    cards: rhythms('4: w, h h, q q q q, q q h, h q q, q h q'),
  },
  {
    id: 'rhythm-three',
    name: 'Rhythm: 3/4, 2/4 & dotted halves',
    kind: 'topic',
    description: 'Three and two beats in a bar, and the dotted half note.',
    cards: rhythms('3: h., q q q, h q, q h; 4: h. q, q h.; 2: h, q q'),
  },
  {
    id: 'rhythm-rests',
    name: 'Rhythm: rests',
    kind: 'topic',
    description: 'Quarter and half rests — count through the silence.',
    cards: rhythms('4: q qr q qr, qr q q q, h hr, q q hr, hr q q, q qr h; 3: q qr q, qr q q, h qr'),
  },
  {
    id: 'rhythm-eighths',
    name: 'Rhythm: eighth notes',
    kind: 'topic',
    description: 'Pairs and runs of eighth notes.',
    cards: rhythms('4: e e q q q, q e e q q, q q e e q, q q q e e, e e e e q q, e e q e e q, e e e e h, h e e q, e e e e e e e e; 3: e e q q, q e e e e'),
  },
  {
    id: 'rhythm-dotted',
    name: 'Rhythm: dotted quarter notes',
    kind: 'topic',
    description: 'The dotted quarter and eighth: long-short.',
    cards: rhythms('4: q. e q q, q. e h, q q. e q, h q. e, q. e q. e; 3: q. e q'),
  },
  {
    id: 'grand-chords',
    name: 'Grand staff: bass note + chord',
    kind: 'topic',
    description: 'A left-hand root (or root and fifth) under a right-hand triad.',
    cards: bassAndChord(),
  },
];

/**
 * Test decks: a few cards from each group that between them use every feature of that group, for checking
 * the app with a real piano. Their cards have their own ids, so practising them leaves real progress alone.
 */
const P = parsePitch;
const testDeck = (id: string, name: string, description: string, cards: Card[]): DeckDef => ({
  id,
  name,
  kind: 'topic',
  description,
  cards: cards.map(asTest),
});
const TEST_NOTE = 'Separate progress, so it never affects your real cards; reset it any time.';
const TEST_DECKS: DeckDef[] = [
  testDeck('test-staff', 'Test deck: reading the staff', `Treble and bass, on the staff and on ledger lines above and below. ${TEST_NOTE}`, [
    makeCard('treble', [P('C4')]),
    makeCard('treble', [P('G5')]),
    makeCard('bass', [P('F2')]),
    makeCard('bass', [P('C4')]),
    makeCard('treble', [P('A3')]),
    makeCard('bass', [P('E4')]),
  ]),
  testDeck('test-grand', 'Test deck: grand staff', `Middle C in each clef, one note per hand, and a left-hand chord. ${TEST_NOTE}`, [
    makeGrandCard([P('C4')], []),
    makeGrandCard([], [P('C4')]),
    makeGrandCard([P('G4')], [P('C3')]),
    makeGrandCard([P('C4'), P('E4'), P('G4')], [P('C3')]),
    makeGrandCard([], [P('G2'), P('B2'), P('D3')]),
  ]),
  testDeck('test-keys', 'Test deck: sharps, flats & keys', `Sharps and flats, naming a key, and notes in a key signature (including a natural). ${TEST_NOTE}`, [
    makeCard('treble', [P('F#4')]),
    makeCard('bass', [P('Bb2')]),
    makeKeyCard('D'),
    makeKeyCard('Eb'),
    makeGrandCard([P('F#4')], [], 'G'),
    makeGrandCard([], [P('Bb2')], 'F'),
    makeGrandCard([P('F4')], [], 'G'),
  ]),
  testDeck('test-chords', 'Test deck: intervals & chords', `A 5th, an octave and a 3rd, then triads in each clef. ${TEST_NOTE}`, [
    makeCard('treble', [P('C4'), P('G4')]),
    makeCard('treble', [P('C4'), P('C5')]),
    makeCard('bass', [P('F2'), P('A2')]),
    makeCard('treble', [P('C4'), P('E4'), P('G4')]),
    makeCard('bass', [P('G2'), P('B2'), P('D3')]),
  ]),
  testDeck('test-rhythm', 'Test deck: rhythm', `One of each: quarters and halves, 3/4, 2/4, rests, eighths, and a dotted quarter. ${TEST_NOTE}`, [
    makeRhythmCard('q q h', 4),
    makeRhythmCard('h.', 3),
    makeRhythmCard('q q', 2),
    makeRhythmCard('q qr q qr', 4),
    makeRhythmCard('e e q q q', 4),
    makeRhythmCard('q. e h', 4),
  ]),
];
TOPIC_DECKS.push(...TEST_DECKS);

/** Every distinct card. Courses reuse topic-deck cards by id, so review history is shared between them. */
export const ALL_CARDS: Card[] = uniqueById([...TOPIC_DECKS, ...COURSES].flatMap((d) => d.cards));
export const CARD_BY_ID: Map<string, Card> = new Map(ALL_CARDS.map((c) => [c.id, c]));

// Point every deck at the single shared object for each card id.
const canonical = (cards: Card[]) => cards.map((c) => CARD_BY_ID.get(c.id)!);
export const DECKS: DeckDef[] = [...COURSES, ...TOPIC_DECKS].map((d) => ({
  ...d,
  group: DECK_GROUPS.find((g) => g.decks.includes(d.id))?.name,
  cards: canonical(d.cards),
  units: d.units?.map((u) => ({ ...u, cards: canonical(u.cards) })),
}));


/** Courses, with their cards resolved to the shared card objects. */
export const COURSE_DECKS: DeckDef[] = DECKS.filter((d) => d.kind === 'course');
