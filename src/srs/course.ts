import { MAJOR_KEYS, MINOR_KEYS, naturalRange } from '../music/notes';
import { asTest, type Card, makeKeyCard, makeRhythmCard } from './cards';
import type { CourseUnit, DeckDef } from './deck';
import {
  dominantSevenths,
  grand as cards,
  handsTogether,
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

const unit = (id: string, title: string, summary: string, list: Card[]): CourseUnit => ({ id, title, summary, cards: list });

/**
 * Follows the reading progression of a typical adult method book — unit by unit, the order of
 * Faber's Adult Piano Adventures All-in-One Book 1. Unit 1 there is played from finger numbers
 * and note names before the staff is introduced, so the course starts at Unit 2.
 */
const ADULT_BEGINNER_UNITS: CourseUnit[] = [
  unit('u2', 'Unit 2 · Orientation to the staff', 'Middle C, D, E, F in the treble; middle C, B, A in the bass; 4/4 and 3/4', [
    ...cards('C4| |C4 D4| |B3 E4| |A3 F4|'),
    // Unit 1's note values and Unit 2's time signatures, as rhythms to tap.
    ...rhythms('4: q q q q, h h, w, q q h, h. q; 3: h., q q q'),
  ]),
  unit('u3', 'Unit 3 · Reading reinforcement', 'Treble G (the G clef); bass G and F (the F clef)', cards('G4| |F3 |G3')),
  unit('u4', 'Unit 4 · More about staff reading', '3rds on the staff, the C chord, quarter and half rests', [
    ...cards('C4+E4| |F3+A3 D4+F4| |G3+B3 E4+G4| |A3+C4 C4+E4+G4|'),
    ...rhythms('4: q qr q qr, h hr, q q hr; 3: q q qr'),
  ]),
  unit('u5', 'Unit 5 · More bass clef reading', 'Bass C, D, E and 3rds below middle C', cards('|C3 |D3 |E3 |C3+E3 |D3+F3 |E3+G3')),
  unit('u6', 'Unit 6 · Eighth notes', 'Eighth-note rhythms; B below middle C; C and Csus4 chords', [
    ...cards('B3| |C3+E3+G3 |C3+F3+G3 C4+F4+G4|'),
    ...rhythms('4: e e q q q, q q e e q, e e e e h; 3: e e q q'),
  ]),
  unit(
    'u7',
    'Unit 7 · Treble space notes F-A-C-E',
    'A, C and E in the treble spaces; the F chord',
    cards('A4| C5| E5| F4+A4+C5| |F3+A3+C4'),
  ),
  unit('u8', 'Unit 8 · Treble C pentascale', 'Treble C up to G: D, F and G above the middle line', cards('D5| F5| G5| C5+E5| E5+G5|')),
  unit(
    'u9',
    'Unit 9 · G pentascales in 3 locations',
    'Low G, A, B in the bass; treble B; G and Gsus4 chords',
    cards('|G2 |A2 |B2 B4| G4+B4+D5| |G2+B2+D3 G4+C5+D5| |G2+C3+D3'),
  ),
  unit('u10', 'Unit 10 · Sharps and flats', 'Sharps and flats in both hands', cards('F#4| |F#3 C#4| |Bb2 Bb4| |C#3 Eb4| |Eb3 G#4| Ab4|')),
  unit(
    'u11',
    'Unit 11 · Intervals: 4ths, 5ths, 6ths',
    'Blocked 4ths, 5ths and 6ths in C and G position',
    cards('C4+F4| C4+G4| |C3+F3 |C3+G3 C4+A4| |C3+A3 D4+G4| D4+A4| |G2+C3 |G2+D3 E4+A4| E4+C5| |G2+E3 G4+C5| G4+D5| G4+E5|'),
  ),
  unit(
    'u12',
    'Unit 12 · The C major scale',
    'The scale in both hands, an octave apart',
    cards('C4|C3 D4|D3 E4|E3 F4|F3 G4|G3 A4|A3 B4|B3 C5|C4'),
  ),
  unit(
    'u13',
    'Unit 13 · The G7 chord',
    'The V7 chord in C (B-F-G), with melody notes',
    cards('|B2+F3+G3 B3+F4+G4| D4|B2+F3+G3 F4|B2+F3+G3'),
  ),
  unit(
    'u14',
    'Unit 14 · Primary chords in C major',
    'I, IV and V7 in the left hand under a melody note',
    cards('|C3+F3+A3 E4|C3+E3+G3 F4|C3+F3+A3 B3|B2+F3+G3 G4|C3+E3+G3 A4|C3+F3+A3 G4|B2+F3+G3 C5|C3+E3+G3 C5|C3+F3+A3'),
  ),
  unit(
    'u15',
    'Unit 15 · The G major scale',
    'The key signature of G: F is sharp unless marked natural',
    cards('F#4| |F#3 F#5| |F#2 F4| G4|G2 A4|A2 B4|B2 C5|C3 D5|D3 E5|E3 F#5|F#3 G5|G3', 'G'),
  ),
  unit(
    'u16',
    'Unit 16 · Primary chords in G major',
    'G, C and D7 in the left hand under a melody note',
    cards('|G2+B2+D3 |G2+C3+E3 |F#2+C3+D3 B4|G2+B2+D3 C5|G2+C3+E3 A4|F#2+C3+D3 D5|G2+B2+D3 E5|G2+C3+E3 F#4|F#2+C3+D3', 'G'),
  ),
];

/**
 * Carries on where the first course stops (primary chords in G), to the reading a late-intermediate player needs:
 * every key signature, minor keys, ledger lines further out, inversions and seventh chords, and the rest of the
 * rhythms. Keys arrive in the order method books usually take them (F, D, A minor, E and D minor, B♭ and E♭, then the
 * rest), each with its notes, a hand position and its primary chords. Cards are shared with the topic decks.
 */
/** Keys named in the units before "Every key signature". */
const EARLIER_KEYS = ['F', 'D', 'Am', 'Em', 'Dm', 'Bb', 'Eb', 'A', 'E', 'Ab'];

const INTERMEDIATE_UNITS: CourseUnit[] = [
  unit(
    'i1',
    'Unit 1 · Around middle C',
    'Ledger-line notes where the staves meet (A and B below the treble, D and E above the bass) and the Cs two ledger lines out',
    [...cards('A3| |D4 B3| |E4 G3| |F4'), ...cards('C6| |C2')],
  ),
  unit('i2', 'Unit 2 · Eighth rests', 'Half a beat of silence, and the dotted quarter again', [
    ...rhythms('4: er e q q q, q er e q q, q q q er e, q. e q er e, er e er e h; 3: er e q q, q er e q'),
  ]),
  unit('i3', 'Unit 3 · F major', 'One flat: B♭. F position, and the F, B♭ and C7 chords', [
    makeKeyCard('F'),
    ...notesInKeys(['F'], 70),
    ...handsTogether('F3', 'F4', 17, 'F').slice(0, 8),
    ...cards('|F2+A2+C3 |F2+Bb2+D3 |E2+Bb2+C3 A4|F2+A2+C3 Bb4|F2+Bb2+D3 G4|E2+Bb2+C3 C5|F2+A2+C3', 'F'),
  ]),
  unit('i4', 'Unit 4 · Naturals', 'A natural sign cancels the key signature until the barline', naturalsInKeys(['G', 'F'], 50)),
  unit('i5', 'Unit 5 · D major', 'Two sharps: F♯ and C♯. D position, and the D, G and A7 chords', [
    makeKeyCard('D'),
    ...notesInKeys(['D'], 71),
    ...handsTogether('D3', 'D4', 18, 'D').slice(0, 8),
    ...cards('|D3+F#3+A3 |D3+G3+B3 |C#3+G3+A3 F#4|D3+F#3+A3 G4|D3+G3+B3 E4|C#3+G3+A3 D5|D3+F#3+A3', 'D'),
  ]),
  unit('i6', 'Unit 6 · A minor', "C major's relative minor: same signature, with G♯ as the raised 7th. Am, Dm and E7", [
    makeKeyCard('Am'),
    ...leadingTones(['Am'], 72),
    ...handsTogether('A2', 'A4', 19, 'Am').slice(0, 8),
    ...cards('|A2+C3+E3 |A2+D3+F3 |G#2+D3+E3 C5|A2+C3+E3 D5|A2+D3+F3 B4|G#2+D3+E3 A4|A2+C3+E3', 'Am'),
  ]),
  unit('i7', 'Unit 7 · 2nds, 6ths and 7ths', 'The intervals the first course skipped', [
    ...ordered(stacks('treble', 'C4', 'G4', [[1], [5], [6]], 'G5'), [], 23),
    ...ordered(stacks('bass', 'C3', 'G3', [[1], [5]], 'C4'), [], 24),
  ]),
  unit('i8', 'Unit 8 · Triad inversions', 'The same chord with a different note at the bottom: C-E-G, E-G-C, G-C-E', [
    ...cards('C4+E4+G4| E4+G4+C5| G4+C5+E5| F4+A4+C5| A4+C5+F5| C4+F4+A4| G4+B4+D5| B3+D4+G4| D4+G4+B4|'),
    ...cards('|C3+E3+G3 |E3+G3+C4 |G2+C3+E3 |F2+A2+C3 |A2+C3+F3 |C3+F3+A3 |G2+B2+D3 |B2+D3+G3 |D3+G3+B3'),
  ]),
  unit('i9', 'Unit 9 · Sixteenth notes', 'Four to a beat, and an eighth with two sixteenths', [
    ...rhythms('4: s s s s q q q, q s s s s q q, e s s q q q, s s e q q q, e s s e s s h; 2: s s s s q'),
  ]),
  unit('i10', 'Unit 10 · 6/8 time', 'Two beats in a bar, each a dotted quarter split in three', [
    ...rhythms('6/8: q. q., q e q e, e e e e e e, q. e e e, e e e q., h., q e q.'),
  ]),
  unit('i11', 'Unit 11 · E minor and D minor', 'Relatives of G and F major, with D♯ and C♯ as their raised 7ths', [
    makeKeyCard('Em'),
    makeKeyCard('Dm'),
    ...leadingTones(['Em', 'Dm'], 73),
    ...cards('|E3+G3+B3 |E3+A3+C4 |D#3+A3+B3', 'Em'),
    ...cards('|D3+F3+A3 |D3+G3+Bb3 |C#3+G3+A3', 'Dm'),
  ]),
  unit('i12', 'Unit 12 · B♭ and E♭ major', 'Two and three flats', [makeKeyCard('Bb'), makeKeyCard('Eb'), ...notesInKeys(['Bb', 'Eb'], 74)]),
  unit('i13', 'Unit 13 · Major and minor chords', 'Every major and minor triad, sharps and flats written in', [
    ...majorMinorTriads('treble', 4),
  ]),
  unit('i14', 'Unit 14 · Seventh chords', 'Dominant 7ths in root position, and the left-hand V7 shapes', [
    ...dominantSevenths('treble', 4, ['C', 'D', 'E', 'F', 'G', 'A']),
    ...cards('|B2+F3+G3'),
    ...cards('|F#2+C3+D3', 'G'),
  ]),
  unit('i15', 'Unit 15 · Triplets and syncopation', 'Three in the time of two; ties and accents off the beat', [
    ...rhythms('4: 3[e e e] q q q, q 3[e e e] h, 3[e e e] 3[e e e] h, h~ q q, q~ e e q q, e q e q q, q e e~ e e q'),
  ]),
  unit('i16', 'Unit 16 · Further out', 'Ledger lines high above the treble and low below the bass', [
    ...singles('treble', naturalRange('A5', 'C7')),
    ...singles('bass', naturalRange('F1', 'E2')),
  ]),
  unit('i17', 'Unit 17 · A, E and A♭ major', 'Three and four sharps and flats', [
    makeKeyCard('A'),
    makeKeyCard('E'),
    makeKeyCard('Ab'),
    ...notesInKeys(['A', 'E', 'Ab'], 75),
  ]),
  unit(
    'i18',
    'Unit 18 · Every key signature',
    'The rest of the fifteen major keys and their relative minors, up to seven sharps or flats',
    [...MAJOR_KEYS, ...MINOR_KEYS].filter((k) => !EARLIER_KEYS.includes(k.key)).map((k) => makeKeyCard(k.key)),
  ),
  unit('i19', 'Unit 19 · Cut time', 'Two half-note beats in a bar', rhythms('2/2: h h, w, q q h, h q q, q q q q, h. q, q h q')),
  unit('i20', 'Unit 20 · Melodic minor and odd accidentals', 'The raised 6th in minor keys; E♯, B♯, C♭ and F♭', [
    ...raisedSixths(['Am', 'Em', 'Dm'], 60),
    ...unusualAccidentals('treble', 'C4', 'G5'),
  ]),
];

const TEST_UNITS: CourseUnit[] = [
  unit('test-u1', 'Test unit 1 · Middle C', 'Middle C in each clef', cards('C4| |C4').map(asTest)),
  unit('test-u2', 'Test unit 2 · Key and rhythm', 'Name a key, tap a rhythm', [makeKeyCard('G'), makeRhythmCard('q q h', 4)].map(asTest)),
  unit('test-u3', 'Test unit 3 · Both hands', 'A melody note over a chord', cards('E4|C3+E3+G3 G4|C3').map(asTest)),
];

export const COURSES: DeckDef[] = [
  {
    id: 'course-adult-beginner',
    name: 'Adult beginner course',
    description:
      'Note reading from your first notes on the staff to primary chords in G, unit by unit in the order of an adult method book ' +
      "(Faber's Adult Piano Adventures All-in-One Book 1). The next unit opens once you've learned most of the current one.",
    kind: 'course',
    units: ADULT_BEGINNER_UNITS,
    cards: ADULT_BEGINNER_UNITS.flatMap((u) => u.cards),
  },
  {
    id: 'course-intermediate',
    name: 'Late beginner to intermediate',
    description:
      'Carries on where the adult beginner course stops: the common keys one at a time with their primary chords, minor keys, ' +
      'ledger lines further out, inversions and seventh chords, sixteenths, 6/8 and triplets, and finally every key signature.',
    kind: 'course',
    units: INTERMEDIATE_UNITS,
    cards: INTERMEDIATE_UNITS.flatMap((u) => u.cards),
  },
  {
    id: 'course-test',
    name: 'Test course',
    description:
      "Three tiny units for checking that units open as you learn: answer a unit's cards (Easy graduates a card straight away) " +
      'and the next one opens. Separate progress, so it never affects your real cards; reset it any time.',
    kind: 'course',
    units: TEST_UNITS,
    cards: TEST_UNITS.flatMap((u) => u.cards),
  },
];
