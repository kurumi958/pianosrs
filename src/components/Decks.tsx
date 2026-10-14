import { type DeckDef, DECKS } from '../srs/deck';
import { courseProgress, type CourseState } from '../srs/study';
import type { AppData } from '../storage';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
}

const STATUS_ICON = { skipped: '↷', done: '✓', open: '●', locked: '○' } as const;
const STATUS_LABEL = { skipped: 'skipped', done: 'learned', open: 'open', locked: 'locked' } as const;

function Progress({ seen, mature, total }: { seen: number; mature: number; total: number }) {
  return (
    <div className="bar" title={`${seen} started, ${mature} learned, ${total} total`}>
      <div className="seen" style={{ width: `${(100 * seen) / total}%` }} />
      <div className="mature" style={{ width: `${(100 * mature) / total}%` }} />
    </div>
  );
}

export function Decks({ data, update }: Props) {
  const isOn = (id: string) => data.settings.enabledDecks.includes(id);
  const toggle = (id: string) =>
    update((d) => {
      d.settings.enabledDecks = isOn(id) ? d.settings.enabledDecks.filter((x) => x !== id) : [...d.settings.enabledDecks, id];
    });
  const resetDeck = (deck: DeckDef) => {
    if (!confirm(`Forget all progress on the cards in "${deck.name}"? Cards shared with other decks are reset there too.`)) return;
    update((d) => {
      for (const c of deck.cards) delete d.cards[c.id];
      delete d.courses[deck.id];
    });
  };
  const seenCount = (deck: DeckDef) => deck.cards.filter((c) => data.cards[c.id] && data.cards[c.id].status !== 'new').length;

  const courses = DECKS.filter((d) => d.kind === 'course');
  const topics = DECKS.filter((d) => d.kind === 'topic');

  return (
    <div className="panel">
      <h2>Courses</h2>
      <p className="muted">A course introduces notes in the order a method book teaches them. Each unit opens once you've learned most of the one before.</p>
      {courses.map((course) => (
        <Course
          key={course.id}
          course={course}
          data={data}
          on={isOn(course.id)}
          onToggle={() => toggle(course.id)}
          onReset={() => resetDeck(course)}
          setState={(fn) =>
            update((d) => {
              const cs = (d.courses[course.id] ??= { start: 0, unlocked: 0 });
              fn(cs);
              // Choosing where to start in a course means you want to study it.
              if (!d.settings.enabledDecks.includes(course.id)) d.settings.enabledDecks.push(course.id);
            })
          }
        />
      ))}

      <h2 className="section">Topic decks</h2>
      <p className="muted">
        Drill one skill at a time — useful on their own if you can already read, or alongside the course. New cards come from enabled decks in
        the order shown, a few per day.
      </p>
      <ul className="decks">
        {topics.map((deck) => {
          const seen = deck.cards.filter((c) => data.cards[c.id] && data.cards[c.id].status !== 'new');
          const mature = seen.filter((c) => data.cards[c.id].interval >= 21);
          return (
            <li key={deck.id} className={isOn(deck.id) ? 'on' : ''}>
              <label className="deck-toggle">
                <input type="checkbox" checked={isOn(deck.id)} onChange={() => toggle(deck.id)} />
                <span>
                  <b>{deck.name}</b>
                  <small className="muted">{deck.description}</small>
                </span>
              </label>
              <div className="deck-progress">
                <Progress seen={seen.length} mature={mature.length} total={deck.cards.length} />
                <small>
                  {seen.length}/{deck.cards.length}
                </small>
                {seenCount(deck) > 0 && (
                  <button className="small link" onClick={() => resetDeck(deck)}>
                    reset
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface CourseProps {
  course: DeckDef;
  data: AppData;
  on: boolean;
  onToggle: () => void;
  onReset: () => void;
  setState: (fn: (cs: CourseState) => void) => void;
}

function Course({ course, data, on, onToggle, onReset, setState }: CourseProps) {
  const units = course.units ?? [];
  const cs = data.courses[course.id] ?? { start: 0, unlocked: 0 };
  const { open, units: progress } = courseProgress(course, data.cards, cs);
  const anySeen = progress.some((u) => u.seen > 0);

  return (
    <div className={`course ${on ? 'on' : ''}`}>
      <label className="deck-toggle">
        <input type="checkbox" checked={on} onChange={onToggle} />
        <span>
          <b>{course.name}</b>
          <small className="muted">{course.description}</small>
        </span>
      </label>

      <div className="row course-controls">
        <label>
          Start at{' '}
          <select
            value={cs.start}
            onChange={(e) =>
              setState((s) => {
                s.start = Number(e.target.value);
                s.unlocked = Math.max(s.unlocked, s.start);
              })
            }
          >
            {units.map((u, i) => (
              <option key={u.id} value={i}>
                {u.title}
              </option>
            ))}
          </select>
        </label>
        {open < units.length - 1 && (
          <button
            className="small"
            onClick={() =>
              setState((s) => {
                s.unlocked = open + 1;
              })
            }
            title="Open the next unit without waiting to learn this one"
          >
            Open next unit now
          </button>
        )}
        {anySeen && (
          <button className="small link" onClick={onReset}>
            reset
          </button>
        )}
      </div>

      <ol className="units">
        {units.map((u, i) => {
          const p = progress[i];
          return (
            <li key={u.id} className={`unit ${p.status} ${i === open ? 'current' : ''}`} title={STATUS_LABEL[p.status]}>
              <span className="unit-icon">{STATUS_ICON[p.status]}</span>
              <span className="unit-text">
                <b>{u.title}</b>
                <small className="muted">{u.summary}</small>
              </span>
              <span className="unit-progress">
                <Progress seen={p.seen} mature={p.learned} total={p.total} />
                <small>
                  {p.learned}/{p.total}
                </small>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
