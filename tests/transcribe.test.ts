import { beforeEach, describe, expect, it, vi } from 'vitest';

// A scripted stand-in for the API: each request gets the next reply.
const requests: { tools?: unknown[]; messages: { role: string; content: unknown }[] }[] = [];
let replies: { stop_reason: string; content: unknown[] }[] = [];
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = {
      messages: {
        stream: (params: (typeof requests)[number]) => {
          requests.push(structuredClone(params));
          const reply = replies.shift()!;
          return { finalMessage: async () => reply };
        },
      },
    };
  },
}));

const { clampRect, transcribePage } = await import('../src/songs/transcribe');

const page = (rh: string) =>
  JSON.stringify({ title: 'T', composer: 'C', key: 'C', meter: '4/4', tempo: 80, pickup: false, notes: '', bars: [{ rh, lh: 'C3w', rh2: '', lh2: '' }] });
const zoomCall = (id: string, x: number) => ({ type: 'tool_use', id, name: 'zoom', input: { x, y: 10, width: 300, height: 200 } });
const base = { apiKey: 'k', image: 'data:image/png;base64,AAAA', imageSize: { width: 1200, height: 1568 }, page: 1, pages: 1 };

describe('transcribing with zoom', () => {
  beforeEach(() => {
    requests.length = 0;
  });

  it('answers zoom calls with enlarged regions, then reads the JSON', async () => {
    replies = [
      { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '…', signature: 's' }, zoomCall('a', 0), zoomCall('b', 1100)] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: page('C4q D4q E4q F4q') }] },
    ];
    const zoom = vi.fn(async () => 'data:image/png;base64,ZOOM');
    const t = await transcribePage({ ...base, zoom });
    expect(t.bars).toHaveLength(1);
    expect(t.problems).toEqual([]);
    expect(zoom).toHaveBeenCalledTimes(2);
    // The second region would run off the page: it's moved back on.
    expect(zoom).toHaveBeenLastCalledWith({ x: 900, y: 10, width: 300, height: 200 });
    expect(requests).toHaveLength(2);
    expect(requests[0].tools).toHaveLength(1);
    // The second request carries the reply (thinking included) and both results, each with its image.
    const [, assistant, results] = requests[1].messages;
    expect(assistant.role).toBe('assistant');
    expect((assistant.content as unknown[]).length).toBe(3);
    const blocks = results.content as { type: string; tool_use_id: string; content: { type: string }[] }[];
    expect(blocks.map((b) => b.tool_use_id)).toEqual(['a', 'b']);
    expect(blocks[0].content.map((c) => c.type)).toEqual(['text', 'image']);
  });

  it('sends bars that do not add up back, then gives up after two tries', async () => {
    const bad = { stop_reason: 'end_turn', content: [{ type: 'text', text: page('C4q D4q') }] };
    replies = [bad, bad, bad];
    const t = await transcribePage({ ...base, zoom: async () => 'x' });
    expect(requests).toHaveLength(3);
    expect(t.problems).toHaveLength(1);
    expect(JSON.stringify(requests[1].messages.at(-1))).toContain('zoom in on them');
  });

  it('offers no tool without zoom', async () => {
    replies = [{ stop_reason: 'end_turn', content: [{ type: 'text', text: page('C4w') }] }];
    await transcribePage(base);
    expect(requests[0].tools).toBeUndefined();
  });

  it('keeps zoom regions on the page and not too small', () => {
    expect(clampRect({ x: -50, y: 1500, width: 5, height: 900 }, { width: 1200, height: 1568 })).toEqual({ x: 0, y: 668, width: 40, height: 900 });
  });
});
