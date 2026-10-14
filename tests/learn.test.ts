import { describe, expect, it } from 'vitest';
import { introduce, nextBatch, recordLearned, reviewCards, reviewSections, unitToLearn } from '../src/srs/learn';
import { COURSE_DECKS, DECKS } from '../src/srs/deck';
import { DEFAULT_SCHEDULER, newCardState } from '../src/srs/scheduler';
import { emptyData } from '../src/storage';

const MIN = 60_000;
const course = COURSE_DECKS.find((c) => c.id === 'course-adult-beginner')!;
const deck = (id: string) => DECKS.find((d) => d.id === id)!;

describe('learning sessions', () => {
  it('puts a new card into the learning steps, sooner if it was missed', () => {
    const now = 1_000_000;
    const right = introduce(undefined, 'treble:C4', true, now, DEFAULT_SCHEDULER)!;
    const wrong = introduce(undefined, 'treble:C4', false, now, DEFAULT_SCHEDULER)!;
    expect(right.status).toBe('learning');
    expect(right.due - now).toBe(10 * MIN);
    expect(wrong.due - now).toBe(1 * MIN);
  });
  it('leaves cards already being learned alone', () => {
    const s = { ...newCardState('treble:C4'), status: 'review' as const, due: 5 };
    expect(introduce(s, 'treble:C4', true, 0, DEFAULT_SCHEDULER)).toBeNull();
  });
  it('records a session once per card and counts new cards for the day', () => {
    const d = emptyData();
    expect(
      recordLearned(d, [
        { id: 'a', rightFirstTime: true },
        { id: 'b', rightFirstTime: false },
      ]),
    ).toBe(2);
    expect(recordLearned(d, [{ id: 'a', rightFirstTime: true }])).toBe(0);
    expect(Object.values(d.newByDay)).toEqual([2]);
  });
  it('takes the next unlearned cards of a deck in order', () => {
    const cards = deck('treble-staff').cards;
    const states = { [cards[0].id]: { ...newCardState(cards[0].id), status: 'review' as const } };
    expect(nextBatch(deck('treble-staff'), states, 3).map((c) => c.id)).toEqual(cards.slice(1, 4).map((c) => c.id));
  });
  it('offers the open unit with cards still to learn', () => {
    expect(unitToLearn(course, {})).toBe(0);
    const states = Object.fromEntries(course.units![0].cards.map((c) => [c.id, { ...newCardState(c.id), status: 'learning' as const }]));
    expect(unitToLearn(course, states)).toBeNull(); // unit 1 seen, unit 2 not open yet
    expect(unitToLearn(course, states, { start: 0, unlocked: 1 })).toBe(1);
  });
});

describe('review sections', () => {
  it('lists only learned cards, by lesson unit and by deck', () => {
    const d = emptyData();
    d.settings.enabledDecks = [course.id, 'treble-staff', 'bass-staff'];
    const now = Date.now();
    recordLearned(
      d,
      course.units![1].cards.map((c) => ({ id: c.id, rightFirstTime: true })),
      now - 20 * MIN,
    );
    recordLearned(d, [{ id: 'treble:C4', rightFirstTime: true }], now - 20 * MIN);
    const sections = reviewSections(d, now);
    expect(sections.map((s) => s.title)).toEqual(['Lessons', 'Decks']);
    const unit = sections[0].groups[0].items;
    expect(unit).toHaveLength(1);
    expect(unit[0]).toMatchObject({ key: `course:${course.id}:1`, title: course.units![1].title, due: course.units![1].cards.length });
    const decks = sections[1].groups;
    expect(decks.map((g) => g.title)).toEqual(['Reading the staff']);
    expect(decks[0].items.map((i) => [i.title, i.cards.length, i.due])).toEqual([['Treble clef: on the staff', 1, 1]]);
    expect(reviewCards({ enabledDecks: d.settings.enabledDecks, states: d.cards })).toHaveLength(course.units![1].cards.length + 1);
  });
});
