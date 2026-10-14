import { Accidental, Formatter, Renderer, Stave, StaveConnector, StaveNote, Voice } from 'vexflow/bravura';
import type { Card } from '../srs/deck';
import { accidentalInKey, type Clef, type Pitch, sortPitches, vexKey } from './notes';
import { accidentalsToDraw, eventKey, type Beats, type DrawnAccidental, type Phrase, type PhraseEvent } from './phrase';

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

type Ctx = ReturnType<typeof prepare>;

const DURATION: Record<Beats, string> = { 1: 'q', 2: 'h', 4: 'w' };
// Where rests sit: the whole rest hangs from the 4th line, others are centred.
const REST_KEY: Record<Clef, Record<Beats, string>> = {
  treble: { 1: 'b/4', 2: 'b/4', 4: 'd/5' },
  bass: { 1: 'd/3', 2: 'd/3', 4: 'f/3' },
};

function makeNote(pitches: Pitch[], clef: Clef, beats: Beats, accs: DrawnAccidental[], color: string): StaveNote {
  if (!pitches.length) return new StaveNote({ clef, keys: [REST_KEY[clef][beats]], duration: `${DURATION[beats]}r` });
  const note = new StaveNote({ clef, keys: sortPitches(pitches).map(vexKey), duration: DURATION[beats], auto_stem: true });
  accs.forEach((a, i) => {
    if (a) note.addModifier(new Accidental(a), i);
  });
  note.setStyle({ fillStyle: color, strokeStyle: color });
  return note;
}

function connect(ctx: Ctx, top: Stave, bottom: Stave, type: 'brace' | 'singleLeft' | 'singleRight' | 'boldDoubleRight') {
  new StaveConnector(top, bottom).setType(type).setContext(ctx).draw();
}

/** Draw voices on their staves, formatted together so simultaneous notes line up. */
function drawVoices(ctx: Ctx, parts: { stave: Stave; notes: StaveNote[] }[]) {
  const voices = parts.map((p) => new Voice({ num_beats: 4, beat_value: 4 }).setStrict(false).addTickables(p.notes));
  const f = new Formatter();
  voices.forEach((v) => f.joinVoices([v]));
  f.formatToStave(voices, parts[0].stave);
  voices.forEach((v, i) => v.draw(ctx, parts[i].stave));
}

const accsInKey = (ps: Pitch[], key: string): DrawnAccidental[] => sortPitches(ps).map((p) => accidentalInKey(p, key));

/** One flash card: a whole note or chord on one staff, or on both staves of a grand staff. */
export function renderCard(el: HTMLElement, card: Card, color = COLORS.ink): void {
  const width = 220;
  const staveFor = (x: number, y: number, clef: Clef) => {
    const st = new Stave(x, y, width - x - 10).addClef(clef);
    if (card.key !== 'C') st.addKeySignature(card.key);
    return st;
  };
  if (card.staff !== 'grand') {
    const ctx = prepare(el, width, 190);
    const stave = staveFor(10, 45, card.staff).setContext(ctx).draw();
    drawVoices(ctx, [{ stave, notes: [makeNote(card.notes, card.staff, 4, accsInKey(card.notes, card.key), color)] }]);
    return;
  }
  const ctx = prepare(el, width, 290);
  const treble = staveFor(25, 30, 'treble').setContext(ctx).draw();
  const bass = staveFor(25, 150, 'bass').setContext(ctx).draw();
  connect(ctx, treble, bass, 'brace');
  connect(ctx, treble, bass, 'singleLeft');
  connect(ctx, treble, bass, 'singleRight');
  drawVoices(ctx, [
    { stave: treble, notes: [makeNote(card.hands.treble, 'treble', 4, accsInKey(card.hands.treble, card.key), color)] },
    { stave: bass, notes: [makeNote(card.hands.bass, 'bass', 4, accsInKey(card.hands.bass, card.key), color)] },
  ]);
}

export type PhraseMark = 'pending' | 'current' | 'ok' | 'miss';

/** A sight-reading phrase in 4/4, wrapped over as many lines as fit. `marks` has one entry per event. */
export function renderPhrase(el: HTMLElement, phrase: Phrase, events: PhraseEvent[], marks: PhraseMark[], logicalWidth: number): void {
  const grand = phrase.staff === 'grand';
  const clefs: Clef[] = grand ? ['treble', 'bass'] : [phrase.staff as Clef];
  const eventIndex = new Map(events.map((e, i) => [eventKey(e.measure, e.beat), i]));
  const left = grand ? 25 : 10;
  const n = phrase.measures.length;
  const maxPerLine = Math.max(1, Math.floor((logicalWidth - left - 10) / 200));
  const lines = Math.ceil(n / maxPerLine);
  // Spread bars evenly over the lines rather than leaving one stranded on the last line.
  const perLine = Math.ceil(n / lines);
  const staffGap = 110;
  const lineHeight = grand ? 240 : 140;
  const ctx = prepare(el, logicalWidth, lines * lineHeight + 20);
  const measureWidth = (logicalWidth - left - 10) / perLine;

  phrase.measures.forEach((m, mi) => {
    const line = Math.floor(mi / perLine);
    const col = mi % perLine;
    const x = left + col * measureWidth;
    const staves = clefs.map((clef, si) => {
      const st = new Stave(x, 20 + line * lineHeight + si * staffGap, measureWidth);
      if (col === 0) st.addClef(clef);
      if (mi === 0) st.addTimeSignature('4/4');
      if (mi === n - 1) st.setEndBarType(3); // final double bar
      return st.setContext(ctx).draw();
    });
    if (grand) {
      if (col === 0) {
        connect(ctx, staves[0], staves[1], 'brace');
        connect(ctx, staves[0], staves[1], 'singleLeft');
      }
      connect(ctx, staves[0], staves[1], mi === n - 1 ? 'boldDoubleRight' : 'singleRight');
    }

    drawVoices(
      ctx,
      clefs.map((clef, si) => {
        const voice = m[clef];
        const accs = accidentalsToDraw(voice.map((v) => sortPitches(v.pitches)));
        let beat = 0;
        const notes = voice.map((v, j) => {
          const idx = eventIndex.get(eventKey(mi, beat));
          beat += v.beats;
          const mark = idx === undefined ? 'pending' : (marks[idx] ?? 'pending');
          const color = mark === 'current' ? COLORS.current : mark === 'ok' ? COLORS.ok : mark === 'miss' ? COLORS.miss : COLORS.ink;
          return makeNote(v.pitches, clef, v.beats, accs[j], color);
        });
        return { stave: staves[si], notes };
      }),
    );
  });
}
