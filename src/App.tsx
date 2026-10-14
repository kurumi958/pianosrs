import { useCallback, useEffect, useRef, useState } from 'react';
import { hub, installComputerKeyboard } from './midi/input';
import { type AppData, loadData, saveData } from './storage';
import { useMidiStatus } from './hooks';
import { Review } from './components/Review';
import { SightRead } from './components/SightRead';
import { Decks } from './components/Decks';
import { Stats } from './components/Stats';
import { Settings } from './components/Settings';

const TABS = ['Review', 'Sight-read', 'Decks', 'Stats', 'Settings'] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [data, setData] = useState<AppData>(loadData);
  const dataRef = useRef(data);
  const [tab, setTab] = useState<Tab>('Review');
  const midi = useMidiStatus();

  /** Apply a mutation to a copy of the data synchronously, persist it, and re-render. */
  const update = useCallback((fn: (d: AppData) => void) => {
    const next = structuredClone(dataRef.current);
    fn(next);
    dataRef.current = next;
    saveData(next);
    setData(next);
  }, []);
  const replace = useCallback((d: AppData) => {
    dataRef.current = d;
    saveData(d);
    setData(d);
  }, []);

  useEffect(() => installComputerKeyboard(), []);
  useEffect(() => {
    hub.enableMidi();
  }, []);
  useEffect(() => {
    hub.selectedInput = data.settings.midiInput;
    hub.soundForVirtual = data.settings.onscreenSound;
  }, [data.settings.midiInput, data.settings.onscreenSound]);

  const midiLabel = !midi.supported
    ? 'No Web MIDI'
    : !midi.enabled
      ? 'MIDI off'
      : midi.devices.length
        ? midi.devices.map((d) => d.name).join(', ')
        : 'No MIDI device';
  const midiOk = midi.enabled && midi.devices.length > 0;

  return (
    <div className="app">
      <header>
        <h1>
          <span className="logo">𝄞</span> PianoSRS
        </h1>
        <button
          className={`midi-pill ${midiOk ? 'ok' : ''}`}
          onClick={() => (midi.enabled ? setTab('Settings') : hub.enableMidi())}
          title={midi.error ?? 'MIDI status'}
        >
          <span className="dot" /> {midiLabel}
        </button>
      </header>
      <nav>
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <main>
        {tab === 'Review' && <Review data={data} update={update} onChooseDecks={() => setTab('Decks')} />}
        {tab === 'Sight-read' && <SightRead data={data} update={update} />}
        {tab === 'Decks' && <Decks data={data} update={update} />}
        {tab === 'Stats' && <Stats data={data} />}
        {tab === 'Settings' && <Settings data={data} update={update} replace={replace} />}
      </main>
    </div>
  );
}
