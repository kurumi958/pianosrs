import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttemptMatcher } from '../midi/matcher';
import { midiName, toMidi } from '../music/notes';
import { COLORS } from '../music/notation';
import { type Card, cardLabel, COURSE_DECKS as COURSES } from '../srs/deck';
import { courseProgress, studyCards } from '../srs/study';
import { autoGrade } from '../srs/grading';
import { type CardState, formatDelay, type Grade, GRADE_LABELS, schedule } from '../srs/scheduler';
import { countQueue, pickNext, type QueuePick } from '../srs/session';
import { type AppData, dayKey } from '../storage';
import { useHeldNotes, useNoteEvents } from '../hooks';
import { CardStaff } from './Staff';
import { RhythmTrial } from './RhythmTrial';
import { describeTaps, type TapResult } from '../music/rhythm';
import { Piano } from './Piano';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  onChooseDecks: () => void;
}

type Phase = 'question' | 'correct' | 'wrong';

interface Undo {
  cardId: string;
  prev: CardState | undefined;
  wasNew: boolean;
  day: string;
}

export function Review({ data, update, onChooseDecks }: Props) {
  const held = useHeldNotes();
  const [pick, setPick] = useState<QueuePick | null>(null);
  const [phase, setPhase] = useState<Phase>('question');
  const [wrongNotes, setWrongNotes] = useState<number[]>([]);
  const [chosen, setChosen] = useState<Grade>(1);
  const [lastMs, setLastMs] = useState(0);
  const [detail, setDetail] = useState('');
  const [undo, setUndo] = useState<Undo | null>(null);
  const [reviewedNow, setReviewedNow] = useState(0);
  const shownAt = useRef(0);
  const matcher = useRef<AttemptMatcher | null>(null);
  const advanceTimer = useRef<number | undefined>(undefined);
  const lastCard = useRef<string | undefined>(undefined);

  // Course units open as you learn, so the card list is derived from progress; keep its identity stable between renders.
  const available = studyCards({ enabledDecks: data.settings.enabledDecks, courses: data.courses, states: data.cards });
  const cardsKey = available.map((c) => c.id).join(',');
  const cards = useMemo(() => available, [cardsKey]);
  const activeCourses = COURSES.filter((c) => data.settings.enabledDecks.includes(c.id)).map((c) => {
    const { open } = courseProgress(c, data.cards, data.courses[c.id]);
    return c.units![open].title;
  });
  const today = dayKey(Date.now());
  const newRemaining = data.settings.newPerDay - (data.newByDay[today] ?? 0);
  const queueInput = { cards, states: data.cards, now: Date.now(), newRemaining, lastCardId: lastCard.current };
  const counts = countQueue(queueInput);

  const targetMidi = (c: Card) => c.notes.map(toMidi);

  const showNext = useCallback(() => {
    window.clearTimeout(advanceTimer.current);
    const next = pickNext({ ...queueInput, now: Date.now() });
    setPick(next);
    setPhase('question');
    setWrongNotes([]);
    if (next) {
      matcher.current = new AttemptMatcher(targetMidi(next.card), data.settings.ignoreOctave || !!next.card.anyOctave);
      shownAt.current = performance.now();
    }
  }, [cards, data, newRemaining]);

  // Pick the first card when the screen opens or decks change.
  useEffect(() => {
    if (!pick) showNext();
  }, [cards]);
  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const commit = (p: QueuePick, grade: Grade, ms: number) => {
    const now = Date.now();
    const day = dayKey(now);
    setUndo({ cardId: p.card.id, prev: data.cards[p.card.id], wasNew: p.isNew, day });
    lastCard.current = p.card.id;
    setReviewedNow((n) => n + 1);
    update((d) => {
      d.cards[p.card.id] = schedule(p.state, grade, now);
      if (p.isNew) d.newByDay[day] = (d.newByDay[day] ?? 0) + 1;
      d.log.push({ id: p.card.id, t: now, grade, ms: Math.round(ms) });
    });
  };

  const continueAfterWrong = () => {
    if (!pick || phase !== 'wrong') return;
    commit(pick, chosen, lastMs);
    // Re-pick after the state update lands.
    setPick(null);
  };
  // When pick is cleared after a commit, choose the next one with fresh data.
  useEffect(() => {
    if (pick === null && phase !== 'question') showNext();
  }, [pick, phase, showNext]);

  /** Rhythm cards grade themselves when the bar ends. */
  const onRhythmDone = (grade: Grade, result: TapResult, beatMs: number) => {
    if (!pick || phase !== 'question') return;
    const ms = performance.now() - shownAt.current;
    const timing = describeTaps(result) || 'no taps';
    setLastMs(ms);
    setChosen(grade);
    setDetail(timing);
    if (grade === 1) {
      setPhase('wrong');
      return;
    }
    setPhase('correct');
    commit(pick, grade, ms);
    // Leave a moment to see which notes landed.
    advanceTimer.current = window.setTimeout(() => setPick(null), Math.max(1200, beatMs * 2));
  };

  useNoteEvents((e) => {
    if (e.type !== 'on' || !pick || !matcher.current || pick.card.rhythm) return;
    const result = matcher.current.noteOn(e.note);
    if (phase === 'question') {
      const ms = performance.now() - shownAt.current;
      if (result === 'correct') {
        const grade = autoGrade(true, ms, pick.card.notes.length, data.settings);
        setLastMs(ms);
        setChosen(grade);
        setPhase('correct');
        commit(pick, grade, ms);
        advanceTimer.current = window.setTimeout(() => setPick(null), 650);
      } else if (result === 'wrong') {
        setLastMs(ms);
        setChosen(1);
        setWrongNotes([...matcher.current.wrongNotes]);
        setPhase('wrong');
        // Let the player play the right answer to continue.
        matcher.current = new AttemptMatcher(targetMidi(pick.card), data.settings.ignoreOctave || !!pick.card.anyOctave);
      }
    } else if (phase === 'wrong') {
      if (result === 'correct') continueAfterWrong();
      else if (result === 'wrong')
        matcher.current = new AttemptMatcher(targetMidi(pick.card), data.settings.ignoreOctave || !!pick.card.anyOctave);
    }
  });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (phase !== 'wrong') return;
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        continueAfterWrong();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const doUndo = () => {
    if (!undo) return;
    window.clearTimeout(advanceTimer.current);
    update((d) => {
      if (undo.prev) d.cards[undo.cardId] = undo.prev;
      else delete d.cards[undo.cardId];
      if (undo.wasNew) d.newByDay[undo.day] = Math.max(0, (d.newByDay[undo.day] ?? 1) - 1);
      const idx = d.log.map((l) => l.id).lastIndexOf(undo.cardId);
      if (idx >= 0) d.log.splice(idx, 1);
    });
    setReviewedNow((n) => Math.max(0, n - 1));
    setUndo(null);
    setPick(null);
    setPhase('correct'); // triggers re-pick; the undone card is due again so it comes straight back
    lastCard.current = undefined;
  };

  if (!cards.length) {
    const startCourse = () =>
      update((d) => {
        d.settings.enabledDecks = [...d.settings.enabledDecks, COURSES[0].id];
        d.courses[COURSES[0].id] ??= { start: 0, unlocked: 0 };
      });
    return (
      <div className="panel empty onboarding">
        <h2>What would you like to learn?</h2>
        <div className="choices">
          <button className="choice" onClick={startCourse}>
            <b>I'm new to reading music</b>
            <span className="muted">Start the adult beginner course from your first notes on the staff.</span>
          </button>
          <button className="choice" onClick={onChooseDecks}>
            <b>I can already read some</b>
            <span className="muted">Join the course at a later unit, or pick topic decks like ledger lines or accidentals.</span>
          </button>
        </div>
      </div>
    );
  }

  if (!pick) {
    const nextDue = Object.values(data.cards)
      .filter((s) => s.status !== 'new' && cards.some((c) => c.id === s.id))
      .reduce((m, s) => Math.min(m, s.due), Infinity);
    return (
      <div className="panel empty">
        <h2>All done for now 🎉</h2>
        <p>{reviewedNow ? `You reviewed ${reviewedNow} card${reviewedNow === 1 ? '' : 's'} this session.` : 'Nothing is due.'}</p>
        {Number.isFinite(nextDue) && <p className="muted">Next card due in {formatDelay(Math.max(0, nextDue - Date.now()))}.</p>}
        <p className="muted">Try the <b>Sight-read</b> tab to practise what you've learned, or raise the new-card limit in Settings.</p>
        <div className="row">
          <button onClick={showNext}>Check again</button>
          {undo && <button onClick={doUndo}>Undo last</button>}
        </div>
      </div>
    );
  }

  const target = targetMidi(pick.card);
  const color = phase === 'correct' ? COLORS.ok : phase === 'wrong' ? COLORS.miss : undefined;
  const preview = (g: Grade) => formatDelay(schedule(pick.state, g, Date.now()).due - Date.now());

  return (
    <div className="review">
      <div className="counts">
        <span className="c-new" title="New">{counts.newCount}</span>
        <span className="c-learn" title="Learning">{counts.learning}</span>
        <span className="c-review" title="Review">{counts.review}</span>
        {pick.isNew && <span className="badge">new card</span>}
        {activeCourses.map((t) => (
          <span key={t} className="muted small course-pos">
            {t}
          </span>
        ))}
        <span className="spacer" />
        {undo && phase === 'question' && <button className="small" onClick={doUndo}>Undo</button>}
      </div>

      {pick.card.rhythm ? (
        <RhythmTrial pattern={pick.card.rhythm} bpm={data.settings.rhythmBpm} latencyMs={data.settings.latencyMs} onDone={onRhythmDone} />
      ) : (
        <CardStaff card={pick.card} color={color} />
      )}

      <div className={`feedback ${phase}`}>
        {phase === 'question' && !pick.card.rhythm && (
          <span className="muted">
            {pick.card.prompt === 'key'
              ? 'Which major key is this? Play its tonic (any octave)'
              : `Play the ${pick.card.notes.length > 1 ? 'notes' : 'note'} on your piano`}
          </span>
        )}
        {phase === 'correct' && (
          <span>
            ✓ {pick.card.rhythm ? detail : `${cardLabel(pick.card)} · ${(lastMs / 1000).toFixed(1)}s`} · {GRADE_LABELS[chosen]}
          </span>
        )}
        {phase === 'wrong' && pick.card.rhythm && <span>✗ Not quite: {detail}. Press Continue, or tap any key to practise it again.</span>}
        {phase === 'wrong' && !pick.card.rhythm && (
          <span>
            ✗ You played {wrongNotes.map(midiName).join(', ')} — it's <b>{cardLabel(pick.card)}</b>. Play it to continue.
          </span>
        )}
      </div>

      {phase === 'wrong' && (
        <div className="grades">
          {([1, 2, 3, 4] as Grade[]).map((g) => (
            <button key={g} className={`grade g${g} ${chosen === g ? 'chosen' : ''}`} onClick={() => setChosen(g)}>
              {GRADE_LABELS[g]}
              <small>{preview(g)}</small>
            </button>
          ))}
          <button className="primary" onClick={continueAfterWrong}>
            Continue ⏎
          </button>
        </div>
      )}

      <Piano
        showLabels={data.settings.showKeyLabels}
        held={held}
        answer={phase === 'wrong' ? target : []}
        wrong={wrongNotes}
        focus={target.length ? Math.round((Math.min(...target) + Math.max(...target)) / 2) : 60}
      />
    </div>
  );
}
