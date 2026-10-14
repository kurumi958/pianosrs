import { useEffect, useRef } from 'react';
import type { Card } from '../srs/deck';
import { type PhraseMark, phraseSize, renderCard, renderPhrase, renderRhythm } from '../music/notation';
import type { Phrase, PhraseEvent } from '../music/phrase';
import { useElementSize } from '../hooks';

export function CardStaff({ card, color }: { card: Card; color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) renderCard(ref.current, card, color);
  }, [card, color]);
  return <div className="music-svg" ref={ref} aria-label="Music to play" />;
}

/** A card drawn small, for previews: its notes, its key signature, or its rhythm. */
export function CardPreview({ card }: { card: Card }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    if (card.rhythm) renderRhythm(ref.current, card.rhythm);
    else renderCard(ref.current, card);
  }, [card]);
  return <div className="music-svg" ref={ref} aria-label="Card preview" />;
}

/** Largest on-screen scale the music is drawn at, so a short phrase doesn't balloon. */
const MAX_SCALE = 2.2;

/** How much smaller (relative to the largest fit) the music may be drawn to keep it on fewer lines. */
const FEWER_LINES_TOLERANCE = 0.85;

/**
 * Bars per line for a box of this size: the fewest lines that still draw the music within 15% of its largest
 * possible size. Stacking lines only when it really pays keeps a short phrase on one line, where it can't be
 * mistaken for a grand staff.
 */
function bestPerLine(phrase: Phrase, box: { width: number; height: number }): number {
  const n = phrase.measures.length;
  const scaleFor = (p: number) => {
    const { width, height } = phraseSize(phrase, p);
    return Math.min(MAX_SCALE, box.width / width, box.height / height);
  };
  let bestScale = 0;
  for (let p = 1; p <= n; p++) bestScale = Math.max(bestScale, scaleFor(p));
  let perLine = n;
  for (let p = n; p >= 1; p--) {
    if (scaleFor(p) >= bestScale * FEWER_LINES_TOLERANCE) {
      perLine = p;
      break;
    }
  }
  // Spread bars evenly over the lines rather than stranding one on the last line.
  const lines = Math.ceil(n / perLine);
  return Math.ceil(n / lines);
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
