import { Check, ChevronRight, Lock } from 'lucide-react';
import { useState } from 'react';
import { COURSE_DECKS, type CourseUnit, type DeckDef } from '../srs/deck';
import { courseProgress, type CourseState, type UnitProgress, UNIT_PASS_RATIO } from '../srs/study';
import type { AppData } from '../storage';
import { Group, Progress } from './Group';
import { CardPreview } from './Staff';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
}

const isLearned = (data: AppData, id: string) => {
  const s = data.cards[id];
  return !!s && (s.status === 'review' || s.status === 'relearning');
};

/** Lessons: courses that teach reading step by step, each a list of units that open as you learn. */
export function Lessons({ data, update }: Props) {
  return (
    <div className="page-inner">
      <header className="page-head">
        <h2>Lessons</h2>
        <p>
          Courses introduce notes in the order a method book teaches them. Each unit opens once you've learned most of the one before it.
        </p>
      </header>
      {COURSE_DECKS.map((course) => (
        <Course key={course.id} course={course} data={data} update={update} />
      ))}
      <p className="muted small">More courses can be added alongside this one; custom courses are on the list for later.</p>
    </div>
  );
}

function Course({ course, data, update }: { course: DeckDef; data: AppData; update: Props['update'] }) {
  const units = course.units ?? [];
  const on = data.settings.enabledDecks.includes(course.id);
  const cs = data.courses[course.id] ?? { start: 0, unlocked: 0 };
  const { open, units: progress } = courseProgress(course, data.cards, cs);
  const [expanded, setExpanded] = useState<number | null>(null);
  const learned = course.cards.filter((c) => isLearned(data, c.id)).length;
  const seen = course.cards.filter((c) => data.cards[c.id] && data.cards[c.id].status !== 'new').length;

  const setState = (fn: (cs: CourseState) => void) =>
    update((d) => {
      fn((d.courses[course.id] ??= { start: 0, unlocked: 0 }));
      // Choosing where to start in a course means you want to study it.
      if (!d.settings.enabledDecks.includes(course.id)) d.settings.enabledDecks.push(course.id);
    });
  const toggle = () =>
    update((d) => {
      d.settings.enabledDecks = on ? d.settings.enabledDecks.filter((x) => x !== course.id) : [...d.settings.enabledDecks, course.id];
      d.courses[course.id] ??= { start: 0, unlocked: 0 };
    });
  const reset = () => {
    if (!window.confirm(`Forget all progress on the cards in "${course.name}"? Cards shared with decks are reset there too.`)) return;
    update((d) => {
      for (const c of course.cards) delete d.cards[c.id];
      delete d.courses[course.id];
    });
  };

  return (
    <Group
      title={course.name}
      subtitle={on ? `Now on ${units[open].title}` : `${units.length} units`}
      on={on}
      defaultOpen
      meta={
        <>
          <Progress seen={seen} learned={learned} total={course.cards.length} />
          <label className="switch">
            <input id={`enrol-${course.id}`} type="checkbox" checked={on} onChange={toggle} /> Studying
          </label>
        </>
      }
    >
      <p>{course.description}</p>
      <div className="row course-controls">
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
        <span className="spacer" />
        {seen > 0 && (
          <button className="small link" onClick={reset}>
            Reset progress
          </button>
        )}
      </div>
      <ol className="units">
        {units.map((u, i) => {
          const p = progress[i];
          const isOpen = expanded === i;
          return (
            <li key={u.id} className={`unit ${p.status} ${on && i === open ? 'current' : ''} ${isOpen ? 'expanded' : ''}`}>
              <button className="unit-row" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : i)}>
                <span className="unit-icon" aria-label={p.status}>
                  {p.status === 'done' ? <Check size={13} strokeWidth={3} /> : p.status === 'locked' ? <Lock size={11} /> : null}
                </span>
                <span className="unit-text">
                  <b>{u.title}</b>
                  <small>{u.summary}</small>
                </span>
                <Progress seen={p.seen} learned={p.learned} total={p.total} />
                <ChevronRight size={16} className="unit-chev" />
              </button>
              {isOpen && (
                <UnitDetail
                  unit={u}
                  index={i}
                  progress={p}
                  isStart={i === cs.start}
                  previous={units[i - 1]?.title}
                  data={data}
                  onStartHere={() =>
                    setState((s) => {
                      s.start = i;
                      s.unlocked = Math.max(s.unlocked, i);
                    })
                  }
                />
              )}
            </li>
          );
        })}
      </ol>
    </Group>
  );
}

/** A unit opened up: where it stands, starting the course from it, and every card it teaches. */
function UnitDetail({
  unit,
  index,
  progress: p,
  isStart,
  previous,
  data,
  onStartHere,
}: {
  unit: CourseUnit;
  index: number;
  progress: UnitProgress;
  isStart: boolean;
  previous?: string;
  data: AppData;
  onStartHere: () => void;
}) {
  const status =
    p.status === 'done'
      ? `Done: ${p.learned} of ${p.total} cards learned.`
      : p.status === 'open'
        ? p.seen
          ? `Open: ${p.learned} of ${p.total} cards learned, ${p.seen - p.learned} still being learned.`
          : `Open: new cards from this unit come up in Review.`
        : p.status === 'locked'
          ? `Locked: opens once you've seen every card of ${previous ?? 'the unit before'} and learned ${Math.round(UNIT_PASS_RATIO * 100)}% of them.`
          : `Skipped: you started the course after this unit, so its cards count as already known when you sight-read.`;
  return (
    <div className="unit-detail">
      <div className="row unit-detail-head">
        <p className="small">{status}</p>
        <span className="spacer" />
        {!isStart && (
          <button className="small" onClick={onStartHere} title="Units before this one count as already known">
            {index === 0 ? 'Start the course from the beginning' : 'Start the course here'}
          </button>
        )}
      </div>
      <ul className="unit-cards" aria-label={`Cards in ${unit.title}`}>
        {unit.cards.map((c) => {
          const s = data.cards[c.id];
          const learned = !!s && (s.status === 'review' || s.status === 'relearning');
          return (
            <li
              key={c.id}
              className={learned ? 'learned' : s && s.status !== 'new' ? 'seen' : ''}
              title={learned ? 'Learned' : s && s.status !== 'new' ? 'Learning' : 'Not seen yet'}
            >
              <CardPreview card={c} />
              {learned && <Check size={12} strokeWidth={3} className="card-check" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
