import { type Card, cardLabel, STAFF_LABEL } from '../srs/cards';
import { formatDelay } from '../srs/scheduler';
import { type Focus, LEECH_QUIET_DAYS, RECENT_ATTEMPTS, SIGHT_FLAG_MISSES, weakSpots } from '../srs/weak';
import type { AppData } from '../storage';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  onPractise: (focus: Focus) => void;
}

const ago = (t: number | undefined, now: number) => (t ? `${formatDelay(now - t)} ago` : '');
const where = (c: Card) => (c.rhythm ? 'rhythm' : c.prompt === 'key' ? 'key signature' : STAFF_LABEL[c.staff]);

/** Things to work on: notes often misread in sight-reading, and flash cards that keep being forgotten. */
export function WorkOn({ data, update, onPractise }: Props) {
  const now = Date.now();
  const { sight, leeches } = weakSpots(data, now);
  const everything = [...new Map([...sight, ...leeches].map((s) => [s.card.id, s.card])).values()];
  const threshold = data.settings.srs.leechThreshold;

  const reviewNow = (id: string) =>
    update((d) => {
      const s = d.cards[id];
      if (s && s.status !== 'new') d.cards[id] = { ...s, due: Math.min(s.due, Date.now()) };
    });

  return (
    <div className="page-inner">
      <header className="page-head">
        <h2>Things to work on</h2>
        <p>Notes you often misread when sight-reading, and flash cards you keep forgetting. Practise them in phrases built around them.</p>
      </header>

      {everything.length === 0 ? (
        <section className="panel empty-state">
          <h3>Nothing to work on right now</h3>
          <p className="muted">
            A note shows up here once you've missed it {SIGHT_FLAG_MISSES} times in your last {RECENT_ATTEMPTS} sight-reading attempts, and a
            flash card once you've forgotten it {threshold} times. Keep reading and this page will fill in where it helps.
          </p>
        </section>
      ) : (
        <div className="row">
          <button className="primary" onClick={() => onPractise({ title: `All ${everything.length} things to work on`, cards: everything })}>
            Practise all {everything.length}
          </button>
          <span className="muted small">A sight-reading session that keeps coming back to these, mixed with notes you know.</span>
        </div>
      )}

      {sight.length > 0 && (
        <section className="panel">
          <h3>Slips in sight-reading</h3>
          <ul className="work-list">
            {sight.map((s) => (
              <li key={s.card.id} className="work-row">
                <span className="work-text">
                  <b>{cardLabel(s.card)}</b>
                  <small className="muted">
                    {where(s.card)} · missed {s.recentMisses} of your last {s.recentAttempts}
                    {s.confusedWith.length > 0 && ` · often played as ${s.confusedWith.join(' or ')}`}
                    {s.lastMiss && ` · last missed ${ago(s.lastMiss, now)}`}
                  </small>
                </span>
                <button className="small" onClick={() => onPractise({ title: cardLabel(s.card), cards: [s.card] })}>
                  Practise
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {leeches.length > 0 && (
        <section className="panel">
          <h3>Cards you keep forgetting</h3>
          <ul className="work-list">
            {leeches.map((l) => {
              const state = data.cards[l.card.id];
              const dueNow = state && state.due <= now;
              return (
                <li key={l.card.id} className="work-row">
                  <span className="work-text">
                    <b>{cardLabel(l.card)}</b>
                    <small className="muted">
                      {where(l.card)} · forgotten {l.lapses} times · last {ago(l.lastForgotten, now)}
                    </small>
                  </span>
                  <button className="small" onClick={() => onPractise({ title: cardLabel(l.card), cards: [l.card] })}>
                    Practise
                  </button>
                  <button className="small" disabled={dueNow} onClick={() => reviewNow(l.card.id)} title="Bring the flash card back today">
                    {dueNow ? 'Due now' : 'Review now'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="muted small">
        Notes leave the list as you get them right again. Cards leave it after {LEECH_QUIET_DAYS} days without being forgotten; the number of
        times that counts as "keep forgetting" ({threshold}) is in Settings → Scheduling.
      </p>
    </div>
  );
}
