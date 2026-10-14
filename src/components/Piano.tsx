import { useEffect, useRef } from 'react';
import { hub } from '../midi/input';
import { isBlackKey, midiName } from '../music/notes';

interface Props {
  held: Set<number>;
  /** Keys to mark as the expected answer. */
  answer?: number[];
  /** Keys to mark as wrongly played. */
  wrong?: number[];
  low?: number;
  high?: number;
  /** Scroll so that this note is visible. */
  focus?: number;
}

const WHITE_W = 28;

/** Clickable on-screen piano used as a fallback input and to show answers. */
export function Piano({ held, answer = [], wrong = [], low = 36, high = 84, focus }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const whites: number[] = [];
  for (let n = low; n <= high; n++) if (!isBlackKey(n)) whites.push(n);
  const xOf = (n: number) => whites.indexOf(n) * WHITE_W;

  useEffect(() => {
    const el = scroller.current;
    if (!el || focus === undefined) return;
    const white = isBlackKey(focus) ? focus - 1 : focus;
    el.scrollTo({ left: xOf(white) - el.clientWidth / 2, behavior: 'smooth' });
  }, [focus]);

  const press = (note: number) => (ev: React.PointerEvent) => {
    ev.preventDefault();
    // Touch input captures the pointer implicitly; release it so pointerleave fires when sliding off a key.
    const el = ev.currentTarget as HTMLElement;
    if (el.hasPointerCapture(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
    hub.emit({ type: 'on', note, velocity: 80, source: 'screen' });
  };
  const release = (note: number) => () => {
    if (hub.held.has(note)) hub.emit({ type: 'off', note, velocity: 0, source: 'screen' });
  };

  const cls = (n: number) =>
    [
      'key',
      isBlackKey(n) ? 'black' : 'white',
      held.has(n) ? 'held' : '',
      answer.includes(n) ? 'answer' : '',
      wrong.includes(n) ? 'wrong' : '',
    ].join(' ');

  const keys = [];
  for (let n = low; n <= high; n++) {
    const black = isBlackKey(n);
    const left = black ? xOf(n - 1) + WHITE_W - 9 : xOf(n);
    keys.push(
      <div
        key={n}
        className={cls(n)}
        style={{ left }}
        title={midiName(n)}
        onPointerDown={press(n)}
        onPointerUp={release(n)}
        onPointerLeave={release(n)}
      >
        {n % 12 === 0 && <span className="key-label">{midiName(n)}</span>}
      </div>,
    );
  }
  return (
    <div className="piano-scroll" ref={scroller}>
      <div className="piano" style={{ width: whites.length * WHITE_W }}>
        {keys}
      </div>
    </div>
  );
}
