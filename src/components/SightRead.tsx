import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttemptMatcher } from '../midi/matcher';
import { MAJOR_KEYS, toMidi } from '../music/notes';
import type { PhraseMark } from '../music/notation';
import { grandStaffPhrase, type GrandStyle, type Phrase, phraseEvents, singleStaffPhrase, weightedSampler } from '../music/phrase';
import { hitWindow } from '../music/rhythm';
import { TempoJudge } from '../music/tempo';
import { barClicks, outputLatencyMs, scheduleClicks } from '../midi/metronome';
import { type Card, cardLabel, DECKS, type StaffKind } from '../srs/deck';
import { cardsInKey, knownCards, learnedKeys, learnedRhythms, phraseRhythms, studyCards } from '../srs/study';
import { type Focus, focusKey, focusStaff, recordSightResults } from '../srs/weak';
import type { AppData, SightClef } from '../storage';
import { useNoteEvents, useShowOnKeyboard } from '../hooks';
import { PhraseStaff } from './Staff';
import { PlayScreen } from './PlayScreen';
import { Metronome } from './Metronome';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  /** Focused practice from "Things to work on", or null for ordinary phrases. */
  focus: Focus | null;
  onEndFocus: () => void;
}

const keyName = (k: string) => k.replace('b', '♭').replace('#', '♯');

const onlyHand = (hand: 'treble' | 'bass') => (c: Card) => c.hands[hand].length > 0 && c.hands[hand === 'treble' ? 'bass' : 'treble'].length === 0;

/** Cards you know (or, early on, the first few you're about to learn) so there's always something to read. */
function readable(known: Card[], upcoming: Card[], fallbackDeck: string): Card[] {
  if (known.length >= 3) return known;
  const source = upcoming.length ? upcoming : (DECKS.find((d) => d.id === fallbackDeck)?.cards ?? []);
  return [...known, ...source.filter((c) => !known.includes(c))].slice(0, 5);
}

/** How much more often a focus item comes up than an ordinary note in a focused phrase. */
const FOCUS_BOOST = 8;

function buildPhrase(data: AppData, staff: StaffKind, focus: Focus | null): Phrase {
  const input = { enabledDecks: data.settings.enabledDecks, courses: data.courses, states: data.cards };
  const known = knownCards(input);
  const upcoming = studyCards(input);
  const bars = Math.max(1, Math.ceil(data.settings.phraseLength / 4));
  const melodic = data.settings.melodic;
  // A focus picks the key (one its items are written in) and, for weak rhythms, the rhythms.
  const keys = data.settings.sightKey === 'learned' ? learnedKeys(known) : [data.settings.sightKey];
  const key = focus ? focusKey(focus.cards) : keys[Math.floor(Math.random() * keys.length)];
  const focusRhythms = focus ? focus.cards.filter((c) => c.rhythm).map((c) => c.rhythm!) : [];
  const patterns = focusRhythms.length
    ? phraseRhythms(focusRhythms, bars)
    : phraseRhythms(data.settings.sightRhythms ? learnedRhythms(known) : [], bars);
  // Focus notes written in this phrase's key (a weak F♯ in G major isn't moved into another key).
  const focusNotes = focus ? focus.cards.filter((c) => !c.prompt && c.key === key) : [];
  const focusIds = new Set(focusNotes.map((c) => c.id));
  const boost = focusIds.size ? (c: Card) => (focusIds.has(c.id) ? FOCUS_BOOST : 1) : undefined;
  const withFocus = (cards: Card[], keep: (c: Card) => boolean) => {
    const extra = focusNotes.filter((c) => keep(c) && !cards.some((x) => x.id === c.id));
    return [...cards, ...extra];
  };
  const pool = (hand: 'treble' | 'bass') => {
    const cards = readable(known.filter(onlyHand(hand)), upcoming.filter(onlyHand(hand)), `${hand}-staff`);
    const inKey = cardsInKey(cards, key);
    // Every card here was chromatic in this key (rare): fall back to the plain-staff notes.
    const base = inKey.length ? inKey : cardsInKey(DECKS.find((d) => d.id === `${hand}-staff`)!.cards, key);
    return withFocus(base, onlyHand(hand));
  };
  if (staff !== 'grand') {
    return singleStaffPhrase(weightedSampler(pool(staff), data.cards, Math.random, melodic, boost), staff, patterns, key);
  }
  const both = withFocus(
    cardsInKey(
      known.filter((c) => c.hands.treble.length && c.hands.bass.length),
      key,
    ),
    (c) => c.hands.treble.length > 0 && c.hands.bass.length > 0,
  );
  return grandStaffPhrase({ rh: pool('treble'), lh: pool('bass'), both }, data.cards, patterns, data.settings.grandStyle, Math.random, melodic, key, boost);
}

interface Result {
  ms: number;
  events: number;
  /** Wrong keys pressed. */
  misses: number;
  /** Events played right the first time (and, in time mode, on time). */
  clean: number;
  missed: Card[];
  flagged: number;
  /** In time mode: average timing error in ms and how many were missed entirely. */
  timing?: { meanAbs: number; mean: number; skipped: number };
}

const ROTATION: StaffKind[] = ['treble', 'bass', 'grand'];

export function SightRead({ data, update, focus, onEndFocus }: Props) {
  const [round, setRound] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [missed, setMissed] = useState<Set<number>>(new Set());
  const [okSet, setOkSet] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  useShowOnKeyboard([], wrong);
  const [running, setRunning] = useState<{ start: number; judge: TempoJudge } | null>(null);
  const [countIn, setCountIn] = useState(false);
  const startedAt = useRef<number | null>(null);
  const matcher = useRef<AttemptMatcher | null>(null);
  const missCount = useRef(0);
  /** Wrong keys pressed on each event, for "Things to work on". */
  const wrongByEvent = useRef(new Map<number, number[]>());
  const noteWrong = (event: number, midi: number) => wrongByEvent.current.set(event, [...(wrongByEvent.current.get(event) ?? []), midi]);
  const stopClicks = useRef<() => void>(() => {});

  const settings = data.settings;
  const tempo = settings.sightMode === 'tempo';
  const sc: SightClef = settings.sightClef;
  const chosenStaff: StaffKind = sc === 'alternate' ? ROTATION[round % ROTATION.length] : sc;
  // A focus decides the staff: grand if its items use both hands, otherwise the one hand's clef.
  const staff: StaffKind = (focus && focusStaff(focus.cards)) || chosenStaff;

  const deckKey = settings.enabledDecks.join(',');
  const phrase = useMemo(
    () => buildPhrase(data, staff, focus),
    // Only regenerate on a new round or settings change, not on every card-state update.
    [round, staff, focus, settings.phraseLength, settings.grandStyle, settings.melodic, settings.sightKey, settings.sightRhythms, deckKey],
  );
  const events = useMemo(() => phraseEvents(phrase), [phrase]);
  const targetOf = useCallback(
    (i: number) => new AttemptMatcher(events[i].pitches.map(toMidi), settings.ignoreOctave),
    [events, settings.ignoreOctave],
  );

  useEffect(() => {
    stopClicks.current();
    setCursor(0);
    setMissed(new Set());
    setOkSet(new Set());
    setWrong([]);
    setResult(null);
    setRunning(null);
    startedAt.current = null;
    missCount.current = 0;
    wrongByEvent.current = new Map();
    matcher.current = events.length ? targetOf(0) : null;
  }, [events, targetOf, tempo]);
  useEffect(() => () => stopClicks.current(), []);

  const finish = (misses: Set<number>, ms: number, timing?: Result['timing']) => {
    const missedCards = [...new Set([...misses].flatMap((i) => events[i].cards))];
    // Notes you stumbled on become due in the flashcards straight away.
    let flagged = 0;
    const now = Date.now();
    const results = events.map((e, i) => ({ cards: e.cards, missed: misses.has(i), wrong: wrongByEvent.current.get(i) ?? [] }));
    update((d) => {
      recordSightResults(d.sightStats, results, now);
      for (const c of missedCards) {
        const s = d.cards[c.id];
        if (s && s.status === 'review' && s.due > now) {
          d.cards[c.id] = { ...s, due: now };
          flagged++;
        }
      }
    });
    setResult({ ms, events: events.length, misses: missCount.current, clean: events.length - misses.size, missed: missedCards, flagged, timing });
  };

  // --- In time: count-in, then the cursor follows the beat and every event is judged on pitch and timing.
  const beatMs = 60_000 / settings.sightBpm;
  const startTempo = () => {
    const start = performance.now() + 300;
    const barStart = start + phrase.beats * beatMs;
    const shift = outputLatencyMs() + settings.latencyMs;
    const judge = new TempoJudge(
      events.map((e) => ({ at: barStart + e.time * beatMs + shift, pitches: e.pitches.map(toMidi) })),
      hitWindow(beatMs),
      settings.ignoreOctave,
    );
    stopClicks.current();
    stopClicks.current = scheduleClicks(barClicks(start, beatMs, phrase.beats, phrase.measures.length + 1));
    missCount.current = 0;
    wrongByEvent.current = new Map();
    setMissed(new Set());
    setOkSet(new Set());
    setResult(null);
    setRunning({ start, judge });
  };

  useEffect(() => {
    if (!running) return;
    const { judge, start } = running;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      setCountIn(now < start + phrase.beats * beatMs);
      judge.tick(now);
      setCursor(judge.current(now));
      setMissed(new Set(judge.status.flatMap((st, i) => (st === 'miss' ? [i] : []))));
      setOkSet(new Set(judge.status.flatMap((st, i) => (st === 'ok' ? [i] : []))));
      if (!judge.finished(now)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setRunning(null);
      setCountIn(false);
      const errs = judge.errors.filter((e): e is number => e !== null);
      const misses = new Set(judge.status.flatMap((st, i) => (st === 'ok' ? [] : [i])));
      missCount.current = judge.wrong + judge.extra;
      finish(misses, now - start - phrase.beats * beatMs, {
        meanAbs: errs.length ? errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length : 0,
        mean: errs.length ? errs.reduce((a, e) => a + e, 0) / errs.length : 0,
        skipped: judge.errors.filter((e) => e === null).length,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  useNoteEvents((e) => {
    if (e.type !== 'on') return;
    if (tempo) {
      if (running) {
        const r = running.judge.noteOn(e.note, e.time ?? performance.now());
        setWrong(r.right ? [] : [e.note]);
        if (!r.right && r.event !== null) noteWrong(r.event, e.note);
      } else if (!result) {
        startTempo(); // any key starts the count-in
      }
      return;
    }
    // --- Wait for me: the cursor waits for the right notes.
    if (result || !matcher.current) return;
    startedAt.current ??= performance.now();
    const r = matcher.current.noteOn(e.note);
    if (r === 'wrong') {
      missCount.current++;
      noteWrong(cursor, e.note);
      setWrong([e.note]);
      setMissed(new Set(missed).add(cursor));
      matcher.current = targetOf(cursor);
    } else if (r === 'correct') {
      setWrong([]);
      const next = cursor + 1;
      setCursor(next);
      if (next >= events.length) finish(missed, performance.now() - startedAt.current);
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
    () =>
      events.map((_, i) => {
        if (tempo) {
          if (okSet.has(i)) return 'ok';
          if (missed.has(i)) return 'miss';
          return running && !countIn && i === cursor ? 'current' : 'pending';
        }
        return i === cursor ? 'current' : i < cursor ? (missed.has(i) ? 'miss' : 'ok') : 'pending';
      }),
    [events, cursor, missed, okSet, tempo, running, countIn],
  );

  const set = <K extends keyof AppData['settings']>(k: K, v: AppData['settings'][K]) =>
    update((d) => {
      d.settings[k] = v;
    });

  const target = events.length ? events[Math.min(cursor, events.length - 1)].pitches.map(toMidi) : [];
  const bars = phrase.measures.length;
  const STAFF_NAMES: Record<SightClef, string> = { treble: 'Treble clef', bass: 'Bass clef', grand: 'Grand staff', alternate: 'Rotating staves' };

  const left = (
    <>
      {focus && (
        <div className="side-block focus-block">
          <span className="eyebrow">Focused practice</span>
          <span>{focus.title}</span>
          <span className="muted small">Phrases lean on these, mixed with notes you know.</span>
          <button className="small" onClick={onEndFocus}>
            Back to normal practice
          </button>
        </div>
      )}
      <div className="side-block">
        <span className="eyebrow">Phrase</span>
        <span>
          {focus ? STAFF_NAMES[staff as SightClef] : STAFF_NAMES[sc]} · {bars} bar{bars > 1 ? 's' : ''}
        </span>
        <span className="muted small">
          {focus || settings.sightKey !== 'learned' ? `${keyName(phrase.key)} major` : 'In a key you know'}
        </span>
      </div>
      <div className="side-block">
        <span className="eyebrow">Progress</span>
        <span className="big-counts">
          <span>
            {Math.min(tempo ? okSet.size + missed.size : cursor, events.length)}/{events.length}
            <small>{tempo ? 'Played' : 'Notes'}</small>
          </span>
          {missed.size > 0 && (
            <span className="c-learn">
              {missed.size}
              <small>Missed</small>
            </span>
          )}
        </span>
      </div>
      {tempo && (
        <div className="side-block">
          <Metronome bpm={settings.sightBpm} start={running ? running.start : null} />
        </div>
      )}
      <div className="side-block">
        <span className="eyebrow">Mode</span>
        <span>{tempo ? 'In time' : 'Wait for me'}</span>
        <span className="muted small">
          {tempo ? 'A bar of count-in, then keep going with the metronome.' : 'The cursor waits for each right note.'}
        </span>
      </div>
    </>
  );

  const right = (
    <>
      <span className="eyebrow">Options</span>
      {focus && <span className="muted small">Staff and key follow the focused practice.</span>}
      <label className="opt">
        Staff
        <select id="sr-staff" disabled={!!focus} value={sc} onChange={(e) => set('sightClef', e.target.value as SightClef)}>
          <option value="treble">Treble</option>
          <option value="bass">Bass</option>
          <option value="grand">Grand staff (both hands)</option>
          <option value="alternate">Rotate all three</option>
        </select>
      </label>
      <label className="opt">
        Length
        <select id="sr-length" value={bars} onChange={(e) => set('phraseLength', Number(e.target.value) * 4)}>
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n} bar{n > 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </label>
      {phrase.staff === 'grand' && (
        <label className="opt">
          Hands
          <select id="sr-hands" value={settings.grandStyle} onChange={(e) => set('grandStyle', e.target.value as GrandStyle)}>
            <option value="mixed">Mixed</option>
            <option value="melody">RH melody, LH held</option>
            <option value="bass-melody">LH melody, RH held</option>
            <option value="alternate">Alternating hands</option>
            <option value="together">Hands together</option>
          </select>
        </label>
      )}
      <label className="opt">
        Key
        <select id="sr-key" disabled={!!focus} value={settings.sightKey} onChange={(e) => set('sightKey', e.target.value)}>
          <option value="learned">Keys I've learned</option>
          {MAJOR_KEYS.map((k) => (
            <option key={k.key} value={k.key}>
              {keyName(k.key)} major
            </option>
          ))}
        </select>
      </label>
      <label className="opt">
        Mode
        <select id="sr-mode" value={settings.sightMode} onChange={(e) => set('sightMode', e.target.value as 'wait' | 'tempo')}>
          <option value="wait">Wait for me</option>
          <option value="tempo">In time</option>
        </select>
      </label>
      {tempo && (
        <label className="opt">
          Tempo (♩ per minute)
          <input
            id="sr-bpm"
            type="number"
            min={30}
            max={200}
            step={4}
            value={settings.sightBpm}
            onChange={(e) => set('sightBpm', Math.min(200, Math.max(30, Number(e.target.value) || 60)))}
          />
        </label>
      )}
      <label className="opt-check" title="Use rhythms from rhythm cards you've learned (otherwise quarter notes)">
        <input id="sr-rhythms" type="checkbox" checked={settings.sightRhythms} onChange={(e) => set('sightRhythms', e.target.checked)} /> Learned rhythms
      </label>
      <label className="opt-check" title="Mostly steps and skips, like real melodies, instead of leaping anywhere">
        <input id="sr-stepwise" type="checkbox" checked={settings.melodic} onChange={(e) => set('melodic', e.target.checked)} /> Stepwise melodies
      </label>
    </>
  );

  const overlay = result && (
    <div className="result-overlay">
      <div className="panel result">
        <h3>
          {result.clean === result.events ? 'Clean run' : `${Math.round((100 * result.clean) / result.events)}% right${tempo ? ' and on time' : ' first time'}`}
        </h3>
        {result.timing ? (
          <p>
            {result.events - result.timing.skipped} of {result.events} played · timing ±{Math.round(result.timing.meanAbs)}ms
            {Math.abs(result.timing.mean) > 25 ? (result.timing.mean > 0 ? ', running late' : ', rushing') : ''} · {result.misses} wrong or
            stray key{result.misses === 1 ? '' : 's'}
          </p>
        ) : (
          <p>
            {result.events} notes and chords in {(result.ms / 1000).toFixed(1)}s ({Math.round((result.events / result.ms) * 60_000)} a
            minute) · {result.misses} wrong key{result.misses === 1 ? '' : 's'}
          </p>
        )}
        {result.missed.length > 0 && (
          <p className="muted">
            Stumbled on: {result.missed.map(cardLabel).join(', ')}
            {result.flagged > 0 && `. ${result.flagged} moved up for flash-card review.`}
          </p>
        )}
      </div>
    </div>
  );

  const status = !events.length
    ? 'Turn on some decks or start the course to get phrases to read.'
    : result
      ? 'Space or Enter for the next phrase'
      : tempo
        ? running
          ? countIn
            ? 'Count-in…'
            : "Keep going, don't stop for mistakes"
          : `Press any key for a one-bar count-in at ♩ = ${settings.sightBpm}`
        : `${target.length > 1 ? `Play ${target.length} notes together · ` : ''}keep your eyes on the music`;

  return (
    <PlayScreen
      left={left}
      right={right}
      music={events.length ? <PhraseStaff phrase={phrase} events={events} marks={marks} /> : null}
      overlay={overlay}
      status={status}
      showLabels={settings.showKeyLabels}
      bottom={
        <>
          {tempo && !running && (
            <button onClick={startTempo} disabled={!events.length}>
              {result ? 'Try again' : 'Start'}
            </button>
          )}
          <button className="primary" onClick={() => setRound((r) => r + 1)}>
            {result ? 'Next phrase ⏎' : 'New phrase'}
          </button>
        </>
      }
    />
  );
}
