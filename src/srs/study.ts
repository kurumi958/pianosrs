import { withKey } from './cards';
import { type Card, CARD_BY_ID, type DeckDef, DECKS } from './deck';
import type { CardState } from './scheduler';

/** Where you are in a course: the unit you started from, and the furthest unit you've opened by hand. */
export interface CourseState {
  start: number;
  unlocked: number;
}

export interface UnitProgress {
  total: number;
  /** Cards you've started learning. */
  seen: number;
  /** Cards that have graduated out of the learning steps. */
  learned: number;
  status: 'skipped' | 'done' | 'open' | 'locked';
}

/** A unit counts as done once every card has been seen and this share of them has graduated. */
export const UNIT_PASS_RATIO = 0.8;

const isSeen = (s?: CardState) => !!s && s.status !== 'new';
const isLearned = (s?: CardState) => !!s && (s.status === 'review' || s.status === 'relearning');

export function courseProgress(course: DeckDef, states: Record<string, CardState>, cs: CourseState = { start: 0, unlocked: 0 }) {
  const units = course.units ?? [];
  const counts = units.map((u) => ({
    total: u.cards.length,
    seen: u.cards.filter((c) => isSeen(states[c.id])).length,
    learned: u.cards.filter((c) => isLearned(states[c.id])).length,
  }));
  const passed = (i: number) => counts[i].seen === counts[i].total && counts[i].learned >= UNIT_PASS_RATIO * counts[i].total;
  let current = Math.min(cs.start, units.length - 1);
  while (current < units.length - 1 && passed(current)) current++;
  // The open frontier: the first unit not yet passed, or further if opened by hand.
  const open = Math.max(current, Math.min(cs.unlocked, units.length - 1));
  const progress: UnitProgress[] = counts.map((c, i) => ({
    ...c,
    status: i < cs.start ? 'skipped' : i > open ? 'locked' : passed(i) ? 'done' : 'open',
  }));
  return { open, current, units: progress };
}

export interface StudyInput {
  enabledDecks: string[];
  courses: Record<string, CourseState>;
  states: Record<string, CardState>;
}

/** Cards available for flash-card study, in introduction order, without duplicates. Courses contribute their open units only. */
export function studyCards({ enabledDecks, courses, states }: StudyInput): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const deck of DECKS) {
    if (!enabledDecks.includes(deck.id)) continue;
    let list = deck.cards;
    if (deck.kind === 'course' && deck.units) {
      const cs = courses[deck.id];
      const { open } = courseProgress(deck, states, cs);
      list = deck.units.slice(cs?.start ?? 0, open + 1).flatMap((u) => u.cards);
    }
    for (const c of list) if (!seen.has(c.id) && seen.add(c.id)) out.push(c);
  }
  return out;
}

/**
 * Cards you can be expected to read in sight-reading practice: ones you've started learning, plus
 * the units you skipped in a course (you said you already know those).
 */
export function knownCards(input: StudyInput): Card[] {
  const out = studyCards(input).filter((c) => isSeen(input.states[c.id]));
  const ids = new Set(out.map((c) => c.id));
  for (const deck of DECKS) {
    if (!input.enabledDecks.includes(deck.id) || deck.kind !== 'course' || !deck.units) continue;
    const start = input.courses[deck.id]?.start ?? 0;
    for (const c of deck.units.slice(0, start).flatMap((u) => u.cards)) if (!ids.has(c.id) && ids.add(c.id)) out.push(c);
  }
  return out;
}

/** Keys you can read in: C, plus every key of a key-signature card you've started (name-the-key cards don't count). */
export function learnedKeys(known: Card[]): string[] {
  const keys = new Set(['C']);
  for (const c of known) if (!c.prompt) keys.add(c.key);
  return [...keys];
}

/**
 * Rewrite cards into a key signature for sight-reading. Uses the real card when one exists (so mistakes feed
 * back into its reviews) and drops cards with chromatic notes, which have no equivalent in the new key.
 */
export function cardsInKey(cards: Card[], key: string): Card[] {
  const out = new Map<string, Card>();
  for (const c of cards) {
    const k = withKey(c, key);
    if (k) out.set(k.id, CARD_BY_ID.get(k.id) ?? k);
  }
  return [...out.values()];
}
