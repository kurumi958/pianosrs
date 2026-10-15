import { describe, expect, it } from 'vitest';
import { CORPUS } from '../src/songs/corpus';
import { compileSong } from '../src/songs/dsl';
import { barsPerLine, pageAt, pagesOf, turnTick } from '../src/songs/pages';

const score = compileSong(CORPUS.find((s) => s.id === 'ode-to-joy')!).score;

describe('pages of sheet music', () => {
  it('splits bars into pages of whole lines', () => {
    expect(pagesOf(0, 15, 4, 2)).toEqual([
      [0, 7],
      [8, 15],
    ]);
    expect(pagesOf(3, 12, 2, 3)).toEqual([
      [3, 8],
      [9, 12],
    ]);
  });

  it('puts fewer bars on a line the busier the music is', () => {
    const n = barsPerLine(score);
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(6);
  });

  it('turns at the end of the page, the start of its last bar, or halfway through it', () => {
    const pages = pagesOf(0, score.measures.length - 1, 2, 2); // 4 bars a page
    const last = score.measures[3];
    expect(turnTick(score, pages[0], 'end')).toBe(last.start + last.length);
    expect(turnTick(score, pages[0], 'lastBar')).toBe(last.start);
    expect(turnTick(score, pages[0], 'halfLastBar')).toBe(last.start + last.length / 2);
    expect(pageAt(score, pages, last.start - 1, 'lastBar')).toBe(0);
    expect(pageAt(score, pages, last.start, 'lastBar')).toBe(1);
    expect(pageAt(score, pages, last.start + last.length / 2 - 1, 'halfLastBar')).toBe(0);
    expect(pageAt(score, pages, last.start + last.length / 2, 'halfLastBar')).toBe(1);
    expect(pageAt(score, pages, last.start + last.length - 1, 'end')).toBe(0);
    // Past the last page's end it stays on the last page.
    expect(pageAt(score, pages, 1e9, 'end')).toBe(pages.length - 1);
  });
});
