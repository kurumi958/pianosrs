import { describe, expect, it } from 'vitest';
import { accidentalInKey, KEY_SIGNATURES, midiName, parsePitch, toMidi, vexKey } from '../src/music/notes';
import { withKey } from '../src/srs/cards';
import { cardsInKey, courseProgress, knownCards, learnedKeys, studyCards } from '../src/srs/study';
import type { CardState } from '../src/srs/scheduler';
import { DEFAULT_SCHEDULER as cfg, newCardState, schedule } from '../src/srs/scheduler';
import { ALL_CARDS, CARD_BY_ID, cardLabel, DECKS } from '../src/srs/deck';
import { pickNext, countQueue } from '../src/srs/session';
import { AttemptMatcher } from '../src/midi/matcher';
import {
  accidentalsToDraw,
  generatePhrase,
  grandStaffPhrase,
  type GrandStyle,
  phraseEvents,
  singleStaffPhrase,
} from '../src/music/phrase';
import { autoGrade } from '../src/srs/grading';
import { mulberry32 } from '../src/srs/deck';

const MIN = 60_000;
const COURSES = DECKS.filter((d) => d.kind === 'course');
const deckCards = (id: string) => DECKS.find((d) => d.id === id)!.cards;
const DAY = 86_400_000;

describe('notes', () => {
  it('converts pitches to MIDI', () => {
    expect(toMidi(parsePitch('C4'))).toBe(60);
    expect(toMidi(parsePitch('A4'))).toBe(69);
    expect(toMidi(parsePitch('Bb3'))).toBe(58);
    expect(toMidi(parsePitch('F#2'))).toBe(42);
    expect(midiName(61)).toBe('C#4');
    expect(vexKey(parsePitch('Eb5'))).toBe('eb/5');
  });
});

describe('scheduler', () => {
  const now = 1_000_000_000_000;
  it('moves a new card through learning steps to review', () => {
    let c = schedule(newCardState('x'), 3, now);
    expect(c.status).toBe('learning');
    expect(c.due).toBe(now + 10 * MIN);
    c = schedule(c, 3, c.due);
    expect(c.status).toBe('review');
    expect(c.interval).toBe(1);
  });
  it('graduates immediately on Easy', () => {
    const c = schedule(newCardState('x'), 4, now);
    expect(c.status).toBe('review');
    expect(c.interval).toBe(cfg.easyIntervalDays);
  });
  it('grows intervals with ease and lapses on Again', () => {
    const base = { ...newCardState('x'), status: 'review' as const, interval: 10, due: now };
    expect(schedule(base, 3, now).interval).toBe(25);
    expect(schedule(base, 2, now).interval).toBe(12);
    expect(schedule(base, 4, now).interval).toBe(Math.round(10 * 2.65 * 1.3));
    const lapsed = schedule(base, 1, now);
    expect(lapsed.status).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.ease).toBeCloseTo(2.3);
    const back = schedule(lapsed, 3, lapsed.due);
    expect(back.status).toBe('review');
    expect(back.interval).toBe(5);
    expect(back.due).toBe(lapsed.due + 5 * DAY);
  });
  it('never drops ease below the minimum', () => {
    const c = schedule({ ...newCardState('x'), status: 'review', interval: 3, ease: 1.35 }, 2, now);
    expect(c.ease).toBe(cfg.minEase);
  });
});

describe('decks', () => {
  it('has unique card ids', () => {
    expect(CARD_BY_ID.size).toBe(ALL_CARDS.length);
  });
  it('starts each staff deck with its landmark notes', () => {
    expect(deckCards('treble-staff')[0].id).toBe('treble:C4');
    expect(deckCards('bass-staff')[0].id).toBe('bass:C4');
  });
  it('keeps chords sorted and inside their range', () => {
    for (const c of ALL_CARDS) {
      const m = c.notes.map(toMidi);
      expect([...m].sort((a, b) => a - b)).toEqual(m);
    }
    expect(CARD_BY_ID.has('treble:C4+E4+G4')).toBe(true);
  });
});

describe('grand staff decks', () => {
  const deck = (id: string) => DECKS.find((d) => d.id === id)!.cards;
  it('splits notes between the hands', () => {
    const c = CARD_BY_ID.get('grand:C4+E4+G4|C3')!;
    expect(c.staff).toBe('grand');
    expect(c.hands.treble.map(toMidi)).toEqual([60, 64, 67]);
    expect(c.hands.bass.map(toMidi)).toEqual([48]);
    expect(c.notes.map(toMidi)).toEqual([48, 60, 64, 67]);
  });
  it('has middle C on either staff', () => {
    expect(CARD_BY_ID.get('grand:C4|')!.hands.treble).toHaveLength(1);
    expect(CARD_BY_ID.get('grand:|C4')!.hands.bass).toHaveLength(1);
  });
  it('builds hands-together cards in C then G position', () => {
    const hands = deck('grand-hands');
    expect(hands).toHaveLength(48); // 2 shapes overlap between the positions
    expect(hands[0].id).toBe('grand:C4|C3');
    expect(hands.slice(0, 25).every((c) => c.hands.bass[0].octave === 3)).toBe(true);
  });
  it('keeps every card on its staff\'s side of middle C (give or take ledger lines)', () => {
    for (const c of ALL_CARDS) {
      for (const p of c.hands.treble) expect(toMidi(p)).toBeGreaterThanOrEqual(55);
      for (const p of c.hands.bass) expect(toMidi(p)).toBeLessThanOrEqual(67);
    }
  });
});

describe('session queue', () => {
  const cards = deckCards('treble-staff').slice(0, 3);
  const now = 1_000_000_000_000;
  it('introduces new cards in order up to the daily limit', () => {
    expect(pickNext({ cards, states: {}, now, newRemaining: 1 })?.card.id).toBe('treble:C4');
    expect(pickNext({ cards, states: {}, now, newRemaining: 0 })).toBeNull();
  });
  it('prefers due cards over new ones and learns ahead at the end', () => {
    const learning = schedule(newCardState(cards[1].id), 3, now - 20 * MIN);
    const states = { [cards[1].id]: learning };
    expect(pickNext({ cards, states, now, newRemaining: 5 })?.card.id).toBe(cards[1].id);
    const soon = { [cards[1].id]: { ...learning, due: now + 5 * MIN } };
    expect(pickNext({ cards, states: soon, now, newRemaining: 0 })?.card.id).toBe(cards[1].id);
    expect(countQueue({ cards, states, now, newRemaining: 5 })).toEqual({ newCount: 2, learning: 1, review: 0 });
  });
});

describe('matcher', () => {
  it('accepts chords in any order and rejects wrong notes', () => {
    const m = new AttemptMatcher([60, 64, 67]);
    expect(m.noteOn(67)).toBe('pending');
    expect(m.noteOn(60)).toBe('pending');
    expect(m.noteOn(64)).toBe('correct');
    const w = new AttemptMatcher([60]);
    expect(w.noteOn(62)).toBe('wrong');
    expect(w.wrongNotes).toEqual([62]);
  });
  it('can ignore octaves', () => {
    expect(new AttemptMatcher([60], true).noteOn(72)).toBe('correct');
    expect(new AttemptMatcher([60]).noteOn(72)).toBe('wrong');
  });
});

describe('phrases', () => {
  it('generates the requested length without immediate repeats', () => {
    const p = generatePhrase(deckCards('treble-staff'), {}, 50, mulberry32(7));
    expect(p).toHaveLength(50);
    for (let i = 1; i < p.length; i++) expect(p[i]).not.toBe(p[i - 1]);
  });
  it('prints accidentals only when the bar needs them', () => {
    const P = parsePitch;
    expect(accidentalsToDraw([[P('F#4')], [P('F#4')], [P('F4')], [P('F5')]])).toEqual([['#'], [null], ['n'], [null]]);
  });
});

describe('rhythmic phrases', () => {
  const treble = DECKS.find((d) => d.id === 'treble-staff')!.cards;
  const bass = DECKS.find((d) => d.id === 'bass-staff')!.cards;
  const both = DECKS.find((d) => d.id === 'grand-hands')!.cards.slice(0, 4);
  const beats = (v: { beats: number }[]) => v.reduce((a, n) => a + n.beats, 0);

  it('pads single-staff phrases to full bars', () => {
    const p = singleStaffPhrase(treble.slice(0, 6), 'treble');
    expect(p.measures).toHaveLength(2);
    expect(p.measures[1].treble.map((n) => n.pitches.length)).toEqual([1, 1, 0, 0]);
    expect(phraseEvents(p)).toHaveLength(6);
  });

  it('fills both voices of every grand-staff bar with four beats', () => {
    for (const style of ['mixed', 'melody', 'bass-melody', 'alternate', 'together'] as GrandStyle[]) {
      const p = grandStaffPhrase({ rh: treble, lh: bass, both }, {}, 12, style, mulberry32(3));
      expect(p.measures).toHaveLength(12);
      for (const m of p.measures) {
        expect(beats(m.treble)).toBe(4);
        expect(beats(m.bass)).toBe(4);
      }
    }
  });

  it('merges notes that start together into one event', () => {
    const p = grandStaffPhrase({ rh: treble, lh: bass, both: [] }, {}, 1, 'melody', mulberry32(1));
    const ev = phraseEvents(p);
    expect(ev).toHaveLength(4);
    expect(ev[0].beat).toBe(0);
    expect(ev[0].cards).toHaveLength(2); // RH note + LH held note
    expect(ev[1].cards).toHaveLength(1);
  });

  it('uses both hands in alternating bars', () => {
    const p = grandStaffPhrase({ rh: treble, lh: bass, both: [] }, {}, 20, 'alternate', mulberry32(9));
    for (const m of p.measures) {
      expect(m.treble.some((n) => n.pitches.length)).toBe(true);
      expect(m.bass.some((n) => n.pitches.length)).toBe(true);
      expect(phraseEvents({ staff: 'grand', key: 'C', measures: [m] })).toHaveLength(4);
    }
  });
});

describe('key signatures', () => {
  it('only prints accidentals the key does not imply', () => {
    expect(accidentalInKey(parsePitch('F#4'), 'G')).toBeNull();
    expect(accidentalInKey(parsePitch('F4'), 'G')).toBe('n');
    expect(accidentalInKey(parsePitch('F#4'), 'C')).toBe('#');
    expect(accidentalInKey(parsePitch('C4'), 'G')).toBeNull();
  });
  it('knows all 15 major key signatures', () => {
    expect(Object.keys(KEY_SIGNATURES)).toHaveLength(15);
    expect(KEY_SIGNATURES.Eb).toEqual({ B: 'b', E: 'b', A: 'b' });
    expect(KEY_SIGNATURES.E).toEqual({ F: '#', C: '#', G: '#', D: '#' });
    expect(KEY_SIGNATURES['C#']).toEqual({ F: '#', C: '#', G: '#', D: '#', A: '#', E: '#', B: '#' });
  });
  it('carries accidentals through a bar against the key', () => {
    const P = parsePitch;
    expect(accidentalsToDraw([[P('F#4')], [P('F4')], [P('F4')], [P('F#4')], [P('F#5')]], 'G')).toEqual([[null], ['n'], [null], ['#'], [null]]);
  });
  it('rewrites cards into another key', () => {
    const f = CARD_BY_ID.get('treble:F4')!;
    expect(withKey(f, 'D')!.id).toBe('treble[D]:F#4');
    expect(withKey(f, 'D')!.notes.map(toMidi)).toEqual([66]);
    expect(withKey(CARD_BY_ID.get('treble:F#4')!, 'D')).toBeNull(); // chromatic in C
    expect(withKey(CARD_BY_ID.get('grand[G]:F#4|')!, 'Bb')!.notes.map(toMidi)).toEqual([65]);
  });
  it('uses real cards when a phrase is moved into a key, so mistakes count', () => {
    const inD = cardsInKey([CARD_BY_ID.get('grand:F4|')!, CARD_BY_ID.get('grand:G4|')!], 'D');
    expect(inD[0]).toBe(CARD_BY_ID.get('grand[D]:F#4|')); // from the sharp-keys deck
    expect(inD[1].id).toBe('grand[D]:G4|');
  });
  it('counts a key as learned once you read in it', () => {
    const cards = [CARD_BY_ID.get('keysig:A')!, CARD_BY_ID.get('grand[G]:F#4|')!, CARD_BY_ID.get('treble:C4')!];
    expect(learnedKeys(cards).sort()).toEqual(['C', 'G']);
  });
  it('builds name-the-key cards answered in any octave', () => {
    const c = CARD_BY_ID.get('keysig:Bb')!;
    expect(c.prompt).toBe('key');
    expect(new AttemptMatcher(c.notes.map(toMidi), c.anyOctave).noteOn(46)).toBe('correct'); // Bb2
    expect(cardLabel(c)).toBe('B♭ major');
  });
  it('gives keyed cards their own ids', () => {
    expect(CARD_BY_ID.get('grand[G]:F#4|')!.key).toBe('G');
  });
});

describe('beginner course', () => {
  const course = COURSES[0];
  const units = course.units!;
  const learn = (ids: string[]): Record<string, CardState> =>
    Object.fromEntries(ids.map((id) => [id, { ...newCardState(id), status: 'review', interval: 3, due: Date.now() + DAY }]));

  it('shares cards with topic decks', () => {
    expect(units[0].cards[0]).toBe(CARD_BY_ID.get('grand:C4|'));
    expect(deckCards('grand-staff')).toContain(CARD_BY_ID.get('grand:C4|'));
  });
  it('has no duplicate cards across units', () => {
    const ids = course.cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('opens the next unit once most of the current one is learned', () => {
    expect(courseProgress(course, {}).open).toBe(0);
    const u0 = units[0].cards.map((c) => c.id);
    const most = learn(u0.slice(0, -1));
    // Every card must at least be seen, so one card still new keeps the unit open.
    expect(courseProgress(course, most).open).toBe(0);
    most[u0.at(-1)!] = { ...newCardState(u0.at(-1)!), status: 'learning', due: 0 };
    expect(courseProgress(course, most).open).toBe(1); // 6 of 7 learned ≥ 80%
  });
  it('lets you start later and open units by hand', () => {
    const p = courseProgress(course, {}, { start: 3, unlocked: 5 });
    expect(p.open).toBe(5);
    expect(p.units[0].status).toBe('skipped');
    expect(p.units[4].status).toBe('open');
    expect(p.units[6].status).toBe('locked');
  });
  it('studies only open units, and treats skipped units as known for sight-reading', () => {
    const input = { enabledDecks: [course.id], courses: { [course.id]: { start: 2, unlocked: 2 } }, states: {} };
    expect(studyCards(input)).toEqual(units[2].cards);
    expect(knownCards(input)).toEqual([...units[0].cards, ...units[1].cards]);
  });
});

describe('melodic phrases', () => {
  it('move by smaller steps than random ones', () => {
    const pool = deckCards('treble-staff');
    const avgLeap = (ps: typeof pool) =>
      ps.slice(1).reduce((a, c, i) => a + Math.abs(toMidi(c.notes[0]) - toMidi(ps[i].notes[0])), 0) / (ps.length - 1);
    const random = generatePhrase(pool, {}, 400, mulberry32(5));
    const melodic = generatePhrase(pool, {}, 400, mulberry32(5), true);
    expect(avgLeap(melodic)).toBeLessThan(avgLeap(random) * 0.6);
  });
});

describe('grading', () => {
  const g = { easyMs: 2000, goodMs: 5000 };
  it('grades by correctness and speed', () => {
    expect(autoGrade(false, 100, 1, g)).toBe(1);
    expect(autoGrade(true, 1500, 1, g)).toBe(4);
    expect(autoGrade(true, 4000, 1, g)).toBe(3);
    expect(autoGrade(true, 6000, 1, g)).toBe(2);
    expect(autoGrade(true, 2800, 3, g)).toBe(4);
  });
});
