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

const PIVOT = { x: 60, y: 122 };
const ARM = 98;
const SWING = 24; // degrees either side

interface Props {
  bpm: number;
  /** performance.now() time of a beat (the pendulum is at the end of its swing then), or null when stopped. */
  start: number | null;
}

/**
 * A simplified pyramid metronome: the pendulum swings in time with the clicks, reaching the end of
 * its swing on every beat, and the sliding weight sits higher for slower tempos, as on the real thing.
 */
export function Metronome({ bpm, start }: Props) {
  const arm = useRef<SVGGElement>(null);
  const beatMs = 60_000 / bpm;
  // Weight position along the arm: near the top at 40 BPM, near the pivot at 208.
  const t = Math.min(1, Math.max(0, (bpm - 40) / (208 - 40)));
  const weightY = PIVOT.y - ARM + 10 + t * 62;

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
  const ticks = Array.from({ length: 11 }, (_, i) => 20 + 80 * Math.pow(i / 10, 0.8));

  return (
    <figure className="metronome" aria-label={`Metronome, ${bpm} beats per minute`}>
      <svg viewBox="0 0 120 168" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="met-wood" x1="0" x2="1">
            <stop offset="0" stopColor="#4a231c" />
            <stop offset="0.45" stopColor="#6b3327" />
            <stop offset="1" stopColor="#3d1c17" />
          </linearGradient>
          <linearGradient id="met-steel" x1="0" x2="1">
            <stop offset="0" stopColor="#9a9a9a" />
            <stop offset="0.5" stopColor="#e8e6e2" />
            <stop offset="1" stopColor="#a7a5a1" />
          </linearGradient>
        </defs>
        {/* Body and base */}
        <path d="M44 6 H76 Q80 6 81 10 L104 136 H16 L39 10 Q40 6 44 6 Z" fill="url(#met-wood)" />
        <rect x="10" y="128" width="100" height="36" rx="4" fill="#4a231c" />
        <rect x="10" y="128" width="100" height="5" fill="#2f1612" opacity="0.6" />
        {/* Scale plate with gold ticks */}
        <path d="M47 14 H73 L80 112 H40 Z" fill="#1d1513" />
        {ticks.map((y, i) => {
          const half = 13 + (y - 14) * 0.2;
          return <line key={i} x1={60 - half + 3} x2={60 - half + (i % 2 ? 7 : 10)} y1={y} y2={y} stroke="#d4aa5c" strokeWidth="1.2" />;
        })}
        {ticks.map((y, i) => {
          const half = 13 + (y - 14) * 0.2;
          return <line key={`r${i}`} x1={60 + half - 3} x2={60 + half - (i % 2 ? 7 : 10)} y1={y} y2={y} stroke="#d4aa5c" strokeWidth="1.2" />;
        })}
        {/* Pendulum */}
        <g ref={arm}>
          <rect x={PIVOT.x - 1.6} y={PIVOT.y - ARM} width="3.2" height={ARM} rx="1.4" fill="url(#met-steel)" />
          <path
            d={`M${PIVOT.x - 9} ${weightY} h18 l-2 16 q-7 4 -14 0 Z`}
            fill="url(#met-steel)"
            stroke="#7c7a76"
            strokeWidth="0.6"
          />
          <line x1={PIVOT.x - 8} x2={PIVOT.x + 8} y1={weightY + 5} y2={weightY + 5} stroke="#8d8b87" strokeWidth="0.8" />
          <line x1={PIVOT.x - 7.5} x2={PIVOT.x + 7.5} y1={weightY + 8} y2={weightY + 8} stroke="#8d8b87" strokeWidth="0.8" />
        </g>
        <circle cx={PIVOT.x} cy={PIVOT.y} r="3.2" fill="#2f1612" stroke="#d4aa5c" strokeWidth="1" />
      </svg>
      <figcaption>
        <b className="num">{bpm}</b>
        <span>BPM · {tempoMarking(bpm)}</span>
      </figcaption>
    </figure>
  );
}
