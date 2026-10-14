import { DOMParser } from '@xmldom/xmldom';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { barTicks } from '../src/music/rhythm';
import { type CorpusEntry, DEFAULT_SONG_OPTIONS, LEVEL_LABEL, songCards } from '../src/songs/library';
import { parseMusicXML, readScoreFile } from '../src/songs/musicxml';

const dir = new URL('../public/songs/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')) as CorpusEntry[];

describe('the larger song corpus (public/songs)', () => {
  it('has well-formed index entries with unique ids', () => {
    expect(index.length).toBeGreaterThan(150);
    expect(new Set(index.map((e) => e.id)).size).toBe(index.length);
    for (const e of index) {
      expect(LEVEL_LABEL[e.level], e.id).toBeTruthy();
      expect(e.title && e.composer && e.collection && e.key && e.meter && e.license, e.id).toBeTruthy();
      expect(e.source, e.id).toMatch(/^https:\/\/www\.mutopiaproject\.org\//);
      expect(existsSync(new URL(e.file, dir)), e.file).toBe(true);
    }
  });

  it('reads every piece with the app’s parser: two hands, full bars, cards to learn', () => {
    for (const e of index) {
      const xml = readScoreFile(new Uint8Array(readFileSync(new URL(e.file, dir))));
      const score = parseMusicXML(xml, DOMParser as never);
      expect(score.title, e.id).toBe(e.title);
      expect(score.composer, e.id).toBe(e.composer);
      expect(score.staves, e.id).toBe(2);
      expect(new Set(score.notes.map((n) => n.staff)), e.id).toEqual(new Set([0, 1]));
      const m = score.measures;
      const pickup = m[0].length < barTicks(m[0].meter) ? 1 : 0;
      expect(m.length - pickup, e.id).toBe(e.bars);
      // No bar overflows. Short bars are rare: a pickup, the last bar, or a bar split around a repeat sign.
      m.forEach((x, i) => expect(x.length, `${e.id} bar ${i + 1}`).toBeLessThanOrEqual(barTicks(x.meter)));
      expect(m.slice(1, -1).filter((x) => x.length < barTicks(x.meter)).length, e.id).toBeLessThanOrEqual(3);
      const song = { id: e.id, title: e.title, composer: e.composer, source: 'corpus' as const, xml, score };
      const cards = songCards(song, DEFAULT_SONG_OPTIONS);
      expect(cards.length, e.id).toBeGreaterThan(2);
      expect(new Set(cards.map((c) => c.id)).size, e.id).toBe(cards.length);
    }
  }, 30_000);
});
