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

/** A region of the page image, in its pixels. */
export interface ZoomRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Options {
  apiKey: string;
  /** The page image as a PNG data URL, and its size in pixels. */
  image: string;
  imageSize: { width: number; height: number };
  /**
   * Redraw part of the page enlarged (a PNG data URL). With it, Claude can look closer at dense chords, inner voices
   * and ledger lines, which it reads far more accurately that way, at several times the cost.
   */
  zoom?: (rect: ZoomRect) => Promise<string>;
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
/** Zooms allowed per page: plenty for a dense page read a bar or two at a time. */
const MAX_ZOOMS = 60;

const ZOOM_TOOL: Anthropic.Beta.BetaTool = {
  name: 'zoom',
  description:
    'See part of the page enlarged, redrawn sharply from the original PDF. Give the region in pixels of the page image as you were shown it. A region a system tall and two or three bars wide reads well; narrower regions enlarge more.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['x', 'y', 'width', 'height'],
    properties: {
      x: { type: 'integer', description: 'Left edge, pixels from the left of the page image.' },
      y: { type: 'integer', description: 'Top edge, pixels from the top of the page image.' },
      width: { type: 'integer', description: 'Width in pixels.' },
      height: { type: 'integer', description: 'Height in pixels.' },
    },
  },
  strict: true,
};

/** Keep a requested region on the page and at least a little bigger than a notehead. */
export function clampRect(r: ZoomRect, size: { width: number; height: number }): ZoomRect {
  const min = 40;
  const width = Math.min(size.width, Math.max(min, Math.round(r.width)));
  const height = Math.min(size.height, Math.max(min, Math.round(r.height)));
  const x = Math.min(size.width - width, Math.max(0, Math.round(r.x)));
  const y = Math.min(size.height - height, Math.max(0, Math.round(r.y)));
  return { x, y, width, height };
}

const ZOOM_ADVICE = (size: { width: number; height: number }) =>
  `The page image is ${size.width}×${size.height} pixels, too small to read dense music reliably: noteheads in chords, inner voices, ledger lines and accidentals blur at this size. Use the zoom tool to look at the music up close, system by system, a few bars at a time, before writing each bar down. Zoom again on anything you're unsure of. When you've read every bar, reply with the JSON.`;

const dataOf = (url: string) => url.replace(/^data:image\/png;base64,/, '');

/** Transcribe one page. Bars that don't add up go back for correction; any left are returned in `problems`. */
export async function transcribePage({
  apiKey,
  image,
  imageSize,
  zoom,
  page,
  pages,
  context,
  signal,
  onStatus,
}: Options): Promise<PageTranscript> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const intro = context
    ? `Page ${page} of ${pages}. Earlier pages of "${context.title}" are in ${context.key}, ${context.meter}. Transcribe every bar on this page, starting with its first bar; leave title and composer empty unless this page prints them, and use the key and time signature in force at the start of this page. If a system starts with a bar continued from the previous page, still transcribe it from the start of the bar.`
    : `Page ${page} of ${pages}: the first page. Transcribe every bar on it.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: dataOf(image) } },
        { type: 'text', text: zoom ? `${intro}\n\n${ZOOM_ADVICE(imageSize)}` : intro },
      ],
    },
  ];
  let result: Omit<PageTranscript, 'problems'> | null = null;
  let problems: BarProblem[] = [];
  let fixes = 0;
  let zooms = 0;
  onStatus?.(`Reading page ${page}…`);
  for (;;) {
    const stream = client.beta.messages.stream(
      {
        model: TRANSCRIBE_MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
        system: SYSTEM,
        ...(zoom ? { tools: [ZOOM_TOOL] } : {}),
        // Each zoom resends the conversation so far: caching makes those resends cheap.
        cache_control: { type: 'ephemeral' },
        messages,
      },
      { signal },
    );
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') throw new Error(`Claude declined to transcribe page ${page}.`);
    if (response.stop_reason === 'max_tokens') throw new Error(`Page ${page} was too long to transcribe in one go.`);
    // Keep the whole reply (thinking included): the next request carries on from it.
    messages.push({ role: 'assistant', content: response.content });

    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (calls.length) {
      const results = await Promise.all(
        calls.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          if (!zoom || call.name !== 'zoom') return { type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'Unknown tool.' };
          if (++zooms > MAX_ZOOMS)
            return {
              type: 'tool_result',
              tool_use_id: call.id,
              is_error: true,
              content: 'No more zooms for this page: reply with the JSON now.',
            };
          const rect = clampRect(call.input as ZoomRect, imageSize);
          const png = await zoom(rect);
          return {
            type: 'tool_result',
            tool_use_id: call.id,
            content: [
              { type: 'text', text: `Region x=${rect.x} y=${rect.y} ${rect.width}×${rect.height}, enlarged:` },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: dataOf(png) } },
            ],
          };
        }),
      );
      onStatus?.(`Page ${page}: looking closer (${Math.min(zooms, MAX_ZOOMS)} zoom${zooms === 1 ? '' : 's'})…`);
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
    if (!text) throw new Error(`No transcription came back for page ${page}.`);
    result = JSON.parse(text) as Omit<PageTranscript, 'problems'>;
    problems = barProblems(asSource(result, !context)).filter((p) => p.bar >= 0);
    if (!problems.length || fixes++ >= MAX_FIXES) break;
    onStatus?.(`Page ${page}: fixing ${problems.length} bar${problems.length === 1 ? '' : 's'} that don't add up…`);
    messages.push({
      role: 'user',
      content: `These bars on this page don't add up (bar numbers count from 1 on this page):\n${problems
        .map((p) => `- Bar ${p.bar + 1}: ${p.message}`)
        .join('\n')}\nLook at those bars on the page again${zoom ? ' (zoom in on them)' : ''} and send the whole page's JSON, corrected.`,
    });
  }
  return { ...result!, problems };
}

/**
 * Rough cost of one page, for the notes by the button: a page image in and several thousand tokens of reading out;
 * looking closer adds dozens of enlarged images and much more reading.
 */
export const COST_PER_PAGE = '$0.10–0.40';
export const COST_PER_PAGE_ZOOM = '$1–3';

/**
 * Instructions to paste into a Claude chat (claude.ai or the Claude app) with the PDF attached, for transcribing
 * on a Claude plan instead of with an API key. The reply is pasted back and read by parseChatReply.
 */
export function chatPrompt(pages: number): string {
  return `${SYSTEM}

The attached PDF has ${pages} page${pages === 1 ? '' : 's'}. Transcribe every bar of the piano music on every page, in order, as ONE JSON object with these fields:
- "title", "composer": as printed (empty strings if not shown)
- "key": the key, written like C, G, Bb, F#, or for minor keys Am, F#m, Ebm
- "meter": the time signature, like "3/4"
- "tempo": quarter notes per minute (an integer; estimate from the tempo word if there's no metronome mark)
- "pickup": true if the piece starts with an incomplete bar
- "bars": an array with one object per bar, {"rh": "...", "lh": "...", "rh2": "...", "lh2": "..."}
- "notes": bars you couldn't read with confidence

If you can run code, crop and enlarge each system of each page (a few bars at a time) and read the music from those close-ups: at full-page size, noteheads in chords, inner voices and ledger lines blur and get misread.

Skip pages without piano music (covers, notes). Reply with only the JSON, in a \`\`\`json code block.`;
}

/** What to paste back when some bars don't add up. */
export function chatFixPrompt(problems: BarProblem[]): string {
  return `These bars don't add up (bar numbers count from 1):\n${problems
    .filter((p) => p.bar >= 0)
    .map((p) => `- Bar ${p.bar + 1}: ${p.message}`)
    .join('\n')}\nLook at those bars in the PDF again and send the whole JSON again, corrected, in a \`\`\`json code block.`;
}

/** Read the JSON out of a pasted Claude reply (with or without a code block). Throws a readable error. */
export function parseChatReply(reply: string): Omit<PageTranscript, 'problems'> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply)?.[1];
  const text = fenced ?? reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1);
  let data: Partial<Omit<PageTranscript, 'problems'>>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Couldn't find the JSON in that reply. Paste Claude's whole answer, including the ```json block.");
  }
  if (!Array.isArray(data.bars) || !data.bars.length) throw new Error('The reply has no bars in it.');
  const keys = new Set(KEYS);
  return {
    title: data.title ?? '',
    composer: data.composer ?? '',
    key: data.key && keys.has(data.key) ? data.key : 'C',
    meter: data.meter ?? '4/4',
    tempo: Number(data.tempo) || 80,
    pickup: !!data.pickup,
    bars: data.bars.map((b) => ({ rh: b.rh ?? '', lh: b.lh ?? '', rh2: b.rh2 ?? '', lh2: b.lh2 ?? '' })),
    notes: data.notes ?? '',
  };
}
