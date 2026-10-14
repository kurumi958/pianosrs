import { CARD_BY_ID, cardLabel } from '../srs/deck';
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
    <div className="panel stats">
      <h2>Progress</h2>
      <div className="tiles">
        <div className="tile">
          <b>{todayLog.length}</b>
          <small>reviews today</small>
        </div>
        <div className="tile">
          <b>{week.length ? Math.round((100 * correctWeek) / week.length) : '–'}%</b>
          <small>correct (7 days)</small>
        </div>
        <div className="tile">
          <b>{avgMs ? (avgMs / 1000).toFixed(1) + 's' : '–'}</b>
          <small>avg. answer time</small>
        </div>
        <div className="tile">
          <b>{states.length}</b>
          <small>cards learned</small>
        </div>
      </div>

      <h3>Cards</h3>
      <p>
        {byStatus.learning} learning · {byStatus.relearning} relearning · {byStatus.review} young · {byStatus.mature} mature (21d+)
      </p>
      {todayLog.length > 0 && (
        <p className="muted">Today: {gradeCounts.map((n, i) => `${n} ${GRADE_LABELS[(i + 1) as 1 | 2 | 3 | 4]}`).join(' · ')}</p>
      )}

      <h3>Due over the next week</h3>
      <div className="forecast">
        {forecast.map((n, i) => (
          <div key={i} className="fc">
            <div className="fc-bar" style={{ height: `${(100 * n) / maxF}%` }} title={`${n} due`} />
            <small>{i === 0 ? 'Today' : `+${i}d`}</small>
            <small className="muted">{n}</small>
          </div>
        ))}
      </div>

      <h3>Trickiest notes</h3>
      {weakest.length ? (
        <ul className="weak">
          {weakest.map((s) => {
            const c = CARD_BY_ID.get(s.id)!;
            return (
              <li key={s.id}>
                <b>{cardLabel(c)}</b> <span className="muted">{c.clef} clef · {s.lapses} lapses · ease {s.ease.toFixed(2)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Nothing tricky yet.</p>
      )}
    </div>
  );
}
