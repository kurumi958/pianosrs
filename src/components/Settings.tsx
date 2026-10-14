import { useRef } from 'react';
import { useMidiStatus } from '../hooks';
import { SchedulingSettings } from './SchedulingSettings';
import { hub } from '../midi/input';
import { type AppData, emptyData, normalize, type Settings as S } from '../storage';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  replace: (d: AppData) => void;
  /** Open the piano setup walkthrough. */
  onSetup: () => void;
}

export function Settings({ data, update, replace, onSetup }: Props) {
  const midi = useMidiStatus();
  const file = useRef<HTMLInputElement>(null);
  const s = data.settings;
  const set = <K extends keyof S>(k: K, v: S[K]) =>
    update((d) => {
      d.settings[k] = v;
    });

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pianosrs-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importData = async (f: File) => {
    try {
      const next = normalize(JSON.parse(await f.text()));
      if (confirm('Replace all current progress with this backup?')) replace(next);
    } catch (e) {
      alert(`Couldn't import: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <div className="page-inner settings">
      <header className="page-head">
        <h2>Settings</h2>
        <p>Your piano, how cards are graded, rhythm timing, and your saved progress.</p>
      </header>

      <section className="panel stack">
        <h3>Appearance</h3>
        <label className="field">
          Theme
          <select id="set-theme" value={s.theme} onChange={(e) => set('theme', e.target.value as S['theme'])}>
            <option value="system">Match my device</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>
      <section className="panel stack">
        <div className="row spread">
          <h3>MIDI</h3>
          <button className="small" onClick={onSetup}>
            Run piano setup
          </button>
        </div>
      {!midi.supported ? (
        <p className="warn">
          This browser doesn't support Web MIDI. Use Chrome or Edge (desktop or Android). You can still use the on-screen piano or your
          computer keyboard.
        </p>
      ) : !midi.enabled ? (
        <p>
          <button className="primary" onClick={() => hub.enableMidi()}>
            Connect MIDI keyboard
          </button>{' '}
          {midi.error && <span className="warn">{midi.error}</span>}
        </p>
      ) : (
        <label className="field">
          Input device
          <select value={s.midiInput} onChange={(e) => set('midiInput', e.target.value)}>
            <option value="all">All devices ({midi.devices.length} connected)</option>
            {midi.devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={s.ignoreOctave} onChange={(e) => set('ignoreOctave', e.target.checked)} />
        Accept the right note in any octave (a stopgap for keyboards with fewer than 88 keys — less strict reading)
      </label>
      <label className="check">
        <input type="checkbox" checked={s.showKeyLabels} onChange={(e) => set('showKeyLabels', e.target.checked)} />
        Label the C keys on the on-screen piano (off by default so you read the staff, not the keys)
      </label>
      <label className="check">
        <input type="checkbox" checked={s.onscreenSound} onChange={(e) => set('onscreenSound', e.target.checked)} />
        Play a sound for on-screen and computer-keyboard notes
      </label>
      <p className="muted small">
        Computer keyboard: <kbd>A</kbd>–<kbd>;</kbd> are white keys from C, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd>{' '}
        <kbd>U</kbd> <kbd>O</kbd> <kbd>P</kbd> black keys; <kbd>Z</kbd>/<kbd>X</kbd> shift octave.
      </p>
      </section>
      <section className="panel stack">
        <h3>Answer grading</h3>
      <p className="muted small">A right answer is graded by how quickly you play it. A wrong note is always "Again".</p>
      <h4>Cards you've seen before</h4>
      <label className="field">
        "Easy" if answered within (seconds)
        <input type="number" min={0.3} step={0.1} value={s.easyMs / 1000} onChange={(e) => set('easyMs', Number(e.target.value) * 1000)} />
      </label>
      <label className="field">
        "Good" if answered within (seconds), slower is "Okay"
        <input type="number" min={1} step={0.5} value={s.goodMs / 1000} onChange={(e) => set('goodMs', Number(e.target.value) * 1000)} />
      </label>
      <p className="muted small">
        Times are per note; chords get 50% extra per additional note. Easy is meant for notes you know instantly: it sends a card away for
        much longer, so most right answers should land on Good. Rhythm cards are Easy only with near-metronomic timing.
      </p>
      <label className="check">
        <input id="set-easy-learning" type="checkbox" checked={s.easyWhileLearning} onChange={(e) => set('easyWhileLearning', e.target.checked)} />
        Allow Easy on new and learning cards (off: they top out at Good, so a lucky first answer doesn't skip the learning steps)
      </label>
      <h4>New cards (the first time you see one)</h4>
      <p className="muted small">
        You have to look at a new card, work it out and then play it, so it's graded mostly on playing it right. Speed counts from its
        next review on.
      </p>
      <label className="field">
        "Good" if answered within (seconds)
        <input id="set-new-good" type="number" min={1} step={0.5} value={s.newGoodMs / 1000} onChange={(e) => set('newGoodMs', Number(e.target.value) * 1000)} />
      </label>
      <label className="field">
        "Okay" if answered within (seconds), slower is "Again"
        <input id="set-new-okay" type="number" min={2} step={1} value={s.newOkayMs / 1000} onChange={(e) => set('newOkayMs', Number(e.target.value) * 1000)} />
      </label>
      <label className="check">
        <input
          id="set-auto-known"
          type="checkbox"
          checked={s.autoKnownMs > 0}
          onChange={(e) => set('autoKnownMs', e.target.checked ? 1000 : 0)}
        />
        Mark a new card as Known when you play it right within
        <input
          id="set-auto-known-ms"
          className="inline-num"
          type="number"
          min={0.3}
          max={5}
          step={0.1}
          disabled={s.autoKnownMs === 0}
          value={(s.autoKnownMs || 1000) / 1000}
          onChange={(e) => set('autoKnownMs', Math.round(Number(e.target.value) * 1000))}
        />
        s (you could already read it)
      </label>
      </section>
      <SchedulingSettings data={data} update={update} />
      <section className="panel stack">
        <h3>Rhythm</h3>
      <label className="field">
        Tempo for rhythm cards (♩ per minute)
        <input type="number" min={30} max={200} step={4} value={s.rhythmBpm} onChange={(e) => set('rhythmBpm', Math.min(200, Math.max(30, Number(e.target.value) || 72)))} />
      </label>
      <label className="field">
        Latency adjustment (ms)
        <input type="number" min={-300} max={300} step={5} value={s.latencyMs} onChange={(e) => set('latencyMs', Number(e.target.value) || 0)} />
      </label>
      <p className="muted small">
        Speaker latency is compensated automatically. If your taps still come out consistently late, raise this by roughly the amount
        reported (e.g. "±40ms, a bit late" → try 40); if early, lower it.
      </p>
      </section>
      <section className="panel stack">
        <h3>Your data</h3>
      <p className="muted small">Progress is stored in this browser only. Export a backup to move it to another device.</p>
      <div className="row">
        <button onClick={exportData}>Export backup</button>
        <button onClick={() => file.current?.click()}>Import backup</button>
        <input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
        />
        <button
          className="danger"
          onClick={() => confirm('Erase all progress and settings? This cannot be undone.') && replace(emptyData())}
        >
          Reset everything
        </button>
      </div>
      </section>
    </div>
  );
}
