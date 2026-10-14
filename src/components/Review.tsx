import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttemptMatcher } from '../midi/matcher';
import { midiName, toMidi } from '../music/notes';
import { COLORS } from '../music/notation';
import { type Card, cardLabel, DECKS } from '../srs/deck';
import { autoGrade } from '../srs/grading';
import { type CardState, formatDelay, type Grade, GRADE_LABELS, schedule } from '../srs/scheduler';
import { countQueue, pickNext, type QueuePick } from '../srs/session';
import { type AppData, dayKey } from '../storage';
import { useHeldNotes, useNoteEvents } from '../hooks';
import { CardStaff } from './Staff';
import { Piano } from './Piano';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
}

type Phase = 'question' | 'correct' | 'wrong';

interface Undo {
  cardId: string;
  prev: CardState | undefined;
  wasNew: boolean;
  day: string;
}

export function Review({ data, update }: Props) {
  const held = useHeldNotes();
  const [pick, setPick] = useState<QueuePick | null>(null);
  const [phase, setPhase] = useState<Phase>('question');
  const [wrongNotes, setWrongNotes] = useState<number[]>([]);
  const [chosen, setChosen] = useState<Grade>(1);
  const [lastMs, setLastMs] = useState(0);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [reviewedNow, setReviewedNow] = useState(0);
  const shownAt = useRef(0);
  const matcher = useRef<AttemptMatcher | null>(null);
  const advanceTimer = useRef<number | undefined>(undefined);
  const lastCard = useRef<string | undefined>(undefined);

  const deckKey = data.settings.enabledDecks.join(',');
  const cards = useMemo(
    () => DECKS.filter((d) => deckKey.split(',').includes(d.id)).flatMap((d) => d.cards),
    [deckKey],
  );
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
      matcher.current = new AttemptMatcher(targetMidi(next.card), data.settings.ignoreOctave);
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

  useNoteEvents((e) => {
    if (e.type !== 'on' || !pick || !matcher.current) return;
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
        matcher.current = new AttemptMatcher(targetMidi(pick.card), data.settings.ignoreOctave);
      }
    } else if (phase === 'wrong') {
      if (result === 'correct') continueAfterWrong();
      else if (result === 'wrong') matcher.current = new AttemptMatcher(targetMidi(pick.card), data.settings.ignoreOctave);
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
    return <div className="panel empty">No decks enabled. Turn some on in the <b>Decks</b> tab.</div>;
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
        <span className="spacer" />
        {undo && phase === 'question' && <button className="small" onClick={doUndo}>Undo</button>}
      </div>

      <CardStaff card={pick.card} color={color} />

      <div className={`feedback ${phase}`}>
        {phase === 'question' && <span className="muted">Play the {pick.card.notes.length > 1 ? 'notes' : 'note'} on your piano</span>}
        {phase === 'correct' && (
          <span>
            ✓ {cardLabel(pick.card)} · {(lastMs / 1000).toFixed(1)}s · {GRADE_LABELS[chosen]}
          </span>
        )}
        {phase === 'wrong' && (
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

      <Piano held={held} answer={phase === 'wrong' ? target : []} wrong={wrongNotes} focus={Math.round((Math.min(...target) + Math.max(...target)) / 2)} />
    </div>
  );
}
