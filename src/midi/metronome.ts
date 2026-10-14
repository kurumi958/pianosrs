/** Metronome clicks scheduled on the Web Audio clock, addressed in performance.now() milliseconds. */

let ctx: AudioContext | undefined;

function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** How long after scheduling a sound it actually comes out of the speakers. Taps follow what you hear, so expected times shift by this. */
export function outputLatencyMs(): number {
  const c = audio();
  return ((c.outputLatency || 0) + (c.baseLatency || 0)) * 1000;
}

/** Schedule clicks at the given performance.now() times; accented clicks are higher. Returns a function that cancels them. */
export function scheduleClicks(clicks: { at: number; accent?: boolean }[]): () => void {
  const c = audio();
  const offset = c.currentTime - performance.now() / 1000;
  const nodes = clicks.map(({ at, accent }) => {
    const t = Math.max(c.currentTime, at / 1000 + offset);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.value = accent ? 1600 : 1000;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(accent ? 0.5 : 0.3, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.08);
    return osc;
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
