import type { Card, StaffKind } from '../srs/deck';
import type { CardState } from '../srs/scheduler';
import { type Clef, diatonicIndex, keyAccidental, type Pitch } from './notes';
import type { Dur, RhythmPattern } from './rhythm';

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

/** One note, chord or rest (no pitches) in one staff's voice. */
export interface PhraseNote {
  pitches: Pitch[];
  dur: Dur;
  /** The flash card this note came from, so mistakes can feed back into reviews. */
  card?: Card;
}

/** One bar. A voice is either empty (staff not used) or adds up to the bar's beats. */
export type Measure = Record<Clef, PhraseNote[]>;

export interface Phrase {
  staff: StaffKind;
  /** Key signature the phrase is written in. */
  key: string;
  /** Quarter-note beats per bar (the time signature is beats/4). */
  beats: number;
  measures: Measure[];
}

/** Something to play: every note that starts at the same moment, across both hands. */
export interface PhraseEvent {
  measure: number;
  /** Beat within the bar. */
  beat: number;
  /** Beats from the start of the phrase. */
  time: number;
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
          const e = byBeat.get(beat) ?? { measure: mi, beat, time: mi * phrase.beats + beat, pitches: [], cards: [] };
          e.pitches.push(...n.pitches);
          if (n.card && !e.cards.includes(n.card)) e.cards.push(n.card);
          byBeat.set(beat, e);
        }
        beat += n.dur;
      }
    }
    events.push(...[...byBeat.values()].sort((a, b) => a.beat - b.beat));
  });
  return events;
}

const note = (card: Card, clef: Clef, dur: Dur): PhraseNote => ({ pitches: card.hands[clef].length ? card.hands[clef] : card.notes, dur, card });
const rest = (dur: Dur): PhraseNote => ({ pitches: [], dur });

/** Plain quarter notes, for phrases that aren't practising rhythm. */
export const QUARTERS = (beats: number): RhythmPattern => ({ beats, notes: Array.from({ length: beats }, () => ({ dur: 1 as Dur })) });

/** Single-staff phrase: one bar per rhythm pattern, each note drawn from `next`. */
export function singleStaffPhrase(next: () => Card, clef: Clef, patterns: RhythmPattern[], key = 'C'): Phrase {
  const measures: Measure[] = patterns.map((p) => {
    const voice = p.notes.map((n) => (n.rest ? rest(n.dur) : note(next(), clef, n.dur)));
    return clef === 'treble' ? { treble: voice, bass: [] } : { treble: [], bass: voice };
  });
  return { staff: clef, key, beats: patterns[0]?.beats ?? 4, measures };
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

/** Long notes filling a bar: a whole note or two halves in 4/4, a dotted half in 3/4, a half in 2/4. */
function heldNotes(draw: () => Card, clef: Clef, beats: number, rnd: () => number): PhraseNote[] {
  if (beats === 4) return rnd() < 0.5 ? [note(draw(), clef, 4)] : [note(draw(), clef, 2), note(draw(), clef, 2)];
  if (beats === 3) return [note(draw(), clef, 3)];
  if (beats === 2) return [note(draw(), clef, 2)];
  return Array.from({ length: beats }, () => note(draw(), clef, 1));
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

  const measures: Measure[] = patterns.map((p) => {
    const s = pickStyle();
    const played = p.notes.filter((n) => !n.rest).length;
    if (s === 'melody') {
      return { treble: p.notes.map((n) => (n.rest ? rest(n.dur) : note(rh(), 'treble', n.dur))), bass: heldNotes(lh, 'bass', p.beats, rnd) };
    }
    if (s === 'bass-melody') {
      return { treble: heldNotes(rh, 'treble', p.beats, rnd), bass: p.notes.map((n) => (n.rest ? rest(n.dur) : note(lh(), 'bass', n.dur))) };
    }
    if (s === 'alternate' && played >= 2) {
      // Each hand gets at least one note.
      let hands = p.notes.map(() => (rnd() < 0.5 ? 'treble' : 'bass'));
      const playedHands = hands.filter((_, i) => !p.notes[i].rest);
      if (playedHands.every((h) => h === playedHands[0])) {
        const last = p.notes.map((n) => !n.rest).lastIndexOf(true);
        hands = hands.map((h, i) => (i === last ? (h === 'treble' ? 'bass' : 'treble') : h));
      }
      return {
        treble: p.notes.map((n, i) => (!n.rest && hands[i] === 'treble' ? note(rh(), 'treble', n.dur) : rest(n.dur))),
        bass: p.notes.map((n, i) => (!n.rest && hands[i] === 'bass' ? note(lh(), 'bass', n.dur) : rest(n.dur))),
      };
    }
    // Hands together (also used for "alternate" bars with only one note).
    const treble: PhraseNote[] = [];
    const bass: PhraseNote[] = [];
    for (const n of p.notes) {
      if (n.rest) {
        treble.push(rest(n.dur));
        bass.push(rest(n.dur));
      } else if (both && rnd() < 0.5) {
        const c = both();
        treble.push(note(c, 'treble', n.dur));
        bass.push(note(c, 'bass', n.dur));
      } else {
        treble.push(note(rh(), 'treble', n.dur));
        bass.push(note(lh(), 'bass', n.dur));
      }
    }
    return { treble, bass };
  });
  return { staff: 'grand', key, beats: patterns[0]?.beats ?? 4, measures };
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
