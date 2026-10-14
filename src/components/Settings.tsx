import { useRef } from 'react';
import { useMidiStatus } from '../hooks';
import { hub } from '../midi/input';
import { type AppData, emptyData, normalize, type Settings as S } from '../storage';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  replace: (d: AppData) => void;
}

export function Settings({ data, update, replace }: Props) {
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
    <div className="panel settings">
      <h2>Settings</h2>

      <h3>MIDI</h3>
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
        Accept the right note in any octave (for small keyboards — less strict sight-reading)
      </label>
      <label className="check">
        <input type="checkbox" checked={s.onscreenSound} onChange={(e) => set('onscreenSound', e.target.checked)} />
        Play a sound for on-screen and computer-keyboard notes
      </label>
      <p className="muted small">
        Computer keyboard: <kbd>A</kbd>–<kbd>;</kbd> are white keys from C, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd>{' '}
        <kbd>U</kbd> <kbd>O</kbd> <kbd>P</kbd> black keys; <kbd>Z</kbd>/<kbd>X</kbd> shift octave.
      </p>

      <h3>Flashcards</h3>
      <label className="field">
        New cards per day
        <input type="number" min={0} max={200} value={s.newPerDay} onChange={(e) => set('newPerDay', Math.max(0, Number(e.target.value)))} />
      </label>
      <label className="field">
        "Easy" if answered within (seconds)
        <input type="number" min={0.5} step={0.5} value={s.easyMs / 1000} onChange={(e) => set('easyMs', Number(e.target.value) * 1000)} />
      </label>
      <label className="field">
        "Good" if answered within (seconds), slower is "Hard"
        <input type="number" min={1} step={0.5} value={s.goodMs / 1000} onChange={(e) => set('goodMs', Number(e.target.value) * 1000)} />
      </label>
      <p className="muted small">Times are per note; chords get 50% extra per additional note. A wrong note is always "Again".</p>

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
    </div>
  );
}
