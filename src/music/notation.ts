import { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveConnector, StaveNote, Voice } from 'vexflow/bravura';
import type { Card } from '../srs/deck';
import { accidentalInKey, type Clef, type Pitch, sortPitches, vexKey } from './notes';
import { accidentalsToDraw, eventKey, type DrawnAccidental, type Phrase, type PhraseEvent } from './phrase';
import type { Dur, RhythmPattern } from './rhythm';

/** Score colours: warm ink, burgundy for the note to play, sage for right, brick for wrong. */
export const COLORS = {
  ink: '#2a211d',
  current: '#7a2531',
  ok: '#557548',
  miss: '#b0402c',
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
    // Fill the container and scale the music to fit it (the viewBox keeps the proportions).
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.display = 'block';
  }
  return ctx;
}

type Ctx = ReturnType<typeof prepare>;

const DURATION: Record<Dur, { duration: string; dots: number }> = {
  0.5: { duration: '8', dots: 0 },
  1: { duration: 'q', dots: 0 },
  1.5: { duration: 'q', dots: 1 },
  2: { duration: 'h', dots: 0 },
  3: { duration: 'h', dots: 1 },
  4: { duration: 'w', dots: 0 },
};
// Where rests sit: the whole rest hangs from the 4th line, others are centred.
const REST_KEY: Record<Clef, string> = { treble: 'b/4', bass: 'd/3' };
const WHOLE_REST_KEY: Record<Clef, string> = { treble: 'd/5', bass: 'f/3' };

function makeNote(pitches: Pitch[], clef: Clef, dur: Dur, accs: DrawnAccidental[], color: string, stemUp = false): StaveNote {
  const { duration, dots } = DURATION[dur];
  const note = pitches.length
    ? new StaveNote({ clef, keys: sortPitches(pitches).map(vexKey), duration, dots, auto_stem: !stemUp, stem_direction: stemUp ? 1 : undefined })
    : new StaveNote({ clef, keys: [dur === 4 ? WHOLE_REST_KEY[clef] : REST_KEY[clef]], duration: `${duration}r`, dots });
  if (dots) Dot.buildAndAttach([note], { all: true });
  accs.forEach((a, i) => {
    if (a) note.addModifier(new Accidental(a), i);
  });
  if (pitches.length) note.setStyle({ fillStyle: color, strokeStyle: color });
  return note;
}

function connect(ctx: Ctx, top: Stave, bottom: Stave, type: 'brace' | 'singleLeft' | 'singleRight' | 'boldDoubleRight') {
  new StaveConnector(top, bottom).setType(type).setContext(ctx).draw();
}

/** Draw voices on their staves, formatted together so simultaneous notes line up. Eighth notes are beamed. */
function drawVoices(ctx: Ctx, parts: { stave: Stave; notes: StaveNote[] }[], beats = 4, stemUp = false) {
  const beams = parts.flatMap((p) => Beam.generateBeams(p.notes, stemUp ? { stem_direction: 1 } : {}));
  const voices = parts.map((p) => new Voice({ num_beats: beats, beat_value: 4 }).setStrict(false).addTickables(p.notes));
  const f = new Formatter();
  voices.forEach((v) => f.joinVoices([v]));
  f.formatToStave(voices, parts[0].stave);
  voices.forEach((v, i) => v.draw(ctx, parts[i].stave));
  beams.forEach((b) => b.setContext(ctx).draw());
}

/** A rhythm on a single line (rhythm cards). `colors` optionally colours each sounding note, e.g. to show which taps landed. */
export function renderRhythm(el: HTMLElement, pattern: RhythmPattern, colors: string[] = []): void {
  const width = 260;
  const ctx = prepare(el, width, 130);
  const stave = new Stave(10, 25, width - 20).addTimeSignature(`${pattern.beats}/4`);
  stave.setConfigForLines([0, 1, 2, 3, 4].map((i) => ({ visible: i === 2 })));
  stave.setEndBarType(3);
  stave.setContext(ctx).draw();
  let k = 0;
  const notes = pattern.notes.map((n) =>
    makeNote(n.rest ? [] : [{ letter: 'B', acc: '', octave: 4 }], 'treble', n.dur, [], n.rest ? COLORS.ink : (colors[k++] ?? COLORS.ink), true),
  );
  drawVoices(ctx, [{ stave, notes }], pattern.beats, true);
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
  if (card.prompt === 'key') return; // just the key signature
  drawVoices(ctx, [
    { stave: treble, notes: [makeNote(card.hands.treble, 'treble', 4, accsInKey(card.hands.treble, card.key), color)] },
    { stave: bass, notes: [makeNote(card.hands.bass, 'bass', 4, accsInKey(card.hands.bass, card.key), color)] },
  ]);
}

export type PhraseMark = 'pending' | 'current' | 'ok' | 'miss';

/** Size of a rendered phrase, in SVG units, when laid out `perLine` bars to a line. */
export function phraseSize(phrase: Phrase, perLine: number): { width: number; height: number; lines: number } {
  const grand = phrase.staff === 'grand';
  const lines = Math.ceil(phrase.measures.length / perLine);
  return { width: (grand ? 25 : 10) + 10 + perLine * MEASURE_W, height: lines * (grand ? 240 : 140) + 20, lines };
}

const MEASURE_W = 230;

/** A sight-reading phrase, `perLine` bars to a line. `marks` has one entry per event. */
export function renderPhrase(el: HTMLElement, phrase: Phrase, events: PhraseEvent[], marks: PhraseMark[], perLine: number): void {
  const grand = phrase.staff === 'grand';
  const clefs: Clef[] = grand ? ['treble', 'bass'] : [phrase.staff as Clef];
  const eventIndex = new Map(events.map((e, i) => [eventKey(e.measure, e.beat), i]));
  const left = grand ? 25 : 10;
  const n = phrase.measures.length;
  const staffGap = 110;
  const lineHeight = grand ? 240 : 140;
  const { width, height } = phraseSize(phrase, perLine);
  const ctx = prepare(el, width, height);
  const measureWidth = MEASURE_W;

  phrase.measures.forEach((m, mi) => {
    const line = Math.floor(mi / perLine);
    const col = mi % perLine;
    const x = left + col * measureWidth;
    const staves = clefs.map((clef, si) => {
      const st = new Stave(x, 20 + line * lineHeight + si * staffGap, measureWidth);
      if (col === 0) {
        st.addClef(clef);
        if (phrase.key !== 'C') st.addKeySignature(phrase.key);
      }
      if (mi === 0) st.addTimeSignature(`${phrase.beats}/4`);
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
        const accs = accidentalsToDraw(voice.map((v) => sortPitches(v.pitches)), phrase.key);
        let beat = 0;
        const notes = voice.map((v, j) => {
          const idx = eventIndex.get(eventKey(mi, beat));
          beat += v.dur;
          const mark = idx === undefined ? 'pending' : (marks[idx] ?? 'pending');
          const color = mark === 'current' ? COLORS.current : mark === 'ok' ? COLORS.ok : mark === 'miss' ? COLORS.miss : COLORS.ink;
          return makeNote(v.pitches, clef, v.dur, accs[j], color);
        });
        return { stave: staves[si], notes };
      }),
      phrase.beats,
    );
  });
}
