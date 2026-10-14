import { type Clef, keyAccidental, type Pitch, pitchName, sortPitches, tonic } from '../music/notes';

/** Which staff a card is drawn on. Grand-staff cards use both hands. */
export type StaffKind = Clef | 'grand';

export interface Card {
  id: string;
  staff: StaffKind;
  /** Key signature the card is written in (see KEY_SIGNATURES). */
  key: string;
  /** Every note to play, sorted low → high. */
  notes: Pitch[];
  /** Notes written on each staff (right hand = treble, left hand = bass). One side is empty for single-clef cards. */
  hands: Record<Clef, Pitch[]>;
  /** "key": the card shows only a key signature and you answer with the key's tonic. */
  prompt?: 'key';
  /** Accept the answer in any octave. */
  anyOctave?: boolean;
}

const keyTag = (key: string) => (key === 'C' ? '' : `[${key}]`);

export function makeCard(clef: Clef, notes: Pitch[], key = 'C'): Card {
  const sorted = sortPitches(notes);
  const hands = { treble: [] as Pitch[], bass: [] as Pitch[] };
  hands[clef] = sorted;
  return { id: `${clef}${keyTag(key)}:${sorted.map(pitchName).join('+')}`, staff: clef, key, notes: sorted, hands };
}

/** A grand-staff card. Its id lists the right-hand notes, then the left-hand notes: "grand:E4+G4|C3". */
export function makeGrandCard(treble: Pitch[], bass: Pitch[], key = 'C'): Card {
  const t = sortPitches(treble);
  const b = sortPitches(bass);
  return {
    id: `grand${keyTag(key)}:${t.map(pitchName).join('+')}|${b.map(pitchName).join('+')}`,
    staff: 'grand',
    key,
    notes: sortPitches([...t, ...b]),
    hands: { treble: t, bass: b },
  };
}

/** Deterministic PRNG so the introduction order is stable between sessions. */
/** "Which major key is this?" — shows a key signature on the grand staff; play the tonic in any octave. */
export function makeKeyCard(key: string): Card {
  return { id: `keysig:${key}`, staff: 'grand', key, notes: [tonic(key, 4)], hands: { treble: [], bass: [] }, prompt: 'key', anyOctave: true };
}

/**
 * The same card read in another key signature: each note keeps its letter and takes the key's accidental.
 * Returns null for cards with chromatic notes (accidentals outside their own key), which don't carry over.
 */
export function withKey(card: Card, key: string): Card | null {
  if (card.prompt) return null;
  if (card.key === key) return card;
  const diatonic = (ps: Pitch[]) => ps.every((p) => p.acc === keyAccidental(card.key, p.letter));
  if (!diatonic(card.notes)) return null;
  const move = (ps: Pitch[]) => ps.map((p) => ({ ...p, acc: keyAccidental(key, p.letter) }));
  return card.staff === 'grand'
    ? makeGrandCard(move(card.hands.treble), move(card.hands.bass), key)
    : makeCard(card.staff, move(card.notes), key);
}

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

export function shuffle<T>(xs: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Drop later duplicates (overlapping hand positions can produce the same card twice). */
export function uniqueById(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter((c) => !seen.has(c.id) && seen.add(c.id));
}

export function cardLabel(card: Card): string {
  if (card.prompt === 'key') return `${card.key.replace('b', '♭').replace('#', '♯')} major`;
  const keyNote = card.key === 'C' ? '' : ` in ${card.key} major`;
  return baseLabel(card) + keyNote;
}

function baseLabel(card: Card): string {
  if (card.staff !== 'grand') return card.notes.map(pitchName).join(' + ');
  const hand = (ps: Pitch[]) => ps.map(pitchName).join('+');
  const { treble, bass } = card.hands;
  if (!bass.length) return `${hand(treble)} (RH)`;
  if (!treble.length) return `${hand(bass)} (LH)`;
  return `LH ${hand(bass)} · RH ${hand(treble)}`;
}

export const STAFF_LABEL: Record<StaffKind, string> = { treble: 'treble clef', bass: 'bass clef', grand: 'grand staff' };
