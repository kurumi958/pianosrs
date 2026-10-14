import { unzipSync } from 'fflate';
import type { Accidental, Letter, Pitch } from '../music/notes';
import { type Meter, TPQ } from '../music/rhythm';
import { type Hand, keyFromFifths, type Score, type ScoreMeasure, type ScoreNote } from './score';

/** The DOM parser to use: the browser's, or one passed in (tests use @xmldom/xmldom). */
type ParserCtor = new () => { parseFromString(text: string, type: string): Document };

const isEl = (n: Node): n is Element => n.nodeType === 1;
const kids = (el: Element, name?: string): Element[] =>
  Array.from(el.childNodes as ArrayLike<Node>).filter(isEl).filter((e) => !name || e.nodeName === name);
const kid = (el: Element, name: string): Element | undefined => kids(el, name)[0];
const text = (el: Element | undefined, name?: string): string | undefined => {
  const t = name ? (el ? kid(el, name) : undefined) : el;
  return t?.textContent?.trim() || undefined;
};
const num = (s: string | undefined, fallback: number) => (s !== undefined && Number.isFinite(Number(s)) ? Number(s) : fallback);

const STEP_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Read a MusicXML score (score-partwise, the format every notation program exports) into the app's model:
 * every note with its bar, timing, staff and ties, and each bar's length, time signature and key.
 *
 * Grace notes and cue notes are left out (they aren't part of the timed playing), repeats are read once, as
 * written, and every part is included, with staves numbered top to bottom across parts.
 */
export function parseMusicXML(xml: string, Parser: ParserCtor = DOMParser as unknown as ParserCtor): Score {
  const doc = new Parser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.nodeName === 'parsererror' || doc.getElementsByTagName('parsererror').length) throw new Error("This file isn't valid MusicXML.");
  if (root.nodeName === 'score-timewise') throw new Error('Timewise MusicXML isn\'t supported; export the score as regular ("partwise") MusicXML.');
  if (root.nodeName !== 'score-partwise') throw new Error("This file isn't a MusicXML score.");

  const title = text(kid(root, 'work'), 'work-title') ?? text(root, 'movement-title') ?? 'Untitled';
  const composer =
    Array.from(doc.getElementsByTagName('creator') as ArrayLike<Element>)
      .find((c) => c.getAttribute('type') === 'composer')
      ?.textContent?.trim() ?? '';

  const parts = kids(root, 'part');
  if (!parts.length) throw new Error('This score has no parts.');

  const measures: ScoreMeasure[] = [];
  const notes: ScoreNote[] = [];
  let staffBase = 0;
  let tempo: number | undefined;

  parts.forEach((part, pi) => {
    let divisions = 1;
    let meter: Meter = { num: 4, den: 4 };
    let key = 'C';
    let staves = 1;
    const clefs: Record<number, string> = {};
    let start = 0;
    kids(part, 'measure').forEach((m, mi) => {
      let pos = 0;
      let maxPos = 0;
      let chordStart = 0;
      const ticks = (el: Element) => Math.round((num(text(el, 'duration'), 0) * TPQ) / divisions);
      for (const el of kids(m)) {
        if (el.nodeName === 'attributes') {
          divisions = num(text(el, 'divisions'), divisions);
          const k = kid(el, 'key');
          if (k && text(k, 'fifths') !== undefined) key = keyFromFifths(num(text(k, 'fifths'), 0), text(k, 'mode'));
          const t = kid(el, 'time');
          if (t && text(t, 'beats') && text(t, 'beat-type')) {
            // Compound signatures like "3+2" add up.
            const beats = (text(t, 'beats') ?? '4').split('+').reduce((a, b) => a + num(b, 0), 0);
            meter = { num: beats || 4, den: num(text(t, 'beat-type'), 4) };
          }
          staves = num(text(el, 'staves'), staves);
          for (const c of kids(el, 'clef')) clefs[num(c.getAttribute('number') ?? undefined, 1)] = text(c, 'sign') ?? 'G';
        } else if (el.nodeName === 'backup') {
          pos = Math.max(0, pos - ticks(el));
        } else if (el.nodeName === 'forward') {
          pos += ticks(el);
          maxPos = Math.max(maxPos, pos);
        } else if (el.nodeName === 'direction' || el.nodeName === 'sound') {
          const s = el.nodeName === 'sound' ? el : kid(el, 'sound');
          const bpm = s?.getAttribute('tempo');
          if (bpm && tempo === undefined) tempo = Math.round(Number(bpm));
        } else if (el.nodeName === 'note') {
          if (kid(el, 'grace')) continue; // ornaments: no time of their own
          const d = ticks(el);
          const isChord = !!kid(el, 'chord');
          const at = isChord ? chordStart : pos;
          if (!isChord) {
            chordStart = pos;
            pos += d;
            maxPos = Math.max(maxPos, pos);
          }
          const p = kid(el, 'pitch');
          if (!p || kid(el, 'rest') || kid(el, 'cue')) continue;
          const step = (text(p, 'step') ?? 'C') as Letter;
          const alter = Math.round(num(text(p, 'alter'), 0));
          const octave = num(text(p, 'octave'), 4);
          const acc: Accidental = alter === 1 ? '#' : alter === -1 ? 'b' : '';
          const pitch: Pitch = { letter: step, acc, octave };
          const staffNo = num(text(el, 'staff'), 1);
          const hand: Hand = staves >= 2 ? (staffNo === 1 ? 'rh' : 'lh') : clefs[staffNo] === 'F' ? 'lh' : 'rh';
          notes.push({
            measure: mi,
            tick: at,
            time: start + at,
            dur: d,
            midi: 12 * (octave + 1) + STEP_PC[step] + alter,
            pitch,
            staff: staffBase + staffNo - 1,
            hand,
            tiedOver: kids(el, 'tie').some((t) => t.getAttribute('type') === 'stop'),
            voice: `${pi}:${text(el, 'voice') ?? '1'}`,
          });
        }
      }
      // The first part decides the bars; other parts line up with them.
      if (pi === 0) {
        const full = (meter.num * TPQ * 4) / meter.den;
        const length = maxPos || full;
        measures.push({ index: mi, number: m.getAttribute('number') ?? String(mi + 1), start, length, meter, key });
        start += length;
      }
    });
    staffBase += staves;
  });

  // Later parts were timed against their own running clock; re-anchor them to the first part's bars.
  for (const n of notes) {
    const m = measures[n.measure];
    if (m) n.time = m.start + n.tick;
  }
  notes.sort((a, b) => a.time - b.time || a.staff - b.staff || a.midi - b.midi);
  if (!notes.length) throw new Error('This score has no notes to play.');
  return { title, composer, measures, notes, staves: staffBase, tempo };
}

/**
 * The MusicXML text of a score file: plain .musicxml/.xml, or compressed .mxl (a zip whose
 * META-INF/container.xml names the score inside).
 */
export function readScoreFile(bytes: Uint8Array): string {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return decode(bytes);
  const files = unzipSync(bytes);
  const container = files['META-INF/container.xml'];
  let path = container ? /full-path="([^"]+)"/.exec(decode(container))?.[1] : undefined;
  path ??= Object.keys(files).find((f) => !f.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(f));
  if (!path || !files[path]) throw new Error('No score found inside this .mxl file.');
  return decode(files[path]);
}

function decode(bytes: Uint8Array): string {
  // MusicXML is usually UTF-8; some programs write UTF-16 with a byte-order mark.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}
