import type { Card } from './deck';
import { type CardState, newCardState } from './scheduler';

export interface QueueInput {
  /** Cards from the enabled decks, in introduction order. */
  cards: Card[];
  states: Record<string, CardState>;
  now: number;
  /** How many more new cards may be introduced today. */
  newRemaining: number;
  /** How many more review cards may be shown today (unlimited if omitted). */
  reviewRemaining?: number;
  /** Learning cards due within this window are shown early once nothing else is left (like Anki's "learn ahead"). */
  learnAheadMs?: number;
  /** Avoid showing the same card twice in a row when there is an alternative. */
  lastCardId?: string;
}

export interface QueuePick {
  card: Card;
  state: CardState;
  isNew: boolean;
}

/** Choose the next card to show, or null when the session is finished. */
export function pickNext(q: QueueInput): QueuePick | null {
  const learnAhead = q.learnAheadMs ?? 20 * 60_000;
  const started = q.cards
    .map((card) => ({ card, state: q.states[card.id] }))
    .filter((x): x is { card: Card; state: CardState } => !!x.state && x.state.status !== 'new');

  const due = started.filter((x) => x.state.due <= q.now).sort((a, b) => a.state.due - b.state.due);
  const notLast = (xs: typeof due) => xs.find((x) => x.card.id !== q.lastCardId) ?? xs[0];

  const dueLearning = due.filter((x) => x.state.status !== 'review');
  const dueReview = (q.reviewRemaining ?? Infinity) > 0 ? due.filter((x) => x.state.status === 'review') : [];

  // Learning cards that are due take priority, then mix reviews with new cards.
  if (dueLearning.length) return { ...notLast(dueLearning), isNew: false };
  if (dueReview.length) return { ...notLast(dueReview), isNew: false };

  if (q.newRemaining > 0) {
    const fresh = q.cards.find((c) => !q.states[c.id] || q.states[c.id].status === 'new');
    if (fresh) return { card: fresh, state: q.states[fresh.id] ?? newCardState(fresh.id), isNew: true };
  }

  const ahead = started
    .filter((x) => x.state.status !== 'review' && x.state.due <= q.now + learnAhead)
    .sort((a, b) => a.state.due - b.state.due);
  if (ahead.length) return { ...notLast(ahead), isNew: false };
  return null;
}

export interface QueueCounts {
  newCount: number;
  learning: number;
  review: number;
}

/** What's left to do. Learning cards count from as early as they can be shown (the learn-ahead window), as in pickNext. */
export function countQueue(q: QueueInput): QueueCounts {
  let learning = 0;
  let review = 0;
  let unseen = 0;
  const ahead = q.learnAheadMs ?? 0;
  for (const card of q.cards) {
    const s = q.states[card.id];
    if (!s || s.status === 'new') unseen++;
    else if (s.status === 'review') s.due <= q.now && review++;
    else if (s.due <= q.now + ahead) learning++;
  }
  return {
    newCount: Math.min(unseen, Math.max(0, q.newRemaining)),
    learning,
    review: Math.min(review, Math.max(0, q.reviewRemaining ?? Infinity)),
  };
}
