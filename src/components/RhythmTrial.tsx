import { useEffect, useRef, useState } from 'react';
import { barClicks, outputLatencyMs, scheduleClicks } from '../midi/metronome';
import { COLORS, renderRhythm } from '../music/notation';
import { gradeTaps, hitWindow, matchTaps, onsets, type RhythmPattern, type TapResult } from '../music/rhythm';
import type { Grade } from '../srs/scheduler';
import { useNoteEvents } from '../hooks';

interface Props {
  pattern: RhythmPattern;
  bpm: number;
  /** Extra latency compensation from settings, in ms (positive = you tap later than the click you hear). */
  latencyMs: number;
  /** Called once per attempt with the grade and tap details. */
  onDone: (grade: Grade, result: TapResult, beatMs: number) => void;
}

type Stage = { kind: 'ready' } | { kind: 'running'; start: number } | { kind: 'done'; result: TapResult };

/**
 * A one-bar rhythm: press any key to start, hear a bar of count-in clicks, then tap the rhythm on any key
 * while the metronome keeps going. Graded on whether every note was tapped and how close to the beat.
 */
export function RhythmTrial({ pattern, bpm, latencyMs, onDone }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'ready' });
  const [beat, setBeat] = useState(-1);
  const taps = useRef<number[]>([]);
  const cancel = useRef<() => void>(() => {});
  const staff = useRef<HTMLDivElement>(null);
  const beatMs = 60_000 / bpm;
  const window_ = hitWindow(beatMs);

  // Reset when the card changes.
  useEffect(() => {
    setStage({ kind: 'ready' });
    setBeat(-1);
    return () => cancel.current();
  }, [pattern]);

  useEffect(() => {
    if (!staff.current) return;
    const colors = stage.kind === 'done' ? stage.result.errors.map((e) => (e === null ? COLORS.miss : COLORS.ok)) : [];
    renderRhythm(staff.current, pattern, colors);
  }, [pattern, stage]);

  // Count beats for the on-screen counter, and finish once the bar (plus the hit window) is over.
  useEffect(() => {
    if (stage.kind !== 'running') return;
    const barStart = stage.start + pattern.beats * beatMs;
    const end = barStart + pattern.beats * beatMs + window_;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      setBeat(Math.floor((now - stage.start) / beatMs));
      if (now < end) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const shift = outputLatencyMs() + latencyMs;
      const expected = onsets(pattern).map((b) => barStart + b * beatMs + shift);
      const result = matchTaps(expected, taps.current, window_);
      setStage({ kind: 'done', result });
      onDone(gradeTaps(result, beatMs), result, beatMs);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // onDone is intentionally read from the render that started the run.
  }, [stage]);

  useNoteEvents((e) => {
    if (e.type !== 'on') return;
    if (stage.kind === 'running') {
      taps.current.push(e.time ?? performance.now());
      return;
    }
    // Any key starts (or restarts, for practice) the count-in.
    const start = performance.now() + 300;
    taps.current = [];
    cancel.current();
    cancel.current = scheduleClicks(barClicks(start, beatMs, pattern.beats, 2));
    setStage({ kind: 'running', start });
  });

  const countIn = stage.kind === 'running' && beat < pattern.beats;
  return (
    <div className="rhythm-trial">
      <div className="rhythm-staff" ref={staff} aria-label="Rhythm to tap" />
      <div className="beats" aria-live="polite">
        {Array.from({ length: pattern.beats }, (_, i) => {
          const active = stage.kind === 'running' && beat >= 0 && beat % pattern.beats === i;
          return (
            <span key={i} className={`beat ${active ? (countIn ? 'count' : 'play') : ''}`}>
              {i + 1}
            </span>
          );
        })}
      </div>
      <p className="muted small">
        {stage.kind === 'ready' && `Press any key for a one-bar count-in at ♩ = ${bpm}, then tap the rhythm on any key.`}
        {stage.kind === 'running' && (countIn ? 'Count-in…' : 'Play!')}
        {stage.kind === 'done' && 'Press any key to try it again for practice.'}
      </p>
    </div>
  );
}
