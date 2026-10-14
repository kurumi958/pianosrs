import { describe, expect, it } from 'vitest';
import { midiName, parsePitch, toMidi, vexKey } from '../src/music/notes';
import { DEFAULT_SCHEDULER as cfg, newCardState, schedule } from '../src/srs/scheduler';
import { ALL_CARDS, CARD_BY_ID, DECKS } from '../src/srs/deck';
import { pickNext, countQueue } from '../src/srs/session';
import { AttemptMatcher } from '../src/midi/matcher';
import { accidentalsToDraw, generatePhrase } from '../src/music/phrase';
import { autoGrade } from '../src/srs/grading';
import { mulberry32 } from '../src/srs/deck';

const MIN = 60_000;
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
    expect(DECKS[0].cards[0].id).toBe('treble:C4');
    expect(DECKS[1].cards[0].id).toBe('bass:C4');
  });
  it('keeps chords sorted and inside their range', () => {
    for (const c of ALL_CARDS) {
      const m = c.notes.map(toMidi);
      expect([...m].sort((a, b) => a - b)).toEqual(m);
    }
    expect(CARD_BY_ID.has('treble:C4+E4+G4')).toBe(true);
  });
});

describe('session queue', () => {
  const cards = DECKS[0].cards.slice(0, 3);
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
    const p = generatePhrase(DECKS[0].cards, {}, 50, mulberry32(7));
    expect(p).toHaveLength(50);
    for (let i = 1; i < p.length; i++) expect(p[i]).not.toBe(p[i - 1]);
  });
  it('prints accidentals only when the bar needs them', () => {
    const P = parsePitch;
    expect(accidentalsToDraw([[P('F#4')], [P('F#4')], [P('F4')], [P('F5')]])).toEqual([['#'], [null], ['n'], [null]]);
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
