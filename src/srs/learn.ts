import { type AppData, dayKey } from '../storage';
import { type Card, COURSE_DECKS, DECK_GROUPS, type DeckDef, DECKS } from './deck';
import { type CardState, newCardState, schedule, type SchedulerConfig } from './scheduler';
import { courseProgress, type StudyInput } from './study';

/**
 * Learning and reviewing are separate. New cards are learned in a learning session (a lesson unit, or the next
 * few cards of a deck), played through without grading; leaving a card puts it into the review schedule. Review
 * then only shows cards you've learned, sorted by the lesson or deck they came from.
 */

const isStarted = (s?: CardState) => !!s && s.status !== 'new';

/**
 * A learning session has just shown this card for the first time. It enters the learning steps as if answered
 * Good when you played it right first try (first review in about ten minutes) or Again when you didn't (a minute).
 * Cards already being learned or reviewed are left as they are: going over them again is just practice.
 */
export function introduce(
  state: CardState | undefined,
  id: string,
  rightFirstTime: boolean,
  now: number,
  cfg: SchedulerConfig,
): CardState | null {
  if (isStarted(state)) return null;
  return schedule(state ?? newCardState(id, cfg), rightFirstTime ? 3 : 1, now, cfg);
}

/** Put a learning session's cards into the schedule, counting them as today's new cards. */
export function recordLearned(d: AppData, results: { id: string; rightFirstTime: boolean }[], now = Date.now()): number {
  let added = 0;
  for (const r of results) {
    const next = introduce(d.cards[r.id], r.id, r.rightFirstTime, now, d.settings.srs);
    if (!next) continue;
    d.cards[r.id] = next;
    added++;
  }
  const day = dayKey(now);
  if (added) d.newByDay[day] = (d.newByDay[day] ?? 0) + added;
  return added;
}

/** The next `n` cards of a deck you haven't learned, in the deck's order. */
export function nextBatch(deck: DeckDef, states: Record<string, CardState>, n: number): Card[] {
  return deck.cards.filter((c) => !isStarted(states[c.id])).slice(0, n);
}

/** Cards of the decks and courses you study that you've learned (every unit, open or not), without duplicates. */
export function reviewCards({ enabledDecks, states }: Pick<StudyInput, 'enabledDecks' | 'states'>): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const deck of DECKS) {
    if (!enabledDecks.includes(deck.id)) continue;
    for (const c of deck.cards) if (isStarted(states[c.id]) && !seen.has(c.id) && seen.add(c.id)) out.push(c);
  }
  return out;
}

/** One thing you can review: a unit, a deck or a song, with its learned cards and how many are due now. */
export interface ReviewItem {
  /** "course:<id>:<unit index>" or "deck:<id>". */
  key: string;
  title: string;
  /** Where it sits, e.g. "Adult beginner course" or "Intervals & chords". */
  parent: string;
  cards: Card[];
  due: number;
}

export interface ReviewSection {
  title: 'Lessons' | 'Decks' | 'Songs';
  groups: { title: string; items: ReviewItem[] }[];
}

const dueCount = (cards: Card[], states: Record<string, CardState>, now: number, learnAheadMs: number) =>
  cards.filter((c) => {
    const s = states[c.id];
    return isStarted(s) && (s!.due <= now || (s!.status !== 'review' && s!.due <= now + learnAheadMs));
  }).length;

/**
 * What there is to review, in the order of the sidebar: lessons by course and unit, decks by their group (your own
 * decks first), then songs. Only things with learned cards are listed; a card shared between two of them counts
 * in both.
 */
export function reviewSections(data: AppData, now = Date.now()): ReviewSection[] {
  const states = data.cards;
  const on = (id: string) => data.settings.enabledDecks.includes(id);
  const ahead = data.settings.srs.learnAheadMin * 60_000;
  const item = (key: string, title: string, parent: string, all: Card[]): ReviewItem | null => {
    const cards = all.filter((c) => isStarted(states[c.id]));
    return cards.length ? { key, title, parent, cards, due: dueCount(cards, states, now, ahead) } : null;
  };
  const keep = (xs: (ReviewItem | null)[]) => xs.filter((x): x is ReviewItem => !!x);

  const lessons = COURSE_DECKS.filter((c) => on(c.id)).map((c) => ({
    title: c.name,
    items: keep((c.units ?? []).map((u, i) => item(`course:${c.id}:${i}`, u.title, c.name, u.cards))),
  }));
  const deckGroup = (title: string, decks: DeckDef[]) => ({
    title,
    items: keep(decks.filter((d) => on(d.id)).map((d) => item(`deck:${d.id}`, d.name, title, d.cards))),
  });
  const decks = [
    deckGroup(
      'Your decks',
      DECKS.filter((d) => d.id.startsWith('custom:')),
    ),
    ...DECK_GROUPS.map((g) => deckGroup(g.name, g.decks.map((id) => DECKS.find((d) => d.id === id)!).filter(Boolean))),
  ];
  const songs = [
    deckGroup(
      'Songs',
      DECKS.filter((d) => d.kind === 'song'),
    ),
  ];
  const sections: ReviewSection[] = [
    { title: 'Lessons', groups: lessons },
    { title: 'Decks', groups: decks },
    { title: 'Songs', groups: songs },
  ];
  return sections.map((s) => ({ ...s, groups: s.groups.filter((g) => g.items.length) })).filter((s) => s.groups.length);
}

/** The course unit a learning session for this course would teach next: the open unit, or the first with unseen cards. */
export function unitToLearn(course: DeckDef, states: Record<string, CardState>, cs = { start: 0, unlocked: 0 }) {
  const { open } = courseProgress(course, states, cs);
  const units = course.units ?? [];
  for (let i = cs.start; i <= open; i++) if (units[i].cards.some((c) => !isStarted(states[c.id]))) return i;
  return null;
}
