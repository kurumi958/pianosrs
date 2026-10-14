import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { LAYERS, layerFor, nearestSample, SAMPLED, sampleName } from '../src/audio/piano';

describe('sampled piano', () => {
  it('names its samples like the files in public/piano', () => {
    expect(SAMPLED[0]).toBe(21);
    expect(SAMPLED.at(-1)).toBe(108);
    expect([21, 24, 27, 30, 60, 108].map(sampleName)).toEqual(['A0', 'C1', 'Ds1', 'Fs1', 'C4', 'C8']);
    for (const m of SAMPLED)
      for (const l of LAYERS) expect(existsSync(`public/piano/${sampleName(m)}v${l}.mp3`), `${sampleName(m)}v${l}`).toBe(true);
  });
  it('plays every key from a sample at most a semitone away', () => {
    for (let m = 21; m <= 108; m++) expect(Math.abs(nearestSample(m) - m)).toBeLessThanOrEqual(1);
  });
  it('spreads key velocity over the eight layers', () => {
    expect([1, 16, 17, 64, 100, 127].map(layerFor)).toEqual([0, 0, 1, 3, 6, 7]);
  });
});
