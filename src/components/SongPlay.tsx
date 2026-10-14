import { useEffect, useMemo, useRef, useState } from 'react';
import { AttemptMatcher } from '../midi/matcher';
import { barClicks, outputLatencyMs, scheduleClicks } from '../midi/metronome';
import { barTicks, hitWindow, pulseBpm, pulsesPerBar, pulseTicks, shortestGap, tickMs, TPQ } from '../music/rhythm';
import { TempoJudge } from '../music/tempo';
import { gradePassage, limitEasy } from '../srs/grading';
import type { Passage } from '../srs/cards';
import type { CardStatus, Grade } from '../srs/scheduler';
import type { Song } from '../songs/library';
import { BAR_HISTORY, barOutcomes, type PlayState, playColors, tieChains, weakBars } from '../songs/play';
import { barsLabel, type Hands, HANDS_LABEL, scoreEvents } from '../songs/score';
import type { AppData } from '../storage';
import { useNoteEvents, useShowOnKeyboard } from '../hooks';
import { Metronome } from './Metronome';
import { PlayScreen } from './PlayScreen';
import { ScoreView } from './ScoreView';

export interface PlayResult {
  events: number;
  /** Events with a wrong key (wait) or not played right and on time (in time). */
  missed: Set<number>;
  wrongKeys: number;
  ms: number;
  /** Wait mode: time between consecutive right answers. */
  gaps: number[];
  timing?: { meanAbs: number; mean: number; skipped: number };
}

interface PlayOptions {
  song: Song;
  from: number;
  to: number;
  hands: Hands;
  mode: 'wait' | 'tempo';
  /** Quarter notes per minute, for in-time mode. */
  bpm: number;
  latencyMs: number;
  ignoreOctave: boolean;
  onFinish: (r: PlayResult) => void;
}

/** Playing a passage: wait-for-me (the cursor waits for the right keys) or in time with a count-in and metronome. */
function usePassagePlay({ song, from, to, hands, mode, bpm, latencyMs, ignoreOctave, onFinish }: PlayOptions) {
  const { score } = song;
  const events = useMemo(() => scoreEvents(score, from, to, hands), [score, from, to, hands]);
  const chains = useMemo(() => tieChains(score), [score]);
  const [cursor, setCursor] = useState(0);
  const [missed, setMissed] = useState<Set<number>>(new Set());
  const [ok, setOk] = useState<Set<number> | undefined>(undefined);
  const [wrong, setWrong] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState<{ start: number; judge: TempoJudge; countInEnd: number } | null>(null);
  const [countIn, setCountIn] = useState(false);
  // Read by key presses, which can come faster than renders: refs, mirrored into state for drawing.
  const cursorRef = useRef(0);
  const missedRef = useRef<Set<number>>(new Set());
  const matcher = useRef<AttemptMatcher | null>(null);
  const startedAt = useRef<number | null>(null);
  const lastAt = useRef<number | null>(null);
  const gaps = useRef<number[]>([]);
  const wrongKeys = useRef(0);
  const stopClicks = useRef<() => void>(() => {});
  /** When the last run ended: a late last note shouldn't start the next run straight away. */
  const finishedAt = useRef(0);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const matcherFor = (i: number) => (events[i] ? new AttemptMatcher(events[i].midis, ignoreOctave) : null);
  const reset = () => {
    stopClicks.current();
    cursorRef.current = 0;
    missedRef.current = new Set();
    setCursor(0);
    setMissed(new Set());
    setOk(undefined);
    setWrong([]);
    setDone(false);
    setRunning(null);
    setCountIn(false);
    startedAt.current = null;
    lastAt.current = null;
    gaps.current = [];
    wrongKeys.current = 0;
    matcher.current = matcherFor(0);
  };
  useEffect(reset, [events, mode, ignoreOctave]);
  useEffect(() => () => stopClicks.current(), []);

  // --- In time: a bar of count-in, then every event is judged on pitch and timing.
  const first = score.measures[from];
  const meter = first.meter;
  const msPerTick = tickMs(bpm);
  const startTempo = () => {
    const start = performance.now() + 300;
    const full = barTicks(meter);
    // A pickup bar starts partway through: count in a full bar, then come in on the right beat.
    const lead = full + (full - first.length);
    const zero = first.start;
    const shift = outputLatencyMs() + latencyMs;
    const timed = events.map((e) => ({ at: start + (lead + e.time - zero) * msPerTick + shift, pitches: e.midis }));
    const judge = new TempoJudge(timed, hitWindow(TPQ * msPerTick, shortestGap(events.map((e) => e.time)) * msPerTick), ignoreOctave);
    // Clicks from the count-in to the end of the last bar, accenting each barline.
    const endTick = lead + score.measures[to].start + score.measures[to].length - zero;
    stopClicks.current();
    stopClicks.current = scheduleClicks(barClicks(start, pulseTicks(meter) * msPerTick, pulsesPerBar(meter), Math.ceil(endTick / full)));
    wrongKeys.current = 0;
    setMissed(new Set());
    setOk(new Set());
    setDone(false);
    setRunning({ start, judge, countInEnd: start + full * msPerTick });
  };

  useEffect(() => {
    if (!running) return;
    const { judge, start, countInEnd } = running;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      setCountIn(now < countInEnd);
      judge.tick(now);
      setCursor(judge.current(now));
      // Only redraw when a note's state changes, not every frame.
      const misses = judge.status.filter((st) => st === 'miss').length;
      const oks = judge.status.filter((st) => st === 'ok').length;
      setMissed((m) => (m.size === misses ? m : new Set(judge.status.flatMap((st, i) => (st === 'miss' ? [i] : [])))));
      setOk((o) => (o?.size === oks ? o : new Set(judge.status.flatMap((st, i) => (st === 'ok' ? [i] : [])))));
      if (!judge.finished(now)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      stopClicks.current();
      finishedAt.current = now;
      setRunning(null);
      setCountIn(false);
      setDone(true);
      const errs = judge.errors.filter((e): e is number => e !== null);
      const miss = new Set(judge.status.flatMap((st, i) => (st === 'ok' ? [] : [i])));
      finishRef.current({
        events: events.length,
        missed: miss,
        wrongKeys: judge.wrong + judge.extra,
        ms: now - start,
        gaps: [],
        timing: {
          meanAbs: errs.length ? errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length : 0,
          mean: errs.length ? errs.reduce((a, e) => a + e, 0) / errs.length : 0,
          skipped: judge.errors.filter((e) => e === null).length,
        },
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const noteOn = (note: number, time: number) => {
    if (performance.now() - finishedAt.current < 1200) return; // let the result show before starting again
    if (mode === 'tempo') {
      if (running) {
        const r = running.judge.noteOn(note, time);
        setWrong(r.right ? [] : [note]);
      } else {
        reset();
        startTempo(); // any key starts the count-in
      }
      return;
    }
    if (done) {
      reset(); // any key after finishing starts again
      return;
    }
    if (!matcher.current) return;
    const now = performance.now();
    startedAt.current ??= now;
    const at = cursorRef.current;
    const r = matcher.current.noteOn(note);
    if (r === 'wrong') {
      wrongKeys.current++;
      setWrong([note]);
      missedRef.current = new Set(missedRef.current).add(at);
      setMissed(missedRef.current);
      matcher.current = matcherFor(at);
    } else if (r === 'correct') {
      if (lastAt.current !== null) gaps.current.push(now - lastAt.current);
      lastAt.current = now;
      setWrong([]);
      const next = at + 1;
      cursorRef.current = next;
      setCursor(next);
      matcher.current = matcherFor(next);
      if (next >= events.length) {
        finishedAt.current = now;
        setDone(true);
        finishRef.current({ events: events.length, missed: missedRef.current, wrongKeys: wrongKeys.current, ms: now - startedAt.current, gaps: gaps.current });
      }
    }
  };

  const state: PlayState = { cursor, missed, ok };
  const colors = useMemo(() => playColors(events, chains, state), [events, chains, cursor, missed, ok]);
  return { events, colors, wrong, done, running: !!running, startedAt: running?.start ?? null, countIn, noteOn, reset, current: events[cursor] };
}

/** The staves a hand doesn't use, to draw faded while practicing the other hand. */
function otherStaves(song: Song, hands: Hands): number[] {
  if (hands === 'both') return [];
  const keep = new Set(song.score.notes.filter((n) => n.hand === hands).map((n) => n.staff));
  return Array.from({ length: song.score.staves }, (_, i) => i).filter((i) => !keep.has(i));
}

/** Record which bars went cleanly, for the song's bar strip and "bars to work on". */
export function recordBars(d: AppData, songId: string, outcomes: Map<number, boolean>): void {
  const bars = (d.songBars[songId] ??= {});
  for (const [m, slip] of outcomes) bars[m] = [...(bars[m] ?? []), slip ? 1 : 0].slice(-BAR_HISTORY);
}

// ---------------------------------------------------------------------------------------------
// A passage flash card in Review.

interface TrialProps {
  song: Song;
  passage: Passage;
  status: CardStatus;
  data: AppData;
  onDone: (grade: Grade, detail: string, ms: number, outcomes: Map<number, boolean>) => void;
}

/** A passage card: play the bars through (the cursor waits for you); the grade comes from slips and hesitations. */
export function PassageTrial({ song, passage, status, data, onDone }: TrialProps) {
  const graded = useRef(false);
  const s = data.settings;
  const play = usePassagePlay({
    song,
    from: passage.from,
    to: passage.to,
    hands: passage.hands,
    mode: 'wait',
    bpm: 60,
    latencyMs: s.latencyMs,
    ignoreOctave: s.ignoreOctave,
    onFinish: (r) => {
      if (graded.current) return; // replays after grading are just practice
      graded.current = true;
      const grade = limitEasy(gradePassage(r.events, r.missed.size, r.gaps, s), status, s.easyWhileLearning);
      const slips = r.missed.size;
      const detail = slips ? `${slips} slip${slips === 1 ? '' : 's'} in ${r.events} notes` : `clean, ${(r.ms / 1000).toFixed(1)}s`;
      onDone(grade, detail, r.ms, barOutcomes(play.events, r.missed));
    },
  });
  useShowOnKeyboard(play.wrong.length && play.current ? play.current.midis : [], play.wrong);
  useNoteEvents((e) => e.type === 'on' && play.noteOn(e.note, e.time ?? performance.now()));
  return (
    <ScoreView
      xml={song.xml}
      from={passage.from}
      to={passage.to}
      colors={play.colors}
      dimStaves={otherStaves(song, passage.hands)}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Free practice of any bars of a song.

interface PracticeProps {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  song: Song;
  from: number;
  to: number;
  hands: Hands;
  onClose: () => void;
}

export function SongPractice({ data, update, song, from: from0, to: to0, hands: hands0, onClose }: PracticeProps) {
  const { score } = song;
  const n = score.measures.length;
  const [from, setFrom] = useState(from0);
  const [to, setTo] = useState(to0);
  const [hands, setHands] = useState<Hands>(hands0);
  const [mode, setMode] = useState<'wait' | 'tempo'>('wait');
  const opts = data.songs[song.id];
  const bpm = opts?.tempo ?? Math.round((score.tempo ?? 80) * 0.7);
  const [result, setResult] = useState<PlayResult | null>(null);
  const s = data.settings;
  const play = usePassagePlay({
    song,
    from,
    to,
    hands,
    mode,
    bpm,
    latencyMs: s.latencyMs,
    ignoreOctave: s.ignoreOctave,
    onFinish: (r) => {
      setResult(r);
      update((d) => recordBars(d, song.id, barOutcomes(play.events, r.missed)));
    },
  });
  useEffect(() => setResult(null), [from, to, hands, mode]);
  useShowOnKeyboard(play.wrong.length && play.current && mode === 'wait' ? play.current.midis : [], play.wrong);
  useNoteEvents((e) => {
    if (e.type !== 'on') return;
    if (play.done || (mode === 'tempo' && !play.running)) setResult(null);
    play.noteOn(e.note, e.time ?? performance.now());
  });
  const weak = weakBars(data.songBars[song.id]);
  const label = (i: number) => score.measures[i].number;
  const setBpm = (v: number) =>
    update((d) => {
      d.songs[song.id] = { ...(d.songs[song.id] ?? { bars: 2, separateHands: true }), tempo: v };
    });

  const status = result
    ? result.missed.size
      ? `${result.events - result.missed.size} of ${result.events} right${result.timing ? ` · ±${Math.round(result.timing.meanAbs)}ms` : ''}. Play any key to go again.`
      : `Clean run${result.timing ? ` · ±${Math.round(result.timing.meanAbs)}ms` : ` in ${(result.ms / 1000).toFixed(1)}s`}! Play any key to go again.`
    : mode === 'tempo'
      ? play.running
        ? play.countIn
          ? 'Count-in…'
          : 'Play!'
        : `Press any key for a one-bar count-in at ♩ = ${bpm}.`
      : play.wrong.length
        ? 'Not that one: the right keys are lit below.'
        : `${barsLabel(score, from, to)} · ${HANDS_LABEL[hands].toLowerCase()}`;

  const left = (
    <>
      <div className="side-block">
        <span className="eyebrow">Song</span>
        <b>{song.title}</b>
        <span className="muted small">{song.composer}</span>
      </div>
      <div className="side-block">
        <span className="eyebrow">Playing</span>
        <span>{barsLabel(score, from, to)}</span>
        <span className="muted small">{HANDS_LABEL[hands]}</span>
      </div>
      {weak.length > 0 && (
        <div className="side-block">
          <span className="eyebrow">Bars to work on</span>
          <div className="bar-chips">
            {weak.map((m) => (
              <button
                key={m}
                className="chip"
                onClick={() => {
                  setFrom(m);
                  setTo(m);
                }}
              >
                {label(m)}
              </button>
            ))}
          </div>
        </div>
      )}
      {mode === 'tempo' && <Metronome bpm={bpm} pulseBpm={pulseBpm(score.measures[from].meter, bpm)} start={play.startedAt} />}
    </>
  );

  const right = (
    <>
      <label className="opt">
        From bar
        <select id="sp-from" value={from} onChange={(e) => {
          const v = Number(e.target.value);
          setFrom(v);
          if (to < v) setTo(v);
        }}>
          {score.measures.map((m) => (
            <option key={m.index} value={m.index}>
              {m.number}
            </option>
          ))}
        </select>
      </label>
      <label className="opt">
        To bar
        <select id="sp-to" value={to} onChange={(e) => setTo(Math.max(from, Number(e.target.value)))}>
          {score.measures.filter((m) => m.index >= from).map((m) => (
            <option key={m.index} value={m.index}>
              {m.number}
            </option>
          ))}
        </select>
      </label>
      <label className="opt">
        Hands
        <select id="sp-hands" value={hands} onChange={(e) => setHands(e.target.value as Hands)}>
          <option value="rh">Right hand</option>
          <option value="lh">Left hand</option>
          <option value="both">Hands together</option>
        </select>
      </label>
      <label className="opt">
        Mode
        <select id="sp-mode" value={mode} onChange={(e) => setMode(e.target.value as 'wait' | 'tempo')}>
          <option value="wait">Wait for me</option>
          <option value="tempo">In time</option>
        </select>
      </label>
      {mode === 'tempo' && (
        <label className="opt">
          Tempo (♩ per minute)
          <input id="sp-bpm" type="number" min={30} max={200} step={4} value={bpm} onChange={(e) => setBpm(Math.min(200, Math.max(30, Number(e.target.value) || 60)))} />
        </label>
      )}
    </>
  );

  return (
    <PlayScreen
      left={left}
      right={right}
      music={
        play.events.length ? (
          <ScoreView
            xml={song.xml}
            from={from}
            to={to}
            colors={play.colors}
            dimStaves={otherStaves(song, hands)}
          />
        ) : (
          <div className="result panel">
            <p>Nothing for the {HANDS_LABEL[hands].toLowerCase()} to play in these bars.</p>
          </div>
        )
      }
      status={status}
      statusTone={result ? (result.missed.size ? 'wrong' : 'correct') : play.wrong.length ? 'wrong' : ''}
      showLabels={s.showKeyLabels}
      bottom={
        <>
          <button onClick={onClose}>← Back to the song</button>
          <button
            onClick={() => {
              setResult(null);
              play.reset();
            }}
          >
            Start over
          </button>
          {to < n - 1 && (
            <button
              className="primary"
              onClick={() => {
                const len = to - from + 1;
                setFrom(to + 1);
                setTo(Math.min(n - 1, to + len));
              }}
            >
              Next bars →
            </button>
          )}
        </>
      }
    />
  );
}
