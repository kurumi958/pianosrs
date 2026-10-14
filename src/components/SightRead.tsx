import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttemptMatcher } from '../midi/matcher';
import { toMidi } from '../music/notes';
import type { PhraseMark } from '../music/notation';
import { generatePhrase, grandStaffPhrase, type GrandStyle, type Phrase, phraseEvents, singleStaffPhrase } from '../music/phrase';
import { type Card, cardLabel, DECKS, type StaffKind } from '../srs/deck';
import type { AppData, SightClef } from '../storage';
import { useHeldNotes, useNoteEvents } from '../hooks';
import { PhraseStaff } from './Staff';
import { Piano } from './Piano';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
}

/** Cards you've already started learning, or (early on) the first few cards so there's always something to read. */
function startedOrFirst(cards: Card[], data: AppData, fallbackDeck: string): Card[] {
  const started = cards.filter((c) => data.cards[c.id] && data.cards[c.id].status !== 'new');
  if (started.length >= 3) return started;
  const source = cards.length ? cards : (DECKS.find((d) => d.id === fallbackDeck)?.cards ?? []);
  return [...started, ...source.filter((c) => !started.includes(c))].slice(0, 5);
}

function buildPhrase(data: AppData, staff: StaffKind): Phrase {
  const enabled = DECKS.filter((d) => data.settings.enabledDecks.includes(d.id)).flatMap((d) => d.cards);
  const bars = Math.max(1, Math.ceil(data.settings.phraseLength / 4));
  if (staff !== 'grand') {
    const pool = startedOrFirst(
      enabled.filter((c) => c.staff === staff),
      data,
      `${staff}-staff`,
    );
    return singleStaffPhrase(generatePhrase(pool, data.cards, bars * 4), staff);
  }
  const rhOnly = enabled.filter((c) => c.hands.treble.length && !c.hands.bass.length);
  const lhOnly = enabled.filter((c) => c.hands.bass.length && !c.hands.treble.length);
  const both = enabled.filter((c) => c.hands.treble.length && c.hands.bass.length && data.cards[c.id] && data.cards[c.id].status !== 'new');
  return grandStaffPhrase(
    { rh: startedOrFirst(rhOnly, data, 'treble-staff'), lh: startedOrFirst(lhOnly, data, 'bass-staff'), both },
    data.cards,
    bars,
    data.settings.grandStyle,
  );
}

interface Result {
  ms: number;
  events: number;
  misses: number;
  /** Events played right the first time. */
  clean: number;
  missed: Card[];
  flagged: number;
}

const ROTATION: StaffKind[] = ['treble', 'bass', 'grand'];

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
  const staff: StaffKind = sc === 'alternate' ? ROTATION[round % ROTATION.length] : sc;

  const deckKey = data.settings.enabledDecks.join(',');
  const phrase = useMemo(
    () => buildPhrase(data, staff),
    // Only regenerate on a new round or settings change, not on every card-state update.
    [round, staff, data.settings.phraseLength, data.settings.grandStyle, deckKey],
  );
  const events = useMemo(() => phraseEvents(phrase), [phrase]);
  const targetOf = useCallback(
    (i: number) => new AttemptMatcher(events[i].pitches.map(toMidi), data.settings.ignoreOctave),
    [events, data.settings.ignoreOctave],
  );

  useEffect(() => {
    setCursor(0);
    setMissed(new Set());
    setWrong([]);
    setResult(null);
    startedAt.current = null;
    missCount.current = 0;
    matcher.current = events.length ? targetOf(0) : null;
  }, [events, targetOf]);

  const finish = (misses: Set<number>) => {
    const ms = performance.now() - (startedAt.current ?? performance.now());
    const missedCards = [...new Set([...misses].flatMap((i) => events[i].cards))];
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
    setResult({ ms, events: events.length, misses: missCount.current, clean: events.length - misses.size, missed: missedCards, flagged });
  };

  useNoteEvents((e) => {
    if (e.type !== 'on' || result || !matcher.current) return;
    startedAt.current ??= performance.now();
    const r = matcher.current.noteOn(e.note);
    if (r === 'wrong') {
      missCount.current++;
      setWrong([e.note]);
      setMissed(new Set(missed).add(cursor));
      matcher.current = targetOf(cursor);
    } else if (r === 'correct') {
      setWrong([]);
      const next = cursor + 1;
      setCursor(next);
      if (next >= events.length) finish(missed);
      else matcher.current = targetOf(next);
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

  const marks: PhraseMark[] = useMemo(
    () => events.map((_, i) => (i === cursor ? 'current' : i < cursor ? (missed.has(i) ? 'miss' : 'ok') : 'pending')),
    [events, cursor, missed],
  );

  const set = <K extends 'sightClef' | 'phraseLength' | 'grandStyle'>(k: K, v: AppData['settings'][K]) =>
    update((d) => {
      d.settings[k] = v;
    });

  if (!events.length) {
    return <div className="panel empty">Enable some decks in the <b>Decks</b> tab to practise sight-reading.</div>;
  }

  const target = events[Math.min(cursor, events.length - 1)].pitches.map(toMidi);
  const bars = phrase.measures.length;

  return (
    <div className="sight">
      <div className="row controls">
        <label>
          Staff{' '}
          <select value={sc} onChange={(e) => set('sightClef', e.target.value as SightClef)}>
            <option value="treble">Treble</option>
            <option value="bass">Bass</option>
            <option value="grand">Grand staff (both hands)</option>
            <option value="alternate">Rotate all three</option>
          </select>
        </label>
        <label>
          Length{' '}
          <select value={bars} onChange={(e) => set('phraseLength', Number(e.target.value) * 4)}>
            {[1, 2, 3, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} bar{n > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
        {phrase.staff === 'grand' && (
          <label>
            Hands{' '}
            <select value={data.settings.grandStyle} onChange={(e) => set('grandStyle', e.target.value as GrandStyle)}>
              <option value="mixed">Mixed</option>
              <option value="melody">RH melody, LH held</option>
              <option value="bass-melody">LH melody, RH held</option>
              <option value="alternate">Alternating hands</option>
              <option value="together">Hands together</option>
            </select>
          </label>
        )}
        <span className="spacer" />
        <button onClick={() => setRound((r) => r + 1)}>New phrase</button>
      </div>

      <PhraseStaff phrase={phrase} events={events} marks={marks} />

      {result ? (
        <div className="panel result">
          <h3>{result.misses === 0 ? 'Clean run! ✨' : `${Math.round((100 * result.clean) / result.events)}% right first time`}</h3>
          <p>
            {result.events} notes/chords in {(result.ms / 1000).toFixed(1)}s ({Math.round((result.events / result.ms) * 60_000)} per
            minute) · {result.misses} wrong key{result.misses === 1 ? '' : 's'}
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
            {cursor + 1} of {events.length}
            {target.length > 1 ? ` · play ${target.length} notes together` : ''} · keep your eyes on the music
          </span>
        </div>
      )}

      <Piano held={held} wrong={wrong} focus={Math.round((Math.min(...target) + Math.max(...target)) / 2)} />
    </div>
  );
}
