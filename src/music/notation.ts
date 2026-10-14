import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow/bravura';
import type { Card } from '../srs/deck';
import { type Clef, vexKey } from './notes';
import { accidentalsToDraw } from './phrase';

export const COLORS = {
  ink: '#1b1b1b',
  current: '#2463eb',
  ok: '#1e8a4c',
  miss: '#d03b3b',
};

function prepare(el: HTMLElement, width: number, height: number) {
  el.innerHTML = '';
  const renderer = new Renderer(el as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  // Scale with the container instead of using fixed pixel sizes.
  const svg = el.querySelector('svg');
  if (svg) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
  }
  return ctx;
}

function makeNote(card: Card, clef: Clef, duration: string, accs: (string | null)[], color: string): StaveNote {
  const note = new StaveNote({ clef, keys: card.notes.map(vexKey), duration });
  accs.forEach((a, i) => {
    if (a) note.addModifier(new Accidental(a), i);
  });
  note.setStyle({ fillStyle: color, strokeStyle: color });
  return note;
}

/** One flash card: a single whole note or chord on one staff. */
export function renderCard(el: HTMLElement, card: Card, color = COLORS.ink): void {
  const width = 220;
  const height = 190;
  const ctx = prepare(el, width, height);
  const stave = new Stave(10, 45, width - 20);
  stave.addClef(card.clef).setContext(ctx).draw();
  const accs = card.notes.map((p) => (p.acc ? p.acc : null));
  const note = makeNote(card, card.clef, 'w', accs, color);
  const voice = new Voice({ num_beats: 4, beat_value: 4 }).addTickables([note]);
  new Formatter().joinVoices([voice]).format([voice], width - 110);
  voice.draw(ctx, stave);
}

export type PhraseMark = 'pending' | 'current' | 'ok' | 'miss';

/** A sight-reading phrase: quarter notes in 4/4, wrapped over as many lines as fit. */
export function renderPhrase(el: HTMLElement, cards: Card[], clef: Clef, marks: PhraseMark[], logicalWidth: number): void {
  const measures: Card[][] = [];
  for (let i = 0; i < cards.length; i += 4) measures.push(cards.slice(i, i + 4));
  const perLine = Math.max(1, Math.min(measures.length, Math.floor((logicalWidth - 20) / 200)));
  const lines = Math.ceil(measures.length / perLine);
  const lineHeight = 140;
  const ctx = prepare(el, logicalWidth, lines * lineHeight + 20);
  const measureWidth = (logicalWidth - 20) / perLine;

  measures.forEach((m, mi) => {
    const line = Math.floor(mi / perLine);
    const col = mi % perLine;
    const stave = new Stave(10 + col * measureWidth, 20 + line * lineHeight, measureWidth);
    if (col === 0) stave.addClef(clef);
    if (mi === 0) stave.addTimeSignature('4/4');
    if (mi === measures.length - 1) stave.setEndBarType(3); // final double bar
    stave.setContext(ctx).draw();

    const accs = accidentalsToDraw(m.map((c) => c.notes));
    const notes = m.map((card, j) => {
      const mark = marks[mi * 4 + j] ?? 'pending';
      const color = mark === 'current' ? COLORS.current : mark === 'ok' ? COLORS.ok : mark === 'miss' ? COLORS.miss : COLORS.ink;
      return makeNote(card, clef, 'q', accs[j], color);
    });
    while (notes.length < 4) notes.push(new StaveNote({ clef, keys: [clef === 'treble' ? 'b/4' : 'd/3'], duration: 'qr' }));
    const voice = new Voice({ num_beats: 4, beat_value: 4 }).addTickables(notes);
    new Formatter().joinVoices([voice]).formatToStave([voice], stave);
    voice.draw(ctx, stave);
  });
}
