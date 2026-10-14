import { Check, ChevronDown, Lock, Play } from 'lucide-react';
import { useState } from 'react';
import { COURSE_DECKS, type CourseUnit, type DeckDef } from '../srs/deck';
import { courseProgress, type CourseState, type UnitProgress, UNIT_PASS_RATIO } from '../srs/study';
import type { AppData } from '../storage';
import { Group, Progress } from './Group';
import type { LearnPlan } from './LearnSession';
import { CardPreview } from './Staff';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  /** Start a learning session (and study the course). */
  onLearn: (plan: LearnPlan, deckId: string) => void;
}

const isLearned = (data: AppData, id: string) => {
  const s = data.cards[id];
  return !!s && (s.status === 'review' || s.status === 'relearning');
};

/** Lessons: courses that teach reading step by step, each a list of units that open as you learn. */
export function Lessons({ data, update, onLearn }: Props) {
  return (
    <div className="page-inner">
      <header className="page-head">
        <h2>Lessons</h2>
        <p>
          Courses introduce notes in the order a method book teaches them. Click a unit to learn it: play through its cards at your own
          pace, then they come back in Review. Each unit opens once you've learned most of the one before it.
        </p>
      </header>
      {COURSE_DECKS.map((course) => (
        <Course key={course.id} course={course} data={data} update={update} onLearn={onLearn} />
      ))}
      <p className="muted small">More courses can be added alongside this one; custom courses are on the list for later.</p>
    </div>
  );
}

function Course({ course, data, update, onLearn }: { course: DeckDef } & Props) {
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
  const learn = (i: number) =>
    onLearn({ title: units[i].title, source: course.name, cards: units[i].cards, reviewKey: `course:${course.id}:${i}` }, course.id);
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
              <div className="unit-line">
                <button className="unit-row" onClick={() => learn(i)} title={`Learn ${u.title}`}>
                  <span className="unit-icon" aria-label={p.status}>
                    {p.status === 'done' ? <Check size={13} strokeWidth={3} /> : p.status === 'locked' ? <Lock size={11} /> : null}
                    <Play size={11} className="unit-play" fill="currentColor" />
                  </span>
                  <span className="unit-text">
                    <b>{u.title}</b>
                    <small>{u.summary}</small>
                  </span>
                  <Progress seen={p.seen} learned={p.learned} total={p.total} />
                </button>
                <button
                  className="unit-expand"
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Hide the cards in ${u.title}` : `Show the cards in ${u.title}`}
                  title={isOpen ? 'Hide cards' : 'Show cards'}
                  onClick={() => setExpanded(isOpen ? null : i)}
                >
                  <ChevronDown size={17} className="unit-chev" />
                </button>
              </div>
              {isOpen && (
                <UnitDetail
                  unit={u}
                  index={i}
                  progress={p}
                  isStart={i === cs.start}
                  previous={units[i - 1]?.title}
                  data={data}
                  onLearn={() => learn(i)}
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
  onLearn,
  onStartHere,
}: {
  unit: CourseUnit;
  index: number;
  progress: UnitProgress;
  isStart: boolean;
  previous?: string;
  data: AppData;
  onLearn: () => void;
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
        <button className="small primary" onClick={onLearn}>
          <Play size={12} fill="currentColor" /> Learn this unit
        </button>
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
