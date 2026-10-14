import { RotateCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { hub, installComputerKeyboard } from './midi/input';
import { type AppData, loadData, saveData, setDayStartHour } from './storage';
import { fillFsrsMemory, needsFsrsMemory } from './srs/memory';
import { Home } from './components/Home';
import { Review } from './components/Review';
import { SightRead } from './components/SightRead';
import { Lessons } from './components/Lessons';
import { Decks } from './components/Decks';
import { Stats } from './components/Stats';
import { Settings } from './components/Settings';
import { WorkOn } from './components/WorkOn';
import { Sidebar } from './components/Sidebar';
import type { Focus } from './srs/weak';

export type Tab = 'Home' | 'Review' | 'Sight-read' | 'Work on' | 'Lessons' | 'Decks' | 'Stats' | 'Settings';

/** Screens you play on: these use the practice layout with the keyboard. */
const PLAY_TABS: Tab[] = ['Review', 'Sight-read'];
const SIDEBAR_KEY = 'pianosrs:sidebar';

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

/** The sidebar remembers whether it was collapsed; small screens start collapsed. */
function useSidebar(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY);
      if (saved !== null) return saved === 'collapsed';
    } catch {
      // storage unavailable
    }
    return window.innerWidth < 1000;
  });
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? 'open' : 'collapsed');
      } catch {
        // storage unavailable
      }
      return !c;
    });
  return [collapsed, toggle];
}

export function App() {
  const [data, setData] = useState<AppData>(loadData);
  const dataRef = useRef(data);
  const [tab, setTab] = useState<Tab>('Home');
  /** Focused sight-reading started from "Things to work on". */
  const [focus, setFocus] = useState<Focus | null>(null);
  const [portraitOk, setPortraitOk] = useState(false);
  const [fullscreen, toggleFullscreen] = useFullscreen();
  const [collapsed, toggleSidebar] = useSidebar();

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

  useEffect(() => {
    // The stylesheet reads data-theme; without it, the device's light/dark setting applies.
    const root = document.documentElement;
    if (data.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', data.settings.theme);
  }, [data.settings.theme]);
  // Day boundaries follow the "next day starts at" setting.
  setDayStartHour(data.settings.srs.dayStartHour);
  // With FSRS on, make sure every studied card has an FSRS memory (rebuilt from its review history).
  useEffect(() => {
    if (data.settings.srs.algorithm === 'fsrs' && needsFsrsMemory(data)) update((d) => void fillFsrsMemory(d));
  }, [data, update]);
  useEffect(() => installComputerKeyboard(), []);
  useEffect(() => {
    hub.enableMidi();
  }, []);
  useEffect(() => {
    hub.selectedInput = data.settings.midiInput;
    hub.soundForVirtual = data.settings.onscreenSound;
  }, [data.settings.midiInput, data.settings.onscreenSound]);

  const playing = PLAY_TABS.includes(tab);

  return (
    <div className="app">
      <Sidebar
        data={data}
        tab={tab}
        onNavigate={setTab}
        collapsed={collapsed}
        onToggleCollapsed={toggleSidebar}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      <main className={playing ? 'play' : 'page'}>
        {tab === 'Home' && <Home data={data} update={update} onNavigate={setTab} />}
        {tab === 'Review' && <Review data={data} update={update} onNavigate={setTab} />}
        {tab === 'Sight-read' && <SightRead data={data} update={update} focus={focus} onEndFocus={() => setFocus(null)} />}
        {tab === 'Work on' && (
          <WorkOn
            data={data}
            update={update}
            onPractice={(f) => {
              setFocus(f);
              setTab('Sight-read');
            }}
          />
        )}
        {tab === 'Lessons' && <Lessons data={data} update={update} />}
        {tab === 'Decks' && <Decks data={data} update={update} />}
        {tab === 'Stats' && <Stats data={data} />}
        {tab === 'Settings' && <Settings data={data} update={update} replace={replace} />}
      </main>

      {!portraitOk && (
        <div className="rotate-hint" role="dialog" aria-label="Rotate your device">
          <RotateCw size={48} />
          <p>
            <b>Turn your device sideways</b>
          </p>
          <p className="muted">PianoSRS is laid out for a landscape screen, with the whole keyboard across the bottom.</p>
          <button onClick={() => setPortraitOk(true)}>Use it upright anyway</button>
        </div>
      )}
    </div>
  );
}
