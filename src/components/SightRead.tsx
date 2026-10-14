import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttemptMatcher } from '../midi/matcher';
import type { Clef } from '../music/notes';
import { toMidi } from '../music/notes';
import type { PhraseMark } from '../music/notation';
import { generatePhrase } from '../music/phrase';
import { type Card, cardLabel, DECKS } from '../srs/deck';
import type { AppData, SightClef } from '../storage';
import { useHeldNotes, useNoteEvents } from '../hooks';
import { PhraseStaff } from './Staff';
import { Piano } from './Piano';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
}

/** Cards to draw a phrase from: ones you've already started learning, or the first few of each enabled deck. */
function poolFor(data: AppData, clef: Clef): Card[] {
  const decks = DECKS.filter((d) => data.settings.enabledDecks.includes(d.id) && d.cards[0]?.clef === clef);
  const all = decks.flatMap((d) => d.cards);
  const started = all.filter((c) => data.cards[c.id] && data.cards[c.id].status !== 'new');
  if (started.length >= 3) return started;
  return [...started, ...all.filter((c) => !started.includes(c))].slice(0, 5);
}

interface Result {
  ms: number;
  notes: number;
  misses: number;
  /** Notes played right the first time. */
  clean: number;
  missed: Card[];
  flagged: number;
}

export function SightRead({ data, update }: Props) {
  const held = useHeldNotes();
  const [round, setRound] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [missed, setMissed] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const startedAt = useRef<number | null>(null);
  const matcher = useRef<AttemptMatcher | null>(null);
  const missCount = useRef(0);

  const sc: SightClef = data.settings.sightClef;
  const clef: Clef = sc === 'alternate' ? (round % 2 === 0 ? 'treble' : 'bass') : sc;

  const deckKey = data.settings.enabledDecks.join(',');
  const phrase = useMemo(
    () => generatePhrase(poolFor(data, clef), data.cards, data.settings.phraseLength),
    // Only regenerate on a new round or settings change, not on every card-state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, clef, data.settings.phraseLength, deckKey],
  );

  const reset = useCallback(() => {
    setCursor(0);
    setMissed(new Set());
    setWrong([]);
    setResult(null);
    startedAt.current = null;
    missCount.current = 0;
  }, []);

  useEffect(() => {
    reset();
    matcher.current = phrase[0] ? new AttemptMatcher(phrase[0].notes.map(toMidi), data.settings.ignoreOctave) : null;
  }, [phrase, reset, data.settings.ignoreOctave]);

  const finish = (misses: Set<number>) => {
    const ms = performance.now() - (startedAt.current ?? performance.now());
    const missedCards = [...new Set([...misses].map((i) => phrase[i]))];
    // Notes you stumbled on become due in the flashcards straight away.
    let flagged = 0;
    const now = Date.now();
    update((d) => {
      for (const c of missedCards) {
        const s = d.cards[c.id];
        if (s && s.status === 'review' && s.due > now) {
          d.cards[c.id] = { ...s, due: now };
          flagged++;
        }
      }
    });
    setResult({ ms, notes: phrase.length, misses: missCount.current, clean: phrase.length - misses.size, missed: missedCards, flagged });
  };

  useNoteEvents((e) => {
    if (e.type !== 'on' || result || !matcher.current) return;
    startedAt.current ??= performance.now();
    const r = matcher.current.noteOn(e.note);
    const card = phrase[cursor];
    if (r === 'wrong') {
      missCount.current++;
      setWrong([e.note]);
      const m = new Set(missed).add(cursor);
      setMissed(m);
      matcher.current = new AttemptMatcher(card.notes.map(toMidi), data.settings.ignoreOctave);
    } else if (r === 'correct') {
      setWrong([]);
      const next = cursor + 1;
      if (next >= phrase.length) {
        setCursor(next);
        finish(missed);
      } else {
        setCursor(next);
        matcher.current = new AttemptMatcher(phrase[next].notes.map(toMidi), data.settings.ignoreOctave);
      }
    }
  });

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (result && (ev.key === ' ' || ev.key === 'Enter')) {
        ev.preventDefault();
        setRound((r) => r + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const marks: PhraseMark[] = phrase.map((_, i) =>
    i === cursor ? 'current' : i < cursor ? (missed.has(i) ? 'miss' : 'ok') : 'pending',
  );

  const setClef = (v: SightClef) =>
    update((d) => {
      d.settings.sightClef = v;
    });
  const setLength = (n: number) =>
    update((d) => {
      d.settings.phraseLength = n;
    });

  if (!phrase.length) {
    return <div className="panel empty">Enable a {clef} clef deck in the <b>Decks</b> tab to practise sight-reading.</div>;
  }

  const target = phrase[Math.min(cursor, phrase.length - 1)].notes.map(toMidi);

  return (
    <div className="sight">
      <div className="row controls">
        <label>
          Clef{' '}
          <select value={sc} onChange={(e) => setClef(e.target.value as SightClef)}>
            <option value="treble">Treble</option>
            <option value="bass">Bass</option>
            <option value="alternate">Alternate</option>
          </select>
        </label>
        <label>
          Length{' '}
          <select value={data.settings.phraseLength} onChange={(e) => setLength(Number(e.target.value))}>
            {[4, 8, 12, 16, 24, 32].map((n) => (
              <option key={n} value={n}>
                {n} notes
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button onClick={() => setRound((r) => r + 1)}>New phrase</button>
      </div>

      <PhraseStaff cards={phrase} clef={clef} marks={marks} />

      {result ? (
        <div className="panel result">
          <h3>
            {result.misses === 0 ? 'Clean run! ✨' : `${Math.round((100 * result.clean) / result.notes)}% right first time`}
          </h3>
          <p>
            {result.notes} notes in {(result.ms / 1000).toFixed(1)}s ({Math.round((result.notes / result.ms) * 60_000)} per minute) ·{' '}
            {result.misses} wrong key{result.misses === 1 ? '' : 's'}
          </p>
          {result.missed.length > 0 && (
            <p className="muted">
              Stumbled on: {result.missed.map(cardLabel).join(', ')}
              {result.flagged > 0 && ` — ${result.flagged} moved up for flashcard review`}
            </p>
          )}
          <button className="primary" onClick={() => setRound((r) => r + 1)}>
            Next phrase ⏎
          </button>
        </div>
      ) : (
        <div className="feedback">
          <span className="muted">
            Note {cursor + 1} of {phrase.length} · play through without looking down
          </span>
        </div>
      )}

      <Piano held={held} wrong={wrong} focus={target[0]} />
    </div>
  );
}
