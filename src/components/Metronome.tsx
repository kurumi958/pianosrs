import { useEffect, useRef } from 'react';

/** Tempo markings as printed on a mechanical metronome's scale, by the lowest BPM each starts at. */
const MARKINGS: [number, string][] = [
  [40, 'Grave'],
  [44, 'Largo'],
  [50, 'Lento'],
  [56, 'Adagio'],
  [60, 'Larghetto'],
  [66, 'Adagietto'],
  [72, 'Andante'],
  [80, 'Andantino'],
  [88, 'Maestoso'],
  [96, 'Moderato'],
  [104, 'Allegretto'],
  [116, 'Animato'],
  [132, 'Allegro'],
  [144, 'Assai'],
  [160, 'Vivace'],
  [184, 'Presto'],
  [200, 'Prestissimo'],
];

export function tempoMarking(bpm: number): string {
  let name = MARKINGS[0][1];
  for (const [min, n] of MARKINGS) if (bpm >= min) name = n;
  return name;
}

const PIVOT = { x: 50, y: 112 };
const ARM = 92;
const SWING = 22; // degrees either side

interface Props {
  /** Tempo in quarter notes per minute (what's shown). */
  bpm: number;
  /** Clicks per minute, when the pendulum should swing to a different pulse (dotted quarters in 6/8, halves in 2/2). */
  pulseBpm?: number;
  /** performance.now() time of a beat (the pendulum is at the end of its swing then), or null when stopped. */
  start: number | null;
}

/**
 * A simplified pyramid metronome: the pendulum swings in time with the clicks, reaching the end of
 * its swing on every beat, and the sliding weight sits higher for slower tempos, as on the real thing.
 */
export function Metronome({ bpm, pulseBpm, start }: Props) {
  const arm = useRef<SVGGElement>(null);
  const beatMs = 60_000 / (pulseBpm ?? bpm);
  // Weight position along the arm: near the top at 40 BPM, near the pivot at 208.
  const t = Math.min(1, Math.max(0, (bpm - 40) / (208 - 40)));
  const weightY = PIVOT.y - ARM + 10 + t * 58;

  useEffect(() => {
    const el = arm.current;
    if (!el) return;
    if (start === null) {
      el.setAttribute('transform', `rotate(0 ${PIVOT.x} ${PIVOT.y})`);
      return;
    }
    let raf = 0;
    const tick = () => {
      const phase = (performance.now() - start) / beatMs;
      const angle = phase < 0 ? SWING : SWING * Math.cos(Math.PI * phase);
      el.setAttribute('transform', `rotate(${angle.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, beatMs]);

  // Scale ticks on the plate, wider apart towards the bottom like the printed scale.
  const ticks = Array.from({ length: 9 }, (_, i) => 17 + 76 * Math.pow(i / 8, 0.85));

  return (
    <figure className="metronome" aria-label={`Metronome, ${bpm} beats per minute`}>
      <svg viewBox="0 0 100 132" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="met-wood" x1="0" x2="1">
            <stop offset="0" stopColor="#5a2a21" />
            <stop offset="0.5" stopColor="#74392c" />
            <stop offset="1" stopColor="#4d241d" />
          </linearGradient>
          <linearGradient id="met-steel" x1="0" x2="1">
            <stop offset="0" stopColor="#a3a19d" />
            <stop offset="0.5" stopColor="#ecebe7" />
            <stop offset="1" stopColor="#adaba6" />
          </linearGradient>
        </defs>
        {/* Body on a slim plinth */}
        <path d="M41 4 H59 Q62 4 62.6 7 L81 120 H19 L37.4 7 Q38 4 41 4 Z" fill="url(#met-wood)" />
        <rect x="14" y="119" width="72" height="9" rx="2.5" fill="#4d241d" />
        {/* Scale plate with gold ticks */}
        <path d="M43 11 H57 L64 100 H36 Z" fill="#1d1513" />
        {ticks.map((y, i) => {
          const half = 7 + (y - 11) * 0.08;
          return (
            <g key={i} stroke="#d4aa5c" strokeWidth="0.9">
              <line x1={50 - half} x2={50 - half + (i % 2 ? 3 : 5)} y1={y} y2={y} />
              <line x1={50 + half} x2={50 + half - (i % 2 ? 3 : 5)} y1={y} y2={y} />
            </g>
          );
        })}
        {/* Pendulum */}
        <g ref={arm}>
          <rect x={PIVOT.x - 1.2} y={PIVOT.y - ARM} width="2.4" height={ARM} rx="1.2" fill="url(#met-steel)" />
          <path d={`M${PIVOT.x - 6} ${weightY} h12 l-1.5 11 q-4.5 2.6 -9 0 Z`} fill="url(#met-steel)" stroke="#7c7a76" strokeWidth="0.5" />
        </g>
        <circle cx={PIVOT.x} cy={PIVOT.y} r="2.4" fill="#2f1612" stroke="#d4aa5c" strokeWidth="0.8" />
      </svg>
      <figcaption>
        <b className="num">{bpm}</b>
        <span>BPM · {tempoMarking(bpm)}</span>
      </figcaption>
    </figure>
  );
}
