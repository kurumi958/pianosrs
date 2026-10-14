import { useEffect, useRef } from 'react';
import type { Card } from '../srs/deck';
import { type PhraseMark, phraseSize, renderCard, renderPhrase } from '../music/notation';
import type { Phrase, PhraseEvent } from '../music/phrase';
import { useElementSize } from '../hooks';

export function CardStaff({ card, color }: { card: Card; color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) renderCard(ref.current, card, color);
  }, [card, color]);
  return <div className="music-svg" ref={ref} aria-label="Music to play" />;
}

/** Largest on-screen scale the music is drawn at, so a short phrase doesn't balloon. */
const MAX_SCALE = 2.2;

/** Bars per line that show the phrase biggest inside a box of this size. */
function bestPerLine(phrase: Phrase, box: { width: number; height: number }): number {
  let best = 1;
  let bestScale = 0;
  for (let p = 1; p <= phrase.measures.length; p++) {
    const { width, height } = phraseSize(phrase, p);
    const scale = Math.min(MAX_SCALE, box.width / width, box.height / height);
    // Prefer fewer, fuller lines when the scale is (nearly) the same.
    if (scale > bestScale + 0.01) {
      best = p;
      bestScale = scale;
    }
  }
  // Spread bars evenly over the lines rather than stranding one on the last line.
  const lines = Math.ceil(phrase.measures.length / best);
  return Math.ceil(phrase.measures.length / lines);
}

/** The phrase, scaled to fill its box. */
export function PhraseStaff({ phrase, events, marks }: { phrase: Phrase; events: PhraseEvent[]; marks: PhraseMark[] }) {
  const [box, size] = useElementSize<HTMLDivElement>();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !size.width || !size.height) return;
    renderPhrase(ref.current, phrase, events, marks, bestPerLine(phrase, size));
  }, [phrase, events, marks, size]);
  return (
    <div className="music-svg" ref={box}>
      <div className="music-svg" ref={ref} />
    </div>
  );
}
