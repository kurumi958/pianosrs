import type { Card, StaffKind } from '../srs/deck';
import type { CardState } from '../srs/scheduler';
import { type Clef, diatonicIndex, keyAccidental, type Pitch } from './notes';

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
export function weightedSampler(pool: Card[], states: Record<string, CardState>, rnd: () => number, melodic = false): () => Card {
  const weights = pool.map((c) => practiceWeight(states[c.id]));
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

export type Beats = 1 | 2 | 4;

/** One note, chord or rest (no pitches) in one staff's voice. */
export interface PhraseNote {
  pitches: Pitch[];
  beats: Beats;
  /** The flash card this note came from, so mistakes can feed back into reviews. */
  card?: Card;
}

/** One 4/4 bar. A voice is either empty (staff not used) or adds up to 4 beats. */
export type Measure = Record<Clef, PhraseNote[]>;

export interface Phrase {
  staff: StaffKind;
  /** Key signature the phrase is written in. */
  key: string;
  measures: Measure[];
}

/** Something to play: every note that starts at the same moment, across both hands. */
export interface PhraseEvent {
  measure: number;
  beat: number;
  pitches: Pitch[];
  cards: Card[];
}

export const eventKey = (measure: number, beat: number) => `${measure}:${beat}`;

export function phraseEvents(phrase: Phrase): PhraseEvent[] {
  const events: PhraseEvent[] = [];
  phrase.measures.forEach((m, mi) => {
    const byBeat = new Map<number, PhraseEvent>();
    for (const clef of ['treble', 'bass'] as Clef[]) {
      let beat = 0;
      for (const n of m[clef]) {
        if (n.pitches.length) {
          const e = byBeat.get(beat) ?? { measure: mi, beat, pitches: [], cards: [] };
          e.pitches.push(...n.pitches);
          if (n.card && !e.cards.includes(n.card)) e.cards.push(n.card);
          byBeat.set(beat, e);
        }
        beat += n.beats;
      }
    }
    events.push(...[...byBeat.values()].sort((a, b) => a.beat - b.beat));
  });
  return events;
}

const note = (card: Card, clef: Clef, beats: Beats): PhraseNote => ({ pitches: card.hands[clef], beats, card });
const rest = (beats: Beats): PhraseNote => ({ pitches: [], beats });

/** Single-staff phrase of quarter notes; the last bar is padded with rests. */
export function singleStaffPhrase(cards: Card[], clef: Clef, key = 'C'): Phrase {
  const measures: Measure[] = [];
  for (let i = 0; i < cards.length; i += 4) {
    const voice: PhraseNote[] = cards.slice(i, i + 4).map((c) => ({ pitches: c.notes, beats: 1, card: c }));
    while (voice.length < 4) voice.push(rest(1));
    measures.push(clef === 'treble' ? { treble: voice, bass: [] } : { treble: [], bass: voice });
  }
  return { staff: clef, key, measures };
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

/**
 * Two-handed phrase on the grand staff. Bar patterns:
 * - melody: RH quarter notes over a held LH whole note or two half notes
 * - bass-melody: the same with the hands swapped
 * - alternate: the melody passes between the hands, one note per beat
 * - together: both hands on every beat
 */
export function grandStaffPhrase(
  pools: GrandPools,
  states: Record<string, CardState>,
  measureCount: number,
  style: GrandStyle,
  rnd: () => number = Math.random,
  melodic = false,
  key = 'C',
): Phrase {
  const rh = weightedSampler(pools.rh, states, rnd, melodic);
  const lh = weightedSampler(pools.lh, states, rnd, melodic);
  const both = pools.both.length ? weightedSampler(pools.both, states, rnd, melodic) : null;
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
  const held = (draw: () => Card, clef: Clef): PhraseNote[] =>
    rnd() < 0.5 ? [note(draw(), clef, 4)] : [note(draw(), clef, 2), note(draw(), clef, 2)];

  const measures: Measure[] = [];
  for (let i = 0; i < measureCount; i++) {
    const s = pickStyle();
    if (s === 'melody') {
      measures.push({ treble: [1, 2, 3, 4].map(() => note(rh(), 'treble', 1)), bass: held(lh, 'bass') });
    } else if (s === 'bass-melody') {
      measures.push({ treble: held(rh, 'treble'), bass: [1, 2, 3, 4].map(() => note(lh(), 'bass', 1)) });
    } else if (s === 'alternate') {
      // Each hand gets at least one beat.
      let hands = [0, 1, 2, 3].map(() => (rnd() < 0.5 ? 'treble' : 'bass'));
      if (hands.every((h) => h === hands[0])) hands = hands.map((h, k) => (k === 3 ? (h === 'treble' ? 'bass' : 'treble') : h));
      measures.push({
        treble: hands.map((h) => (h === 'treble' ? note(rh(), 'treble', 1) : rest(1))),
        bass: hands.map((h) => (h === 'bass' ? note(lh(), 'bass', 1) : rest(1))),
      });
    } else {
      const treble: PhraseNote[] = [];
      const bass: PhraseNote[] = [];
      for (let b = 0; b < 4; b++) {
        if (both && rnd() < 0.5) {
          const c = both();
          treble.push(note(c, 'treble', 1));
          bass.push(note(c, 'bass', 1));
        } else {
          treble.push(note(rh(), 'treble', 1));
          bass.push(note(lh(), 'bass', 1));
        }
      }
      measures.push({ treble, bass });
    }
  }
  return { staff: 'grand', key, measures };
}

export type DrawnAccidental = '#' | 'b' | 'n' | null;

/**
 * Accidentals carry through the bar, so work out which ones actually need printing: an accidental is drawn
 * when it differs from what that line/space currently implies — the key signature, or an earlier accidental in the bar.
 */
export function accidentalsToDraw(measure: Pitch[][], key = 'C'): DrawnAccidental[][] {
  const current = new Map<string, string>();
  return measure.map((chord) =>
    chord.map((p) => {
      const pos = `${p.letter}${p.octave}`;
      const prev = current.get(pos) ?? keyAccidental(key, p.letter);
      if (prev === p.acc) return null;
      current.set(pos, p.acc);
      return p.acc === '' ? 'n' : p.acc;
    }),
  );
}
