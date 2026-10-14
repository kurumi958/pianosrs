import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CORPUS } from '../src/songs/corpus';
import { compileSong } from '../src/songs/dsl';
import { parseMusicXML, readScoreFile } from '../src/songs/musicxml';
import { scoreEvents, keyFromFifths, handPlays, barsLabel } from '../src/songs/score';

const parse = (xml: string) => parseMusicXML(xml, DOMParser as never);

describe('song corpus', () => {
  it('compiles every song, with full bars', () => {
    for (const src of CORPUS) {
      const { score } = compileSong(src);
      expect(score.measures.length).toBeGreaterThan(3);
      expect(score.notes.length).toBeGreaterThan(10);
      score.measures.forEach((m, i) => {
        if (i > 0 || !src.pickup) expect(m.length, `${src.id} bar ${i + 1}`).toBe((m.meter.num * 96) / m.meter.den);
      });
    }
  });

  it('writes MusicXML that reads back to the same notes', () => {
    for (const src of CORPUS) {
      const { score, xml } = compileSong(src);
      const back = parse(xml);
      expect(back.title).toBe(src.title);
      expect(back.measures.map((m) => [m.number, m.start, m.length, m.key])).toEqual(score.measures.map((m) => [m.number, m.start, m.length, m.key]));
      const key = (n: (typeof score.notes)[number]) => `${n.time}:${n.midi}:${n.hand}:${n.tiedOver}:${n.dur}`;
      expect(back.notes.map(key).sort()).toEqual(score.notes.map(key).sort());
      expect(back.tempo).toBe(src.tempo);
    }
  });

  it('plays tied notes once', () => {
    const { score } = compileSong(CORPUS.find((s) => s.id === 'gymnopedie-1')!);
    const rh = scoreEvents(score, 0, score.measures.length - 1, 'rh');
    // F#5 A5 | G5 F#5 C#5 | B4 C#5 D5 | A4 | F#4 (held for four bars)
    expect(rh).toHaveLength(2 + 3 + 3 + 1 + 1);
    expect(rh[rh.length - 1].midis).toEqual([66]);
  });

  it('groups chords and both hands into events', () => {
    const { score } = compileSong(CORPUS.find((s) => s.id === 'minuet-g')!);
    const both = scoreEvents(score, 0, 0, 'both');
    expect(both[0].midis).toEqual([55, 59, 62, 74]); // G3 B3 D4 under D5
    expect(scoreEvents(score, 0, 0, 'rh').map((e) => e.midis.length)).toEqual([1, 1, 1, 1, 1]);
    expect(scoreEvents(score, 0, 0, 'lh')).toHaveLength(2);
  });

  it('reads a pickup bar and its numbering', () => {
    const { score } = compileSong(CORPUS.find((s) => s.id === 'fur-elise')!);
    expect(score.measures[0]).toMatchObject({ number: '0', length: 12 });
    expect(score.measures[1].start).toBe(12);
    expect(barsLabel(score, 1, 2)).toBe('Bars 1–2');
    expect(handPlays(score, 1, 1, 'lh')).toBe(false);
    expect(handPlays(score, 2, 2, 'lh')).toBe(true);
  });
});

describe('MusicXML import', () => {
  const XML = `<?xml version="1.0"?>
<score-partwise version="3.1">
  <movement-title>Test</movement-title>
  <identification><creator type="composer">Someone</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><key><fifths>-3</fifths><mode>minor</mode></key><time><beats>3</beats><beat-type>4</beat-type></time><staves>2</staves></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><alter>-1</alter><octave>5</octave></pitch><duration>2</duration><tie type="start"/><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><alter>-1</alter><octave>5</octave></pitch><duration>1</duration><tie type="stop"/><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><grace/><pitch><step>F</step><octave>5</octave></pitch><voice>1</voice><type>16th</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <backup><duration>6</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>6</duration><voice>5</voice><type>half</type><dot/><staff>2</staff></note>
      <note><chord/><pitch><step>G</step><octave>3</octave></pitch><duration>6</duration><voice>5</voice><type>half</type><dot/><staff>2</staff></note>
    </measure>
    <measure number="2">
      <note><rest measure="yes"/><duration>6</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>6</duration></backup>
      <forward><duration>2</duration></forward>
      <note><pitch><step>B</step><alter>-1</alter><octave>2</octave></pitch><duration>4</duration><voice>5</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;

  it('reads notes, chords, ties, voices and attributes', () => {
    const s = parse(XML);
    expect(s.title).toBe('Test');
    expect(s.composer).toBe('Someone');
    expect(s.measures.map((m) => [m.key, m.length, `${m.meter.num}/${m.meter.den}`])).toEqual([
      ['Cm', 72, '3/4'],
      ['Cm', 72, '3/4'],
    ]);
    const ev = scoreEvents(s, 0, 1, 'both');
    expect(ev.map((e) => [e.time, e.midis])).toEqual([
      [0, [48, 55, 72]],
      [24, [75]],
      [60, [79]], // the tied E♭ (at 48) and the grace note aren't played
      [96, [46]], // bar 2: B♭2 after a quarter's forward
    ]);
    expect(ev[0].notes.find((n) => n.midi === 48)!.hand).toBe('lh');
  });

  it('reads compressed .mxl files', () => {
    const zip = zipSync({
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="score/piece.xml"/></rootfiles></container>'),
      'score/piece.xml': strToU8(XML),
    });
    expect(parse(readScoreFile(zip)).title).toBe('Test');
    expect(readScoreFile(strToU8(XML))).toBe(XML);
  });

  it('rejects files that are not scores', () => {
    expect(() => parse('<html><body/></html>')).toThrow(/MusicXML/);
    expect(() => parse('<score-timewise/>')).toThrow(/Timewise/);
  });

  it('names keys from fifths', () => {
    expect(keyFromFifths(2)).toBe('D');
    expect(keyFromFifths(-1, 'minor')).toBe('Dm');
    expect(keyFromFifths(4, 'minor')).toBe('C#m');
  });
});

describe('song decks', () => {
  it('splits a song into passages: hands separately, together, joined, then the whole song', async () => {
    const { CORPUS_SONGS, songCards } = await import('../src/songs/library');
    const minuet = CORPUS_SONGS.find((s) => s.id === 'minuet-g')!;
    const ids = songCards(minuet, { bars: 2, separateHands: true }).map((c) => c.id);
    expect(ids.slice(0, 7)).toEqual([
      'song:minuet-g:1-2:rh',
      'song:minuet-g:1-2:lh',
      'song:minuet-g:1-2:both',
      'song:minuet-g:3-4:rh',
      'song:minuet-g:3-4:lh',
      'song:minuet-g:3-4:both',
      'song:minuet-g:1-4:both',
    ]);
    expect(ids[ids.length - 1]).toBe('song:minuet-g:1-16:both');
    expect(new Set(ids).size).toBe(ids.length);
    expect(songCards(minuet, { bars: 4, separateHands: false }).map((c) => c.id).slice(0, 3)).toEqual([
      'song:minuet-g:1-4:both',
      'song:minuet-g:5-8:both',
      'song:minuet-g:1-8:both',
    ]);
  });

  it('puts a pickup bar in the first passage and skips a hand with nothing to play', async () => {
    const { CORPUS_SONGS, songCards } = await import('../src/songs/library');
    const elise = CORPUS_SONGS.find((s) => s.id === 'fur-elise')!;
    const cards = songCards(elise, { bars: 1, separateHands: true });
    // Pickup + bar 1: the left hand rests, so there's one right-hand card.
    expect(cards[0].id).toBe('song:fur-elise:1-2:rh');
    expect(cards[0].passage!.bars).toBe('Bars 0–1');
    expect(cards[1].id).toBe('song:fur-elise:3-3:rh');
    expect(cards.map((c) => c.id)).toContain('song:fur-elise:3-3:lh');
  });

  it('registers song decks so their cards can be studied', async () => {
    const { syncSongDecks, songDeckId } = await import('../src/songs/library');
    const { CARD_BY_ID, DECKS } = await import('../src/srs/deck');
    const { studyCards } = await import('../src/srs/study');
    syncSongDecks({ twinkle: { bars: 4, separateHands: false } });
    expect(DECKS.some((d) => d.id === songDeckId('twinkle'))).toBe(true);
    expect(CARD_BY_ID.has('song:twinkle:1-4:both')).toBe(true);
    const cards = studyCards({ enabledDecks: [songDeckId('twinkle')], courses: {}, states: {} });
    expect(cards.map((c) => c.id)).toEqual(['song:twinkle:1-4:both', 'song:twinkle:5-8:both', 'song:twinkle:1-8:both', 'song:twinkle:9-12:both', 'song:twinkle:5-12:both', 'song:twinkle:1-12:both']);
    // Re-splitting swaps the deck's cards.
    syncSongDecks({ twinkle: { bars: 2, separateHands: false } });
    expect(CARD_BY_ID.has('song:twinkle:1-4:both')).toBe(true); // now the join of bars 1–2 and 3–4
    expect(CARD_BY_ID.has('song:twinkle:1-8:both')).toBe(false); // joins now span two 2-bar passages
  });
});

describe('playing songs', () => {
  it('grades a passage by slips and hesitations', async () => {
    const { gradePassage } = await import('../src/srs/grading');
    const cfg = { easyMs: 1000, goodMs: 5000 };
    expect(gradePassage(20, 0, [400, 500, 600], cfg)).toBe(4);
    expect(gradePassage(20, 0, [400, 2000], cfg)).toBe(3);
    expect(gradePassage(20, 0, [400, 6000], cfg)).toBe(2);
    expect(gradePassage(20, 1, [400], cfg)).toBe(2);
    expect(gradePassage(20, 2, [400], cfg)).toBe(2);
    expect(gradePassage(20, 3, [400], cfg)).toBe(1);
    expect(gradePassage(5, 2, [400], cfg)).toBe(1);
  });

  it('colours tied notes with the note they continue', async () => {
    const { tieChains, playColors } = await import('../src/songs/play');
    const { COLORS } = await import('../src/music/notation');
    const { score } = compileSong(CORPUS.find((s) => s.id === 'gymnopedie-1')!);
    const chains = tieChains(score);
    const f = score.notes.find((n) => n.measure === 8 && n.hand === 'rh')!;
    expect(chains.get(f)!.map((n) => n.measure)).toEqual([9, 10, 11]);
    const events = scoreEvents(score, 8, 11, 'rh');
    const colors = playColors(events, chains, { cursor: 1, missed: new Set() });
    expect([...colors.values()]).toEqual([COLORS.ok, COLORS.ok, COLORS.ok, COLORS.ok]);
  });

  it('finds bars with repeated slips', async () => {
    const { weakBars } = await import('../src/songs/play');
    expect(weakBars({ 0: [0, 0, 1], 3: [1, 0, 1], 5: [1, 1] })).toEqual([3, 5]);
    expect(weakBars(undefined)).toEqual([]);
  });
});

describe('new cards', () => {
  it('grade the first answer on playing it right, not speed', async () => {
    const { gradeNewCard } = await import('../src/srs/grading');
    const cfg = { newGoodMs: 5000, newOkayMs: 15000, autoKnownMs: 1000 };
    expect(gradeNewCard(false, 500, 1, cfg)).toBe(1);
    expect(gradeNewCard(true, 800, 1, cfg)).toBe('known');
    expect(gradeNewCard(true, 1200, 1, cfg)).toBe(3);
    expect(gradeNewCard(true, 4900, 1, cfg)).toBe(3);
    expect(gradeNewCard(true, 9000, 1, cfg)).toBe(2);
    expect(gradeNewCard(true, 16000, 1, cfg)).toBe(1);
    expect(gradeNewCard(true, 20000, 3, cfg)).toBe(2); // chords get longer
    expect(gradeNewCard(true, 800, 1, { ...cfg, autoKnownMs: 0 })).toBe(3);
  });
  it('grade a new passage on the notes alone', async () => {
    const { gradePassage } = await import('../src/srs/grading');
    expect(gradePassage(20, 0, [400, 9000], { easyMs: 1000, goodMs: 5000 }, true)).toBe(3);
    expect(gradePassage(20, 1, [400], { easyMs: 1000, goodMs: 5000 }, true)).toBe(2);
  });
});

describe('transcriptions', () => {
  const base = { id: 't', title: 'T', composer: '', level: 1 as const, about: '', key: 'G', meter: '3/4', tempo: 90 };
  it('reports each bar that does not add up, and unreadable notes', async () => {
    const { barProblems } = await import('../src/songs/dsl');
    const problems = barProblems({ ...base, rh: 'D5q G4e A4e B4e C5e | D5q G4q | E5q Q4q G4q', lh: 'G3h. | B3h. | C4h.' });
    expect(problems.map((p) => p.bar)).toEqual([1, 2]);
    expect(problems[0].message).toMatch(/right hand lasts 2 quarter notes; a bar of 3\/4 is 3/);
    expect(problems[1].message).toMatch(/can't read "Q4q"/);
    expect(barProblems({ ...base, rh: 'D5h.', lh: 'G3h.' })).toEqual([]);
    expect(barProblems({ ...base, meter: 'x', rh: 'D5h.', lh: '' })[0].bar).toBe(-1);
  });
  it('lets a second voice sit out bars', async () => {
    const { barProblems, compileSong } = await import('../src/songs/dsl');
    const src = { ...base, rh: 'D5h. | B4h.', lh: 'G3q B3q D4q | G3h.', lh2: 'G2h. | ' };
    expect(barProblems(src)).toEqual([]);
    const { score, xml } = compileSong(src);
    expect(score.notes.filter((n) => n.voice === '6')).toHaveLength(1);
    expect(parse(xml).notes).toHaveLength(score.notes.length);
  });
});
