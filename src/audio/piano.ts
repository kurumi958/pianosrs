/**
 * A sampled grand piano: the Salamander Grand Piano V3 (Yamaha C5, recorded by Alexander Holm, CC BY 3.0), eight of
 * its sixteen velocity layers, sampled every minor third from A0 to C8 (public/piano/). Each note plays the nearest
 * sample, retuned, from the layer matching how hard the key was struck. The dampers and the sustain pedal behave as
 * on a real piano: a released key stops its string unless the pedal is down, and the top strings have no dampers.
 */

/** The velocity layers kept from the sixteen recorded, softest first. */
export const LAYERS = [2, 4, 6, 8, 10, 12, 14, 16];
/** Sampled notes: every third semitone from A0 (21) to C8 (108). */
export const SAMPLED = Array.from({ length: 30 }, (_, i) => 21 + 3 * i);
/** Strings from here up have no dampers: they ring on after the key is released. */
const UNDAMPED_FROM = 89;

const NAMES: Record<number, string> = { 0: 'C', 3: 'Ds', 6: 'Fs', 9: 'A' };
export const sampleName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/** Which layer a key velocity (1–127) plays: eight even bands. */
export const layerFor = (velocity: number) => Math.min(LAYERS.length - 1, Math.max(0, Math.ceil(velocity / 16) - 1));

/** The sampled note nearest to `midi` (ties go down, so samples are retuned upwards slightly more often than down). */
export const nearestSample = (midi: number) => SAMPLED.reduce((best, s) => (Math.abs(s - midi) < Math.abs(best - midi) ? s : best));

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** The key has been released (the note only rings on because of the pedal or missing dampers). */
  released: boolean;
}

type LoadState = { loaded: number; total: number; failed: boolean };

class Piano {
  private ctx?: AudioContext;
  private out?: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<number, Voice[]>();
  private pedalDown = false;
  private loading?: Promise<void>;
  private listeners = new Set<(s: LoadState) => void>();
  private volume = 0.8;
  state: LoadState = { loaded: 0, total: SAMPLED.length * LAYERS.length, failed: false };

  /** Where the samples are served from (next to the app). */
  base = `${import.meta.env?.BASE_URL ?? './'}piano/`;

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      // Chords at full force add up: a gentle compressor keeps them from clipping.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      this.out = this.ctx.createGain();
      this.out.gain.value = this.volume;
      this.out.connect(comp).connect(this.ctx.destination);
      // Browsers start audio suspended until the page is used; resume on the first click or key.
      const resume = () => void this.ctx?.resume();
      window.addEventListener('pointerdown', resume, { once: true });
      window.addEventListener('keydown', resume, { once: true });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  onState(fn: (s: LoadState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }
  private setState(patch: Partial<LoadState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  /** Fetch and decode the samples (once): middle layers first, so the piano is playable within a moment. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    const ctx = this.context();
    const order = [3, 4, 2, 5, 1, 6, 0, 7].map((i) => LAYERS[i]);
    let loaded = 0;
    let failures = 0;
    this.loading = (async () => {
      for (const layer of order) {
        await Promise.all(
          SAMPLED.map(async (midi) => {
            const name = `${sampleName(midi)}v${layer}`;
            try {
              const res = await fetch(`${this.base}${name}.mp3`);
              if (!res.ok) throw new Error(String(res.status));
              this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
            } catch {
              failures++;
            }
            this.setState({ loaded: ++loaded });
          }),
        );
      }
      this.setState({ failed: failures === this.state.total });
    })();
    return this.loading;
  }

  /** The buffer for this note and velocity: the wanted layer, else the nearest layer that has loaded. */
  private bufferFor(sample: number, velocity: number): AudioBuffer | undefined {
    const want = layerFor(velocity);
    for (let d = 0; d < LAYERS.length; d++) {
      for (const i of [want - d, want + d]) {
        const b = i >= 0 && i < LAYERS.length ? this.buffers.get(`${sampleName(sample)}v${LAYERS[i]}`) : undefined;
        if (b) return b;
      }
    }
    return undefined;
  }

  /** Play a note. Returns false if no sample is ready yet (the caller can fall back to a simple tone). */
  noteOn(midi: number, velocity: number): boolean {
    const sample = nearestSample(midi);
    const buffer = this.bufferFor(sample, velocity);
    if (!buffer || !this.ctx || !this.out) return false;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // Striking a key that's still sounding damps its string first.
    for (const v of this.voices.get(midi) ?? []) this.fade(v, t, 0.03);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 2 ** ((midi - sample) / 12);
    const gain = ctx.createGain();
    // Layers already get louder with velocity; this smooths the steps within a layer.
    gain.gain.value = 0.55 + 0.45 * ((velocity % 16 || 16) / 16) ** 0.5;
    source.connect(gain).connect(this.out);
    source.start(t);
    const voice: Voice = { source, gain, released: false };
    this.voices.set(midi, [voice]);
    source.onended = () => {
      const list = this.voices.get(midi);
      if (list)
        this.voices.set(
          midi,
          list.filter((v) => v !== voice),
        );
    };
    return true;
  }

  noteOff(midi: number): void {
    if (!this.ctx) return;
    for (const v of this.voices.get(midi) ?? []) {
      v.released = true;
      if (!this.pedalDown && midi < UNDAMPED_FROM) this.fade(v, this.ctx.currentTime, 0.12);
    }
  }

  /** The sustain pedal: lifting it damps every string whose key is up. */
  pedal(down: boolean): void {
    this.pedalDown = down;
    if (down || !this.ctx) return;
    for (const [midi, list] of this.voices)
      if (midi < UNDAMPED_FROM) for (const v of list) if (v.released) this.fade(v, this.ctx.currentTime, 0.12);
  }

  /** Silence everything (e.g. when sound is turned off). */
  allOff(): void {
    if (!this.ctx) return;
    for (const list of this.voices.values()) for (const v of list) this.fade(v, this.ctx.currentTime, 0.05);
  }

  private fade(v: Voice, t: number, timeConstant: number) {
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.setTargetAtTime(0, t, timeConstant);
    try {
      v.source.stop(t + timeConstant * 8);
    } catch {
      // already stopped
    }
  }
}

export const piano = new Piano();
