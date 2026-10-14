import { parsePitch, type Pitch, toMidi } from '../music/notes';
import { barTicks, type Base, type NoteValue, parseMeter, ticksOf } from '../music/rhythm';
import { fifthsOf, type Hand, type Score, type ScoreMeasure, type ScoreNote } from './score';

/**
 * A song written compactly, one line per hand, bars separated by "|". Each note is pitches + length:
 * "E4q" (quarter), "G3+B3+D4h." (dotted-half chord), "rq" (quarter rest), "A4e~" (tied to the next note),
 * "3[G#3e C#4e E4e]" (a triplet). Lengths: w h q e s, with "." for dotted. A second voice on a staff goes in
 * rh2 / lh2 (rh / lh is the upper voice, stems up).
 */
export interface SongSource {
  id: string;
  title: string;
  composer: string;
  /** 1 beginner, 2 early intermediate, 3 intermediate. */
  level: 1 | 2 | 3;
  /** What it covers and practises, and whether it's an excerpt or simplified. */
  about: string;
  key: string;
  meter: string;
  /** Quarter notes per minute. */
  tempo: number;
  /** The first bar is a pickup (shorter than a full bar). */
  pickup?: boolean;
  rh: string;
  lh: string;
  rh2?: string;
  lh2?: string;
}

interface DslNote extends NoteValue {
  pitches: Pitch[];
}

const TOKEN = /^(r|[A-G][#b]?\d(?:\+[A-G][#b]?\d)*)([whqes])(\.?)(~?)$/;

function parseVoice(line: string, where: string): DslNote[][] {
  return line
    .split('|')
    .map((bar) => bar.trim())
    .filter((bar, i, all) => bar || i < all.length - 1)
    .map((bar, bi) => {
      const out: DslNote[] = [];
      let group: number | undefined;
      let groups = 0;
      for (const tok of bar.replace(/3\[/g, ' 3[ ').replace(/\]/g, ' ] ').trim().split(/\s+/).filter(Boolean)) {
        if (tok === '3[') {
          group = groups++;
          continue;
        }
        if (tok === ']') {
          group = undefined;
          continue;
        }
        const m = TOKEN.exec(tok);
        if (!m) throw new Error(`${where}, bar ${bi + 1}: can't read "${tok}"`);
        const n: DslNote = { pitches: m[1] === 'r' ? [] : m[1].split('+').map(parsePitch), base: m[2] as Base, dots: m[3] ? 1 : 0 };
        if (m[4]) n.tie = true;
        if (group !== undefined) n.triplet = group;
        out.push(n);
      }
      return out;
    });
}

const VOICES = [
  { key: 'rh', staff: 0, hand: 'rh', voice: '1', stem: 'up' },
  { key: 'rh2', staff: 0, hand: 'rh', voice: '2', stem: 'down' },
  { key: 'lh', staff: 1, hand: 'lh', voice: '5', stem: 'up' },
  { key: 'lh2', staff: 1, hand: 'lh', voice: '6', stem: 'down' },
] as const;

const TYPE: Record<Base, string> = { w: 'whole', h: 'half', q: 'quarter', e: 'eighth', s: '16th' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Compile a song to the app's score model, and to MusicXML for drawing it. Throws if a bar doesn't add up. */
export function compileSong(src: SongSource): { score: Score; xml: string } {
  const meter = parseMeter(src.meter);
  const full = barTicks(meter);
  const voices = VOICES.filter((v) => src[v.key]?.trim()).map((v) => ({ ...v, bars: parseVoice(src[v.key]!, `${src.id} ${v.key}`) }));
  const count = voices[0].bars.length;
  for (const v of voices) if (v.bars.length !== count) throw new Error(`${src.id}: ${v.key} has ${v.bars.length} bars, rh has ${count}`);

  const measures: ScoreMeasure[] = [];
  let start = 0;
  for (let i = 0; i < count; i++) {
    const lengths = voices.map((v) => v.bars[i].reduce((a, n) => a + ticksOf(n), 0));
    const length = lengths[0];
    const ok = lengths.every((l) => l === length) && (length === full || (i === 0 && src.pickup && length < full));
    if (!ok) throw new Error(`${src.id}, bar ${i + 1}: voices last ${lengths.map((l) => l / 24).join(', ')} quarters; a bar is ${full / 24}`);
    measures.push({ index: i, number: String(src.pickup ? i : i + 1), start, length, meter, key: src.key });
    start += length;
  }

  const notes: ScoreNote[] = [];
  for (const v of voices) {
    let prev: DslNote | undefined;
    v.bars.forEach((bar, mi) => {
      let tick = 0;
      for (const n of bar) {
        const d = ticksOf(n);
        for (const p of n.pitches) {
          notes.push({
            measure: mi,
            tick,
            time: measures[mi].start + tick,
            dur: d,
            midi: toMidi(p),
            pitch: p,
            staff: v.staff,
            hand: v.hand as Hand,
            tiedOver: !!prev?.tie && prev.pitches.some((q) => toMidi(q) === toMidi(p)),
            voice: v.voice,
          });
        }
        prev = n;
        tick += d;
      }
    });
  }
  notes.sort((a, b) => a.time - b.time || a.staff - b.staff || a.midi - b.midi);
  const score: Score = { title: src.title, composer: src.composer, measures, notes, staves: 2, tempo: src.tempo };
  return { score, xml: toMusicXML(src, voices, measures) };
}

function toMusicXML(src: SongSource, voices: { key: string; staff: number; voice: string; stem: string; bars: DslNote[][] }[], measures: ScoreMeasure[]): string {
  const { fifths, mode } = fifthsOf(src.key);
  const meter = parseMeter(src.meter);
  const staffVoices = (staff: number) => voices.filter((v) => v.staff === staff).length;
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<score-partwise version="4.0">');
  out.push(`<work><work-title>${esc(src.title)}</work-title></work>`);
  out.push(
    `<identification><creator type="composer">${esc(src.composer)}</creator><rights>Encoding: CC0 (public domain dedication), PianoSRS</rights></identification>`,
  );
  out.push('<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>');
  out.push('<part id="P1">');
  const prevOf = new Map<string, DslNote | undefined>();
  measures.forEach((m, mi) => {
    out.push(`<measure number="${m.number}"${src.pickup && mi === 0 ? ' implicit="yes"' : ''}>`);
    if (mi === 0) {
      out.push(
        `<attributes><divisions>24</divisions><key><fifths>${fifths}</fifths><mode>${mode}</mode></key>` +
          `<time><beats>${meter.num}</beats><beat-type>${meter.den}</beat-type></time><staves>2</staves>` +
          '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>',
      );
      out.push(`<sound tempo="${src.tempo}"/>`);
    }
    voices.forEach((v, vi) => {
      if (vi > 0) out.push(`<backup><duration>${m.length}</duration></backup>`);
      const bar = v.bars[mi];
      bar.forEach((n, ni) => {
        const prev = prevOf.get(v.key);
        const d = ticksOf(n);
        const tupletStart = n.triplet !== undefined && bar[ni - 1]?.triplet !== n.triplet;
        const tupletStop = n.triplet !== undefined && bar[ni + 1]?.triplet !== n.triplet;
        const common = (tiedOver: boolean) => {
          let x = `<duration>${d}</duration>`;
          if (tiedOver) x += '<tie type="stop"/>';
          if (n.tie) x += '<tie type="start"/>';
          x += `<voice>${v.voice}</voice><type>${TYPE[n.base]}</type>${n.dots ? '<dot/>' : ''}`;
          if (n.triplet !== undefined) x += '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
          if (n.pitches.length && staffVoices(v.staff) > 1) x += `<stem>${v.stem}</stem>`;
          x += `<staff>${v.staff + 1}</staff>`;
          const marks: string[] = [];
          if (tiedOver) marks.push('<tied type="stop"/>');
          if (n.tie) marks.push('<tied type="start"/>');
          if (tupletStart) marks.push(`<tuplet type="start" bracket="${n.base === 'e' || n.base === 's' ? 'no' : 'yes'}"/>`);
          if (tupletStop) marks.push('<tuplet type="stop"/>');
          if (marks.length) x += `<notations>${marks.join('')}</notations>`;
          return x;
        };
        if (!n.pitches.length) {
          const whole = bar.length === 1 && d === m.length && !src.pickup;
          out.push(`<note><rest${whole ? ' measure="yes"' : ''}/>${common(false)}</note>`);
        } else {
          n.pitches.forEach((p, pi) => {
            const alter = p.acc === '#' ? 1 : p.acc === 'b' ? -1 : 0;
            const tiedOver = !!prev?.tie && prev.pitches.some((q) => toMidi(q) === toMidi(p));
            out.push(
              `<note>${pi ? '<chord/>' : ''}<pitch><step>${p.letter}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>${common(tiedOver)}</note>`,
            );
          });
        }
        prevOf.set(v.key, n);
      });
    });
    if (mi === measures.length - 1) out.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    out.push('</measure>');
  });
  out.push('</part>');
  out.push('</score-partwise>');
  return out.join('\n');
}

