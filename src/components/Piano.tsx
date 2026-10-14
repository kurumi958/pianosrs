import { hub } from '../midi/input';
import { isBlackKey, midiName } from '../music/notes';

interface Props {
  held: Set<number>;
  /** Keys to mark as the expected answer. */
  answer?: number[];
  /** Keys to mark as wrongly played. */
  wrong?: number[];
  /** Label the C keys. Off by default: reading should come from the staff, not the keyboard. */
  showLabels?: boolean;
}

/** Full 88-key range: A0 (21) to C8 (108). */
const LOW = 21;
const HIGH = 108;
const WHITES: number[] = [];
for (let n = LOW; n <= HIGH; n++) if (!isBlackKey(n)) WHITES.push(n);
const WHITE_W = 100 / WHITES.length; // percent of the keyboard width
const BLACK_W = WHITE_W * 0.6;

/**
 * The whole 88-key keyboard, always spanning the full width, so every key stays in the same place
 * whatever note is being played. Clickable as a fallback input, and used to show answers.
 */
export function Piano({ held, answer = [], wrong = [], showLabels = false }: Props) {
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

  const keys = [];
  for (let n = LOW; n <= HIGH; n++) {
    const black = isBlackKey(n);
    const left = black ? (WHITES.indexOf(n - 1) + 1) * WHITE_W - BLACK_W / 2 : WHITES.indexOf(n) * WHITE_W;
    const cls = ['key', black ? 'black' : 'white', held.has(n) && 'held', answer.includes(n) && 'answer', wrong.includes(n) && 'wrong']
      .filter(Boolean)
      .join(' ');
    keys.push(
      <div
        key={n}
        className={cls}
        style={{ left: `${left}%`, width: `${black ? BLACK_W : WHITE_W}%` }}
        title={midiName(n)}
        onPointerDown={press(n)}
        onPointerUp={release(n)}
        onPointerLeave={release(n)}
      >
        {showLabels && n % 12 === 0 && <span className="key-label">{midiName(n)}</span>}
      </div>,
    );
  }
  return (
    <div className="piano" aria-label="Keyboard">
      {keys}
    </div>
  );
}
