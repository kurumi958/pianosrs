import { type Clef, type Pitch, pitchName, sortPitches } from '../music/notes';

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
