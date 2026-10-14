import {
  BookOpen,
  ChartColumn,
  GraduationCap,
  House,
  Layers,
  Maximize,
  Minimize,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Piano as PianoIcon,
  RotateCw,
  Settings as SettingsIcon,
} from 'lucide-react';
import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react';
import { hub, installComputerKeyboard } from './midi/input';
import { type AppData, loadData, saveData } from './storage';
import { useMidiStatus } from './hooks';
import { todayPlan } from './srs/today';
import { Home } from './components/Home';
import { Review } from './components/Review';
import { SightRead } from './components/SightRead';
import { Lessons } from './components/Lessons';
import { Decks } from './components/Decks';
import { Stats } from './components/Stats';
import { Settings } from './components/Settings';

export type Tab = 'Home' | 'Review' | 'Sight-read' | 'Lessons' | 'Decks' | 'Stats' | 'Settings';

const NAV: { tab: Tab; icon: ComponentType<{ size?: number }> }[] = [
  { tab: 'Home', icon: House },
  { tab: 'Review', icon: Layers },
  { tab: 'Sight-read', icon: Music },
  { tab: 'Lessons', icon: GraduationCap },
  { tab: 'Decks', icon: BookOpen },
  { tab: 'Stats', icon: ChartColumn },
  { tab: 'Settings', icon: SettingsIcon },
];
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
  const [portraitOk, setPortraitOk] = useState(false);
  const midi = useMidiStatus();
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
      ? 'Connect MIDI'
      : midi.devices.length
        ? midi.devices.map((d) => d.name).join(', ')
        : 'No MIDI device';
  const midiOk = midi.enabled && midi.devices.length > 0;
  const due = todayPlan(data).total;
  const playing = PLAY_TABS.includes(tab);

  return (
    <div className="app">
      <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Main">
        <div className="sidebar-head">
          <button className="icon-btn" onClick={toggleSidebar} title={collapsed ? 'Expand menu' : 'Collapse menu'} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}>
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <span className="brand">
            <span className="clef">𝄞</span>PianoSRS
          </span>
        </div>
        {NAV.map(({ tab: t, icon: Icon }, i) => (
          <div key={t}>
            {i === 3 && <div className="nav-sep" />}
            <button
              className={`nav-item ${t === tab ? 'active' : ''}`}
              // Drop focus after a click so playing on the computer keyboard doesn't leave a focus ring here.
              onClick={(e) => {
                setTab(t);
                e.currentTarget.blur();
              }} title={t} aria-current={t === tab ? 'page' : undefined}>
              <Icon size={19} />
              <span className="nav-label">{t}</span>
              {t === 'Review' && due > 0 && <span className="nav-badge">{due}</span>}
            </button>
          </div>
        ))}
        <div className="side-foot">
          <button
            className={`nav-item midi-status ${midiOk ? 'ok' : ''}`}
            onClick={() => (midi.enabled ? setTab('Settings') : hub.enableMidi())}
            title={midi.error ?? midiLabel}
          >
            {collapsed ? <PianoIcon size={19} /> : <span className="dot" />}
            <span className="nav-label side-foot-label">{midiLabel}</span>
          </button>
          {document.fullscreenEnabled && (
            <button className="nav-item" onClick={toggleFullscreen} title={fullscreen ? 'Exit full screen' : 'Full screen'}>
              {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
              <span className="nav-label">{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
            </button>
          )}
        </div>
      </nav>

      <main className={playing ? 'play' : 'page'}>
        {tab === 'Home' && <Home data={data} update={update} onNavigate={setTab} />}
        {tab === 'Review' && <Review data={data} update={update} onNavigate={setTab} />}
        {tab === 'Sight-read' && <SightRead data={data} update={update} />}
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
