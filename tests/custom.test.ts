import { describe, expect, it } from 'vitest';
import { customCards, type CustomDeckSpec, MAX_CUSTOM_CARDS, newCustomDeck, rhythmProblems, syncCustomDecks } from '../src/srs/custom';
import { CARD_BY_ID, DECKS } from '../src/srs/deck';

const spec = (over: Partial<CustomDeckSpec>): CustomDeckSpec => ({ ...newCustomDeck(), id: 'custom:test', ...over });
const ids = (over: Partial<CustomDeckSpec>) => customCards(spec(over)).map((c) => c.id);

describe('custom decks', () => {
  it('writes notes in the key, sharing ids with the built-in decks', () => {
    expect(ids({ low: 'C4', high: 'G5', keys: ['C'] }).sort()).toEqual(
      DECKS.find((d) => d.id === 'treble-staff')!
        .cards.map((c) => c.id)
        .sort(),
    );
    const d = ids({ low: 'E4', high: 'G4', keys: ['D'] });
    expect(d.sort()).toEqual(['treble[D]:E4', 'treble[D]:F#4', 'treble[D]:G4']);
  });
  it('adds chromatic notes on request, without E♯, B♯, C♭ or F♭', () => {
    const c = ids({ low: 'E4', high: 'F4', keys: ['C'], chromatic: true });
    expect(c.sort()).toEqual(['treble:E4', 'treble:Eb4', 'treble:F#4', 'treble:F4']);
  });
  it('puts middle C on both staves of the grand staff', () => {
    expect(ids({ staff: 'grand', low: 'B3', high: 'D4' }).sort()).toEqual(['grand:C4|', 'grand:D4|', 'grand:|B3', 'grand:|C4']);
  });
  it('builds intervals and chords from the key, in the inversions asked for', () => {
    expect(ids({ kind: 'intervals', intervals: [2, 8], low: 'C4', high: 'D4' }).sort()).toEqual(['treble:C4+D4']);
    const chords = ids({ kind: 'chords', keys: ['D'], low: 'D4', high: 'D5', inversions: [0, 1] });
    expect(chords).toEqual(expect.arrayContaining(['treble[D]:D4+F#4+A4', 'treble[D]:E4+G4+B4', 'treble[D]:F#4+A4+D5']));
    expect(chords.every((id) => id.split(':')[1].split('+').length === 3)).toBe(true);
    const sevenths = ids({ kind: 'chords', chord: 'sevenths', low: 'G3', high: 'F5', inversions: [3] });
    expect(sevenths).toContain('treble:F4+G4+B4+D5');
  });
  it('names keys up to a number of accidentals', () => {
    expect(ids({ kind: 'keys', keyMode: 'both', maxAccidentals: 1 }).sort()).toEqual([
      'keysig:Am',
      'keysig:C',
      'keysig:Dm',
      'keysig:Em',
      'keysig:F',
      'keysig:G',
    ]);
  });
  it('checks rhythms line by line', () => {
    const s = spec({ kind: 'rhythms', meter: '3/4', rhythms: 'q q q\nq q\n\nh.' });
    expect(customCards(s)).toHaveLength(2);
    expect(rhythmProblems(s).map((p) => p.line)).toEqual([2]);
  });
  it('caps the number of cards', () => {
    const all = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab'];
    expect(customCards(spec({ staff: 'grand', low: 'A0', high: 'C8', keys: all, chromatic: true }))).toHaveLength(MAX_CUSTOM_CARDS);
  });
  it('registers decks at run time without losing built-in cards', () => {
    const before = CARD_BY_ID.size;
    syncCustomDecks([spec({ low: 'C4', high: 'C4', keys: ['C', 'Eb'] })]);
    const deck = DECKS.find((d) => d.id === 'custom:test')!;
    expect(deck.cards[0]).toBe(CARD_BY_ID.get('treble:C4')); // the built-in card object
    expect(CARD_BY_ID.size).toBe(before + 1); // treble[Eb]:C4 is new
    syncCustomDecks([]);
    expect(DECKS.some((d) => d.id === 'custom:test')).toBe(false);
    expect(CARD_BY_ID.get('treble:C4')).toBeDefined();
    expect(CARD_BY_ID.size).toBe(before);
  });
});
