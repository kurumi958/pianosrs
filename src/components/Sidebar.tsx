import {
  BookOpen,
  ChartColumn,
  FileMusic,
  Flame,
  GraduationCap,
  House,
  Layers,
  Maximize,
  Minimize,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Piano as PianoIcon,
  Settings as SettingsIcon,
  Target,
} from 'lucide-react';
import { type ComponentType, useLayoutEffect, useRef, useState } from 'react';
import type { Tab } from '../App';
import { useMidiStatus } from '../hooks';
import { hub } from '../midi/input';
import { todayPlan } from '../srs/today';
import { weakSpots } from '../srs/weak';
import type { AppData } from '../storage';

/** Sidebar labels, where they differ from the tab's name. */
const LABEL: Partial<Record<Tab, string>> = { 'Work on': 'Things to work on' };

type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;

/** The menu, in sections like a book's table of contents. */
const SECTIONS: { title: string; items: { tab: Tab; icon: Icon }[] }[] = [
  {
    title: 'Practice',
    items: [
      { tab: 'Home', icon: House },
      { tab: 'Review', icon: Layers },
      { tab: 'Sight-read', icon: Music },
      { tab: 'Work on', icon: Target },
    ],
  },
  {
    title: 'Library',
    items: [
      { tab: 'Lessons', icon: GraduationCap },
      { tab: 'Decks', icon: BookOpen },
      { tab: 'Songs', icon: FileMusic },
    ],
  },
  {
    title: 'You',
    items: [
      { tab: 'Stats', icon: ChartColumn },
      { tab: 'Settings', icon: SettingsIcon },
    ],
  },
];

interface Props {
  data: AppData;
  tab: Tab;
  onNavigate: (t: Tab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

/** Where the bookmark ribbon sits: the top and height of the current page's menu item. */
function useRibbon(tab: Tab, collapsed: boolean) {
  const items = useRef(new Map<Tab, HTMLButtonElement>());
  const [pos, setPos] = useState<{ top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = items.current.get(tab);
    if (!el) return;
    const place = () => setPos({ top: el.offsetTop, height: el.offsetHeight });
    place();
    // Re-place once the sidebar finishes resizing (fonts loading, collapsing).
    const ro = new ResizeObserver(place);
    ro.observe(el.parentElement!);
    return () => ro.disconnect();
  }, [tab, collapsed]);
  return { pos, ref: (t: Tab) => (el: HTMLButtonElement | null) => void (el ? items.current.set(t, el) : items.current.delete(t)) };
}

export function Sidebar({ data, tab, onNavigate, collapsed, onToggleCollapsed, fullscreen, onToggleFullscreen }: Props) {
  const midi = useMidiStatus();
  const plan = todayPlan(data);
  const weak = weakSpots(data);
  const toWorkOn = new Set([...weak.sight, ...weak.leeches].map((s) => s.card.id)).size;
  const ribbon = useRibbon(tab, collapsed);

  const badge = (t: Tab) =>
    t === 'Review' && plan.total > 0 ? (
      <span className="nav-badge">{plan.total}</span>
    ) : t === 'Work on' && toWorkOn > 0 ? (
      <span className="nav-badge soft">{toWorkOn}</span>
    ) : null;

  // Today's progress: cards answered out of answered + still due.
  const done = plan.reviewedToday;
  const progress = done + plan.total ? done / (done + plan.total) : 0;
  const dueReviews = plan.counts.review + plan.counts.learning;

  const instrument = !midi.supported
    ? { name: 'No Web MIDI', detail: 'Try Chrome or Edge', state: 'off' }
    : !midi.enabled
      ? { name: 'No instrument', detail: 'Tap to connect', state: 'off' }
      : midi.devices.length
        ? {
            name: midi.devices[0].name,
            detail: midi.devices.length > 1 ? `Connected · +${midi.devices.length - 1} more` : 'Connected',
            state: 'on',
          }
        : { name: 'No instrument', detail: 'Plug in your piano', state: 'waiting' };

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Main">
      <div className="brand" title="PianoSRS">
        <span className="brand-mark" aria-hidden>
          P
        </span>
        <span className="brand-name">PianoSRS</span>
      </div>

      <div className="nav-sections">
        {ribbon.pos && <span className="ribbon" style={{ top: ribbon.pos.top, height: ribbon.pos.height }} aria-hidden />}
        {SECTIONS.map((s) => (
          <div key={s.title} className="nav-section">
            <div className="nav-heading">
              <span>{s.title}</span>
            </div>
            {s.items.map(({ tab: t, icon: Icon }) => (
              <button
                key={t}
                ref={ribbon.ref(t)}
                className={`nav-item ${t === tab ? 'active' : ''}`}
                // Drop focus after a click so playing on the computer keyboard doesn't leave a focus ring here.
                onClick={(e) => {
                  onNavigate(t);
                  e.currentTarget.blur();
                }}
                data-tip={LABEL[t] ?? t}
                aria-label={LABEL[t] ?? t}
                aria-current={t === tab ? 'page' : undefined}
              >
                <Icon size={18} strokeWidth={1.6} />
                <span className="nav-label">{LABEL[t] ?? t}</span>
                {badge(t)}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="side-foot">
        {plan.hasDecks && (
          <button className="today-mini" onClick={() => onNavigate(plan.total ? 'Review' : 'Home')}>
            <span className="today-row">
              <span className="today-title">Today</span>
              {plan.streak > 0 && (
                <span className="today-streak" title={`${plan.streak} day${plan.streak === 1 ? '' : 's'} in a row`}>
                  <Flame size={13} strokeWidth={1.8} />
                  {plan.streak}
                </span>
              )}
            </span>
            <span className="today-counts">
              {plan.total === 0 ? (
                done ? (
                  'All done'
                ) : (
                  'Nothing due'
                )
              ) : (
                <>
                  <b>{dueReviews}</b> due · <b>{plan.counts.newCount}</b> new
                </>
              )}
            </span>
            <span className="today-bar" aria-hidden>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </span>
          </button>
        )}

        <button
          className={`instrument ${instrument.state}`}
          onClick={() => (midi.enabled ? onNavigate('Settings') : hub.enableMidi())}
          title={midi.error ?? `${instrument.name} · ${instrument.detail}`}
          data-tip={instrument.name}
        >
          <span className="instrument-icon">
            <PianoIcon size={18} strokeWidth={1.6} />
            <span className="lamp" />
          </span>
          <span className="instrument-text">
            <b>{instrument.name}</b>
            <small>{instrument.detail}</small>
          </span>
        </button>

        <div className="side-tools">
          <button
            className="icon-btn"
            onClick={onToggleCollapsed}
            data-tip={collapsed ? 'Expand menu' : 'Collapse menu'}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.6} /> : <PanelLeftClose size={18} strokeWidth={1.6} />}
          </button>
          {document.fullscreenEnabled && (
            <button
              className="icon-btn"
              onClick={onToggleFullscreen}
              data-tip={fullscreen ? 'Exit full screen' : 'Full screen'}
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen ? <Minimize size={18} strokeWidth={1.6} /> : <Maximize size={18} strokeWidth={1.6} />}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
