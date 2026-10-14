import { parsePitch } from '../music/notes';
import { asTest, type Card, makeGrandCard, makeKeyCard, makeRhythmCard } from './cards';
import type { CourseUnit, DeckDef } from './deck';

/**
 * Cards from a compact spec: space-separated "RH|LH" entries, chords joined with "+".
 * "C4|" is right-hand middle C, "|A3" is left-hand A, "E4|C3+E3+G3" is a melody note over a C chord.
 * Everything is written on the grand staff, as in a beginner method book.
 */
function cards(spec: string, key = 'C'): Card[] {
  const hand = (s: string) => (s ? s.split('+').map(parsePitch) : []);
  return spec
    .trim()
    .split(/\s+/)
    .map((entry) => {
      const [rh, lh = ''] = entry.split('|');
      return makeGrandCard(hand(rh), hand(lh), key);
    });
}

/** Rhythm cards: "4: q q h, w; 3: h." */
function rhythms(spec: string): Card[] {
  return spec.split(';').flatMap((group) => {
    const [meter, patterns] = group.split(':').map((x) => x.trim());
    return patterns.split(',').map((p) => makeRhythmCard(p, meter.includes('/') ? meter : Number(meter)));
  });
}

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
  unit(
    'u4',
    'Unit 4 · More about staff reading',
    '3rds on the staff, the C chord, quarter and half rests',
    [...cards('C4+E4| |F3+A3 D4+F4| |G3+B3 E4+G4| |A3+C4 C4+E4+G4|'), ...rhythms('4: q qr q qr, h hr, q q hr; 3: q q qr')],
  ),
  unit('u5', 'Unit 5 · More bass clef reading', 'Bass C, D, E and 3rds below middle C', cards('|C3 |D3 |E3 |C3+E3 |D3+F3 |E3+G3')),
  unit('u6', 'Unit 6 · Eighth notes', 'Eighth-note rhythms; B below middle C; C and Csus4 chords', [...cards('B3| |C3+E3+G3 |C3+F3+G3 C4+F4+G4|'), ...rhythms('4: e e q q q, q q e e q, e e e e h; 3: e e q q')]),
  unit('u7', 'Unit 7 · Treble space notes F-A-C-E', 'A, C and E in the treble spaces; the F chord', cards('A4| C5| E5| F4+A4+C5| |F3+A3+C4')),
  unit('u8', 'Unit 8 · Treble C pentascale', 'Treble C up to G: D, F and G above the middle line', cards('D5| F5| G5| C5+E5| E5+G5|')),
  unit(
    'u9',
    'Unit 9 · G pentascales in 3 locations',
    'Low G, A, B in the bass; treble B; G and Gsus4 chords',
    cards('|G2 |A2 |B2 B4| G4+B4+D5| |G2+B2+D3 G4+C5+D5| |G2+C3+D3'),
  ),
  unit(
    'u10',
    'Unit 10 · Sharps and flats',
    'Sharps and flats in both hands',
    cards('F#4| |F#3 C#4| |Bb2 Bb4| |C#3 Eb4| |Eb3 G#4| Ab4|'),
  ),
  unit(
    'u11',
    'Unit 11 · Intervals: 4ths, 5ths, 6ths',
    'Blocked 4ths, 5ths and 6ths in C and G position',
    cards('C4+F4| C4+G4| |C3+F3 |C3+G3 C4+A4| |C3+A3 D4+G4| D4+A4| |G2+C3 |G2+D3 E4+A4| E4+C5| |G2+E3 G4+C5| G4+D5| G4+E5|'),
  ),
  unit('u12', 'Unit 12 · The C major scale', 'The scale in both hands, an octave apart', cards('C4|C3 D4|D3 E4|E3 F4|F3 G4|G3 A4|A3 B4|B3 C5|C4')),
  unit('u13', 'Unit 13 · The G7 chord', 'The V7 chord in C (B-F-G), with melody notes', cards('|B2+F3+G3 B3+F4+G4| D4|B2+F3+G3 F4|B2+F3+G3')),
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
    id: 'course-test',
    name: 'Test course',
    description:
      'Three tiny units for checking that units open as you learn: answer a unit\'s cards (Easy graduates a card straight away) ' +
      "and the next one opens. Separate progress, so it never affects your real cards; reset it any time.",
    kind: 'course',
    units: TEST_UNITS,
    cards: TEST_UNITS.flatMap((u) => u.cards),
  },
];
