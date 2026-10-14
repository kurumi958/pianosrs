import { describe, expect, it } from 'vitest';
import {
  accidentalInKey,
  KEY_SIGNATURES,
  keyAccidental,
  keyLabel,
  midiName,
  MINOR_KEYS,
  parsePitch,
  scaleAccidental,
  signatureKey,
  toMidi,
  tonic,
  vexKey,
} from '../src/music/notes';
import { withKey } from '../src/srs/cards';
import { cardsInKey, courseProgress, knownCards, learnedKeys, phraseRhythms, studyCards } from '../src/srs/study';
import type { CardState } from '../src/srs/scheduler';
import {
  DEFAULT_SCHEDULER,
  formatDelay,
  fsrsInterval,
  markKnown,
  memoryFromHistory,
  newCardState,
  parseSteps,
  schedule,
  type Grade,
  type SchedulerConfig,
} from '../src/srs/scheduler';
import { fillFsrsMemory, needsFsrsMemory } from '../src/srs/memory';
import { dayKey, DEFAULT_SETTINGS, emptyData, nextDayStart, normalize, type ReviewLogEntry, setDayStartHour } from '../src/storage';
import { ALL_CARDS, CARD_BY_ID, cardLabel, DECK_GROUPS, DECKS } from '../src/srs/deck';
import { pickNext, countQueue } from '../src/srs/session';
import { AttemptMatcher } from '../src/midi/matcher';
import {
  barTicks,
  gradeTaps,
  hitWindow,
  matchTaps,
  meterName,
  type NoteValue,
  onsets,
  parseMeter,
  parseRhythm,
  pulseBpm,
  pulsesPerBar,
  pulseTicks,
  rhythmSpec,
  shortestGap,
  tickMs,
  ticksOf,
  TPQ,
} from '../src/music/rhythm';
import { TempoJudge } from '../src/music/tempo';
import { tempoMarking } from '../src/components/Metronome';
import {
  QUARTERS,
  weightedSampler,
  accidentalsToDraw,
  generatePhrase,
  grandStaffPhrase,
  type GrandStyle,
  phraseEvents,
  singleStaffPhrase,
  tieAcrossBars,
  voiceNotes,
} from '../src/music/phrase';
import { autoGrade, limitEasy } from '../src/srs/grading';
import { studyStreak, todayPlan } from '../src/srs/today';
import { rate, retentionTable } from '../src/srs/retention';
import { focusKey, focusStaff, recordSightResults, weakSpots } from '../src/srs/weak';
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

// SM-2 exactly as before FSRS became the default: no fuzz, "new interval" 0.5, 365-day cap.
const sm2: SchedulerConfig = { ...DEFAULT_SCHEDULER, algorithm: 'sm2', fuzz: false, lapseMultiplier: 0.5, maxIntervalDays: 365 };
const fsrsCfg: SchedulerConfig = { ...DEFAULT_SCHEDULER, fuzz: false };

describe('SM-2 scheduler', () => {
  const now = 1_000_000_000_000;
  it('moves a new card through learning steps to review', () => {
    let c = schedule(newCardState('x'), 3, now, sm2);
    expect(c.status).toBe('learning');
    expect(c.due).toBe(now + 10 * MIN);
    c = schedule(c, 3, c.due, sm2);
    expect(c.status).toBe('review');
    expect(c.interval).toBe(1);
  });
  it('graduates immediately on Easy', () => {
    const c = schedule(newCardState('x'), 4, now, sm2);
    expect(c.status).toBe('review');
    expect(c.interval).toBe(sm2.easyIntervalDays);
  });
  it('grows intervals with ease and lapses on Again', () => {
    const base = { ...newCardState('x'), status: 'review' as const, interval: 10, due: now };
    expect(schedule(base, 3, now, sm2).interval).toBe(25);
    expect(schedule(base, 2, now, sm2).interval).toBe(12);
    expect(schedule(base, 4, now, sm2).interval).toBe(Math.round(10 * 2.65 * 1.3));
    const lapsed = schedule(base, 1, now, sm2);
    expect(lapsed.status).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.ease).toBeCloseTo(2.3);
    const back = schedule(lapsed, 3, lapsed.due, sm2);
    expect(back.status).toBe('review');
    expect(back.interval).toBe(5);
    expect(back.due).toBe(lapsed.due + 5 * DAY);
  });
  it('never drops ease below 1.3', () => {
    const c = schedule({ ...newCardState('x'), status: 'review', interval: 3, ease: 1.35 }, 2, now, sm2);
    expect(c.ease).toBe(1.3);
  });
  it('applies the interval modifier and custom steps', () => {
    const base = { ...newCardState('x'), status: 'review' as const, interval: 10, due: now };
    expect(schedule(base, 3, now, { ...sm2, intervalModifier: 0.8 }).interval).toBe(20);
    const c = schedule(newCardState('x'), 3, now, { ...sm2, learningSteps: '5m 1h 1d' });
    expect(c.due).toBe(now + 60 * MIN);
    // No relearning steps: a lapse goes straight back to review.
    expect(schedule(base, 1, now, { ...sm2, relearningSteps: '' }).status).toBe('review');
  });
  it('fuzzes longer intervals a little', () => {
    const base = { ...newCardState('x'), status: 'review' as const, interval: 40, due: now };
    const seen = new Set(Array.from({ length: 30 }, () => schedule(base, 3, now, { ...sm2, fuzz: true }).interval));
    expect(seen.size).toBeGreaterThan(1);
    for (const i of seen) expect(Math.abs(i - 100)).toBeLessThanOrEqual(8); // about ±7% at this length, as in Anki
  });
});

describe('FSRS scheduler', () => {
  const now = 1_000_000_000_000;
  it('uses learning steps for new cards, then graduates with a memory', () => {
    let c = schedule(newCardState('x'), 3, now, fsrsCfg);
    expect(c.status).toBe('learning');
    expect(c.due).toBe(now + 10 * MIN);
    expect(c.stability).toBeGreaterThan(0);
    expect(schedule(newCardState('x'), 1, now, fsrsCfg).due).toBe(now + MIN);
    c = schedule(c, 3, c.due, fsrsCfg);
    expect(c.status).toBe('review');
    expect(c.interval).toBeGreaterThanOrEqual(1);
  });
  it('spaces reviews further apart each time you remember', () => {
    let c = schedule(newCardState('x'), 4, now, fsrsCfg);
    const intervals = [c.interval];
    for (let i = 0; i < 3; i++) {
      c = schedule(c, 3, c.due, fsrsCfg);
      intervals.push(c.interval);
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });
  it('relearns a forgotten card and lowers its stability', () => {
    const learned = schedule(schedule(newCardState('x'), 4, now, fsrsCfg), 3, now + 4 * DAY, fsrsCfg);
    const lapsed = schedule(learned, 1, learned.due, fsrsCfg);
    expect(lapsed.status).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.stability!).toBeLessThan(learned.stability!);
  });
  it('schedules sooner for a higher desired retention', () => {
    expect(fsrsInterval(20, { ...fsrsCfg, desiredRetention: 0.95 })).toBeLessThan(fsrsInterval(20, fsrsCfg));
    expect(fsrsInterval(20, { ...fsrsCfg, desiredRetention: 0.8 })).toBeGreaterThan(fsrsInterval(20, fsrsCfg));
  });
  it('takes over SM-2 cards, estimating memory when there is no history', () => {
    const sm2Card = { ...newCardState('x'), status: 'review' as const, interval: 12, ease: 2.5, due: now, lastReview: now - 12 * DAY };
    const next = schedule(sm2Card, 3, now, fsrsCfg);
    expect(next.status).toBe('review');
    expect(next.interval).toBeGreaterThan(12);
  });
  it('rebuilds memory from review history', () => {
    const h = [
      { t: now, grade: 3 as const },
      { t: now + 10 * MIN, grade: 3 as const },
      { t: now + 3 * DAY, grade: 3 as const },
    ];
    const mem = memoryFromHistory(h, fsrsCfg)!;
    expect(mem.stability).toBeGreaterThan(3);
    expect(memoryFromHistory([], fsrsCfg)).toBeNull();
  });
  it('fills in memory for every studied card, from the log or an estimate', () => {
    const d = emptyData();
    d.cards.a = { ...newCardState('a'), status: 'review', interval: 5 };
    d.cards.b = { ...newCardState('b'), status: 'review', interval: 30, ease: 2.1 };
    d.cards.c = newCardState('c');
    d.log = [
      { id: 'a', t: now, grade: 3, ms: 1000 },
      { id: 'a', t: now + 600_000, grade: 3, ms: 1000 },
    ];
    expect(needsFsrsMemory(d)).toBe(true);
    expect(fillFsrsMemory(d)).toBe(2);
    expect(d.cards.a.stability).toBeCloseTo(memoryFromHistory([{ t: now, grade: 3 }, { t: now + 600_000, grade: 3 }], d.settings.srs)!.stability);
    expect(d.cards.b.stability).toBe(30);
    expect(d.cards.b.difficulty).toBeGreaterThan(5);
    expect(d.cards.c.stability).toBeUndefined();
    expect(needsFsrsMemory(d)).toBe(false);
  });
});

describe('Known (new cards)', () => {
  const now = 1_000_000_000_000;
  for (const [name, cfg] of [['FSRS', fsrsCfg], ['SM-2', sm2]] as const) {
    it(`graduates a new card and brings it back in a few days (${name})`, () => {
      const { state, goods } = markKnown(newCardState('x'), now, cfg);
      expect(state.status).toBe('review');
      expect(goods).toBe(3); // Good through the two learning steps, then once more
      expect(state.interval).toBeGreaterThanOrEqual(2);
      expect(state.interval).toBeLessThanOrEqual(7);
      expect(state.due).toBe(now + state.interval * DAY);
    });
  }
  it('needs fewer answers when there are no learning steps', () => {
    expect(markKnown(newCardState('x'), now, { ...fsrsCfg, learningSteps: '' }).goods).toBe(2);
  });
  it("doesn't count Known answers as real ones in the day's numbers", () => {
    const d = emptyData();
    d.settings.enabledDecks = ['treble-staff'];
    const t = Date.now();
    d.log = [
      { id: 'treble:C4', t, grade: 3, ms: 0, known: true },
      { id: 'treble:C4', t, grade: 3, ms: 0, known: true },
      { id: 'treble:D4', t, grade: 1, ms: 2000 },
    ];
    const plan = todayPlan(d, t);
    expect(plan.reviewedToday).toBe(1);
    expect(plan.accuracy).toBe(0);
  });
});

describe('retention', () => {
  const now = new Date(2026, 9, 14, 12).getTime();
  const entry = (daysAgo: number, grade: Grade, prevInterval: number, extra: Partial<ReviewLogEntry> = {}): ReviewLogEntry => ({
    id: 'x',
    t: now - daysAgo * DAY,
    grade,
    ms: 1000,
    prevStatus: 'review',
    prevInterval,
    ...extra,
  });
  it('splits review answers into learning (young) and known (mature)', () => {
    const log = [
      entry(0, 3, 5),
      entry(0, 1, 5),
      entry(0, 3, 30),
      entry(1, 4, 40),
      entry(10, 1, 50),
      entry(100, 3, 2),
      // Left out: learning-step answers, Known, and old entries without card state.
      entry(0, 3, 0, { prevStatus: 'learning' }),
      entry(0, 3, 0, { prevStatus: 'new', known: true }),
      { id: 'y', t: now, grade: 1 as const, ms: 900 },
    ];
    const rows = Object.fromEntries(retentionTable(log, now).map((r) => [r.label, r]));
    expect(rows.Today.young).toEqual({ passed: 1, total: 2 });
    expect(rows.Today.mature).toEqual({ passed: 1, total: 1 });
    expect(rows.Yesterday.all).toEqual({ passed: 1, total: 1 });
    expect(rows['Last 7 days'].all).toEqual({ passed: 3, total: 4 });
    expect(rows['Last 30 days'].mature).toEqual({ passed: 2, total: 3 });
    expect(rows['All time'].all).toEqual({ passed: 4, total: 6 });
    expect(rate(rows.Today.young)).toBe(0.5);
    expect(rate({ passed: 0, total: 0 })).toBeNull();
  });
});

describe('things to work on', () => {
  const C4 = CARD_BY_ID.get('treble:C4')!;
  const F4 = CARD_BY_ID.get('treble:F4')!;
  const bassG2 = CARD_BY_ID.get('bass:G2')!;
  const now = Date.now();

  it('blames a wrong key on the nearest note, and records what was played instead', () => {
    const stats = {};
    recordSightResults(stats, [{ cards: [F4, bassG2], missed: true, wrong: [64] }], now);
    const st = stats as Record<string, { recent: number[]; confusions: Record<string, number> }>;
    expect(st['treble:F4'].recent).toEqual([1]);
    expect(st['treble:F4'].confusions).toEqual({ 64: 1 });
    expect(st['bass:G2'].recent).toEqual([0]); // the left hand was fine
  });
  it('flags a note after 3 recent misses, and lets it go as you get it right', () => {
    const d = emptyData();
    const miss = { cards: [F4], missed: true, wrong: [64] };
    const ok = { cards: [F4], missed: false, wrong: [] };
    recordSightResults(d.sightStats, [miss, ok, miss], now);
    expect(weakSpots(d, now).sight).toHaveLength(0);
    recordSightResults(d.sightStats, [miss], now);
    const spot = weakSpots(d, now).sight[0];
    expect(spot.card.id).toBe('treble:F4');
    expect(spot.recentMisses).toBe(3);
    expect(spot.confusedWith).toEqual(['E4']);
    recordSightResults(d.sightStats, Array.from({ length: 8 }, () => ok), now);
    expect(weakSpots(d, now).sight).toHaveLength(0);
  });
  it('lists cards forgotten too often until they go quiet for 60 days', () => {
    const d = emptyData();
    d.cards['treble:C4'] = { ...newCardState('treble:C4'), status: 'review', interval: 2, lapses: 6 };
    d.cards['treble:D4'] = { ...newCardState('treble:D4'), status: 'review', interval: 2, lapses: 2 };
    d.log = [
      { id: 'treble:C4', t: now - 5 * DAY, grade: 1, ms: 1000 },
      { id: 'treble:D4', t: now - 5 * DAY, grade: 1, ms: 1000 },
    ];
    expect(weakSpots(d, now).leeches.map((l) => l.card.id)).toEqual(['treble:C4']);
    expect(weakSpots(d, now + 70 * DAY).leeches).toHaveLength(0);
    d.settings.srs.leechThreshold = 2;
    expect(weakSpots(d, now).leeches).toHaveLength(2);
  });
  it('picks the key and staff a focused phrase needs', () => {
    const fsharpInG = CARD_BY_ID.get('grand[G]:F#4|')!;
    expect(focusKey([fsharpInG])).toBe('G');
    expect(focusKey([C4])).toBe('C');
    expect(focusKey([CARD_BY_ID.get('rhythm:4/4:q q h')!])).toBe('C');
    expect(focusStaff([C4])).toBe('treble');
    expect(focusStaff([bassG2])).toBe('bass');
    expect(focusStaff([C4, bassG2])).toBe('grand');
    expect(focusStaff([CARD_BY_ID.get('rhythm:4/4:q q h')!])).toBeNull();
  });
  it('makes focus items come up far more often', () => {
    const pool = deckCards('treble-staff');
    const draw = weightedSampler(pool, {}, mulberry32(4), false, (c) => (c.id === 'treble:F4' ? 8 : 1));
    const n = Array.from({ length: 600 }, draw).filter((c) => c.id === 'treble:F4').length;
    expect(n).toBeGreaterThan(150); // ~8/(8+11) of draws, against ~1/12 without the boost
  });
});

describe('scheduling settings', () => {
  it('formats intervals like Anki', () => {
    expect(formatDelay(30 * 1000)).toBe('<1m');
    expect(formatDelay(10 * MIN)).toBe('10m');
    expect(formatDelay(3 * DAY)).toBe('3d');
    expect(formatDelay(54 * DAY)).toBe('1.8mo');
    expect(formatDelay(60 * DAY)).toBe('2mo');
    expect(formatDelay(500 * DAY)).toBe('1.4y');
  });
  it('parses learning steps', () => {
    expect(parseSteps('1m 10m')).toEqual([1, 10]);
    expect(parseSteps(' 30m  2h 1d ')).toEqual([30, 120, 1440]);
    expect(parseSteps('')).toEqual([]);
    expect(parseSteps('10')).toBeNull();
    expect(parseSteps('1x')).toBeNull();
  });
  it('starts a new day at the chosen hour', () => {
    const at = (h: number) => new Date(2026, 9, 14, h, 30).getTime();
    setDayStartHour(4);
    expect(dayKey(at(3))).toBe('2026-10-13');
    expect(dayKey(at(5))).toBe('2026-10-14');
    setDayStartHour(0);
    expect(dayKey(at(3))).toBe('2026-10-14');
    expect(nextDayStart(at(23))).toBe(new Date(2026, 9, 15, 0, 0).getTime());
    setDayStartHour(4);
  });
  it('fills in defaults for settings saved before scheduling options existed', () => {
    const old = normalize({ version: 1, cards: {}, settings: { newPerDay: 5 } });
    expect(old.settings.srs.algorithm).toBe('fsrs');
    expect(old.settings.srs.desiredRetention).toBe(0.9);
    expect(old.settings.newPerDay).toBe(5);
    expect(old.reviewsByDay).toEqual({});
  });
});

describe('decks', () => {
  it('gives every group a test deck whose cards are separate from the real ones', () => {
    for (const g of DECK_GROUPS) {
      const test = DECKS.find((d) => d.id === g.decks[0])!;
      expect(test.name).toMatch(/^Test deck/);
      expect(test.cards.length).toBeGreaterThanOrEqual(5);
      for (const c of test.cards) expect(c.id.startsWith('test:')).toBe(true);
    }
    const testCourse = DECKS.find((d) => d.id === 'course-test')!;
    expect(testCourse.units).toHaveLength(3);
    expect(testCourse.cards.every((c) => c.id.startsWith('test:'))).toBe(true);
    expect(CARD_BY_ID.size).toBe(ALL_CARDS.length);
  });
  it('puts every topic deck in exactly one group', () => {
    const grouped = DECK_GROUPS.flatMap((g) => g.decks);
    const topics = DECKS.filter((d) => d.kind === 'topic').map((d) => d.id);
    expect([...grouped].sort()).toEqual([...topics].sort());
  });
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
    const learning = schedule(newCardState(cards[1].id), 3, now - 20 * MIN, sm2);
    const states = { [cards[1].id]: learning };
    expect(pickNext({ cards, states, now, newRemaining: 5 })?.card.id).toBe(cards[1].id);
    const soon = { [cards[1].id]: { ...learning, due: now + 5 * MIN } };
    expect(pickNext({ cards, states: soon, now, newRemaining: 0 })?.card.id).toBe(cards[1].id);
    expect(countQueue({ cards, states, now, newRemaining: 5 })).toEqual({ newCount: 2, learning: 1, review: 0 });
  });
  it('stops showing reviews at the daily review limit', () => {
    const due = { ...newCardState(cards[0].id), status: 'review' as const, interval: 3, due: now - 1000 };
    const states = { [cards[0].id]: due };
    expect(pickNext({ cards, states, now, newRemaining: 0, reviewRemaining: 1 })?.card.id).toBe(cards[0].id);
    expect(pickNext({ cards, states, now, newRemaining: 0, reviewRemaining: 0 })).toBeNull();
    expect(countQueue({ cards, states, now, newRemaining: 0, reviewRemaining: 0 }).review).toBe(0);
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
    // A note tied over the barline keeps its sharp silently; the next F♯ in the bar prints it again.
    expect(accidentalsToDraw([[P('F#4')], [P('F#4')]], 'C', [true, false])).toEqual([[null], ['#']]);
  });
});

describe('rhythmic phrases', () => {
  const treble = DECKS.find((d) => d.id === 'treble-staff')!.cards;
  const bass = DECKS.find((d) => d.id === 'bass-staff')!.cards;
  const both = DECKS.find((d) => d.id === 'grand-hands')!.cards.slice(0, 4);
  const total = (v: NoteValue[]) => v.reduce((a, n) => a + ticksOf(n), 0);
  const pats = (specs: string[], meter: number | string) => specs.map((sp) => parseRhythm(sp, meter));

  it('builds single-staff bars from rhythm patterns, with rests', () => {
    const p = singleStaffPhrase(weightedSampler(treble, {}, mulberry32(1)), 'treble', pats(['q q h', 'q qr h'], 4));
    expect(p.measures).toHaveLength(2);
    expect(p.measures[1].treble.map((n) => n.pitches.length)).toEqual([1, 0, 1]);
    const ev = phraseEvents(p);
    expect(ev.map((e) => e.time)).toEqual([0, 24, 48, 96, 144]);
  });

  it('fills both voices of every grand-staff bar, in any meter', () => {
    const meters: [string[], string][] = [
      [['q q q q', 'e e q h', 'q. e h', 's s e q h', 'q~ e e q q', '3[e e e] q h'], '4/4'],
      [['h.', 'q q q', 'e e q q', 'h~ e e'], '3/4'],
      [['q q', 'h'], '2/4'],
      [['q e q e', 'q. q.', 'e e e q.'], '6/8'],
      [['q e', 'e e e'], '3/8'],
      [['q. q. q.'], '9/8'],
      [['q e q e q. q.'], '12/8'],
      [['h h', 'q q h'], '2/2'],
    ];
    for (const [specs, meter] of meters)
      for (const style of ['mixed', 'melody', 'bass-melody', 'alternate', 'together'] as GrandStyle[]) {
        const patterns = Array.from({ length: 12 }, (_, i) => parseRhythm(specs[i % specs.length], meter));
        const p = grandStaffPhrase({ rh: treble, lh: bass, both }, {}, patterns, style, mulberry32(3));
        expect(meterName(p.meter)).toBe(meter);
        for (const m of p.measures) {
          expect(total(m.treble)).toBe(barTicks(p.meter));
          expect(total(m.bass)).toBe(barTicks(p.meter));
        }
        // A tied-over note is the same note held on, in the same hand.
        for (const clef of ['treble', 'bass'] as const) {
          const notes = voiceNotes(p, clef);
          notes.forEach((x, i) => {
            if (x.tiedOver) expect(x.note.pitches).toEqual(notes[i - 1].note.pitches);
          });
        }
      }
  });

  it('merges notes that start together into one event', () => {
    const p = grandStaffPhrase({ rh: treble, lh: bass, both: [] }, {}, [QUARTERS(4)], 'melody', mulberry32(1));
    const ev = phraseEvents(p);
    expect(ev).toHaveLength(4);
    expect(ev[0].tick).toBe(0);
    expect(ev[0].cards).toHaveLength(2); // RH note + LH held note
    expect(ev[1].cards).toHaveLength(1);
  });

  it('uses both hands in alternating bars', () => {
    const patterns = Array.from({ length: 20 }, () => QUARTERS(4));
    const p = grandStaffPhrase({ rh: treble, lh: bass, both: [] }, {}, patterns, 'alternate', mulberry32(9));
    for (const m of p.measures) {
      expect(m.treble.some((n) => n.pitches.length)).toBe(true);
      expect(m.bass.some((n) => n.pitches.length)).toBe(true);
      expect(phraseEvents({ staff: 'grand', key: 'C', meter: { num: 4, den: 4 }, measures: [m] })).toHaveLength(4);
    }
  });

  it('picks one meter per phrase from learned rhythms', () => {
    const learned = pats(['q q h', 'w'], 4).concat(pats(['h.', 'q q q'], 3));
    for (let seed = 0; seed < 10; seed++) {
      const r = phraseRhythms(learned, 4, mulberry32(seed));
      expect(new Set(r.map((p) => meterName(p.meter))).size).toBe(1);
    }
    expect(phraseRhythms([], 2)).toEqual([QUARTERS(4), QUARTERS(4)]);
  });

  it('plays a tied note once and holds it', () => {
    const p = singleStaffPhrase(weightedSampler(treble, {}, mulberry32(2)), 'treble', pats(['q~ e e q q'], 4));
    const [a, b] = p.measures[0].treble;
    expect(b.pitches).toEqual(a.pitches);
    expect(phraseEvents(p).map((e) => e.time)).toEqual([0, 36, 48, 72]); // the tied eighth (at 24) isn't played
  });

  it('ties notes over the barline', () => {
    const base = singleStaffPhrase(weightedSampler(treble, {}, mulberry32(4)), 'treble', pats(['q q q q', 'h h', 'w'], 4));
    const tied = tieAcrossBars(base, 1, mulberry32(1));
    expect(tied.measures[0].treble[3].tie).toBe(true);
    expect(tied.measures[1].treble[0].pitches).toEqual(tied.measures[0].treble[3].pitches);
    expect(phraseEvents(tied)).toHaveLength(phraseEvents(base).length - 2);
    expect(tied.measures[2].treble[0].pitches).toEqual(tied.measures[1].treble[1].pitches);
    expect(base.measures[0].treble[3].tie).toBeUndefined(); // the original is untouched
  });
});

describe('rhythm', () => {
  it('parses patterns and rejects bars that do not add up', () => {
    const p = parseRhythm('q. e qr q', 4);
    expect(p.notes.map(ticksOf)).toEqual([36, 12, 24, 24]);
    expect(onsets(p)).toEqual([0, 36, 72]);
    expect(rhythmSpec(p)).toBe('q. e qr q');
    expect(() => parseRhythm('q q', 4)).toThrow();
    expect(() => parseRhythm('x', 1)).toThrow();
  });
  it('reads sixteenths, triplets, ties and compound meters', () => {
    const s = parseRhythm('e. s s s e q q', 4);
    expect(s.notes.map(ticksOf)).toEqual([18, 6, 6, 6, 12, 24, 24]);
    const t = parseRhythm('3[e e e] q 3[q q q]', 4);
    expect(t.notes.map(ticksOf)).toEqual([8, 8, 8, 24, 16, 16, 16]);
    expect(t.notes.map((n) => n.triplet)).toEqual([0, 0, 0, undefined, 1, 1, 1]);
    expect(rhythmSpec(t)).toBe('3[e e e] q 3[q q q]');
    const tie = parseRhythm('q~ e e q q', 4);
    expect(onsets(tie)).toEqual([0, 36, 48, 72]);
    expect(rhythmSpec(tie)).toBe('q~ e e q q');
    const six = parseRhythm('q e q e', '6/8');
    expect(onsets(six)).toEqual([0, 24, 36, 60]);
    expect(() => parseRhythm('q q', '6/8')).toThrow();
  });
  it('rejects broken triplets and ties', () => {
    expect(() => parseRhythm('3[e e] q q q e', 4)).toThrow();
    expect(() => parseRhythm('q q q~ qr', 4)).toThrow();
    expect(() => parseRhythm('q q q q~', 4)).toThrow();
    expect(() => parseRhythm('3[e e e q q q', 4)).toThrow();
  });
  it('counts the beat of each meter', () => {
    expect([pulseTicks(parseMeter('4/4')), pulsesPerBar(parseMeter('4/4'))]).toEqual([24, 4]);
    expect([pulseTicks(parseMeter('6/8')), pulsesPerBar(parseMeter('6/8'))]).toEqual([36, 2]);
    expect([pulseTicks(parseMeter('12/8')), pulsesPerBar(parseMeter('12/8'))]).toEqual([36, 4]);
    expect([pulseTicks(parseMeter('3/8')), pulsesPerBar(parseMeter('3/8'))]).toEqual([12, 3]);
    expect([pulseTicks(parseMeter('2/2')), pulsesPerBar(parseMeter('2/2'))]).toEqual([48, 2]);
    // Tempo is in quarters: at 60, a quarter lasts a second whatever the meter, and 6/8 clicks at 40.
    expect(tickMs(60) * TPQ).toBe(1000);
    expect(pulseBpm(parseMeter('6/8'), 60)).toBe(40);
  });
  it('keeps the hit window under half the gap between fast notes', () => {
    expect(hitWindow(750)).toBe(180);
    expect(hitWindow(750, 187.5)).toBeCloseTo(84.4, 1);
    expect(hitWindow(750, 60)).toBe(50);
    expect(shortestGap([0, 300, 100, 100])).toBe(100);
  });
  it('matches taps to onsets and grades timing', () => {
    const beat = 1000;
    const expected = [0, 1000, 2000];
    expect(gradeTaps(matchTaps(expected, [10, 1020, 1990], 180), beat)).toBe(4);
    expect(gradeTaps(matchTaps(expected, [100, 1120, 2100], 180), beat)).toBe(3);
    expect(gradeTaps(matchTaps(expected, [170, 1170, 1830], 180), beat)).toBe(2);
    const missed = matchTaps(expected, [0, 2000], 180);
    expect(missed.errors).toEqual([0, null, 0]);
    expect(gradeTaps(missed, beat)).toBe(1);
    const extra = matchTaps(expected, [0, 500, 1000, 2000], 180);
    expect(extra.extra).toBe(1);
    expect(gradeTaps(extra, beat)).toBe(1);
  });
  it('builds rhythm cards and decks that parse', () => {
    const c = CARD_BY_ID.get('rhythm:4/4:q. e h')!;
    expect(c.prompt).toBe('rhythm');
    expect(cardLabel(c)).toBe('4/4 rhythm (q. e h)');
    expect(deckCards('rhythm-eighths').length).toBeGreaterThan(5);
    for (const id of ['rhythm-sixteenths', 'rhythm-dotted-eighths', 'rhythm-ties', 'rhythm-triplets', 'rhythm-compound', 'rhythm-cut'])
      expect(deckCards(id).length).toBeGreaterThan(4);
    expect(cardLabel(CARD_BY_ID.get('rhythm:6/8:q e q e')!)).toBe('6/8 rhythm (q e q e)');
    expect(CARD_BY_ID.has('rhythm:4/4:3[e e e] q q q')).toBe(true);
  });
});

describe('metronome', () => {
  it('names tempos like a mechanical metronome', () => {
    expect(tempoMarking(40)).toBe('Grave');
    expect(tempoMarking(72)).toBe('Andante');
    expect(tempoMarking(76)).toBe('Andante');
    expect(tempoMarking(120)).toBe('Animato');
    expect(tempoMarking(132)).toBe('Allegro');
    expect(tempoMarking(208)).toBe('Prestissimo');
  });
});

describe('playing in time', () => {
  const events = [
    { at: 1000, pitches: [60] },
    { at: 2000, pitches: [64, 48] },
    { at: 3000, pitches: [67] },
  ];
  it('judges notes against the nearest beat', () => {
    const j = new TempoJudge(events, 150);
    expect(j.noteOn(60, 1040)).toEqual({ event: 0, right: true });
    expect(j.status[0]).toBe('ok');
    j.noteOn(48, 1980);
    expect(j.status[1]).toBe('pending'); // chord needs both notes
    j.noteOn(64, 2010);
    expect(j.status[1]).toBe('ok');
    expect(j.errors).toEqual([40, -20, null]);
    expect(j.noteOn(65, 3000).right).toBe(false);
    expect(j.status[2]).toBe('miss');
    expect(j.noteOn(70, 2500).event).toBeNull();
    expect(j.extra).toBe(1);
  });
  it('marks beats missed once their window passes', () => {
    const j = new TempoJudge(events, 150);
    expect(j.current(900)).toBe(0);
    j.tick(1200);
    expect(j.status[0]).toBe('miss');
    expect(j.current(1200)).toBe(1);
    expect(j.finished(3100)).toBe(false);
    expect(j.finished(3200)).toBe(true);
  });
});

describe('minor keys', () => {
  it('raises the 7th in harmonic minor', () => {
    expect(scaleAccidental('Am', 'G')).toBe('#');
    expect(scaleAccidental('Am', 'F')).toBe('');
    expect(scaleAccidental('Cm', 'B')).toBe(''); // B♭ in the signature, raised to B♮
    expect(scaleAccidental('F#m', 'E')).toBe('#');
    expect(scaleAccidental('G#m', 'F')).toBeNull(); // would need F double sharp
    expect(scaleAccidental('G', 'F')).toBe('#');
    expect(signatureKey('Bm')).toBe('D');
    expect(keyLabel('Bbm')).toBe('B♭ minor');
    expect(keyLabel('F#')).toBe('F♯ major');
    expect(tonic('C#m', 3)).toEqual(parsePitch('C#3'));
  });
  it('moves cards into a minor key, with the raised 7th', () => {
    const g = withKey(CARD_BY_ID.get('grand:G4|')!, 'Am')!;
    expect(g.id).toBe('grand[Am]:G#4|');
    expect(cardLabel(g)).toBe('G#4 (RH) in A minor');
    expect(withKey(g, 'C')!.id).toBe('grand:G4|');
    expect(withKey(CARD_BY_ID.get('treble:F4')!, 'G#m')).toBeNull();
    expect(accidentalInKey(parsePitch('G#4'), 'Am')).toBe('#');
  });
  it('has decks for minor keys', () => {
    const sigs = deckCards('minor-key-signatures');
    expect(sigs).toHaveLength(15);
    expect(cardLabel(sigs[0])).toBe('A minor');
    expect(sigs[0].notes).toEqual([parsePitch('A4')]);
    const lt = deckCards('minor-notes');
    expect(lt.length).toBeGreaterThan(20);
    for (const c of lt) {
      const p = c.notes[0];
      expect(scaleAccidental(c.key, p.letter)).not.toBe(keyAccidental(c.key, p.letter));
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
  it('knows all 15 major and 15 minor key signatures', () => {
    expect(Object.keys(KEY_SIGNATURES)).toHaveLength(30);
    expect(MINOR_KEYS.map((k) => k.key)).toEqual(['Am', 'Em', 'Dm', 'Bm', 'Gm', 'F#m', 'Cm', 'C#m', 'Fm', 'G#m', 'Bbm', 'D#m', 'Ebm', 'A#m', 'Abm']);
    expect(KEY_SIGNATURES['F#m']).toEqual(KEY_SIGNATURES.A);
    expect(KEY_SIGNATURES.Am).toEqual({});
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

describe('home page', () => {
  it('counts a streak of consecutive study days', () => {
    const now = new Date(2026, 9, 14, 12).getTime();
    const day = (n: number) => ({ t: now - n * DAY });
    expect(studyStreak([], now)).toBe(0);
    expect(studyStreak([day(0), day(1), day(2), day(4)], now)).toBe(3);
    expect(studyStreak([day(1), day(2)], now)).toBe(2); // today not started yet
    expect(studyStreak([day(2)], now)).toBe(0);
  });
});

describe('strict Easy', () => {
  it('needs an instant answer by default', () => {
    const g = DEFAULT_SETTINGS;
    expect(g.easyMs).toBe(1000);
    expect(autoGrade(true, 900, 1, g)).toBe(4);
    expect(autoGrade(true, 1500, 1, g)).toBe(3); // was Easy under the old 2s default
    expect(autoGrade(true, 4500, 1, g)).toBe(3);
    expect(autoGrade(true, 6000, 1, g)).toBe(2); // Hard unchanged
  });
  it('keeps new and learning cards at Good unless allowed', () => {
    for (const status of ['new', 'learning', 'relearning'] as const) {
      expect(limitEasy(4, status, false)).toBe(3);
      expect(limitEasy(4, status, true)).toBe(4);
    }
    expect(limitEasy(4, 'review', false)).toBe(4);
    expect(limitEasy(2, 'new', false)).toBe(2);
  });
  it('needs near-metronomic timing for an Easy rhythm', () => {
    const beat = 1000;
    expect(gradeTaps(matchTaps([0, 1000], [40, 1040], 180), beat)).toBe(4);
    expect(gradeTaps(matchTaps([0, 1000], [60, 1060], 180), beat)).toBe(3);
  });
  it("moves saves still on the old 2s Easy default, but keeps a user's own choice", () => {
    expect(normalize({ version: 1, cards: {}, settings: { easyMs: 2000 } }).settings.easyMs).toBe(1000);
    expect(normalize({ version: 1, cards: {}, settings: { easyMs: 1500 } }).settings.easyMs).toBe(1500);
    expect(normalize({ version: 1, cards: {}, settings: {} }).settings.easyWhileLearning).toBe(false);
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
