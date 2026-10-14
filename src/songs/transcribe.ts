import Anthropic from '@anthropic-ai/sdk';
import { MAJOR_KEYS, MINOR_KEYS } from '../music/notes';
import { barProblems, type BarProblem, type SongSource } from './dsl';

/** Transcribing sheet music is hard visual reasoning, so it uses the most capable default model. */
export const TRANSCRIBE_MODEL = 'claude-opus-5-5';

const KEY_STORE = 'pianosrs:anthropic-key';

/** The Anthropic API key is kept in this browser only (not in backups or progress data). */
export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORE, key.trim());
    else localStorage.removeItem(KEY_STORE);
  } catch {
    // storage unavailable: the key lasts for this page only
  }
}

export interface PageBar {
  rh: string;
  lh: string;
  rh2: string;
  lh2: string;
}

export interface PageTranscript {
  title: string;
  composer: string;
  key: string;
  meter: string;
  tempo: number;
  pickup: boolean;
  bars: PageBar[];
  /** Anything Claude was unsure of, to check by eye. */
  notes: string;
  /** Problems still left after the retries (empty if every bar adds up). */
  problems: BarProblem[];
}

const KEYS = [...MAJOR_KEYS, ...MINOR_KEYS].map((k) => k.key);

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'composer', 'key', 'meter', 'tempo', 'pickup', 'bars', 'notes'],
  properties: {
    title: { type: 'string', description: 'Title as printed, or empty if this page shows none.' },
    composer: { type: 'string', description: 'Composer as printed, or empty.' },
    key: { type: 'string', enum: KEYS, description: 'Key signature, named as major or minor (Am, F#m) from the music.' },
    meter: { type: 'string', description: 'Time signature, e.g. "3/4", "6/8", "2/2" (cut time).' },
    tempo: { type: 'integer', description: 'Quarter notes per minute: the metronome mark, or an estimate from the tempo word.' },
    pickup: { type: 'boolean', description: 'True if the piece starts with an incomplete (pickup) bar.' },
    bars: {
      type: 'array',
      description: 'Every bar on this page, in order.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['rh', 'lh', 'rh2', 'lh2'],
        properties: {
          rh: { type: 'string', description: 'Top staff, main voice.' },
          lh: { type: 'string', description: 'Bottom staff, main voice.' },
          rh2: { type: 'string', description: 'Top staff, second voice, or empty.' },
          lh2: { type: 'string', description: 'Bottom staff, second voice, or empty.' },
        },
      },
    },
    notes: { type: 'string', description: 'Bars or symbols you were unsure of, briefly. Empty if none.' },
  },
} as const;

const SYSTEM = `You transcribe piano sheet music from page images into the compact text notation of a piano-learning app. The app turns your transcription into an engraved score that a student plays along with on a real piano, note by note, so every pitch and every rhythm matters. Read carefully, bar by bar, staff by staff.

The notation, for each bar and each voice:
- Notes are separated by spaces. A note is its pitch, then its length: E4q is a quarter-note E above middle C.
- Pitch: a letter A–G, then an optional # or b, then the octave number. Middle C is C4; the piano runs from A0 to C8. Octave numbers change at C (B3 is just below C4).
- Write the pitch that sounds. Apply the key signature and any accidental still in force in that bar: in G major, an F on the staff is F#4 (not F4); after a natural sign it is F4 until the barline. There are no double sharps or flats: write the enharmonic key (Fx becomes G). Under 8va or 8vb, write the octave that sounds.
- Chords: join the pitches with + from low to high, one length for all: C4+E4+G4h.
- Lengths: w whole, h half, q quarter, e eighth, s sixteenth. Add . for dotted: q. is a dotted quarter.
- Rests: r then the length: rq, rh., re.
- Ties: put ~ after the first note's length and write the held note again: G4h~ G4q.
- Triplets: wrap the three notes in 3[ ]: 3[C5e D5e E5e]. A triplet must fill one beat: three eighths (a quarter), three quarters (a half), or three sixteenths (an eighth).
- Every voice must last exactly one bar of the time signature: fill gaps with rests. The only exception is a pickup bar at the very start of the piece.
- Leave out grace notes, ornament signs, dynamics, pedalling, fingering and lyrics. Play a trill or turn as its main note. Lengths shorter than a sixteenth: combine them into sixteenths so the bar still adds up, and mention it in notes.

Voices:
- rh is the top staff (right hand) and lh the bottom staff (left hand), whatever clef they are in. Assign notes by the staff they are written on.
- Notes that start together and last the same time go in one chord. When a staff has two rhythms at once (a held note under moving notes, or stems up and stems down), put the upper one in rh (or lh) and the lower one in rh2 (or lh2). Leave rh2 and lh2 empty ("") in bars that don't need them.
- Repeats and endings: write the bars once, as printed, in printed order. Don't expand them.
- If the score has other staves (a voice part, other instruments), transcribe only the piano's two staves.

Example, a bar of 3/4 in G major with a melody over a held bass and a moving tenor:
{"rh": "D5q G4e A4e B4e C5e", "lh": "B3h A3q", "rh2": "", "lh2": "G2h."}

Output JSON matching the schema. In notes, list any bar you couldn't read with confidence, so the student can check it.`;

interface Options {
  apiKey: string;
  /** The page image as a PNG data URL. */
  image: string;
  page: number;
  pages: number;
  /** For pages after the first: what's been read so far. */
  context?: { key: string; meter: string; title: string };
  signal?: AbortSignal;
  onStatus?: (s: string) => void;
}

const asSource = (t: Omit<PageTranscript, 'problems'>, first: boolean): SongSource => ({
  id: 'page',
  title: t.title,
  composer: t.composer,
  level: 1,
  about: '',
  key: t.key,
  meter: t.meter,
  tempo: t.tempo,
  pickup: first && t.pickup,
  rh: t.bars.map((b) => b.rh).join(' | '),
  lh: t.bars.map((b) => b.lh).join(' | '),
  rh2: t.bars.map((b) => b.rh2).join(' | '),
  lh2: t.bars.map((b) => b.lh2).join(' | '),
});

/** How many times a page goes back to Claude with the bars that don't add up. */
const MAX_FIXES = 2;

/** Transcribe one page. Bars that don't add up go back for correction; any left are returned in `problems`. */
export async function transcribePage({ apiKey, image, page, pages, context, signal, onStatus }: Options): Promise<PageTranscript> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const intro = context
    ? `Page ${page} of ${pages}. Earlier pages of "${context.title}" are in ${context.key}, ${context.meter}. Transcribe every bar on this page, starting with its first bar; leave title and composer empty unless this page prints them, and use the key and time signature in force at the start of this page. If a system starts with a bar continued from the previous page, still transcribe it from the start of the bar.`
    : `Page ${page} of ${pages}: the first page. Transcribe every bar on it.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: image.replace(/^data:image\/png;base64,/, '') } },
        { type: 'text', text: intro },
      ],
    },
  ];
  let result: Omit<PageTranscript, 'problems'> | null = null;
  let problems: BarProblem[] = [];
  for (let attempt = 0; attempt <= MAX_FIXES; attempt++) {
    onStatus?.(attempt ? `Page ${page}: fixing ${problems.length} bar${problems.length === 1 ? '' : 's'} that don't add up…` : `Reading page ${page}…`);
    const stream = client.beta.messages.stream(
      {
        model: TRANSCRIBE_MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
        system: SYSTEM,
        messages,
      },
      { signal },
    );
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') throw new Error(`Claude declined to transcribe page ${page}.`);
    if (response.stop_reason === 'max_tokens') throw new Error(`Page ${page} was too long to transcribe in one go.`);
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
    if (!text) throw new Error(`No transcription came back for page ${page}.`);
    result = JSON.parse(text) as Omit<PageTranscript, 'problems'>;
    problems = barProblems(asSource(result, !context)).filter((p) => p.bar >= 0);
    if (!problems.length) break;
    // Keep the whole reply (thinking included) and ask for the page again with the problems listed.
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: `These bars on this page don't add up (bar numbers count from 1 on this page):\n${problems
        .map((p) => `- Bar ${p.bar + 1}: ${p.message}`)
        .join('\n')}\nLook at those bars on the page again and send the whole page's JSON, corrected.`,
    });
  }
  return { ...result!, problems };
}

/** Rough cost of one page, for the note under the button: a page image in, several thousand tokens of reading out. */
export const COST_PER_PAGE = '$0.10–0.40';
