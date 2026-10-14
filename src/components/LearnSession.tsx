import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AttemptMatcher } from '../midi/matcher';
import { isMinor, midiName, toMidi } from '../music/notes';
import { COLORS } from '../music/notation';
import { describeTaps, type TapResult } from '../music/rhythm';
import { songById } from '../songs/library';
import { type Card, cardLabel } from '../srs/deck';
import { recordLearned } from '../srs/learn';
import { formatDelay, markKnown, newCardState } from '../srs/scheduler';
import { type AppData, dayKey } from '../storage';
import { useNoteEvents, useShowOnKeyboard } from '../hooks';
import { PlayScreen } from './PlayScreen';
import { RhythmTrial } from './RhythmTrial';
import { PassageTrial } from './SongPlay';
import { CardStaff } from './Staff';

export interface LearnPlan {
  /** What's being learned, e.g. "Unit 3 · Reading reinforcement". */
  title: string;
  /** Where it comes from, e.g. "Adult beginner course". */
  source: string;
  cards: Card[];
  /** The Review section this belongs to ("course:<id>:<unit>" or "deck:<id>"), to review it straight after. */
  reviewKey: string;
}

interface Props {
  plan: LearnPlan;
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  onClose: () => void;
  onReview: (key: string) => void;
}

type Phase = 'question' | 'correct' | 'wrong';
/** For each card: whether the first try was right (absent until you've played it), or "known". */
type Tries = Map<string, boolean | 'known'>;

/**
 * A learning session: the cards of a unit (or a deck's next few) one at a time, at your own pace and without grades.
 * You're told whether you played each one right; moving past a card you've played puts it into your reviews.
 */
export function LearnSession({ plan, data, update, onClose, onReview }: Props) {
  const { cards } = plan;
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('question');
  const [wrongNotes, setWrongNotes] = useState<number[]>([]);
  const [detail, setDetail] = useState('');
  const [finished, setFinished] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const tries = useRef<Tries>(new Map());
  /** Cards already handed to the scheduler this session, and the ones among them that were new. */
  const recorded = useRef(new Set<string>());
  const introduced = useRef(new Set<string>());
  const matcher = useRef<AttemptMatcher | null>(null);
  const advance = useRef<number | undefined>(undefined);
  const card = cards[index];
  const wasNew = (c: Card) => !data.cards[c.id] || data.cards[c.id].status === 'new' || introduced.current.has(c.id);

  useShowOnKeyboard(card && phase === 'wrong' ? card.notes.map(toMidi) : [], wrongNotes);

  const reset = (c: Card | undefined) => {
    window.clearTimeout(advance.current);
    setPhase('question');
    setWrongNotes([]);
    setDetail('');
    matcher.current = c ? new AttemptMatcher(c.notes.map(toMidi), data.settings.ignoreOctave || !!c.anyOctave) : null;
  };
  useEffect(() => reset(card), [index]);
  useEffect(() => () => window.clearTimeout(advance.current), []);

  /** Schedule the cards you've played (and not yet scheduled) so far. */
  const save = (ids: string[]) => {
    const fresh = ids.filter((id) => tries.current.has(id) && !recorded.current.has(id));
    if (!fresh.length) return;
    const now = Date.now();
    update((d) => {
      const played = fresh.filter((id) => tries.current.get(id) !== 'known');
      recordLearned(
        d,
        played.map((id) => ({ id, rightFirstTime: tries.current.get(id) === true })),
        now,
      );
      for (const id of fresh.filter((x) => tries.current.get(x) === 'known')) {
        if (d.cards[id] && d.cards[id].status !== 'new') continue;
        d.cards[id] = markKnown(d.cards[id] ?? newCardState(id, d.settings.srs), now, d.settings.srs).state;
        const day = dayKey(now);
        d.newByDay[day] = (d.newByDay[day] ?? 0) + 1;
      }
    });
    for (const id of fresh) {
      if (!data.cards[id] || data.cards[id].status === 'new') introduced.current.add(id);
      recorded.current.add(id);
    }
  };

  const go = (to: number) => {
    save([card.id]);
    if (to >= cards.length) {
      setFinished(true);
      return;
    }
    setIndex(Math.max(0, to));
  };
  const close = () => {
    if (card) save([card.id]);
    onClose();
  };

  const firstTry = (right: boolean) => {
    if (!tries.current.has(card.id)) tries.current.set(card.id, right);
  };
  const markRight = (text = '') => {
    firstTry(true);
    setDetail(text);
    setPhase('correct');
    if (data.settings.learnAutoAdvance) advance.current = window.setTimeout(() => go(index + 1), 900);
  };
  const markWrong = (text = '') => {
    firstTry(false);
    setDetail(text);
    setPhase('wrong');
  };

  useNoteEvents((e) => {
    if (finished || e.type !== 'on' || !card || !matcher.current || card.rhythm || card.passage) return;
    const result = matcher.current.noteOn(e.note);
    if (result === 'correct') markRight();
    else if (result === 'wrong') {
      setWrongNotes([...matcher.current.wrongNotes]);
      markWrong();
      matcher.current = new AttemptMatcher(card.notes.map(toMidi), data.settings.ignoreOctave || !!card.anyOctave);
    }
  });

  const onRhythmDone = (grade: number, result: TapResult) => {
    const timing = describeTaps(result) || 'no taps';
    if (grade > 1) markRight(timing);
    else markWrong(timing);
  };
  const onPassageDone = (grade: number, summary: string) => {
    if (grade > 1) markRight(summary);
    else markWrong(summary);
  };

  const knowIt = () => {
    if (!wasNew(card)) return;
    tries.current.set(card.id, 'known');
    go(index + 1);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (finished || (ev.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (ev.key === 'Enter' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        go(index + 1);
      } else if (ev.key === 'ArrowLeft' && index > 0) {
        ev.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const set = <K extends keyof AppData['settings']>(k: K, v: AppData['settings'][K]) =>
    update((d) => {
      d.settings[k] = v;
    });

  const played = [...tries.current.values()];
  const firstTimeRight = played.filter((t) => t === true).length;
  const left = (
    <>
      <div className="side-block">
        <span className="eyebrow">Learning</span>
        <b className="learn-title">{plan.title}</b>
        <span className="muted small">{plan.source}</span>
      </div>
      <div className="side-block">
        <span className="eyebrow">Progress</span>
        <span>
          {finished ? cards.length : index + 1} of {cards.length}
        </span>
        <ol className="learn-dots" aria-hidden>
          {cards.map((c, i) => {
            const t = tries.current.get(c.id);
            return (
              <li
                key={c.id}
                className={`${i === index && !finished ? 'here' : ''} ${t === true || t === 'known' ? 'right' : t === false ? 'missed' : ''}`}
              />
            );
          })}
        </ol>
      </div>
      <button className="small link" onClick={close}>
        <ArrowLeft size={14} /> Leave
      </button>
    </>
  );
  const right = (
    <>
      <div className="side-block">
        <span className="eyebrow">How this works</span>
        <p className="muted small">
          No grades here: play each card, see if it's right, and move on when you're ready. Cards you've played go into your reviews.
        </p>
      </div>
      {card?.rhythm && (
        <label className="opt">
          Rhythm tempo (♩ per minute)
          <input
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
          <input type="checkbox" checked={data.settings.learnAutoAdvance} onChange={(e) => set('learnAutoAdvance', e.target.checked)} />
          Move on after a right answer
        </label>
        <label className="opt-check">
          <input type="checkbox" checked={data.settings.showKeyLabels} onChange={(e) => set('showKeyLabels', e.target.checked)} />
          Label C keys
        </label>
        <label className="opt-check">
          <input type="checkbox" checked={data.settings.onscreenSound} onChange={(e) => set('onscreenSound', e.target.checked)} />
          Sound for on-screen keys
        </label>
      </div>
    </>
  );

  if (finished || !card) {
    const learnedNow = introduced.current.size;
    const skipped = cards.filter((c) => !tries.current.has(c.id) && wasNew(c)).length;
    const firstDue = Math.min(...[...introduced.current].map((id) => data.cards[id]?.due ?? Infinity).filter((t) => Number.isFinite(t)));
    return (
      <PlayScreen
        left={left}
        right={right}
        status=""
        showLabels={data.settings.showKeyLabels}
        bottom={null}
        music={
          <div className="result panel">
            <h3>
              <Check size={20} /> {plan.title}
            </h3>
            <p>
              {played.length
                ? `You played ${firstTimeRight} of ${played.length} right first time.`
                : 'You looked through the cards without playing them.'}
            </p>
            {learnedNow > 0 && (
              <p className="muted">
                {learnedNow} card{learnedNow === 1 ? ' is' : 's are'} now in your reviews
                {Number.isFinite(firstDue) ? `; the first comes up in about ${formatDelay(Math.max(0, firstDue - Date.now()))}` : ''}.
              </p>
            )}
            {skipped > 0 && (
              <p className="muted">
                {skipped} card{skipped === 1 ? '' : 's'} you didn't play stay new for next time.
              </p>
            )}
            <div className="row" style={{ justifyContent: 'center' }}>
              <button
                onClick={() => {
                  tries.current = new Map();
                  setFinished(false);
                  setIndex(0);
                  reset(cards[0]);
                }}
              >
                Go through it again
              </button>
              <button onClick={onClose}>Done</button>
              <button className="primary" onClick={() => onReview(plan.reviewKey)}>
                Review these now
              </button>
            </div>
          </div>
        }
      />
    );
  }

  const prompt = card.rhythm
    ? ''
    : card.passage
      ? `${card.passage.title}: play ${card.passage.bars.toLowerCase()}`
      : card.prompt === 'key'
        ? `Which ${isMinor(card.key) ? 'minor' : 'major'} key is this? Play its tonic in any octave`
        : `Play the ${card.notes.length > 1 ? 'notes' : 'note'}`;
  const status =
    phase === 'question' ? (
      prompt
    ) : phase === 'correct' ? (
      <>✓ {card.rhythm || card.passage ? detail : cardLabel(card)}. Next when you're ready.</>
    ) : card.rhythm || card.passage ? (
      <>✗ Not quite: {detail}. Play any key to try again, or move on.</>
    ) : (
      <>
        ✗ You played {wrongNotes.map(midiName).join(', ')}, it's <b>{cardLabel(card)}</b>. Play it to try again, or move on.
      </>
    );
  const color = phase === 'correct' ? COLORS.ok : phase === 'wrong' ? COLORS.miss : undefined;
  const song = card.passage ? songById(card.passage.song) : undefined;

  return (
    <PlayScreen
      left={left}
      right={right}
      music={
        card.rhythm ? (
          <RhythmTrial
            key={card.id}
            pattern={card.rhythm}
            bpm={data.settings.rhythmBpm}
            latencyMs={data.settings.latencyMs}
            onDone={onRhythmDone}
          />
        ) : card.passage && song ? (
          <PassageTrial
            key={card.id + attempt}
            song={song}
            passage={card.passage}
            status={data.cards[card.id]?.status ?? 'new'}
            data={data}
            onDone={(g, s) => {
              onPassageDone(g, s);
              setAttempt((a) => a + 1);
            }}
          />
        ) : (
          <CardStaff card={card} color={color} />
        )
      }
      status={status}
      statusTone={phase === 'question' ? '' : phase}
      showLabels={data.settings.showKeyLabels}
      bottom={
        <div className="learn-bar">
          <button disabled={index === 0} onClick={() => go(index - 1)} title="Previous card (←)">
            <ArrowLeft size={16} /> Back
          </button>
          {wasNew(card) && !tries.current.has(card.id) && (
            <button className="link small" onClick={knowIt} title="Skip learning it: it comes back in a few days to check">
              I already know this one
            </button>
          )}
          <button className={phase === 'correct' ? 'primary' : ''} onClick={() => go(index + 1)} title="Next card (Enter or →)">
            {index === cards.length - 1 ? 'Finish' : 'Next'} <ArrowRight size={16} />
          </button>
        </div>
      }
    />
  );
}
