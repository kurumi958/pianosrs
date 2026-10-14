import { BookOpen, ChevronRight, FileMusic, GraduationCap } from 'lucide-react';
import { reviewCards, type ReviewItem, reviewSections } from '../srs/learn';
import { formatDelay } from '../srs/scheduler';
import { countQueue } from '../srs/session';
import { dailyLimits } from '../srs/today';
import type { AppData } from '../storage';

interface Props {
  data: AppData;
  onSelect: (key: string) => void;
  onNavigate: (tab: 'Lessons') => void;
}

const ICONS = { Lessons: GraduationCap, Decks: BookOpen, Songs: FileMusic };

/** The Review page: everything you've learned, by lesson unit, deck and song, with what's due in each. */
export function ReviewHome({ data, onSelect, onNavigate }: Props) {
  const now = Date.now();
  const sections = reviewSections(data, now);
  const all = reviewCards({ enabledDecks: data.settings.enabledDecks, states: data.cards });
  const counts = countQueue({ cards: all, states: data.cards, now, ...dailyLimits(data, now), newRemaining: 0 });
  const due = counts.learning + counts.review;
  const nextDue = all
    .map((c) => data.cards[c.id]?.due ?? Infinity)
    .filter((t) => t > now)
    .reduce((a, b) => Math.min(a, b), Infinity);

  const row = (it: ReviewItem) => (
    <li key={it.key}>
      <button className={`review-item ${it.due ? '' : 'none-due'}`} onClick={() => onSelect(it.key)}>
        <span className="review-item-text">
          <b>{it.title}</b>
          <small>
            {it.cards.length} card{it.cards.length === 1 ? '' : 's'} learned
          </small>
        </span>
        <span className={`due-pill ${it.due ? '' : 'zero'}`}>{it.due ? `${it.due} due` : 'nothing due'}</span>
        <ChevronRight size={16} className="unit-chev right" />
      </button>
    </li>
  );

  return (
    <div className="page-inner review-home">
      <header className="page-head">
        <h2>Review</h2>
        <p>Cards you've learned come back here when they're due. Review one lesson or deck at a time, or everything at once.</p>
      </header>

      {!all.length ? (
        <section className="panel">
          <h3>Nothing to review yet</h3>
          <p className="muted">
            New cards are learned first: open a unit in Lessons (or a deck) and play through it. Those cards then come back here to review.
          </p>
          <button className="primary" onClick={() => onNavigate('Lessons')}>
            Go to Lessons
          </button>
        </section>
      ) : (
        <>
          <section className="panel review-all">
            <div>
              <b>{due ? `${due} card${due === 1 ? '' : 's'} due` : 'Nothing due right now'}</b>
              <small className="muted">
                {due
                  ? `${counts.learning} still being learned, ${counts.review} to review`
                  : Number.isFinite(nextDue)
                    ? `The next card is due in ${formatDelay(nextDue - now)}.`
                    : ''}
              </small>
            </div>
            <button className={due ? 'primary' : ''} onClick={() => onSelect('all')}>
              Review everything
            </button>
          </section>
          {sections.map((s) => {
            const Icon = ICONS[s.title];
            return (
              <section key={s.title} className="review-section">
                <h3>
                  <Icon size={17} /> {s.title}
                </h3>
                {s.groups.map((g) => (
                  <div key={g.title} className="review-group">
                    {(s.title !== 'Songs' || s.groups.length > 1) && <h4>{g.title}</h4>}
                    <ul>{g.items.map(row)}</ul>
                  </div>
                ))}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
