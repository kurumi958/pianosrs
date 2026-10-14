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
import { Setup } from './components/Setup';
import type { Focus } from './srs/weak';
import { type SongFocus, Songs } from './components/Songs';
import { SongPractice } from './components/SongPlay';
import { loadImportedSongs, songById, syncSongDecks } from './songs/library';
import { syncCustomDecks } from './srs/custom';
import { type LearnPlan, LearnSession } from './components/LearnSession';

export type Tab = 'Home' | 'Review' | 'Sight-read' | 'Work on' | 'Lessons' | 'Decks' | 'Songs' | 'Stats' | 'Settings' | 'Setup';

/** Screens you play on: these use the practice layout with the keyboard. (Review does once something is chosen.) */
const PLAY_TABS: Tab[] = ['Sight-read'];
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

  // Songs: the built-in ones are always there; imported ones load from the browser's database.
  const [, setLibraryVersion] = useState(0);
  const libraryChanged = useCallback(() => setLibraryVersion((v) => v + 1), []);
  useEffect(() => {
    loadImportedSongs().then(libraryChanged);
  }, [libraryChanged]);
  syncSongDecks(data.songs);
  syncCustomDecks(data.customDecks);
  const [openSong, setOpenSong] = useState<string | null>(null);
  const [songPractice, setSongPractice] = useState<SongFocus | null>(null);
  const practiceSong = songPractice ? songById(songPractice.song) : undefined;
  const practiceSongBars = (f: SongFocus) => {
    setOpenSong(f.song);
    setSongPractice(f);
    setTab('Songs');
  };
  /** What Review is showing: null for the list of lessons and decks, else the one chosen (or "all"). */
  const [reviewing, setReviewing] = useState<string | null>(null);
  /** A learning session in progress, shown over the page it was started from. */
  const [learning, setLearning] = useState<LearnPlan | null>(null);
  const startLearning = (plan: LearnPlan, deckId: string) => {
    if (!plan.cards.length) return;
    // Learning from a deck or course means studying it: its cards come back in Review.
    update((d) => {
      if (!d.settings.enabledDecks.includes(deckId)) d.settings.enabledDecks.push(deckId);
      if (deckId.startsWith('course-')) d.courses[deckId] ??= { start: 0, unlocked: 0 };
    });
    setLearning(plan);
  };
  const navigate = (t: Tab) => {
    setSongPractice(null);
    setLearning(null);
    if (t === 'Review') setReviewing(null);
    setTab(t);
  };
  const review = (key: string | null) => {
    setLearning(null);
    setReviewing(key);
    setTab('Review');
  };

  const playing = !!learning || PLAY_TABS.includes(tab) || (tab === 'Review' && reviewing !== null) || (tab === 'Songs' && !!practiceSong);

  return (
    <div className="app">
      <Sidebar
        data={data}
        tab={tab}
        onNavigate={navigate}
        collapsed={collapsed}
        onToggleCollapsed={toggleSidebar}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      <main className={playing ? 'play' : 'page'}>
        {learning && (
          <LearnSession
            key={learning.reviewKey + learning.title}
            plan={learning}
            data={data}
            update={update}
            onClose={() => setLearning(null)}
            onReview={review}
          />
        )}
        {!learning && tab === 'Home' && <Home data={data} update={update} onNavigate={navigate} onLearn={startLearning} />}
        {!learning && tab === 'Review' && (
          <Review key={reviewing ?? 'list'} data={data} update={update} onNavigate={navigate} selection={reviewing} onSelect={review} />
        )}
        {!learning && tab === 'Sight-read' && <SightRead data={data} update={update} focus={focus} onEndFocus={() => setFocus(null)} />}
        {!learning && tab === 'Work on' && (
          <WorkOn
            data={data}
            update={update}
            onPractice={(f) => {
              // A song passage is practiced in its song; anything else in focused sight-reading.
              const p = f.cards.find((c) => c.passage)?.passage;
              if (p) return practiceSongBars({ song: p.song, from: p.from, to: p.to, hands: p.hands });
              setFocus(f);
              setTab('Sight-read');
            }}
          />
        )}
        {!learning && tab === 'Lessons' && <Lessons data={data} update={update} onLearn={startLearning} />}
        {!learning && tab === 'Decks' && <Decks data={data} update={update} onLearn={startLearning} />}
        {!learning &&
          tab === 'Songs' &&
          (practiceSong && songPractice ? (
            <SongPractice
              key={`${songPractice.song}:${songPractice.from}:${songPractice.to}:${songPractice.hands}`}
              data={data}
              update={update}
              song={practiceSong}
              from={songPractice.from}
              to={songPractice.to}
              hands={songPractice.hands}
              onClose={() => setSongPractice(null)}
            />
          ) : (
            <Songs
              data={data}
              update={update}
              openSong={openSong}
              onOpen={setOpenSong}
              onPractice={practiceSongBars}
              onLibraryChange={libraryChanged}
              onLearn={startLearning}
            />
          ))}
        {!learning && tab === 'Stats' && <Stats data={data} />}
        {!learning && tab === 'Settings' && <Settings data={data} update={update} replace={replace} onSetup={() => navigate('Setup')} />}
        {!learning && tab === 'Setup' && <Setup data={data} update={update} onFinish={() => navigate('Home')} />}
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
