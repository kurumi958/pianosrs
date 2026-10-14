import { Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Tuplet, Voice } from 'vexflow/bravura';
import type { Card } from '../srs/deck';
import { accidentalInKey, type Clef, hasSignature, type Pitch, sortPitches, vexKey } from './notes';
import { accidentalsToDraw, eventKey, type DrawnAccidental, type Phrase, type PhraseEvent, type PhraseNote, voiceNotes } from './phrase';
import { type Base, type Meter, meterName, type NoteValue, type RhythmPattern, ticksOf as ticksOfNote } from './rhythm';

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

const DURATION: Record<Base, string> = { w: 'w', h: 'h', q: 'q', e: '8', s: '16' };
// Where rests sit: the whole rest hangs from the 4th line, others are centred.
const REST_KEY: Record<Clef, string> = { treble: 'b/4', bass: 'd/3' };
const WHOLE_REST_KEY: Record<Clef, string> = { treble: 'd/5', bass: 'f/3' };

function makeNote(pitches: Pitch[], clef: Clef, val: NoteValue, accs: DrawnAccidental[], color: string, stemUp = false): StaveNote {
  const duration = DURATION[val.base];
  const dots = val.dots;
  const note = pitches.length
    ? new StaveNote({ clef, keys: sortPitches(pitches).map(vexKey), duration, dots, auto_stem: !stemUp, stem_direction: stemUp ? 1 : undefined })
    : new StaveNote({ clef, keys: [val.base === 'w' ? WHOLE_REST_KEY[clef] : REST_KEY[clef]], duration: `${duration}r`, dots });
  if (dots) Dot.buildAndAttach([note], { all: true });
  accs.forEach((a, i) => {
    if (a) note.addModifier(new Accidental(a), i);
  });
  if (pitches.length) note.setStyle({ fillStyle: color, strokeStyle: color });
  return note;
}

/** Triplet brackets for a voice: notes sharing a triplet number. Made before formatting, as they change the notes' lengths. */
function makeTuplets(values: NoteValue[], notes: StaveNote[]): Tuplet[] {
  const groups = new Map<number, StaveNote[]>();
  values.forEach((v, i) => v.triplet !== undefined && groups.set(v.triplet, [...(groups.get(v.triplet) ?? []), notes[i]]));
  return [...groups.values()].map((ns) => new Tuplet(ns, { num_notes: 3, notes_occupied: 2, location: 1 }));
}

function connect(ctx: Ctx, top: Stave, bottom: Stave, type: 'brace' | 'singleLeft' | 'singleRight' | 'boldDoubleRight') {
  new StaveConnector(top, bottom).setType(type).setContext(ctx).draw();
}

interface Part {
  stave: Stave;
  notes: StaveNote[];
  tuplets?: Tuplet[];
}

/** Draw voices on their staves, formatted together so simultaneous notes line up. Short notes are beamed by the beat. */
function drawVoices(ctx: Ctx, parts: Part[], meter: Meter = { num: 4, den: 4 }, stemUp = false) {
  const groups = Beam.getDefaultBeamGroups(meterName(meter));
  const beams = parts.flatMap((p) => Beam.generateBeams(p.notes, { groups, ...(stemUp ? { stem_direction: 1 } : {}) }));
  const voices = parts.map((p) => new Voice({ num_beats: meter.num, beat_value: meter.den }).setStrict(false).addTickables(p.notes));
  const f = new Formatter();
  voices.forEach((v) => f.joinVoices([v]));
  f.formatToStave(voices, parts[0].stave);
  voices.forEach((v, i) => v.draw(ctx, parts[i].stave));
  beams.forEach((b) => b.setContext(ctx).draw());
  parts.forEach((p) => p.tuplets?.forEach((t) => t.setContext(ctx).draw()));
}

/** A tie between two notes; either end may be missing when the tie crosses a line break. */
function drawTie(ctx: Ctx, from: StaveNote | null, to: StaveNote | null, count: number) {
  const indices = Array.from({ length: count }, (_, i) => i);
  new StaveTie({ first_note: from, last_note: to, first_indices: indices, last_indices: indices }).setContext(ctx).draw();
}

/** A rhythm on a single line (rhythm cards). `colors` optionally colours each sounding note, e.g. to show which taps landed. */
export function renderRhythm(el: HTMLElement, pattern: RhythmPattern, colors: string[] = []): void {
  const width = Math.max(260, 90 + pattern.notes.length * 30);
  const ctx = prepare(el, width, 130);
  const stave = new Stave(10, 25, width - 20).addTimeSignature(meterName(pattern.meter));
  stave.setConfigForLines([0, 1, 2, 3, 4].map((i) => ({ visible: i === 2 })));
  stave.setEndBarType(3);
  stave.setContext(ctx).draw();
  let k = 0;
  const B4: Pitch = { letter: 'B', acc: '', octave: 4 };
  let color = COLORS.ink;
  const notes = pattern.notes.map((n, i) => {
    // A tied-over note takes the colour of the note it continues.
    if (!n.rest && !pattern.notes[i - 1]?.tie) color = colors[k++] ?? COLORS.ink;
    return makeNote(n.rest ? [] : [B4], 'treble', n, [], n.rest ? COLORS.ink : color, true);
  });
  const tuplets = makeTuplets(pattern.notes, notes);
  drawVoices(ctx, [{ stave, notes, tuplets }], pattern.meter, true);
  pattern.notes.forEach((n, i) => n.tie && drawTie(ctx, notes[i], notes[i + 1], 1));
}

const WHOLE: NoteValue = { base: 'w', dots: 0 };
const accsInKey = (ps: Pitch[], key: string): DrawnAccidental[] => sortPitches(ps).map((p) => accidentalInKey(p, key));

/** One flash card: a whole note or chord on one staff, or on both staves of a grand staff. */
export function renderCard(el: HTMLElement, card: Card, color = COLORS.ink): void {
  const width = 220;
  const staveFor = (x: number, y: number, clef: Clef) => {
    const st = new Stave(x, y, width - x - 10).addClef(clef);
    if (hasSignature(card.key)) st.addKeySignature(card.key);
    return st;
  };
  if (card.staff !== 'grand') {
    const ctx = prepare(el, width, 190);
    const stave = staveFor(10, 45, card.staff).setContext(ctx).draw();
    drawVoices(ctx, [{ stave, notes: [makeNote(card.notes, card.staff, WHOLE, accsInKey(card.notes, card.key), color)] }]);
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
    { stave: treble, notes: [makeNote(card.hands.treble, 'treble', WHOLE, accsInKey(card.hands.treble, card.key), color)] },
    { stave: bass, notes: [makeNote(card.hands.bass, 'bass', WHOLE, accsInKey(card.hands.bass, card.key), color)] },
  ]);
}

export type PhraseMark = 'pending' | 'current' | 'ok' | 'miss';

/** Width of every bar in a phrase: wide enough for its busiest bar. */
function measureWidth(phrase: Phrase): number {
  const busiest = Math.max(1, ...phrase.measures.flatMap((m) => [m.treble.length, m.bass.length]));
  return Math.max(230, 70 + busiest * 27);
}

/** Size of a rendered phrase, in SVG units, when laid out `perLine` bars to a line. */
export function phraseSize(phrase: Phrase, perLine: number): { width: number; height: number; lines: number } {
  const grand = phrase.staff === 'grand';
  const lines = Math.ceil(phrase.measures.length / perLine);
  return { width: (grand ? 25 : 10) + 10 + perLine * measureWidth(phrase), height: lines * lineHeightOf(grand) + 20, lines };
}

/** Single-staff lines get extra space between them, so two stacked lines don't read as a grand staff. */
const lineHeightOf = (grand: boolean) => (grand ? 240 : 160);

/** A sight-reading phrase, `perLine` bars to a line. `marks` has one entry per event. */
export function renderPhrase(el: HTMLElement, phrase: Phrase, events: PhraseEvent[], marks: PhraseMark[], perLine: number): void {
  const grand = phrase.staff === 'grand';
  const clefs: Clef[] = grand ? ['treble', 'bass'] : [phrase.staff as Clef];
  const eventIndex = new Map(events.map((e, i) => [eventKey(e.measure, e.tick), i]));
  const left = grand ? 25 : 10;
  const n = phrase.measures.length;
  const staffGap = 110;
  const lineHeight = lineHeightOf(grand);
  const { width, height } = phraseSize(phrase, perLine);
  const ctx = prepare(el, width, height);
  const mw = measureWidth(phrase);
  // Which notes are held over by ties, per staff, by measure and position.
  const tiedOver = new Map(clefs.map((clef) => [clef, new Set(voiceNotes(phrase, clef).filter((x) => x.tiedOver).map((x) => `${x.measure}:${x.index}`))]));
  // The note a tie starts from, waiting for the note it ties to.
  const pending = new Map<Clef, { note: StaveNote; line: number; count: number }>();

  phrase.measures.forEach((m, mi) => {
    const line = Math.floor(mi / perLine);
    const col = mi % perLine;
    const x = left + col * mw;
    const staves = clefs.map((clef, si) => {
      const st = new Stave(x, 20 + line * lineHeight + si * staffGap, mw);
      if (col === 0) {
        st.addClef(clef);
        if (hasSignature(phrase.key)) st.addKeySignature(phrase.key);
      }
      if (mi === 0) st.addTimeSignature(meterName(phrase.meter));
      if (mi === n - 1) st.setEndBarType(3); // final double bar
      return st.setContext(ctx).draw();
    });
    // Bar number above the start of every bar, small and muted so it guides without competing with the notes.
    ctx.save();
    ctx.setFont({ family: 'Spectral, Georgia, serif', size: 11, style: 'italic' });
    ctx.setFillStyle('#8a7c70');
    ctx.fillText(String(mi + 1), staves[0].getX() + 3, staves[0].getYForLine(0) - 8);
    ctx.restore();
    if (grand) {
      if (col === 0) {
        connect(ctx, staves[0], staves[1], 'brace');
        connect(ctx, staves[0], staves[1], 'singleLeft');
      }
      connect(ctx, staves[0], staves[1], mi === n - 1 ? 'boldDoubleRight' : 'singleRight');
    }

    const drawn: { clef: Clef; voice: PhraseNote[]; notes: StaveNote[] }[] = [];
    drawVoices(
      ctx,
      clefs.map((clef, si) => {
        const voice = m[clef];
        const held = voice.map((_, j) => tiedOver.get(clef)!.has(`${mi}:${j}`));
        const accs = accidentalsToDraw(
          voice.map((v) => sortPitches(v.pitches)),
          phrase.key,
          held,
        );
        let tick = 0;
        let color = COLORS.ink;
        const notes = voice.map((v, j) => {
          const idx = eventIndex.get(eventKey(mi, tick));
          tick += ticksOfNote(v);
          // A held-over note keeps the colour of the note it continues.
          if (!held[j]) {
            const mark = idx === undefined ? 'pending' : (marks[idx] ?? 'pending');
            color = mark === 'current' ? COLORS.current : mark === 'ok' ? COLORS.ok : mark === 'miss' ? COLORS.miss : COLORS.ink;
          }
          return makeNote(v.pitches, clef, v, accs[j], color);
        });
        drawn.push({ clef, voice, notes });
        return { stave: staves[si], notes, tuplets: makeTuplets(voice, notes) };
      }),
      phrase.meter,
    );
    for (const { clef, voice, notes } of drawn) {
      voice.forEach((v, j) => {
        const from = pending.get(clef);
        if (from && v.pitches.length) {
          if (from.line === line) drawTie(ctx, from.note, notes[j], from.count);
          else {
            // Across a line break: the tie leaves the end of one line and arrives at the start of the next.
            drawTie(ctx, from.note, null, from.count);
            drawTie(ctx, null, notes[j], from.count);
          }
          pending.delete(clef);
        }
        if (v.tie && v.pitches.length) pending.set(clef, { note: notes[j], line, count: v.pitches.length });
      });
    }
  });
}
