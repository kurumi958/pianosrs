import { midiName, toMidi } from '../music/notes';
import type { AppData } from '../storage';
import type { Card } from './cards';
import { CARD_BY_ID } from './deck';

/** How many recent sight-reading attempts are remembered per note. */
export const RECENT_ATTEMPTS = 10;
/** A note is flagged once it's been missed this many times in its recent attempts. */
export const SIGHT_FLAG_MISSES = 3;
/** A forgotten-card ("leech") stays listed until it's gone this long without being forgotten again. */
export const LEECH_QUIET_DAYS = 60;

const DAY = 86_400_000;

/** Sight-reading record for one card (note, chord, or two-handed shape). */
export interface SightStat {
  /** The card itself, kept so phrases transposed into keys can be practiced again. */
  card: Card;
  /** Most recent attempts, oldest first: 1 = missed, 0 = right. */
  recent: number[];
  attempts: number;
  misses: number;
  lastMiss?: number;
  /** Wrong keys played for this card: MIDI note → count. */
  confusions: Record<string, number>;
}

export interface EventResult {
  cards: Card[];
  missed: boolean;
  /** Wrong keys pressed on this event. */
  wrong: number[];
}

/** Distance from a played key to a card's nearest note. */
const distance = (midi: number, card: Card) => Math.min(...card.notes.map((p) => Math.abs(toMidi(p) - midi)));

/**
 * Record a sight-reading phrase. A wrong key counts against the card it was nearest to (so a slip in the right
 * hand doesn't blame the left); an event missed without a wrong key (skipped in time mode) counts against all of it.
 */
export function recordSightResults(stats: Record<string, SightStat>, results: EventResult[], now: number): void {
  for (const r of results) {
    const playable = r.cards.filter((c) => c.notes.length);
    if (!playable.length) continue;
    const blamed = new Set<Card>();
    for (const w of r.wrong) {
      const nearest = playable.reduce((a, b) => (distance(w, b) < distance(w, a) ? b : a));
      blamed.add(nearest);
      const st = (stats[nearest.id] ??= { card: nearest, recent: [], attempts: 0, misses: 0, confusions: {} });
      st.confusions[w] = (st.confusions[w] ?? 0) + 1;
    }
    if (r.missed && !blamed.size) playable.forEach((c) => blamed.add(c));
    for (const c of playable) {
      const st = (stats[c.id] ??= { card: c, recent: [], attempts: 0, misses: 0, confusions: {} });
      const missed = r.missed && blamed.has(c);
      st.recent = [...st.recent, missed ? 1 : 0].slice(-RECENT_ATTEMPTS);
      st.attempts++;
      if (missed) {
        st.misses++;
        st.lastMiss = now;
      }
    }
  }
}

export interface SightSpot {
  card: Card;
  recentMisses: number;
  recentAttempts: number;
  /** Keys most often played instead, most common first. */
  confusedWith: string[];
  lastMiss?: number;
}

export interface LeechSpot {
  card: Card;
  lapses: number;
  lastForgotten: number;
}

/** Everything worth extra practice right now. */
export function weakSpots(data: AppData, now = Date.now()): { sight: SightSpot[]; leeches: LeechSpot[] } {
  const sight = Object.values(data.sightStats)
    .map((st) => ({
      card: st.card,
      recentMisses: st.recent.reduce((a, b) => a + b, 0),
      recentAttempts: st.recent.length,
      confusedWith: Object.entries(st.confusions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([m]) => midiName(Number(m))),
      lastMiss: st.lastMiss,
    }))
    .filter((s) => s.recentMisses >= SIGHT_FLAG_MISSES)
    .sort((a, b) => b.recentMisses - a.recentMisses || (b.lastMiss ?? 0) - (a.lastMiss ?? 0));

  const lastAgain = new Map<string, number>();
  for (const l of data.log) if (l.grade === 1 && !l.known) lastAgain.set(l.id, Math.max(l.t, lastAgain.get(l.id) ?? 0));
  const threshold = data.settings.srs.leechThreshold;
  const leeches = Object.values(data.cards)
    .filter((s) => s.lapses >= threshold && CARD_BY_ID.has(s.id))
    .map((s) => ({ card: CARD_BY_ID.get(s.id)!, lapses: s.lapses, lastForgotten: lastAgain.get(s.id) ?? 0 }))
    .filter((l) => now - l.lastForgotten <= LEECH_QUIET_DAYS * DAY)
    .sort((a, b) => b.lapses - a.lapses || b.lastForgotten - a.lastForgotten);

  return { sight, leeches };
}

/** A focused sight-reading session: the cards to reinforce, and what to call it. */
export interface Focus {
  title: string;
  cards: Card[];
}

/**
 * The key to write a focused phrase in: one of the focus items' keys, chosen in proportion to how many items
 * use it, so a weak F♯ in G major is practiced in G major.
 */
export function focusKey(cards: Card[], rnd: () => number = Math.random): string {
  const counts = new Map<string, number>();
  for (const c of cards) if (!c.rhythm) counts.set(c.key, (counts.get(c.key) ?? 0) + 1);
  if (!counts.size) return 'C';
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (const [k, n] of counts) if ((r -= n) < 0) return k;
  return [...counts.keys()][0];
}

/** Which staff a focused phrase needs: grand if the focus uses both hands, otherwise the one hand's clef. */
export function focusStaff(cards: Card[]): 'treble' | 'bass' | 'grand' | null {
  const notes = cards.filter((c) => !c.prompt);
  const rh = notes.some((c) => c.hands.treble.length);
  const lh = notes.some((c) => c.hands.bass.length);
  if (rh && lh) return 'grand';
  if (rh) return 'treble';
  if (lh) return 'bass';
  return null;
}
