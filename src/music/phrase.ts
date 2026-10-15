import type { Card, StaffKind } from '../srs/deck';
import type { CardState } from '../srs/scheduler';
import { type Clef, diatonicIndex, keyAccidental, type Pitch, toMidi } from './notes';
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

/** Draws the next card; `weight` (0 excludes) shapes this one draw, e.g. to keep the left hand below the right. */
export type Sampler = (weight?: (c: Card) => number) => Card | null;

const pitchKey = (c: Card) => c.notes.map(toMidi).sort((a, b) => a - b).join(',');
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Returns a function that draws cards by weight. Cards that sound the same (the same note from two decks) count as
 * one choice, and the same notes never come twice in a row unless there's nothing else.
 *
 * With `melodic`, lines move like melodies: mostly by step and skip, carrying on in the same direction for a while,
 * and turning back by step after a leap.
 */
export function weightedSampler(
  pool: Card[],
  states: Record<string, CardState>,
  rnd: () => number,
  melodic = false,
  /** Extra weight per card, e.g. to make weak spots come up more in focused practice. */
  boost?: (c: Card) => number,
): Sampler {
  const groups = new Map<string, { cards: Card[]; weights: number[]; height: number }>();
  for (const c of pool) {
    const k = pitchKey(c);
    const g = groups.get(k) ?? { cards: [], weights: [], height: height(c) };
    g.cards.push(c);
    g.weights.push(practiceWeight(states[c.id]) * (boost?.(c) ?? 1));
    groups.set(k, g);
  }
  const list = [...groups.values()];
  let prev: (typeof list)[number] | undefined;
  let before: (typeof list)[number] | undefined;
  let dir = rnd() < 0.5 ? 1 : -1;
  let lastMove = 0;
  return (weight) => {
    const ws = list.map((g) => {
      // A group's weight is its best card's (so a note in three decks isn't three times as likely).
      let w = Math.max(...g.cards.map((c, i) => g.weights[i] * (weight ? weight(c) : 1)));
      if (!prev || w === 0) return w;
      if (g === prev) return list.length > 1 ? 0 : w;
      if (!melodic) return w;
      const d = g.height - prev.height;
      w *= stepWeight(Math.abs(d));
      if (Math.abs(lastMove) >= 3) w *= sign(d) === -sign(lastMove) && Math.abs(d) <= 2 ? 3 : 0.5; // turn back after a leap
      else w *= sign(d) === dir ? 1.6 : 0.7; // keep going the same way
      if (g === before) w *= 0.6; // fewer back-and-forth wobbles
      return w;
    });
    let total = ws.reduce((a, b) => a + b, 0);
    if (total === 0) {
      // Nothing fits but the note just played: repeat it rather than give up (if the caller allows it).
      if (prev && list.length > 1 && (!weight || prev.cards.some((c) => weight(c) > 0))) ws[list.indexOf(prev)] = 1;
      total = ws.reduce((a, b) => a + b, 0);
      if (total === 0) return null;
    }
    let r = rnd() * total;
    let k = 0;
    while (k < list.length - 1 && r >= ws[k]) r -= ws[k++];
    const g = list[k];
    if (prev) {
      lastMove = g.height - prev.height;
      if (lastMove) dir = sign(lastMove);
      // Melodies don't run in one direction for ever: now and then, turn.
      if (rnd() < 0.12) dir = -dir;
    }
    before = prev;
    prev = g;
    // Which card of the group: by weight (a weak card comes up more), within this draw's limits.
    const cw = g.cards.map((c, i) => g.weights[i] * (weight ? weight(c) : 1) || 0.0001);
    let r2 = rnd() * cw.reduce((a, b) => a + b, 0);
    let j = 0;
    while (j < g.cards.length - 1 && r2 >= cw[j]) r2 -= cw[j++];
    return g.cards[j];
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
  return Array.from({ length }, () => next()!);
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

/** Where a note sounds in its bar (ticks) and which keys. */
interface Span {
  start: number;
  end: number;
  midis: number[];
}

function spansOf(voice: PhraseNote[]): Span[] {
  let t = 0;
  return voice.flatMap((n) => {
    const span = { start: t, end: t + ticksOf(n), midis: n.pitches.map(toMidi) };
    t = span.end;
    return span.midis.length ? [span] : [];
  });
}

const handMidis = (c: Card, clef: Clef) => (c.hands[clef].length ? c.hands[clef] : c.notes).map(toMidi);
const CONSONANT = new Set([0, 3, 4, 7, 8, 9]);
const HARSH = new Set([1, 2, 6, 10, 11]);

/**
 * How well a card fits under (left hand) or over (right hand) what the other hand is sounding meanwhile: never on
 * the same key or crossing it, rarely crowding it, and preferably a consonant interval away (3rds, 5ths, 6ths,
 * octaves) rather than a 2nd, 7th or tritone.
 */
function fitAgainst(clef: Clef, against: Span[], start: number, end: number): ((c: Card) => number) | undefined {
  const other = against.filter((x) => x.start < end && x.end > start).flatMap((x) => x.midis);
  if (!other.length) return undefined;
  return (c) => {
    const mine = handMidis(c, clef);
    const gap = clef === 'bass' ? Math.min(...other) - Math.max(...mine) : Math.min(...mine) - Math.max(...other);
    if (gap <= 0) return 0;
    const iv = gap % 12;
    return (gap < 3 ? 0.3 : 1) * (CONSONANT.has(iv) ? 1.5 : HARSH.has(iv) ? 0.4 : 1);
  };
}

/** Phrases like to end on the key's home note. */
const onTonic = (key: string, clef: Clef) => {
  const tonic = key.replace(/m$/, '');
  return (c: Card) => {
    const ps = c.hands[clef].length ? c.hands[clef] : c.notes;
    return ps.length === 1 && `${ps[0].letter}${ps[0].acc}` === tonic ? 10 : 1;
  };
};

/** Tunes are mostly single notes; chords and intervals belong to the accompanying hand. */
const TUNE = (c: Card) => (c.notes.length > 1 ? 0.15 : 1);
const ACCOMPANIMENT = (c: Card) => (c.notes.length > 1 ? 1.5 : 1);

const times = (a?: (c: Card) => number, b?: (c: Card) => number) => (a && b ? (c: Card) => a(c) * b(c) : (a ?? b));

/**
 * A pattern's notes in one voice, each drawn from `next` except tied-over notes, which repeat the note before.
 * `against` is the other hand's notes in the bar, to fit around; `endKey` makes the last note lean to the tonic.
 */
function patternVoice(p: RhythmPattern, clef: Clef, next: Sampler, against: Span[] = [], endKey?: string): PhraseNote[] {
  const out: PhraseNote[] = [];
  const struck = p.notes.map((n, i) => !n.rest && !p.notes[i - 1]?.tie);
  const last = struck.lastIndexOf(true);
  let t = 0;
  p.notes.forEach((n, i) => {
    const len = ticksOf(n);
    if (n.rest) out.push(rest(n));
    else if (p.notes[i - 1]?.tie) out.push(out[i - 1].pitches.length ? held(out[i - 1], n) : rest(n));
    else {
      const c = next(times(times(TUNE, fitAgainst(clef, against, t, t + len)), endKey && i === last ? onTonic(endKey, clef) : undefined));
      out.push(c ? note(c, clef, n) : rest(n));
    }
    t += len;
  });
  return out;
}

/** Single-staff phrase: one bar per rhythm pattern, each note drawn from `next`, ending (if it can) on the tonic. */
export function singleStaffPhrase(next: Sampler, clef: Clef, patterns: RhythmPattern[], key = 'C'): Phrase {
  const measures: Measure[] = patterns.map((p, i) => {
    const voice = patternVoice(p, clef, next, [], i === patterns.length - 1 ? key : undefined);
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

/** Long notes filling a bar (a whole note or two halves in 4/4, a dotted half in 3/4 or 6/8…), fitted around `against`. */
function heldNotes(draw: Sampler, clef: Clef, meter: Meter, rnd: () => number, against: Span[] = []): PhraseNote[] {
  const options = LONG_NOTES[barTicks(meter)];
  const values = options
    ? options[Math.floor(rnd() * options.length)]
    : Array.from({ length: pulsesPerBar(meter) }, () => (isCompound(meter) ? v('q', 1) : v(meter.den === 8 ? 'e' : meter.den === 2 ? 'h' : 'q')));
  let t = 0;
  return values.map((val) => {
    const len = ticksOf(val);
    const c = draw(times(ACCOMPANIMENT, fitAgainst(clef, against, t, t + len)));
    t += len;
    return c ? note(c, clef, val) : rest(val);
  });
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
  const pair = pools.both.length ? weightedSampler(pools.both, states, rnd, melodic, boost) : null;
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

  const measures: Measure[] = patterns.map((p, bar) => {
    const s = pickStyle();
    // The last bar's tune leans to the home note.
    const endKey = bar === patterns.length - 1 ? key : undefined;
    // Notes that are played (not rests, not held over by a tie).
    const struck = p.notes.map((n, i) => !n.rest && !p.notes[i - 1]?.tie);
    // The tune is written first; the other hand fits around it (below the right hand, above the left).
    if (s === 'melody') {
      const treble = patternVoice(p, 'treble', rh, [], endKey);
      return { treble, bass: heldNotes(lh, 'bass', p.meter, rnd, spansOf(treble)) };
    }
    if (s === 'bass-melody') {
      const bass = patternVoice(p, 'bass', lh, [], endKey);
      return { treble: heldNotes(rh, 'treble', p.meter, rnd, spansOf(bass)), bass };
    }
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
      const voice = (clef: Clef, draw: Sampler, against: Span[]) => {
        const out: PhraseNote[] = [];
        let t = 0;
        p.notes.forEach((n, i) => {
          const len = ticksOf(n);
          if (n.rest || hands[i] !== clef) out.push(rest(n));
          else if (!struck[i]) out.push(out[i - 1].pitches.length ? held(out[i - 1], n) : rest(n));
          else {
            const c = draw(times(TUNE, fitAgainst(clef, against, t, t + len)));
            out.push(c ? note(c, clef, n) : rest(n));
          }
          t += len;
        });
        return out;
      };
      const treble = voice('treble', rh, []);
      return { treble, bass: voice('bass', lh, spansOf(treble)) };
    }
    // Hands together (also used for "alternate" bars with only one note).
    const treble: PhraseNote[] = [];
    const bass: PhraseNote[] = [];
    let t = 0;
    p.notes.forEach((n, i) => {
      const len = ticksOf(n);
      if (n.rest) {
        treble.push(rest(n));
        bass.push(rest(n));
      } else if (!struck[i]) {
        treble.push(treble[i - 1].pitches.length ? held(treble[i - 1], n) : rest(n));
        bass.push(bass[i - 1].pitches.length ? held(bass[i - 1], n) : rest(n));
      } else {
        const c = pair && rnd() < 0.5 ? pair() : null;
        if (c) {
          treble.push(note(c, 'treble', n));
          bass.push(note(c, 'bass', n));
        } else {
          const r = rh(times(TUNE, endKey && i === struck.lastIndexOf(true) ? onTonic(endKey, 'treble') : undefined));
          treble.push(r ? note(r, 'treble', n) : rest(n));
          const l = lh(times(ACCOMPANIMENT, fitAgainst('bass', spansOf(treble.slice(-1)).map((x) => ({ ...x, start: t, end: t + len })), t, t + len)));
          bass.push(l ? note(l, 'bass', n) : rest(n));
        }
      }
      t += len;
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
