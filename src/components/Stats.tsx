import { CARD_BY_ID, cardLabel, STAFF_LABEL } from '../srs/deck';
import { GRADE_LABELS, retrievability } from '../srs/scheduler';
import { type AppData, dayKey, nextDayStart } from '../storage';

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

  const rollover = nextDayStart(now);
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const until = rollover + i * DAY;
    return states.filter((s) => s.due < until && (i === 0 || s.due >= until - DAY)).length;
  });
  const maxF = Math.max(1, ...forecast);

  const srs = data.settings.srs;
  const fsrsOn = srs.algorithm === 'fsrs';
  // Hardness: FSRS difficulty (1–10) when FSRS is on, otherwise how far ease has dropped.
  const hardness = (s: (typeof states)[number]) => (fsrsOn ? (s.difficulty ?? 5) : 10 - s.ease * 2);
  const weakest = [...states]
    .filter((s) => s.lapses > 0 || (fsrsOn ? (s.difficulty ?? 0) > 6 : s.ease < 2.5))
    .sort((a, b) => b.lapses - a.lapses || hardness(b) - hardness(a))
    .slice(0, 10);
  // FSRS: the average chance you'd remember a learned card right now.
  const recalls = fsrsOn ? states.map((s) => retrievability(s, now, srs)).filter((r): r is number => r !== null) : [];
  const recallNow = recalls.length ? recalls.reduce((a, r) => a + r, 0) / recalls.length : null;

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
        {recallNow !== null && (
          <div className="stat" title="FSRS's estimate of how likely you are to remember a learned card if it came up right now">
            <b>{Math.round(recallNow * 100)}%</b>
            <span>predicted recall now</span>
          </div>
        )}
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
                    {STAFF_LABEL[c.staff]} · {s.lapses} lapses ·{' '}
                    {fsrsOn ? `difficulty ${(s.difficulty ?? 5).toFixed(1)}` : `ease ${s.ease.toFixed(2)}`}
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
