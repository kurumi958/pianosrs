import { useCallback, useEffect, useRef, useState } from 'react';
import { hub, installComputerKeyboard } from './midi/input';
import { type AppData, loadData, saveData } from './storage';
import { useHeldNotes, useKeyMarks, useMidiStatus } from './hooks';
import { Review } from './components/Review';
import { SightRead } from './components/SightRead';
import { Decks } from './components/Decks';
import { Stats } from './components/Stats';
import { Settings } from './components/Settings';
import { Piano } from './components/Piano';

const TABS = ['Review', 'Sight-read', 'Decks', 'Stats', 'Settings'] as const;
type Tab = (typeof TABS)[number];
/** Tabs you play on: these show the keyboard. The others are pages you read and scroll. */
const PLAY_TABS: Tab[] = ['Review', 'Sight-read'];

function useFullscreen(): [boolean, () => void] {
  const [on, setOn] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        // Phones and tablets: hold landscape while in full screen (only allowed in full screen, and not everywhere).
        const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        await orientation.lock?.('landscape').catch(() => {});
      }
    } catch {
      // Full screen refused (e.g. inside an embedded frame); the layout works without it.
    }
  };
  return [on, toggle];
}

export function App() {
  const [data, setData] = useState<AppData>(loadData);
  const dataRef = useRef(data);
  const [tab, setTab] = useState<Tab>('Review');
  const [portraitOk, setPortraitOk] = useState(false);
  const midi = useMidiStatus();
  const held = useHeldNotes();
  const marks = useKeyMarks();
  const [fullscreen, toggleFullscreen] = useFullscreen();

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
  const playing = PLAY_TABS.includes(tab);

  return (
    <div className={`app ${playing ? 'with-keyboard' : ''}`}>
      <header className="topbar">
        <h1>
          <span className="logo">𝄞</span> PianoSRS
        </h1>
        <nav>
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <button
          className={`midi-pill ${midiOk ? 'ok' : ''}`}
          onClick={() => (midi.enabled ? setTab('Settings') : hub.enableMidi())}
          title={midi.error ?? 'MIDI status'}
        >
          <span className="dot" /> {midiLabel}
        </button>
        {document.fullscreenEnabled && (
          <button className="icon-btn" onClick={toggleFullscreen} title={fullscreen ? 'Exit full screen' : 'Full screen'} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}>
            {fullscreen ? '⤡' : '⤢'}
          </button>
        )}
      </header>

      <main className={playing ? 'play' : 'page'}>
        {tab === 'Review' && <Review data={data} update={update} onChooseDecks={() => setTab('Decks')} />}
        {tab === 'Sight-read' && <SightRead data={data} update={update} />}
        {tab === 'Decks' && <Decks data={data} update={update} />}
        {tab === 'Stats' && <Stats data={data} />}
        {tab === 'Settings' && <Settings data={data} update={update} replace={replace} />}
      </main>

      {playing && (
        <footer className="keyboard-dock">
          <Piano held={held} answer={marks.answer} wrong={marks.wrong} showLabels={data.settings.showKeyLabels} />
        </footer>
      )}

      {!portraitOk && (
        <div className="rotate-hint" role="dialog" aria-label="Rotate your device">
          <div className="rotate-icon" aria-hidden="true">
            ⟳
          </div>
          <p>
            <b>Turn your device sideways</b>
          </p>
          <p className="muted">PianoSRS is laid out for a landscape screen, with the whole keyboard along the bottom.</p>
          <button onClick={() => setPortraitOk(true)}>Use it upright anyway</button>
        </div>
      )}
    </div>
  );
}
