import type { Card, StaffKind } from '../srs/deck';
import type { CardState } from '../srs/scheduler';
import { type Clef, diatonicIndex, keyAccidental, type Pitch } from './notes';
import { barTicks, isCompound, type Meter, type NoteValue, pulsesPerBar, type RhythmPattern, ticksOf, v } from './rhythm';

/** How much a card should be favoured in sight-reading practice: weak and recently learned cards come up more. */
export function practiceWeight(state: CardState | undefined): number {
  if (!state) return 1;
  let w = 1 + 2 * state.lapses + Math.max(0, 2.5 - state.ease) * 4;
  if (state.status !== 'review') w += 2;
  else if (state.interval < 3) w += 1;
  return w;
}

/** Average staff position of a card's notes, in diatonic steps. */
const height = (c: Card) => c.notes.reduce((a, p) => a + diatonicIndex(p), 0) / c.notes.length;

/** How likely a melody is to move this many staff steps: steps and skips are common, big leaps rare. */
export function stepWeight(steps: number): number {
  return Math.exp(-Math.max(0, steps - 1) / 2);
}

/**
 * Returns a function that draws cards by weight, never giving the same card twice in a row (when it can avoid it).
 * With `melodic`, each draw also favours cards close to the previous one, so lines move like real melodies.
 */
export function weightedSampler(
  pool: Card[],
  states: Record<string, CardState>,
  rnd: () => number,
  melodic = false,
  /** Extra weight per card, e.g. to make weak spots come up more in focused practice. */
  boost?: (c: Card) => number,
): () => Card {
  const weights = pool.map((c) => practiceWeight(states[c.id]) * (boost?.(c) ?? 1));
  let prev: Card | undefined;
  return () => {
    const ws = pool.map((c, j) => {
      if (!prev) return weights[j];
      if (pool.length > 1 && c === prev) return 0;
      return melodic ? weights[j] * stepWeight(Math.abs(height(c) - height(prev))) : weights[j];
    });
    const total = ws.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    let k = 0;
    while (k < pool.length - 1 && r >= ws[k]) r -= ws[k++];
    prev = pool[k];
    return pool[k];
  };
}

/** Build a sequence of `length` cards, sampled by weight, never repeating the same card back to back. */
export function generatePhrase(
  pool: Card[],
  states: Record<string, CardState>,
  length: number,
  rnd: () => number = Math.random,
  melodic = false,
): Card[] {
  if (!pool.length) return [];
  const next = weightedSampler(pool, states, rnd, melodic);
  return Array.from({ length }, next);
}

// ---------------------------------------------------------------------------------------------
// Phrases with rhythm on one or two staves.

/** One note, chord or rest (no pitches) in one staff's voice. */
export interface PhraseNote extends NoteValue {
  pitches: Pitch[];
  /** The flash card this note came from, so mistakes can feed back into reviews. */
  card?: Card;
}

/** One bar. A voice is either empty (staff not used) or fills the bar. */
export type Measure = Record<Clef, PhraseNote[]>;

export interface Phrase {
  staff: StaffKind;
  /** Key signature the phrase is written in. */
  key: string;
  meter: Meter;
  measures: Measure[];
}

/** Something to play: every note that starts at the same moment, across both hands. */
export interface PhraseEvent {
  measure: number;
  /** Ticks into the bar. */
  tick: number;
  /** Ticks from the start of the phrase. */
  time: number;
  pitches: Pitch[];
  cards: Card[];
}

export const eventKey = (measure: number, tick: number) => `${measure}:${tick}`;

/** Every note of one staff's voice in order, with where it starts and whether it's held over from a tie. */
export function voiceNotes(phrase: Phrase, clef: Clef): { measure: number; index: number; tick: number; note: PhraseNote; tiedOver: boolean }[] {
  const out: { measure: number; index: number; tick: number; note: PhraseNote; tiedOver: boolean }[] = [];
  let prev: PhraseNote | undefined;
  phrase.measures.forEach((m, mi) => {
    let tick = 0;
    m[clef].forEach((n, index) => {
      out.push({ measure: mi, index, tick, note: n, tiedOver: !!prev?.tie && n.pitches.length > 0 });
      tick += ticksOf(n);
      prev = n;
    });
    if (!m[clef].length) prev = undefined;
  });
  return out;
}

export function phraseEvents(phrase: Phrase): PhraseEvent[] {
  const bar = barTicks(phrase.meter);
  const byTime = new Map<number, PhraseEvent>();
  for (const clef of ['treble', 'bass'] as Clef[]) {
    for (const { measure, tick, note: n, tiedOver } of voiceNotes(phrase, clef)) {
      if (!n.pitches.length || tiedOver) continue;
      const time = measure * bar + tick;
      const e = byTime.get(time) ?? { measure, tick, time, pitches: [], cards: [] };
      e.pitches.push(...n.pitches);
      if (n.card && !e.cards.includes(n.card)) e.cards.push(n.card);
      byTime.set(time, e);
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

const valueOf = (n: NoteValue): NoteValue => {
  const out: NoteValue = { base: n.base, dots: n.dots };
  if (n.triplet !== undefined) out.triplet = n.triplet;
  if (n.tie) out.tie = true;
  return out;
};
const note = (card: Card, clef: Clef, val: NoteValue): PhraseNote => ({
  ...valueOf(val),
  pitches: card.hands[clef].length ? card.hands[clef] : card.notes,
  card,
});
const rest = (val: NoteValue): PhraseNote => {
  const r: PhraseNote = { ...valueOf(val), pitches: [] };
  delete r.tie;
  return r;
};
/** The same pitches again, held over from the note before. */
const held = (from: PhraseNote, val: NoteValue): PhraseNote => ({ ...valueOf(val), pitches: from.pitches, card: from.card });

/** Plain quarter notes, for phrases that aren't practicing rhythm. */
export const QUARTERS = (beats: number): RhythmPattern => ({
  meter: { num: beats, den: 4 },
  notes: Array.from({ length: beats }, () => ({ base: 'q' as const, dots: 0 as const })),
});

/** A pattern's notes in one voice, each drawn from `next` except tied-over notes, which repeat the note before. */
function patternVoice(p: RhythmPattern, clef: Clef, next: () => Card): PhraseNote[] {
  const out: PhraseNote[] = [];
  p.notes.forEach((n, i) => {
    if (n.rest) out.push(rest(n));
    else if (p.notes[i - 1]?.tie) out.push(held(out[i - 1], n));
    else out.push(note(next(), clef, n));
  });
  return out;
}

/** Single-staff phrase: one bar per rhythm pattern, each note drawn from `next`. */
export function singleStaffPhrase(next: () => Card, clef: Clef, patterns: RhythmPattern[], key = 'C'): Phrase {
  const measures: Measure[] = patterns.map((p) => {
    const voice = patternVoice(p, clef, next);
    return clef === 'treble' ? { treble: voice, bass: [] } : { treble: [], bass: voice };
  });
  return { staff: clef, key, meter: patterns[0]?.meter ?? { num: 4, den: 4 }, measures };
}

/**
 * Tie some bars' last notes into the next bar (with probability `chance` per barline), the way melodies often
 * hold a note over the barline. Only between two sounding notes in the same staff.
 */
export function tieAcrossBars(phrase: Phrase, chance: number, rnd: () => number = Math.random): Phrase {
  const measures = phrase.measures.map((m) => ({ treble: [...m.treble], bass: [...m.bass] }));
  for (let i = 0; i + 1 < measures.length; i++) {
    for (const clef of ['treble', 'bass'] as Clef[]) {
      const a = measures[i][clef];
      const b = measures[i + 1][clef];
      const last = a[a.length - 1];
      const first = b[0];
      if (!last?.pitches.length || !first?.pitches.length || last.tie || rnd() >= chance) continue;
      a[a.length - 1] = { ...last, tie: true };
      // The held note keeps its own length; notes it's tied on to are held too.
      for (let j = 0; j < b.length && (j === 0 || b[j - 1].tie); j++) b[j] = { ...b[j], pitches: last.pitches, card: last.card };
    }
  }
  return { ...phrase, measures };
}

export type GrandStyle = 'mixed' | 'melody' | 'bass-melody' | 'alternate' | 'together';

export interface GrandPools {
  /** Cards that only use the right hand (treble). */
  rh: Card[];
  /** Cards that only use the left hand (bass). */
  lh: Card[];
  /** Cards that use both hands at once. */
  both: Card[];
}

const LONG_NOTES: Record<number, NoteValue[][]> = {
  96: [[v('w')], [v('h'), v('h')]], // 4/4, 2/2
  72: [[v('h', 1)]], // 3/4, 6/8
  48: [[v('h')]], // 2/4
  36: [[v('q', 1)]], // 3/8
  108: [[v('h', 1), v('q', 1)]], // 9/8
  144: [[v('h', 1), v('h', 1)]], // 12/8
};

/** Long notes filling a bar: a whole note or two halves in 4/4, a dotted half in 3/4 or 6/8, and so on. */
function heldNotes(draw: () => Card, clef: Clef, meter: Meter, rnd: () => number): PhraseNote[] {
  const options = LONG_NOTES[barTicks(meter)];
  const values = options
    ? options[Math.floor(rnd() * options.length)]
    : Array.from({ length: pulsesPerBar(meter) }, () => (isCompound(meter) ? v('q', 1) : v(meter.den === 8 ? 'e' : meter.den === 2 ? 'h' : 'q')));
  return values.map((val) => note(draw(), clef, val));
}

/**
 * Two-handed phrase on the grand staff, one bar per rhythm pattern. Bar styles:
 * - melody: the pattern in the RH over held LH notes
 * - bass-melody: the same with the hands swapped
 * - alternate: the pattern's notes pass between the hands
 * - together: both hands play the pattern
 */
export function grandStaffPhrase(
  pools: GrandPools,
  states: Record<string, CardState>,
  patterns: RhythmPattern[],
  style: GrandStyle,
  rnd: () => number = Math.random,
  melodic = false,
  key = 'C',
  boost?: (c: Card) => number,
): Phrase {
  const rh = weightedSampler(pools.rh, states, rnd, melodic, boost);
  const lh = weightedSampler(pools.lh, states, rnd, melodic, boost);
  const both = pools.both.length ? weightedSampler(pools.both, states, rnd, melodic, boost) : null;
  const mixed: [Exclude<GrandStyle, 'mixed'>, number][] = [
    ['melody', 3],
    ['bass-melody', 2],
    ['alternate', 3],
    ['together', 1],
  ];
  const pickStyle = (): Exclude<GrandStyle, 'mixed'> => {
    if (style !== 'mixed') return style;
    let r = rnd() * mixed.reduce((a, [, w]) => a + w, 0);
    for (const [s, w] of mixed) if ((r -= w) < 0) return s;
    return 'melody';
  };

  const measures: Measure[] = patterns.map((p) => {
    const s = pickStyle();
    // Notes that are played (not rests, not held over by a tie).
    const struck = p.notes.map((n, i) => !n.rest && !p.notes[i - 1]?.tie);
    if (s === 'melody') return { treble: patternVoice(p, 'treble', rh), bass: heldNotes(lh, 'bass', p.meter, rnd) };
    if (s === 'bass-melody') return { treble: heldNotes(rh, 'treble', p.meter, rnd), bass: patternVoice(p, 'bass', lh) };
    if (s === 'alternate' && struck.filter(Boolean).length >= 2) {
      // Each struck note goes to a random hand (a tied-over note stays in its hand); each hand gets at least one.
      const hands: Clef[] = [];
      p.notes.forEach((_, i) => hands.push(struck[i] ? (rnd() < 0.5 ? 'treble' : 'bass') : (hands[i - 1] ?? 'treble')));
      const used = hands.filter((_, i) => struck[i]);
      if (used.every((h) => h === used[0])) {
        const last = struck.lastIndexOf(true);
        const other: Clef = hands[last] === 'treble' ? 'bass' : 'treble';
        for (let i = last; i < p.notes.length && (i === last || !struck[i]) && !p.notes[i].rest; i++) hands[i] = other;
      }
      const voice = (clef: Clef, draw: () => Card) => {
        const out: PhraseNote[] = [];
        p.notes.forEach((n, i) => {
          if (n.rest || hands[i] !== clef) out.push(rest(n));
          else if (!struck[i]) out.push(held(out[i - 1], n));
          else out.push(note(draw(), clef, n));
        });
        return out;
      };
      return { treble: voice('treble', rh), bass: voice('bass', lh) };
    }
    // Hands together (also used for "alternate" bars with only one note).
    const treble: PhraseNote[] = [];
    const bass: PhraseNote[] = [];
    p.notes.forEach((n, i) => {
      if (n.rest) {
        treble.push(rest(n));
        bass.push(rest(n));
      } else if (!struck[i]) {
        treble.push(held(treble[i - 1], n));
        bass.push(held(bass[i - 1], n));
      } else if (both && rnd() < 0.5) {
        const c = both();
        treble.push(note(c, 'treble', n));
        bass.push(note(c, 'bass', n));
      } else {
        treble.push(note(rh(), 'treble', n));
        bass.push(note(lh(), 'bass', n));
      }
    });
    return { treble, bass };
  });
  return { staff: 'grand', key, meter: patterns[0]?.meter ?? { num: 4, den: 4 }, measures };
}

export type DrawnAccidental = '#' | 'b' | 'n' | null;

/**
 * Accidentals carry through the bar, so work out which ones actually need printing: an accidental is drawn
 * when it differs from what that line/space currently implies — the key signature, or an earlier accidental in the bar.
 */
export function accidentalsToDraw(measure: Pitch[][], key = 'C', tiedOver: boolean[] = []): DrawnAccidental[][] {
  const current = new Map<string, string>();
  return measure.map((chord, i) =>
    chord.map((p) => {
      // A note held over by a tie keeps its accidental without reprinting it.
      if (tiedOver[i]) return null;
      const pos = `${p.letter}${p.octave}`;
      const prev = current.get(pos) ?? keyAccidental(key, p.letter);
      if (prev === p.acc) return null;
      current.set(pos, p.acc);
      return p.acc === '' ? 'n' : p.acc;
    }),
  );
}
