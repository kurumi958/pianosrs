import { Check, Piano as PianoIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMidiStatus, useNoteEvents } from '../hooks';
import { hub } from '../midi/input';
import { outputLatencyMs, scheduleClicks } from '../midi/metronome';
import { midiName } from '../music/notes';
import type { AppData } from '../storage';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  onFinish: () => void;
}

const STEPS = ['Connect', 'Test a key', 'Keyboard size', 'Timing', 'Ready'] as const;

/** Clicks in the timing check: a bar of count-in, then taps on these. */
const COUNT_IN = 4;
const TAPS = 8;
const CHECK_BPM = 80;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** First steps with your piano: connect it, check it sends the right notes, find its range and calibrate timing. */
export function Setup({ data, update, onFinish }: Props) {
  const midi = useMidiStatus();
  const [step, setStep] = useState(0);
  const [lastNote, setLastNote] = useState<{ note: number; velocity: number; source: string } | null>(null);
  const [range, setRange] = useState<[number, number] | null>(data.settings.keyboardRange ?? null);
  const [timing, setTiming] = useState<{ running: boolean; clicks: number[]; taps: number[]; result: number | null }>({
    running: false,
    clicks: [],
    taps: [],
    result: null,
  });
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  const set = <K extends keyof AppData['settings']>(k: K, v: AppData['settings'][K]) =>
    update((d) => {
      d.settings[k] = v;
    });

  useNoteEvents((e) => {
    if (e.type !== 'on') return;
    setLastNote({ note: e.note, velocity: e.velocity, source: e.source });
    if (step === 2) setRange((r) => (r ? [Math.min(r[0], e.note), Math.max(r[1], e.note)] : [e.note, e.note]));
    if (step === 3 && timing.running) setTiming((t) => ({ ...t, taps: [...t.taps, e.time ?? performance.now()] }));
  });

  const startTiming = () => {
    const beat = 60_000 / CHECK_BPM;
    const start = performance.now() + 400;
    const clicks = Array.from({ length: COUNT_IN + TAPS }, (_, i) => start + i * beat);
    stop.current();
    stop.current = scheduleClicks(clicks.map((at, i) => ({ at, accent: i % 4 === 0 })));
    setTiming({ running: true, clicks: clicks.slice(COUNT_IN), taps: [], result: null });
    window.setTimeout(() => setTiming((t) => ({ ...t, running: false })), clicks[clicks.length - 1] - performance.now() + beat / 2);
  };
  // Once the clicks are over: each click's nearest tap, minus what the speakers add, is your offset.
  useEffect(() => {
    if (timing.running || !timing.clicks.length || timing.result !== null) return;
    const beat = 60_000 / CHECK_BPM;
    const out = outputLatencyMs();
    const offsets = timing.clicks
      .map((c) =>
        timing.taps.reduce<number | null>(
          (best, t) => (Math.abs(t - c) < beat / 2 && (best === null || Math.abs(t - c) < Math.abs(best)) ? t - c : best),
          null,
        ),
      )
      .filter((x): x is number => x !== null)
      .map((x) => x - out);
    setTiming((t) => ({ ...t, result: offsets.length >= TAPS / 2 ? Math.round(median(offsets) / 5) * 5 : NaN }));
  }, [timing]);

  const keys = range ? range[1] - range[0] + 1 : 0;
  const full = range && range[0] <= 21 && range[1] >= 108;
  const finish = () => {
    update((d) => {
      d.settings.setupDone = true;
      if (range && keys > 12) d.settings.keyboardRange = range;
    });
    onFinish();
  };

  return (
    <div className="page-inner setup">
      <header className="page-head">
        <h2>Set up your piano</h2>
        <p>A couple of minutes to check your piano talks to the app: the connection, the notes it sends, its size, and timing.</p>
      </header>
      <ol className="steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
            <button onClick={() => setStep(i)}>
              <span className="step-num">{i < step ? <Check size={13} /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <section className="panel stack setup-step">
        {step === 0 && (
          <>
            <h3>Connect your piano</h3>
            <p>
              Plug the piano's USB port (often labelled <i>USB to Host</i>) into this computer, or into a phone or tablet with a USB-OTG
              adapter. Digital pianos need no driver. Then allow MIDI when the browser asks.
            </p>
            {!midi.supported ? (
              <p className="warn">
                This browser can't use MIDI. Use Chrome or Edge (on a computer or Android). You can still finish setup and use the on-screen
                piano or your computer keyboard.
              </p>
            ) : (
              <div className={`instrument-check ${midi.devices.length ? 'ok' : ''}`}>
                <PianoIcon size={22} />
                <span>
                  <b>
                    {midi.devices.length
                      ? midi.devices.map((d) => d.name).join(', ')
                      : midi.enabled
                        ? 'No piano found yet'
                        : 'Not connected'}
                  </b>
                  <small className="muted">
                    {midi.devices.length
                      ? 'Connected. If it shows a generic name like "USB-MIDI", that is normal.'
                      : midi.enabled
                        ? 'Check the cable and that the piano is switched on; it appears here as soon as it is.'
                        : 'Allow MIDI access to look for it.'}
                  </small>
                </span>
                {!midi.enabled && (
                  <button className="primary" onClick={() => hub.enableMidi()}>
                    Allow MIDI
                  </button>
                )}
              </div>
            )}
            {midi.error && <p className="warn small">{midi.error}</p>}
          </>
        )}

        {step === 1 && (
          <>
            <h3>Play middle C</h3>
            <p>
              Middle C is the C nearest the middle of the keyboard, usually just left of the brand name. Play it, then a few other keys.
            </p>
            <div className="note-readout" aria-live="polite">
              {lastNote ? (
                <>
                  <b>{midiName(lastNote.note)}</b>
                  <small className="muted">
                    {lastNote.source === 'midi'
                      ? `from your piano, velocity ${lastNote.velocity}`
                      : 'from the on-screen or computer keyboard'}
                  </small>
                </>
              ) : (
                <span className="muted">Waiting for a key…</span>
              )}
            </div>
            {lastNote && (
              <p className={lastNote.note === 60 ? 'ok-text' : 'muted'}>
                {lastNote.note === 60
                  ? '✓ That is middle C (C4). Your piano sends the right notes.'
                  : Math.abs(lastNote.note - 60) % 12 === 0
                    ? `That is ${midiName(lastNote.note)}, an octave ${lastNote.note > 60 ? 'above' : 'below'} middle C. If you played middle C, your piano's transpose or octave setting is on: reset it on the piano.`
                    : "If that was middle C, check the piano isn't transposed. Otherwise, try middle C."}
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h3>How big is your keyboard?</h3>
            <p>Play the lowest key, then the highest key.</p>
            <div className="note-readout" aria-live="polite">
              {range ? (
                <>
                  <b>
                    {midiName(range[0])} – {midiName(range[1])}
                  </b>
                  <small className="muted">{keys} keys so far</small>
                </>
              ) : (
                <span className="muted">Waiting for the lowest key…</span>
              )}
            </div>
            {range && keys > 12 && (
              <p className={full ? 'ok-text' : 'muted'}>
                {full
                  ? '✓ A full 88-key piano, which is what PianoSRS is built for.'
                  : `PianoSRS is built for 88 keys, and some notes in lessons and songs may fall outside your ${keys}-key range. Until smaller keyboards are fully supported, you can accept notes in any octave.`}
              </p>
            )}
            {range && !full && keys > 12 && (
              <label className="check">
                <input type="checkbox" checked={data.settings.ignoreOctave} onChange={(e) => set('ignoreOctave', e.target.checked)} />
                Accept the right note in any octave
              </label>
            )}
            {range && (
              <button className="small link" onClick={() => setRange(null)}>
                Start over
              </button>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h3>Check your timing</h3>
            <p>
              Rhythm cards and playing in time measure when you press each key. Speakers, Bluetooth and the piano itself all add a little
              delay, so tap along to measure yours: after four count-in clicks, play any key exactly on each of the next {TAPS} clicks.
            </p>
            <div className="row">
              <button className="primary" disabled={timing.running} onClick={startTiming}>
                {timing.running ? `Tap along… ${Math.min(timing.taps.length, TAPS)}/${TAPS}` : timing.clicks.length ? 'Try again' : 'Start'}
              </button>
              <span className="muted small">Current adjustment: {data.settings.latencyMs} ms</span>
            </div>
            {timing.result !== null &&
              (Number.isNaN(timing.result) ? (
                <p className="warn">Not enough taps landed near the clicks. Try again, tapping right on each click.</p>
              ) : (
                <div className="row">
                  <p className={Math.abs(timing.result) <= 15 ? 'ok-text' : ''}>
                    {Math.abs(timing.result) <= 15
                      ? `✓ You tapped within ${Math.abs(timing.result)} ms of the clicks: no adjustment needed.`
                      : `You tapped about ${Math.abs(timing.result)} ms ${timing.result > 0 ? 'late' : 'early'}.`}
                  </p>
                  {Math.abs(timing.result) > 15 && (
                    <button onClick={() => set('latencyMs', Math.max(-300, Math.min(300, timing.result!)))}>
                      Adjust timing by {timing.result} ms
                    </button>
                  )}
                </div>
              ))}
          </>
        )}

        {step === 4 && (
          <>
            <h3>You're ready</h3>
            <ul className="ready-list">
              <li>
                {midi.devices.length
                  ? `Piano: ${midi.devices[0].name}`
                  : 'No piano connected: the on-screen and computer keyboards still work.'}
              </li>
              <li>
                {range && keys > 12 ? `Keyboard: ${keys} keys (${midiName(range[0])}–${midiName(range[1])})` : 'Keyboard size not checked.'}
              </li>
              <li>Timing adjustment: {data.settings.latencyMs} ms</li>
            </ul>
            <label className="check">
              <input type="checkbox" checked={data.settings.midiSound} onChange={(e) => set('midiSound', e.target.checked)} />
              Play my piano through this computer too (to practice with headphones plugged into the computer)
            </label>
            <label className="check">
              <input type="checkbox" checked={data.settings.onscreenSound} onChange={(e) => set('onscreenSound', e.target.checked)} />
              Play a sound for on-screen and computer-keyboard notes
            </label>
            <p className="muted small">You can run this again any time from Settings.</p>
          </>
        )}
      </section>

      <div className="row spread">
        <button className="link small" onClick={finish}>
          {step < 4 ? 'Skip setup' : ''}
        </button>
        <div className="row">
          {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
          {step < 4 ? (
            <button className="primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <button className="primary" onClick={finish}>
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
