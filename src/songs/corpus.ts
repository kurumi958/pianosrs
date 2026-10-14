import type { SongSource } from './dsl';

/**
 * Songs that come with the app: public-domain music, encoded for PianoSRS and released as CC0. Excerpts say which
 * bars they cover, and arrangements say what was simplified.
 */

const repeat = (bar: string, n: number) => Array.from({ length: n }, () => bar).join(' | ');

/** Bach, Prelude in C, BWV 846: each bar is one broken chord, given as its five notes, low to high. */
const PRELUDE_BARS = [
  'C4 E4 G4 C5 E5',
  'C4 D4 A4 D5 F5',
  'B3 D4 G4 D5 F5',
  'C4 E4 G4 C5 E5',
  'C4 E4 A4 E5 A5',
  'C4 D4 F#4 A4 D5',
  'B3 D4 G4 D5 G5',
  'B3 C4 E4 G4 C5',
  'A3 C4 E4 G4 C5',
  'D3 A3 D4 F#4 C5',
  'G3 B3 D4 G4 B4',
  'G3 Bb3 E4 G4 C#5',
  'F3 A3 D4 A4 D5',
  'F3 Ab3 D4 F4 B4',
  'E3 G3 C4 G4 C5',
  'E3 F3 A3 C4 F4',
  'D3 F3 A3 C4 F4',
  'G2 D3 G3 B3 F4',
  'C3 E3 G3 C4 E4',
].map((b) => b.split(' '));

const prelude = (part: 'rh' | 'lh' | 'lh2') =>
  PRELUDE_BARS.map(([a, b, c, d, e]) => {
    if (part === 'rh') return `re ${c}s ${d}s ${e}s ${c}s ${d}s ${e}s re ${c}s ${d}s ${e}s ${c}s ${d}s ${e}s`;
    if (part === 'lh') return `rs ${b}e.~ ${b}q rs ${b}e.~ ${b}q`;
    return `${a}h ${a}h`;
  }).join(' | ');

/** Satie's left hand: a low bass note, then a chord, alternating G major 7 and D major 7. */
const GYMNOPEDIE_LH = repeat('G2q B3+D4+F#4h | D2q A3+C#4+F#4h', 6);

export const CORPUS: SongSource[] = [
  {
    id: 'mary-lamb',
    title: 'Mary Had a Little Lamb',
    composer: 'Traditional',
    level: 1,
    about: 'Three notes in the right hand over whole notes in the left. Arranged for beginners.',
    key: 'C',
    meter: '4/4',
    tempo: 100,
    rh: 'E4q D4q C4q D4q | E4q E4q E4h | D4q D4q D4h | E4q G4q G4h | E4q D4q C4q D4q | E4q E4q E4q E4q | D4q D4q E4q D4q | C4w',
    lh: 'C3w | C3w | G2w | C3w | C3w | C3w | G2w | C3w',
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'Traditional',
    level: 1,
    about: 'The melody in C position over a simple bass line. Arranged for beginners.',
    key: 'C',
    meter: '4/4',
    tempo: 96,
    rh:
      'C4q C4q G4q G4q | A4q A4q G4h | F4q F4q E4q E4q | D4q D4q C4h | G4q G4q F4q F4q | E4q E4q D4h | ' +
      'G4q G4q F4q F4q | E4q E4q D4h | C4q C4q G4q G4q | A4q A4q G4h | F4q F4q E4q E4q | D4q D4q C4h',
    lh: 'C3w | F3h C3h | F3h C3h | G2h C3h | C3h G2h | C3h G2h | C3h G2h | C3h G2h | C3w | F3h C3h | F3h C3h | G2h C3h',
  },
  {
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    composer: 'Ludwig van Beethoven',
    level: 1,
    about: 'The theme from the Ninth Symphony, with dotted quarters and a low G. Arranged for beginners.',
    key: 'C',
    meter: '4/4',
    tempo: 100,
    rh:
      'E4q E4q F4q G4q | G4q F4q E4q D4q | C4q C4q D4q E4q | E4q. D4e D4h | E4q E4q F4q G4q | G4q F4q E4q D4q | ' +
      'C4q C4q D4q E4q | D4q. C4e C4h | D4q D4q E4q C4q | D4q E4e F4e E4q C4q | D4q E4e F4e E4q D4q | C4q D4q G3h | ' +
      'E4q E4q F4q G4q | G4q F4q E4q D4q | C4q C4q D4q E4q | D4q. C4e C4h',
    lh: 'C3w | G2w | C3w | G2w | C3w | G2w | C3w | G2h C3h | G2h C3h | G2h C3h | G2w | C3h G2h | C3w | G2w | C3w | G2h C3h',
  },
  {
    id: 'minuet-g',
    title: 'Minuet in G',
    composer: 'Christian Petzold (BWV Anh. 114)',
    level: 2,
    about: 'From the Notebook for Anna Magdalena Bach. The first section (bars 1–16): melody as written, left hand simplified.',
    key: 'G',
    meter: '3/4',
    tempo: 100,
    rh:
      'D5q G4e A4e B4e C5e | D5q G4q G4q | E5q C5e D5e E5e F#5e | G5q G4q G4q | C5q D5e C5e B4e A4e | B4q C5e B4e A4e G4e | ' +
      'F#4q G4e A4e B4e G4e | A4h. | D5q G4e A4e B4e C5e | D5q G4q G4q | E5q C5e D5e E5e F#5e | G5q G4q G4q | ' +
      'C5q D5e C5e B4e A4e | B4q C5e B4e A4e G4e | A4q B4e A4e G4e F#4e | G4h.',
    lh:
      'G3+B3+D4h A3q | B3h. | C4h. | B3h. | A3h. | G3h. | D4q B3q G3q | D4q D3e C4e B3e A3e | ' +
      'B3h. | B3h. | C4h. | B3h. | A3h. | G3h. | C4q D4q D3q | G3q D3q G2q',
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves',
    composer: 'Traditional (16th century)',
    level: 2,
    about: 'A minor in 6/8, with a pickup, dotted rhythms, and the raised 6th and 7th (F♯, G♯). Arranged with a simple left hand.',
    key: 'Am',
    meter: '6/8',
    tempo: 120,
    pickup: true,
    rh:
      'A4e | C5q D5e E5e. F5s E5e | D5q B4e G4e. A4s B4e | C5q A4e A4e. G#4s A4e | B4q G#4e E4q A4e | ' +
      'C5q D5e E5e. F5s E5e | D5q B4e G4e. A4s B4e | C5e. B4s A4e G#4e. F#4s G#4e | A4h. | ' +
      'G5q. G5e. F#5s E5e | D5q B4e G4e. A4s B4e | C5q A4e A4e. G#4s A4e | B4q G#4e E4q. | ' +
      'G5q. G5e. F#5s E5e | D5q B4e G4e. A4s B4e | C5e. B4s A4e G#4e. F#4s G#4e | A4h.',
    lh:
      're | A2q. E3q. | G2q. D3q. | A2q. E3q. | E2q. B2q. | A2q. E3q. | G2q. D3q. | A2q. E2q. | A2h. | ' +
      'C3q. G3q. | G2q. D3q. | A2q. E3q. | E2q. B2q. | C3q. G3q. | G2q. D3q. | A2q. E2q. | A2h.',
  },
  {
    id: 'fur-elise',
    title: 'Für Elise (opening)',
    composer: 'Ludwig van Beethoven (WoO 59)',
    level: 3,
    about: 'The opening phrase (pickup and bars 1–8): sixteenths in 3/8, D♯ in A minor, and the hands taking turns.',
    key: 'Am',
    meter: '3/8',
    tempo: 66,
    pickup: true,
    rh:
      'E5s D#5s | E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s G#4s B4s | C5e rs E4s E5s D#5s | ' +
      'E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s C5s B4s | A4e rq',
    lh: 're | rq. | A2s E3s A3s rs re | E2s E3s G#3s rs re | A2s E3s A3s rs re | rq. | A2s E3s A3s rs re | E2s E3s G#3s rs re | A2s E3s A3s rs re',
  },
  {
    id: 'gymnopedie-1',
    title: 'Gymnopédie No. 1 (opening)',
    composer: 'Erik Satie',
    level: 3,
    about: 'Bars 1–12: the left hand leaps from bass note to chord, and the melody holds its last note, tied across bars.',
    key: 'D',
    meter: '3/4',
    tempo: 72,
    rh: 'rh. | rh. | rh. | rh. | rq F#5q A5q | G5q F#5q C#5q | B4q C#5q D5q | A4h. | F#4h.~ | F#4h.~ | F#4h.~ | F#4h.',
    lh: GYMNOPEDIE_LH,
  },
  {
    id: 'prelude-c',
    title: 'Prelude in C (bars 1–19)',
    composer: 'Johann Sebastian Bach (BWV 846)',
    level: 3,
    about: 'From The Well-Tempered Clavier: one broken chord per bar in sixteenths, with two voices in the left hand.',
    key: 'C',
    meter: '4/4',
    tempo: 60,
    rh: prelude('rh'),
    lh: prelude('lh'),
    lh2: prelude('lh2'),
  },
  {
    id: 'moonlight',
    title: 'Moonlight Sonata (opening bars)',
    composer: 'Ludwig van Beethoven (Op. 27 No. 2)',
    level: 3,
    about: 'Bars 1–4 of the first movement: triplets in cut time, in C♯ minor, over octaves in the left hand.',
    key: 'C#m',
    meter: '2/2',
    tempo: 80,
    rh:
      repeat('3[G#3e C#4e E4e]', 4).replace(/ \| /g, ' ') +
      ' | ' +
      repeat('3[G#3e C#4e E4e]', 4).replace(/ \| /g, ' ') +
      ' | 3[A3e C#4e E4e] 3[A3e C#4e E4e] 3[A3e D4e F#4e] 3[A3e D4e F#4e]' +
      ' | 3[G#3e B#3e F#4e] 3[G#3e C#4e E4e] 3[G#3e C#4e D#4e] 3[F#3e B#3e D#4e]',
    lh: 'C#2+C#3w | B1+B2w | A1+A2h F#1+F#2h | G#1+G#2h G#1+G#2h',
  },
];
