import { CARD_BY_ID, cardLabel, STAFF_LABEL } from '../srs/deck';
import { GRADE_LABELS } from '../srs/scheduler';
import { type AppData, dayKey } from '../storage';

const DAY = 86_400_000;

export function Stats({ data }: { data: AppData }) {
  const now = Date.now();
  const states = Object.values(data.cards).filter((s) => s.status !== 'new' && CARD_BY_ID.has(s.id));
  const byStatus = { learning: 0, review: 0, relearning: 0, mature: 0 };
  for (const s of states) {
    if (s.status === 'review' && s.interval >= 21) byStatus.mature++;
    else byStatus[s.status as 'learning' | 'review' | 'relearning']++;
  }

  const today = dayKey(now);
  const todayLog = data.log.filter((l) => dayKey(l.t) === today);
  const week = data.log.filter((l) => l.t > now - 7 * DAY);
  const correctWeek = week.filter((l) => l.grade > 1).length;
  const avgMs = week.length ? week.reduce((a, l) => a + l.ms, 0) / week.length : 0;

  const rollover = new Date(now);
  rollover.setHours(4, 0, 0, 0); // days roll over at 4am
  if (rollover.getTime() <= now) rollover.setDate(rollover.getDate() + 1);
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const until = rollover.getTime() + i * DAY;
    return states.filter((s) => s.due < until && (i === 0 || s.due >= until - DAY)).length;
  });
  const maxF = Math.max(1, ...forecast);

  const weakest = [...states]
    .filter((s) => s.lapses > 0 || s.ease < 2.5)
    .sort((a, b) => b.lapses - a.lapses || a.ease - b.ease)
    .slice(0, 10);

  const gradeCounts = [1, 2, 3, 4].map((g) => todayLog.filter((l) => l.grade === g).length);

  return (
    <div className="page-inner">
      <header className="page-head">
        <h2>Stats</h2>
        <p>How your reading is coming along, and what's coming up.</p>
      </header>
      <div className="tiles">
        <div className="stat">
          <b>{todayLog.length}</b>
          <span>cards answered today</span>
        </div>
        <div className="stat">
          <b>{week.length ? `${Math.round((100 * correctWeek) / week.length)}%` : '–'}</b>
          <span>right in the last 7 days</span>
        </div>
        <div className="stat">
          <b>{avgMs ? (avgMs / 1000).toFixed(1) + 's' : '–'}</b>
          <span>average answer time</span>
        </div>
        <div className="stat">
          <b>{states.length}</b>
          <span>cards learned</span>
        </div>
      </div>

      <section className="panel">
        <h3>Due over the next week</h3>
        <div className="forecast" style={{ marginTop: 14 }}>
          {forecast.map((n, i) => (
            <div key={i} className="fc">
              <span className="num small">{n}</span>
              <div className="fc-bar" style={{ height: `${(100 * n) / maxF}%` }} title={`${n} due`} />
              <small className="muted">{i === 0 ? 'Today' : `+${i}d`}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Your cards</h3>
        <p style={{ marginTop: 6 }}>
          {byStatus.learning} learning · {byStatus.relearning} relearning · {byStatus.review} young · {byStatus.mature} mature (due in 21+ days)
        </p>
        {todayLog.length > 0 && (
          <p className="muted">Today: {gradeCounts.map((n, i) => `${n} ${GRADE_LABELS[(i + 1) as 1 | 2 | 3 | 4]}`).join(' · ')}</p>
        )}
      </section>

      <section className="panel">
        <h3>Trickiest notes</h3>
        {weakest.length ? (
          <ul className="weak" style={{ marginTop: 8 }}>
            {weakest.map((s) => {
              const c = CARD_BY_ID.get(s.id)!;
              return (
                <li key={s.id}>
                  <b>{cardLabel(c)}</b>{' '}
                  <span className="muted">
                    {STAFF_LABEL[c.staff]} · {s.lapses} lapses · ease {s.ease.toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">Nothing tricky yet.</p>
        )}
      </section>
    </div>
  );
}
