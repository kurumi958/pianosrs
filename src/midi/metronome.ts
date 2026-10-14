/**
 * Metronome clicks scheduled on the Web Audio clock, addressed in performance.now() milliseconds. The sound is a
 * clockwork escapement tick (public/metronome/, rendered by scripts/metronome/), alternating between the pendulum's
 * two swings, with an optional small bell on the first beat of the bar.
 */

let ctx: AudioContext | undefined;
let sounds: { ticks: AudioBuffer[]; bell: AudioBuffer } | undefined;
let loading: Promise<void> | undefined;
let bellOn = false;

function audio(): AudioContext {
  ctx ??= new AudioContext({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Fetch and decode the tick and bell (once). Until they're ready, a plain click plays instead. */
export function loadMetronome(): Promise<void> {
  if (loading) return loading;
  const c = audio();
  const get = async (name: string) =>
    c.decodeAudioData(await (await fetch(`${import.meta.env.BASE_URL}metronome/${name}.wav`)).arrayBuffer());
  loading = Promise.all([get('tick-1'), get('tick-2'), get('bell')])
    .then(([a, b, bell]) => void (sounds = { ticks: [a, b], bell }))
    .catch(() => {
      // Keep the plain click.
    });
  return loading;
}

/** Ring the bell on the first beat of each bar (from settings). */
export function setMetronomeBell(on: boolean): void {
  bellOn = on;
}

/** How long after scheduling a sound it actually comes out of the speakers. Taps follow what you hear, so expected times shift by this. */
export function outputLatencyMs(): number {
  const c = audio();
  return ((c.outputLatency || 0) + (c.baseLatency || 0)) * 1000;
}

/** Schedule clicks at the given performance.now() times; accented clicks are higher. Returns a function that cancels them. */
export function scheduleClicks(clicks: { at: number; accent?: boolean }[]): () => void {
  const c = audio();
  void loadMetronome();
  const offset = c.currentTime - performance.now() / 1000;
  const play = (buffer: AudioBuffer, t: number, level: number) => {
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = level;
    src.connect(gain).connect(c.destination);
    src.start(t);
    return src;
  };
  const nodes = clicks.flatMap(({ at, accent }, i): AudioScheduledSourceNode[] => {
    const t = Math.max(c.currentTime, at / 1000 + offset);
    if (sounds) {
      // Tick, tock: the pendulum's two swings sound slightly different. The downbeat is struck harder.
      const tick = play(sounds.ticks[i % 2], t, accent ? 1.35 : 1);
      return accent && bellOn ? [tick, play(sounds.bell, t, 1)] : [tick];
    }
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.08);
    return [osc];
  });
  return () =>
    nodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        // already stopped
      }
    });
}

/** Clicks for `bars` bars of `beats` beats starting at `start`, with beat 1 of each bar accented. */
export function barClicks(start: number, beatMs: number, beats: number, bars: number) {
  return Array.from({ length: beats * bars }, (_, i) => ({ at: start + i * beatMs, accent: i % beats === 0 }));
}
