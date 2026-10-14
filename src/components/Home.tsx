import { Check } from 'lucide-react';
import { COURSE_DECKS } from '../srs/deck';
import { formatDelay } from '../srs/scheduler';
import { todayPlan } from '../srs/today';
import type { AppData } from '../storage';
import type { Tab } from '../App';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  onNavigate: (tab: Tab) => void;
}

const dateLine = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** Home: the day's plan — review what's due, continue the course, then read something new. */
export function Home({ data, update, onNavigate }: Props) {
  const plan = todayPlan(data);

  const startCourse = () =>
    update((d) => {
      const id = COURSE_DECKS[0].id;
      if (!d.settings.enabledDecks.includes(id)) d.settings.enabledDecks.push(id);
      d.courses[id] ??= { start: 0, unlocked: 0 };
    });

  const title = (
    <header className="home-title">
      <h1>
        <span className="clef">𝄞</span> PianoSRS
      </h1>
      <p>{dateLine()}</p>
    </header>
  );

  if (!plan.hasDecks) {
    return (
      <div className="page-inner home">
        {title}
        <section className="panel">
          <div className="page-head" style={{ marginBottom: 14 }}>
            <h2>What would you like to learn?</h2>
            <p>Nothing is chosen for you: start from your first notes, or pick the skills you want to work on.</p>
          </div>
          <div className="choices">
            <button className="choice" onClick={startCourse}>
              <b>I'm new to reading music</b>
              <span className="muted">Start the adult beginner course from your first notes on the staff.</span>
            </button>
            <button className="choice" onClick={() => onNavigate('Lessons')}>
              <b>I can already read some</b>
              <span className="muted">Join the course at a later unit, or pick decks like ledger lines, key signatures or rhythm.</span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  const reviewDone = plan.total === 0;
  const { newCount, learning, review } = plan.counts;

  return (
    <div className="page-inner home">
      {title}

      <ol className="itinerary" aria-label="Today's plan">
        <li className={`step ${reviewDone ? 'done' : ''}`}>
          <span className="step-mark">{reviewDone ? <Check size={20} /> : 1}</span>
          <div className="step-body">
            <h3>{reviewDone ? 'Reviews done for today' : 'Review your cards'}</h3>
            {reviewDone ? (
              <p>{plan.nextDue ? `The next card is due in ${formatDelay(plan.nextDue - Date.now())}.` : 'Nothing is waiting.'}</p>
            ) : (
              <div className="due-counts">
                <span>
                  <b className="c-new">{newCount}</b> new
                </span>
                <span>
                  <b className="c-learn">{learning}</b> learning
                </span>
                <span>
                  <b className="c-review">{review}</b> due
                </span>
                <span>about {plan.minutes} min</span>
              </div>
            )}
          </div>
          <button className={reviewDone ? '' : 'primary'} onClick={() => onNavigate('Review')}>
            {reviewDone ? 'Open' : 'Start review'}
          </button>
        </li>

        {plan.courses.map((c) => (
          <li className="step" key={c.id}>
            <span className="step-mark">2</span>
            <div className="step-body">
              <span className="eyebrow">
                {c.name} · {c.unit.split(' · ')[0]}
              </span>
              <h3>{c.unit.split(' · ').slice(1).join(' · ') || c.unit}</h3>
              <p>{c.summary}</p>
              <div className="progress">
                <div className="bar">
                  <div className="mature" style={{ width: `${(100 * c.learned) / c.total}%` }} />
                </div>
                <span>
                  {c.learned} of {c.total} learned
                </span>
              </div>
            </div>
            <button onClick={() => onNavigate('Lessons')}>View unit</button>
          </li>
        ))}

        <li className="step">
          <span className="step-mark">{plan.courses.length ? 3 : 2}</span>
          <div className="step-body">
            <h3>Read something new</h3>
            <p>A short phrase built from the notes, keys and rhythms you know. Try it in time once it feels easy.</p>
          </div>
          <button onClick={() => onNavigate('Sight-read')}>Sight-read</button>
        </li>
      </ol>

      <section className="home-stats" aria-label="Your progress">
        <div className="stat">
          <b>{plan.streak}</b>
          <span>day{plan.streak === 1 ? '' : 's'} in a row</span>
        </div>
        <div className="stat">
          <b>{plan.reviewedToday}</b>
          <span>cards answered today</span>
        </div>
        <div className="stat">
          <b>{plan.accuracy === null ? '–' : `${Math.round(plan.accuracy * 100)}%`}</b>
          <span>right this week</span>
        </div>
      </section>
    </div>
  );
}
