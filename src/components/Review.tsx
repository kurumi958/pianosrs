import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttemptMatcher } from '../midi/matcher';
import { isMinor, midiName, toMidi } from '../music/notes';
import { COLORS } from '../music/notation';
import { type Card, cardLabel, COURSE_DECKS as COURSES } from '../srs/deck';
import { courseProgress, studyCards } from '../srs/study';
import { autoGrade, limitEasy } from '../srs/grading';
import { type CardState, formatDelay, type Grade, GRADE_LABELS, markKnown, schedule } from '../srs/scheduler';
import { countQueue, pickNext, type QueuePick } from '../srs/session';
import { type AppData, dayKey } from '../storage';
import { dailyLimits } from '../srs/today';
import { useNoteEvents, useShowOnKeyboard } from '../hooks';
import { CardStaff } from './Staff';
import { PlayScreen } from './PlayScreen';
import { RhythmTrial } from './RhythmTrial';
import { describeTaps, type TapResult } from '../music/rhythm';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  onNavigate: (tab: 'Home' | 'Sight-read') => void;
}

type Phase = 'question' | 'correct' | 'wrong';

interface Undo {
  cardId: string;
  prev: CardState | undefined;
  wasNew: boolean;
  wasReview: boolean;
  day: string;
  /** How many review-log entries this answer added (Known adds several). */
  logCount: number;
}

export function Review({ data, update, onNavigate }: Props) {
  const [pick, setPick] = useState<QueuePick | null>(null);
  const [phase, setPhase] = useState<Phase>('question');
  const [wrongNotes, setWrongNotes] = useState<number[]>([]);
  const [chosen, setChosen] = useState<Grade>(1);
  const [lastMs, setLastMs] = useState(0);
  const [detail, setDetail] = useState('');
  const [markedKnown, setMarkedKnown] = useState(false);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [reviewedNow, setReviewedNow] = useState(0);
  // Show the right keys on the keyboard after a wrong answer.
  useShowOnKeyboard(pick && phase === 'wrong' ? pick.card.notes.map(toMidi) : [], wrongNotes);
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
  const limits = dailyLimits(data, Date.now());
  const queueInput = { cards, states: data.cards, now: Date.now(), ...limits, lastCardId: lastCard.current };
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
  }, [cards, data]);

  // Pick the first card when the screen opens or decks change.
  useEffect(() => {
    if (!pick) showNext();
  }, [cards]);
  useEffect(() => () => window.clearTimeout(advanceTimer.current), []);

  const commit = (p: QueuePick, grade: Grade, ms: number) => {
    const now = Date.now();
    const day = dayKey(now);
    const wasReview = p.state.status === 'review';
    setUndo({ cardId: p.card.id, prev: data.cards[p.card.id], wasNew: p.isNew, wasReview, day, logCount: 1 });
    setMarkedKnown(false);
    lastCard.current = p.card.id;
    setReviewedNow((n) => n + 1);
    update((d) => {
      d.cards[p.card.id] = schedule(p.state, grade, now, d.settings.srs);
      if (p.isNew) d.newByDay[day] = (d.newByDay[day] ?? 0) + 1;
      if (wasReview) d.reviewsByDay[day] = (d.reviewsByDay[day] ?? 0) + 1;
      d.log.push({ id: p.card.id, t: now, grade, ms: Math.round(ms), prevStatus: p.state.status, prevInterval: p.state.interval });
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
  const onRhythmDone = (tapGrade: Grade, result: TapResult, beatMs: number) => {
    if (!pick || phase !== 'question') return;
    const grade = limitEasy(tapGrade, pick.state.status, data.settings.easyWhileLearning);
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
        const grade = limitEasy(autoGrade(true, ms, pick.card.notes.length, data.settings), pick.state.status, data.settings.easyWhileLearning);
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

  /** Known: a new card you can already read skips learning, and comes back in a few days to check. */
  const markAsKnown = () => {
    if (!pick || !pick.isNew || phase !== 'question') return;
    const now = Date.now();
    const day = dayKey(now);
    const { state, goods } = markKnown(pick.state, now, data.settings.srs);
    setUndo({ cardId: pick.card.id, prev: data.cards[pick.card.id], wasNew: true, wasReview: false, day, logCount: goods });
    lastCard.current = pick.card.id;
    setReviewedNow((n) => n + 1);
    setMarkedKnown(true);
    setPhase('correct');
    update((d) => {
      d.cards[pick.card.id] = state;
      d.newByDay[day] = (d.newByDay[day] ?? 0) + 1;
      for (let i = 0; i < goods; i++) d.log.push({ id: pick.card.id, t: now, grade: 3, ms: 0, known: true });
    });
    advanceTimer.current = window.setTimeout(() => setPick(null), 1100);
  };

  const doUndo = () => {
    if (!undo) return;
    window.clearTimeout(advanceTimer.current);
    update((d) => {
      if (undo.prev) d.cards[undo.cardId] = undo.prev;
      else delete d.cards[undo.cardId];
      if (undo.wasNew) d.newByDay[undo.day] = Math.max(0, (d.newByDay[undo.day] ?? 1) - 1);
      if (undo.wasReview) d.reviewsByDay[undo.day] = Math.max(0, (d.reviewsByDay[undo.day] ?? 1) - 1);
      for (let i = 0; i < undo.logCount; i++) {
        const idx = d.log.map((l) => l.id).lastIndexOf(undo.cardId);
        if (idx >= 0) d.log.splice(idx, 1);
      }
    });
    setReviewedNow((n) => Math.max(0, n - 1));
    setUndo(null);
    setPick(null);
    setPhase('correct'); // triggers re-pick; the undone card is due again so it comes straight back
    lastCard.current = undefined;
  };

  const set = <K extends keyof AppData['settings']>(k: K, v: AppData['settings'][K]) =>
    update((d) => {
      d.settings[k] = v;
    });

  const left = (
    <>
      <div className="side-block">
        <span className="eyebrow">Today</span>
        <div className="big-counts">
          <span className="c-new">
            {counts.newCount}
            <small>New</small>
          </span>
          <span className="c-learn">
            {counts.learning}
            <small>Learn</small>
          </span>
          <span className="c-review">
            {counts.review}
            <small>Due</small>
          </span>
        </div>
        {reviewedNow > 0 && <span className="muted small">{reviewedNow} answered this session</span>}
      </div>
      {activeCourses.map((t) => (
        <div className="side-block" key={t}>
          <span className="eyebrow">Course</span>
          <span>{t}</span>
        </div>
      ))}
      {pick?.isNew && <span className="badge">New card</span>}
    </>
  );

  const right = (
    <>
      <div className="side-block">
        <span className="eyebrow">Answer</span>
        <p className="muted small">Play on your piano, or tap the keyboard below. A wrong note shows the right keys.</p>
      </div>
      {pick?.card.rhythm && (
        <label className="opt">
          Rhythm tempo (♩ per minute)
          <input
            id="rhythm-bpm"
            type="number"
            min={30}
            max={200}
            step={4}
            value={data.settings.rhythmBpm}
            onChange={(e) => set('rhythmBpm', Math.min(200, Math.max(30, Number(e.target.value) || 72)))}
          />
        </label>
      )}
      <div className="side-block">
        <label className="opt-check">
          <input id="opt-labels" type="checkbox" checked={data.settings.showKeyLabels} onChange={(e) => set('showKeyLabels', e.target.checked)} />
          Label C keys
        </label>
        <label className="opt-check">
          <input id="opt-sound" type="checkbox" checked={data.settings.onscreenSound} onChange={(e) => set('onscreenSound', e.target.checked)} />
          Sound for on-screen keys
        </label>
      </div>
      {undo && (
        <div className="side-block">
          <button className="small" onClick={doUndo}>
            Undo last answer
          </button>
        </div>
      )}
    </>
  );

  if (!cards.length || !pick) {
    const nextDue = Object.values(data.cards)
      .filter((s) => s.status !== 'new' && cards.some((c) => c.id === s.id))
      .reduce((m, s) => Math.min(m, s.due), Infinity);
    const empty = !cards.length ? (
      <div className="result panel">
        <h3>Nothing to study yet</h3>
        <p className="muted">Start the beginner course or pick some decks, and your cards will appear here.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={() => onNavigate('Home')}>
            Get started
          </button>
        </div>
      </div>
    ) : (
      <div className="result panel">
        <h3>All done for now</h3>
        <p>{reviewedNow ? `You answered ${reviewedNow} card${reviewedNow === 1 ? '' : 's'} this session.` : 'Nothing is due.'}</p>
        {Number.isFinite(nextDue) && <p className="muted">Next card due in {formatDelay(Math.max(0, nextDue - Date.now()))}.</p>}
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={() => onNavigate('Sight-read')}>
            Practice sight-reading
          </button>
          <button onClick={showNext}>Check again</button>
        </div>
      </div>
    );
    return (
      <PlayScreen
        left={left}
        right={right}
        music={empty}
        status=""
        showLabels={data.settings.showKeyLabels}
        bottom={<GradeBar />}
      />
    );
  }

  const color = phase === 'correct' ? COLORS.ok : phase === 'wrong' ? COLORS.miss : undefined;
  // Show the unfuzzed interval on the buttons, as Anki does.
  const preview = (g: Grade) => formatDelay(schedule(pick.state, g, Date.now(), { ...data.settings.srs, fuzz: false }).due - Date.now());
  const knownPreview = pick.isNew ? formatDelay(markKnown(pick.state, Date.now(), { ...data.settings.srs, fuzz: false }).state.due - Date.now()) : '';

  const status =
    phase === 'question' ? (
      pick.card.rhythm ? (
        ''
      ) : pick.card.prompt === 'key' ? (
        `Which ${isMinor(pick.card.key) ? 'minor' : 'major'} key is this? Play its tonic in any octave`
      ) : (
        `Play the ${pick.card.notes.length > 1 ? 'notes' : 'note'}`
      )
    ) : phase === 'correct' && markedKnown ? (
      <>✓ Marked as known. It'll come back in {knownPreview} to check.</>
    ) : phase === 'correct' ? (
      <>✓ {pick.card.rhythm ? detail : `${cardLabel(pick.card)} · ${(lastMs / 1000).toFixed(1)}s`}</>
    ) : pick.card.rhythm ? (
      <>✗ Not quite: {detail}. Continue, or tap any key to practice it again.</>
    ) : (
      <>
        ✗ You played {wrongNotes.map(midiName).join(', ')}, it's <b>{cardLabel(pick.card)}</b>. Play it to continue.
      </>
    );

  return (
    <PlayScreen
      left={left}
      right={right}
      music={
        pick.card.rhythm ? (
          <RhythmTrial pattern={pick.card.rhythm} bpm={data.settings.rhythmBpm} latencyMs={data.settings.latencyMs} onDone={onRhythmDone} />
        ) : (
          <CardStaff card={pick.card} color={color} />
        )
      }
      status={status}
      statusTone={phase === 'question' ? '' : phase}
      showLabels={data.settings.showKeyLabels}
      bottom={
        <GradeBar
          lit={phase === 'question' || markedKnown ? null : chosen}
          enabled={phase === 'wrong'}
          preview={preview}
          onPick={setChosen}
          onContinue={phase === 'wrong' ? continueAfterWrong : undefined}
          known={pick.isNew && (phase === 'question' || markedKnown) ? { preview: knownPreview, lit: markedKnown, onClick: markAsKnown } : undefined}
        />
      }
    />
  );
}

/** Again / Hard / Good / Easy with the next interval for each; the app lights up the grade it gave. */
function GradeBar({
  lit = null,
  enabled = false,
  preview,
  onPick,
  onContinue,
  known,
}: {
  lit?: Grade | null;
  enabled?: boolean;
  preview?: (g: Grade) => string;
  onPick?: (g: Grade) => void;
  onContinue?: () => void;
  /** New cards: "Known" skips learning for a card you can already read. */
  known?: { preview: string; lit: boolean; onClick: () => void };
}) {
  return (
    <>
      {([1, 2, 3, 4] as Grade[]).map((g) => (
        <button key={g} className={`grade g${g} ${lit === g ? 'lit' : ''}`} disabled={!enabled} onClick={() => onPick?.(g)}>
          {GRADE_LABELS[g]}
          <small>{preview ? preview(g) : '–'}</small>
        </button>
      ))}
      {onContinue && (
        <button className="primary" onClick={onContinue}>
          Continue ⏎
        </button>
      )}
      {known && (
        <>
          <span className="bar-sep" aria-hidden="true" />
          <button
            className={`grade known ${known.lit ? 'lit' : ''}`}
            onClick={known.onClick}
            disabled={known.lit}
            title="Already know this one? Skip learning it; it comes back in a few days to check."
          >
            Known
            <small>{known.preview}</small>
          </button>
        </>
      )}
    </>
  );
}
