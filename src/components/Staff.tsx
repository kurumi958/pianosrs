import { useEffect, useRef } from 'react';
import type { Card } from '../srs/deck';
import { type PhraseMark, renderCard, renderPhrase } from '../music/notation';
import type { Phrase, PhraseEvent } from '../music/phrase';
import { useElementWidth } from '../hooks';

export function CardStaff({ card, color }: { card: Card; color?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) renderCard(ref.current, card, color);
  }, [card, color]);
  return <div className={`paper card-staff ${card.staff}`} ref={ref} aria-label="Note to play" />;
}

export function PhraseStaff({ phrase, events, marks }: { phrase: Phrase; events: PhraseEvent[]; marks: PhraseMark[] }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !width) return;
    // Render a bit smaller than the container, then let the SVG scale up so notes are easy to read.
    renderPhrase(ref.current, phrase, events, marks, Math.max(300, Math.round(width / 1.3)));
  }, [phrase, events, marks, width]);
  return (
    <div className="paper" ref={wrap}>
      <div ref={ref} />
    </div>
  );
}
