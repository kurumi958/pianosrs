import { MAJOR_KEYS, MINOR_KEYS, naturalRange, parsePitch, SIGHT_MINOR_KEYS } from '../music/notes';
import { asTest, type Card, makeCard, makeGrandCard, makeKeyCard, makeRhythmCard, uniqueById } from './cards';
import { COURSES } from './course';
import {
  accidentals,
  bassAndChord,
  dominantSevenths,
  grand,
  grandSingles,
  handsTogether,
  handsTogetherIntervals,
  leadingTones,
  majorMinorTriads,
  naturalsInKeys,
  notesInKeys,
  ordered,
  raisedSixths,
  rhythms,
  singles,
  stacks,
  unusualAccidentals,
} from './generators';

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
  /** Topic decks drill one skill; a course is a sequence of units that unlock as you progress; a song deck learns a piece. */
  kind: 'topic' | 'course' | 'song';
  /** All cards, in introduction order. */
  cards: Card[];
  units?: CourseUnit[];
  /** For topic decks: the group it's listed under on the Decks page. */
  group?: string;
  /** For topic decks: who it's for. Beginner is a first method book; intermediate carries on to the end of a second. */
  level?: Level;
}

export type Level = 'beginner' | 'intermediate' | 'advanced';
export const LEVEL_LABEL: Record<Level, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** Topic deck groups, in display order; within each, decks are in the order you'd learn them. */
export const DECK_GROUPS: { name: string; decks: string[] }[] = [
  {
    name: 'Reading the staff',
    decks: ['test-staff', 'landmarks', 'treble-staff', 'bass-staff', 'treble-ledger', 'bass-ledger', 'treble-high', 'bass-low'],
  },
  { name: 'Grand staff', decks: ['test-grand', 'grand-staff', 'grand-hands', 'grand-positions', 'grand-chords', 'grand-intervals'] },
  {
    name: 'Sharps, flats & key signatures',
    decks: [
      'test-keys',
      'treble-accidentals',
      'bass-accidentals',
      'key-signatures',
      'key-notes-sharp',
      'key-notes-flat',
      'key-naturals',
      'minor-key-signatures',
      'minor-notes',
      'minor-melodic',
      'unusual-accidentals',
    ],
  },
  {
    name: 'Intervals & chords',
    decks: [
      'test-chords',
      'treble-intervals',
      'bass-intervals',
      'treble-triads',
      'bass-triads',
      'treble-intervals-2',
      'bass-intervals-2',
      'treble-inversions',
      'bass-inversions',
      'major-minor-triads',
      'seventh-chords',
    ],
  },
  {
    name: 'Rhythm',
    decks: [
      'test-rhythm',
      'rhythm-basics',
      'rhythm-three',
      'rhythm-rests',
      'rhythm-eighths',
      'rhythm-dotted',
      'rhythm-eighth-rests',
      'rhythm-sixteenths',
      'rhythm-dotted-eighths',
      'rhythm-ties',
      'rhythm-triplets',
      'rhythm-compound',
      'rhythm-cut',
      'rhythm-sixteenth-rests',
    ],
  },
];

const SHARP_KEYS = MAJOR_KEYS.filter((k) => k.count > 0 && k.count <= 6).map((k) => k.key);
const FLAT_KEYS = MAJOR_KEYS.filter((k) => k.count < 0 && k.count >= -6).map((k) => k.key);

const INTERVALS = [[2], [3], [4], [7]]; // 3rd, 4th, 5th, octave
const INVERSIONS = [
  [2, 5],
  [3, 5],
]; // first and second inversion, from the bottom note
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
    cards: ordered([...singles('bass', naturalRange('C2', 'E2')), ...singles('bass', naturalRange('D4', 'G4'))], ['bass:C2', 'bass:E4'], 4),
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
    description: "A key signature on its own — play the major key's tonic in any octave. Fewest sharps and flats first.",
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
    cards: rhythms(
      '4: e e q q q, q e e q q, q q e e q, q q q e e, e e e e q q, e e q e e q, e e e e h, h e e q, e e e e e e e e; 3: e e q q, q e e e e',
    ),
  },
  {
    id: 'rhythm-dotted',
    name: 'Rhythm: dotted quarter notes',
    kind: 'topic',
    description: 'The dotted quarter and eighth: long-short.',
    cards: rhythms('4: q. e q q, q. e h, q q. e q, h q. e, q. e q. e; 3: q. e q'),
  },
  {
    id: 'rhythm-sixteenths',
    name: 'Rhythm: sixteenth notes',
    kind: 'topic',
    description: 'Four to a beat, and an eighth with two sixteenths.',
    cards: rhythms(
      '4: s s s s q q q, q s s s s q q, q q s s s s q, q q q s s s s, e s s q q q, s s e q q q, s s s s s s s s h, e s s e s s h, s s e s s e q q; 2: s s s s q, q s s s s; 3: s s s s q q',
    ),
  },
  {
    id: 'rhythm-dotted-eighths',
    name: 'Rhythm: dotted eighths',
    kind: 'topic',
    description: 'The dotted eighth and sixteenth (long-short), and the snap (short-long).',
    cards: rhythms('4: e. s q q q, q e. s q q, q q e. s q, e. s e. s h, e. s e. s e. s e. s, s e. q h; 3: e. s q q; 2: e. s q'),
  },
  {
    id: 'rhythm-ties',
    name: 'Rhythm: ties & syncopation',
    kind: 'topic',
    description: "Notes tied together (hold, don't play again) and accents off the beat.",
    cards: rhythms('4: h~ q q, q~ e e q q, q. e~ q q, q h q, e q e q q, e q q q e, q e e~ e e q, e e~ e e~ e e q; 3: q~ e e q, h~ e e'),
  },
  {
    id: 'rhythm-triplets',
    name: 'Rhythm: triplets',
    kind: 'topic',
    description: 'Three in the time of two: eighth-note and quarter-note triplets.',
    cards: rhythms(
      '4: 3[e e e] q q q, q 3[e e e] h, q q 3[e e e] q, 3[e e e] 3[e e e] h, 3[e e e] 3[e e e] 3[e e e] q, 3[q q q] h, h 3[q q q]; 3: 3[e e e] q q; 2: 3[e e e] q',
    ),
  },
  {
    id: 'rhythm-compound',
    name: 'Rhythm: 6/8 and compound time',
    kind: 'topic',
    description: 'Beats of a dotted quarter, each split in three: 6/8, 3/8, 9/8 and 12/8.',
    cards: rhythms(
      '6/8: q. q., q e q e, e e e e e e, q. e e e, e e e q., h., q e q., q. q e, q. q.r; 3/8: q e, e e e, q.; 9/8: q. q. q., q e q e q e; 12/8: q. q. q. q., q e q e q. q.',
    ),
  },
  {
    id: 'rhythm-cut',
    name: 'Rhythm: cut time (2/2)',
    kind: 'topic',
    description: 'Two half-note beats in a bar; the metronome clicks the halves.',
    cards: rhythms('2/2: h h, w, q q h, h q q, q q q q, h. q, q h q'),
  },
  {
    id: 'minor-key-signatures',
    name: 'Minor keys: name the key',
    kind: 'topic',
    description: "A key signature on its own, read as a minor key — play the minor key's tonic in any octave.",
    cards: MINOR_KEYS.map((k) => makeKeyCard(k.key)),
  },
  {
    id: 'minor-notes',
    name: 'Minor keys: the raised 7th',
    kind: 'topic',
    description: "Harmonic minor raises the 7th with an accidental the signature doesn't show: G♯ in A minor, B♮ in C minor.",
    cards: leadingTones(
      [...SIGHT_MINOR_KEYS].sort((a, b) => Math.abs(a.count) - Math.abs(b.count) || b.count - a.count).map((k) => k.key),
      40,
    ),
  },
  {
    id: 'grand-chords',
    name: 'Grand staff: bass note + chord',
    kind: 'topic',
    description: 'A left-hand root (or root and fifth) under a right-hand triad.',
    cards: bassAndChord(),
  },
  {
    id: 'landmarks',
    name: 'Landmark notes',
    kind: 'topic',
    description:
      'Seven notes to find by sight and count from: middle C in each clef, treble G and bass F (the notes the clefs curl around), the Cs in the middle of each staff, and the Cs two ledger lines out.',
    cards: grand('C4| |C4 G4| |F3 C5| |C3 C6| |C2'),
  },
  {
    id: 'treble-high',
    name: 'Treble clef: high ledger lines',
    kind: 'topic',
    description: 'E6 up to C7, three to five ledger lines above the staff.',
    cards: ordered(singles('treble', naturalRange('E6', 'C7')), ['treble:E6', 'treble:C7'], 14),
  },
  {
    id: 'bass-low',
    name: 'Bass clef: low ledger lines',
    kind: 'topic',
    description: 'F1 up to B1, three to four ledger lines below the staff.',
    cards: ordered(singles('bass', naturalRange('F1', 'B1')), ['bass:A1', 'bass:F1'], 15),
  },
  {
    id: 'grand-positions',
    name: 'Grand staff: more hand positions',
    kind: 'topic',
    description: 'One note in each hand in middle C position, F position (with B♭), D position (with F♯) and A minor position.',
    cards: uniqueById([
      ...handsTogether('F3', 'C4', 16),
      ...handsTogether('F3', 'F4', 17, 'F'),
      ...handsTogether('D3', 'D4', 18, 'D'),
      ...handsTogether('A2', 'A4', 19, 'Am'),
    ]),
  },
  {
    id: 'grand-intervals',
    name: 'Grand staff: two notes in each hand',
    kind: 'topic',
    description: 'A right-hand 3rd or 6th over a left-hand 5th or octave.',
    cards: handsTogetherIntervals(21),
  },
  {
    id: 'key-naturals',
    name: 'Key signatures: naturals',
    kind: 'topic',
    description:
      'A natural sign cancels the key signature for the rest of the bar: F♮ in G major, B♮ in F major. Keys with up to three sharps or flats.',
    cards: naturalsInKeys(['G', 'F', 'D', 'Bb', 'A', 'Eb'], 50),
  },
  {
    id: 'minor-melodic',
    name: 'Minor keys: the raised 6th',
    kind: 'topic',
    description: 'Melodic minor raises the 6th as well as the 7th on the way up: F♯ in A minor, A♮ in C minor.',
    cards: raisedSixths(
      [...SIGHT_MINOR_KEYS].sort((a, b) => Math.abs(a.count) - Math.abs(b.count) || b.count - a.count).map((k) => k.key),
      60,
    ),
  },
  {
    id: 'unusual-accidentals',
    name: 'E♯, B♯, C♭ and F♭',
    kind: 'topic',
    description: 'White keys written as sharps or flats: E♯ is F, C♭ is B. They turn up in keys like F♯ major and G♭ major.',
    cards: ordered([...unusualAccidentals('treble', 'C4', 'G5'), ...unusualAccidentals('bass', 'F2', 'C4')], [], 22),
  },
  {
    id: 'treble-intervals-2',
    name: 'Treble clef: 2nds, 6ths & 7ths',
    kind: 'topic',
    description: '2nds (the two noteheads sit side by side), 6ths and 7ths.',
    cards: ordered(stacks('treble', 'C4', 'C5', [[1], [5], [6]], 'G5'), [], 23),
  },
  {
    id: 'bass-intervals-2',
    name: 'Bass clef: 2nds, 6ths & 7ths',
    kind: 'topic',
    description: '2nds (the two noteheads sit side by side), 6ths and 7ths.',
    cards: ordered(stacks('bass', 'F2', 'F3', [[1], [5], [6]], 'C4'), [], 24),
  },
  {
    id: 'treble-inversions',
    name: 'Treble clef: triad inversions',
    kind: 'topic',
    description: 'White-key triads in first inversion (a 3rd under a 4th) and second inversion (a 4th under a 3rd).',
    cards: ordered(stacks('treble', 'C4', 'C5', INVERSIONS, 'A5'), [], 25),
  },
  {
    id: 'bass-inversions',
    name: 'Bass clef: triad inversions',
    kind: 'topic',
    description: 'White-key triads in first inversion (a 3rd under a 4th) and second inversion (a 4th under a 3rd).',
    cards: ordered(stacks('bass', 'F2', 'G3', INVERSIONS, 'D4'), [], 26),
  },
  {
    id: 'major-minor-triads',
    name: 'Major & minor triads',
    kind: 'topic',
    description: 'Every major and minor triad in root position, with its sharps and flats: D major is D-F♯-A, C minor is C-E♭-G.',
    cards: ordered([...majorMinorTriads('treble', 4), ...majorMinorTriads('bass', 3)], [], 27),
  },
  {
    id: 'seventh-chords',
    name: 'Seventh chords',
    kind: 'topic',
    description:
      'Dominant 7ths: root position in each clef, then the three-note left-hand shapes method books use for V7 (B-F-G is G7 in C major).',
    cards: [
      ...ordered(
        [
          ...dominantSevenths('treble', 4),
          ...dominantSevenths('bass', 3, ['C', 'D', 'E']),
          ...dominantSevenths('bass', 2, ['F', 'G', 'A', 'Bb', 'B']),
        ],
        [],
        28,
      ),
      ...grand('|B2+F3+G3'),
      ...grand('|E2+Bb2+C3', 'F'),
      ...grand('|F#2+C3+D3', 'G'),
      ...grand('|C#3+G3+A3', 'D'),
      ...grand('|G#2+D3+E3', 'Am'),
    ],
  },
  {
    id: 'rhythm-eighth-rests',
    name: 'Rhythm: eighth rests',
    kind: 'topic',
    description: 'Half a beat of silence: the eighth rest, often before an offbeat eighth.',
    cards: rhythms(
      '4: er e q q q, q er e q q, q q q er e, er e er e h, e er e er q q, q. e q er e, h er e q, e er q h, hr q er e; 3: er e q q, q er e q, q q er e; 2: er e q',
    ),
  },
  {
    id: 'rhythm-sixteenth-rests',
    name: 'Rhythm: sixteenth rests',
    kind: 'topic',
    description: 'A quarter of a beat of silence, inside groups of sixteenths.',
    cards: rhythms(
      '4: sr s s s q q q, q sr s s s q q, e sr s q q q, sr s e q q q, s s sr s q h, sr s sr s q q q, e. s sr s e q q, q s sr s s q q; 2: sr s s s q',
    ),
  },
];

/**
 * Test decks: a few cards from each group that between them use every feature of that group, for checking
 * the app with a real piano. Their cards have their own ids, so practicing them leaves real progress alone.
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
  testDeck(
    'test-staff',
    'Test deck: reading the staff',
    `Treble and bass, on the staff and on ledger lines above and below. ${TEST_NOTE}`,
    [
      makeCard('treble', [P('C4')]),
      makeCard('treble', [P('G5')]),
      makeCard('bass', [P('F2')]),
      makeCard('bass', [P('C4')]),
      makeCard('treble', [P('A3')]),
      makeCard('bass', [P('E4')]),
    ],
  ),
  testDeck('test-grand', 'Test deck: grand staff', `Middle C in each clef, one note per hand, and a left-hand chord. ${TEST_NOTE}`, [
    makeGrandCard([P('C4')], []),
    makeGrandCard([], [P('C4')]),
    makeGrandCard([P('G4')], [P('C3')]),
    makeGrandCard([P('C4'), P('E4'), P('G4')], [P('C3')]),
    makeGrandCard([], [P('G2'), P('B2'), P('D3')]),
  ]),
  testDeck(
    'test-keys',
    'Test deck: sharps, flats & keys',
    `Sharps and flats, naming major and minor keys, notes in a key signature (including a natural), and a minor key's raised 7th. ${TEST_NOTE}`,
    [
      makeCard('treble', [P('F#4')]),
      makeCard('bass', [P('Bb2')]),
      makeKeyCard('D'),
      makeKeyCard('Eb'),
      makeGrandCard([P('F#4')], [], 'G'),
      makeGrandCard([], [P('Bb2')], 'F'),
      makeGrandCard([P('F4')], [], 'G'),
      makeKeyCard('Em'),
      makeGrandCard([P('G#4')], [], 'Am'),
    ],
  ),
  testDeck('test-chords', 'Test deck: intervals & chords', `A 5th, an octave and a 3rd, then triads in each clef. ${TEST_NOTE}`, [
    makeCard('treble', [P('C4'), P('G4')]),
    makeCard('treble', [P('C4'), P('C5')]),
    makeCard('bass', [P('F2'), P('A2')]),
    makeCard('treble', [P('C4'), P('E4'), P('G4')]),
    makeCard('bass', [P('G2'), P('B2'), P('D3')]),
  ]),
  testDeck(
    'test-rhythm',
    'Test deck: rhythm',
    `One of each: quarters and halves, 3/4, 2/4, rests, eighths, a dotted quarter, sixteenths, a tie, a triplet, 6/8 and 2/2. ${TEST_NOTE}`,
    [
      makeRhythmCard('q q h', 4),
      makeRhythmCard('h.', 3),
      makeRhythmCard('q q', 2),
      makeRhythmCard('q qr q qr', 4),
      makeRhythmCard('e e q q q', 4),
      makeRhythmCard('q. e h', 4),
      makeRhythmCard('e s s q q q', 4),
      makeRhythmCard('q~ e e q q', 4),
      makeRhythmCard('3[e e e] q h', 4),
      makeRhythmCard('q e q e', '6/8'),
      makeRhythmCard('q q h', '2/2'),
    ],
  ),
];
TOPIC_DECKS.push(...TEST_DECKS);

/** Each topic deck's level: beginner decks follow a first method book; intermediate ones a second. */
const LEVELS: Record<string, Level> = {
  ...Object.fromEntries(
    [
      'landmarks',
      'treble-staff',
      'bass-staff',
      'grand-staff',
      'grand-hands',
      'grand-chords',
      'treble-accidentals',
      'bass-accidentals',
      'treble-intervals',
      'bass-intervals',
      'treble-triads',
      'bass-triads',
      'rhythm-basics',
      'rhythm-three',
      'rhythm-rests',
      'rhythm-eighths',
      'rhythm-dotted',
    ].map((id) => [id, 'beginner' as Level]),
  ),
  ...Object.fromEntries(
    [
      'treble-ledger',
      'bass-ledger',
      'grand-positions',
      'grand-intervals',
      'key-signatures',
      'key-notes-sharp',
      'key-notes-flat',
      'key-naturals',
      'minor-key-signatures',
      'minor-notes',
      'minor-melodic',
      'treble-intervals-2',
      'bass-intervals-2',
      'treble-inversions',
      'bass-inversions',
      'major-minor-triads',
      'seventh-chords',
      'rhythm-eighth-rests',
      'rhythm-sixteenths',
      'rhythm-dotted-eighths',
      'rhythm-ties',
      'rhythm-triplets',
      'rhythm-compound',
      'rhythm-cut',
    ].map((id) => [id, 'intermediate' as Level]),
  ),
  ...Object.fromEntries(
    ['treble-high', 'bass-low', 'unusual-accidentals', 'rhythm-sixteenth-rests'].map((id) => [id, 'advanced' as Level]),
  ),
};

/** Every distinct card. Courses reuse topic-deck cards by id, so review history is shared between them. */
export const ALL_CARDS: Card[] = uniqueById([...TOPIC_DECKS, ...COURSES].flatMap((d) => d.cards));
export const CARD_BY_ID: Map<string, Card> = new Map(ALL_CARDS.map((c) => [c.id, c]));

// Point every deck at the single shared object for each card id.
const canonical = (cards: Card[]) => cards.map((c) => CARD_BY_ID.get(c.id)!);
export const DECKS: DeckDef[] = [...COURSES, ...TOPIC_DECKS].map((d) => ({
  ...d,
  level: LEVELS[d.id],
  group: DECK_GROUPS.find((g) => g.decks.includes(d.id))?.name,
  cards: canonical(d.cards),
  units: d.units?.map((u) => ({ ...u, cards: canonical(u.cards) })),
}));

/**
 * Replace the song decks (ids starting "song:") with these. Songs are added at run time (the built-in ones and any
 * you import), and their cards depend on how each song is split up, so their decks are swapped in whole.
 */
export function setSongDecks(decks: DeckDef[]): void {
  for (let i = DECKS.length - 1; i >= 0; i--) {
    if (!DECKS[i].id.startsWith('song:')) continue;
    for (const c of DECKS[i].cards) CARD_BY_ID.delete(c.id);
    DECKS.splice(i, 1);
  }
  for (const d of decks) {
    DECKS.push(d);
    for (const c of d.cards) CARD_BY_ID.set(c.id, c);
  }
}

/** Courses, with their cards resolved to the shared card objects. */
export const COURSE_DECKS: DeckDef[] = DECKS.filter((d) => d.kind === 'course');
