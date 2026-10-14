import {
  type Accidental,
  type Clef,
  type Pitch,
  diatonicIndex,
  fromDiatonicIndex,
  isMinor,
  keyAccidental,
  naturalRange,
  parsePitch,
  scaleAccidental,
  toMidi,
  tonic,
} from '../music/notes';
import { type Card, makeCard, makeGrandCard, makeRhythmCard, shuffle } from './cards';

/** Card builders shared by the topic decks and the courses, so the same note is the same card everywhere. */

/** Landmark notes first (they anchor everything else), the rest in a stable shuffled order. */
export function ordered(cards: Card[], landmarks: string[], seed: number): Card[] {
  const first = landmarks.map((l) => cards.find((c) => c.id === l)).filter((c): c is Card => !!c);
  const rest = cards.filter((c) => !first.includes(c));
  return [...first, ...shuffle(rest, seed)];
}

export function singles(clef: Clef, pitches: Pitch[]): Card[] {
  return pitches.map((p) => makeCard(clef, [p]));
}

/** Every sharp and flat on the white keys between two notes (no E♯, B♯, C♭ or F♭: see `unusualAccidentals`). */
export function accidentals(clef: Clef, from: string, to: string): Card[] {
  const out: Card[] = [];
  for (const p of naturalRange(from, to)) {
    const sharps: Accidental[] = p.letter === 'E' || p.letter === 'B' ? [] : ['#'];
    const flats: Accidental[] = p.letter === 'C' || p.letter === 'F' ? [] : ['b'];
    for (const acc of [...sharps, ...flats]) out.push(makeCard(clef, [{ ...p, acc }]));
  }
  return out;
}

/** E♯, B♯, C♭ and F♭: white keys written as sharps or flats, as they appear in keys like F♯ and G♭ major. */
export function unusualAccidentals(clef: Clef, from: string, to: string): Card[] {
  const out: Card[] = [];
  for (const p of naturalRange(from, to)) {
    if (p.letter === 'E' || p.letter === 'B') out.push(makeCard(clef, [{ ...p, acc: '#' }]));
    if (p.letter === 'C' || p.letter === 'F') out.push(makeCard(clef, [{ ...p, acc: 'b' }]));
  }
  return out;
}

/** Diatonic (white-key) stacks: each entry of `shapes` lists distances in staff steps from the bottom note. */
export function stacks(clef: Clef, from: string, to: string, shapes: number[][], top: string): Card[] {
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

/** A pitch on the given staff position (letter and octave) with whichever accidental makes it sound `midi`. */
function spell(position: Pitch, midi: number): Pitch | null {
  const diff = midi - toMidi({ ...position, acc: '' });
  const acc: Accidental | null = diff === 0 ? '' : diff === 1 ? '#' : diff === -1 ? 'b' : null;
  return acc === null ? null : { ...position, acc };
}

/** A chord built in 3rds on `root`: `semitones` above the root for each note after it (3rd, 5th, 7th). */
function tertian(root: Pitch, semitones: number[]): Pitch[] | null {
  const r = diatonicIndex(root);
  const base = toMidi(root);
  const notes = semitones.map((s, i) => spell(fromDiatonicIndex(r + 2 * (i + 1)), base + s));
  return notes.every((n): n is Pitch => !!n) ? [root, ...notes] : null;
}

/** The twelve major roots and twelve minor roots, spelled as they're usually written. */
const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const DOMINANT_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'B'];

/** Root-position major and minor triads on every root, written with accidentals (no key signature). */
export function majorMinorTriads(clef: Clef, octave: number): Card[] {
  const at = (name: string) => parsePitch(`${name}${octave}`);
  return [...MAJOR_ROOTS.map((r) => tertian(at(r), [4, 7])), ...MINOR_ROOTS.map((r) => tertian(at(r), [3, 7]))]
    .filter((n): n is Pitch[] => !!n)
    .map((n) => makeCard(clef, n));
}

/** Dominant 7th chords in root position. */
export function dominantSevenths(clef: Clef, octave: number, roots = DOMINANT_ROOTS): Card[] {
  return roots
    .map((r) => tertian(parsePitch(`${r}${octave}`), [4, 7, 10]))
    .filter((n): n is Pitch[] => !!n)
    .map((n) => makeCard(clef, n));
}

/** Single notes across the whole grand staff, so you learn to tell which staff you're reading. Middle C appears on both. */
export function grandSingles(): Card[] {
  return [...naturalRange('C4', 'G5').map((p) => makeGrandCard([p], [])), ...naturalRange('F2', 'C4').map((p) => makeGrandCard([], [p]))];
}

/**
 * One note in each hand within a five-finger position, e.g. C position = LH C3–G3, RH C4–G4. The notes take the
 * key's sharps and flats (F position has B♭), and the cards are written in that key.
 */
export function handsTogether(lhFrom: string, rhFrom: string, seed: number, key = 'C'): Card[] {
  const lh = diatonicIndex(parsePitch(lhFrom));
  const rh = diatonicIndex(parsePitch(rhFrom));
  const inKey = (i: number): Pitch => {
    const p = fromDiatonicIndex(i);
    return { ...p, acc: scaleAccidental(key, p.letter) ?? keyAccidental(key, p.letter) };
  };
  const out: Card[] = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) out.push(makeGrandCard([inKey(rh + j)], [inKey(lh + i)], key));
  // Start with the thumbs and fifth fingers lining up (the easiest shapes), then the rest. In middle C position
  // both thumbs share middle C, which one key can't play twice, so that card is left out.
  const anchors = [out[0], out[24], out[4], out[20]];
  const playable = (c: Card) => !c.hands.treble.some((t) => c.hands.bass.some((b) => toMidi(b) === toMidi(t)));
  return [
    ...anchors,
    ...shuffle(
      out.filter((c) => !anchors.includes(c)),
      seed,
    ),
  ].filter(playable);
}

/** Left-hand bass note (or root + fifth) under a right-hand root-position triad on the same root. */
export function bassAndChord(): Card[] {
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

/** Two notes in each hand: a right-hand 3rd or 6th over a left-hand 5th or octave, around C, F and G. */
export function handsTogetherIntervals(seed: number): Card[] {
  const P = parsePitch;
  const lh = ['C3+G3', 'F2+C3', 'G2+D3', 'C3+C4', 'A2+E3'];
  const rh = ['C4+E4', 'D4+F4', 'E4+G4', 'F4+A4', 'G4+B4', 'A4+C5', 'C4+A4', 'E4+C5', 'G4+E5', 'B4+D5'];
  const out: Card[] = [];
  for (const l of lh) for (const r of rh) out.push(makeGrandCard(r.split('+').map(P), l.split('+').map(P)));
  return shuffle(out, seed);
}

/** The notes on each staff where the key sets an accidental: the treble staff (E4–F5) and the bass staff (G2–A3). */
function keyedNotes(keys: string[], seed: number, pick: (key: string, p: Pitch) => Accidental | null): Card[] {
  return keys.flatMap((key, k) => {
    const card = (side: 'rh' | 'lh') => (p: Pitch) => {
      const acc = pick(key, p);
      if (acc === null) return null;
      const n = { ...p, acc };
      return side === 'rh' ? makeGrandCard([n], [], key) : makeGrandCard([], [n], key);
    };
    const rh = naturalRange('E4', 'F5').map(card('rh'));
    const lh = naturalRange('G2', 'A3').map(card('lh'));
    return shuffle(
      [...rh, ...lh].filter((c): c is Card => !!c),
      seed + k,
    );
  });
}

/** Notes the key signature changes, read on the grand staff. Keys come in order, each one's cards together. */
export function notesInKeys(keys: string[], seed: number): Card[] {
  return keyedNotes(keys, seed, (key, p) => (keyAccidental(key, p.letter) !== '' ? keyAccidental(key, p.letter) : null));
}

/** The same notes with a natural sign cancelling the key signature: F♮ in G major, B♮ in F major. */
export function naturalsInKeys(keys: string[], seed: number): Card[] {
  return keyedNotes(keys, seed, (key, p) => (keyAccidental(key, p.letter) !== '' ? '' : null));
}

/** Minor keys' raised 7th (G♯ in A minor): the one note harmonic minor adds outside the key signature. */
export function leadingTones(keys: string[], seed: number): Card[] {
  return keyedNotes(keys, seed, (key, p) => {
    const acc = scaleAccidental(key, p.letter);
    return acc !== null && acc !== keyAccidental(key, p.letter) ? acc : null;
  });
}

/** Melodic minor's raised 6th going up (F♯ in A minor, A♮ in C minor). */
export function raisedSixths(keys: string[], seed: number): Card[] {
  return keyedNotes(keys, seed, (key, p) => {
    if (!isMinor(key)) return null;
    const sixth = fromDiatonicIndex(diatonicIndex(tonic(key, 4)) + 5).letter;
    if (p.letter !== sixth) return null;
    const sig = keyAccidental(key, p.letter);
    return sig === '' ? '#' : sig === 'b' ? '' : null;
  });
}

/** Rhythm cards from "meter: pattern, pattern; meter: ..." e.g. "4: q q h, w; 3: h.; 6/8: q. q." (a bare number is x/4). */
export function rhythms(spec: string): Card[] {
  return spec.split(';').flatMap((group) => {
    const [meter, patterns] = group.split(':').map((x) => x.trim());
    return patterns.split(',').map((p) => makeRhythmCard(p.trim(), meter.includes('/') ? meter : Number(meter)));
  });
}

/**
 * Grand-staff cards from a compact spec: space-separated "RH|LH" entries, chords joined with "+".
 * "C4|" is right-hand middle C, "|A3" is left-hand A, "E4|C3+E3+G3" is a melody note over a C chord.
 */
export function grand(spec: string, key = 'C'): Card[] {
  const hand = (s: string) => (s ? s.split('+').map(parsePitch) : []);
  return spec
    .trim()
    .split(/\s+/)
    .map((entry) => {
      const [rh, lh = ''] = entry.split('|');
      return makeGrandCard(hand(rh), hand(lh), key);
    });
}
