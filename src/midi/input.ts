/**
 * One hub for every way of playing notes: a MIDI keyboard (Web MIDI), the on-screen
 * piano, and the computer keyboard. UI code subscribes here and doesn't care which is used.
 */

export type InputSource = 'midi' | 'screen' | 'keys';
export interface NoteEvent {
  type: 'on' | 'off';
  note: number;
  velocity: number;
  source: InputSource;
}
type Listener = (e: NoteEvent) => void;

export interface MidiDevice {
  id: string;
  name: string;
}

export interface MidiStatus {
  supported: boolean;
  enabled: boolean;
  error?: string;
  devices: MidiDevice[];
}

class InputHub {
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: MidiStatus) => void>();
  readonly held = new Set<number>();
  status: MidiStatus = { supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator, enabled: false, devices: [] };
  selectedInput = 'all';
  soundForVirtual = true;
  private access?: MIDIAccess;
  private audio?: AudioContext;
  private voices = new Map<number, { osc: OscillatorNode; gain: GainNode }>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: MidiStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  emit(e: NoteEvent): void {
    if (e.type === 'on') {
      if (this.held.has(e.note) && e.source !== 'midi') return;
      this.held.add(e.note);
    } else {
      this.held.delete(e.note);
    }
    if (e.source !== 'midi' && this.soundForVirtual) this.sound(e);
    for (const l of this.listeners) l(e);
  }

  private setStatus(patch: Partial<MidiStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const l of this.statusListeners) l(this.status);
  }

  async enableMidi(): Promise<void> {
    if (!this.status.supported) return;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.attach();
      this.attach();
      this.setStatus({ enabled: true, error: undefined });
    } catch (err) {
      this.setStatus({ enabled: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private attach(): void {
    if (!this.access) return;
    const devices: MidiDevice[] = [];
    this.access.inputs.forEach((input) => {
      devices.push({ id: input.id, name: input.name || 'MIDI input' });
      input.onmidimessage = (msg) => this.onMidi(input.id, msg);
    });
    this.setStatus({ devices });
  }

  private onMidi(inputId: string, msg: MIDIMessageEvent): void {
    if (this.selectedInput !== 'all' && this.selectedInput !== inputId) return;
    const data = msg.data;
    if (!data || data.length < 3) return;
    const cmd = data[0] & 0xf0;
    const note = data[1];
    const vel = data[2];
    if (cmd === 0x90 && vel > 0) this.emit({ type: 'on', note, velocity: vel, source: 'midi' });
    else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) this.emit({ type: 'off', note, velocity: 0, source: 'midi' });
  }

  /** A tiny synth so on-screen / typed notes are audible. */
  private sound(e: NoteEvent): void {
    try {
      if (e.type === 'off') {
        const v = this.voices.get(e.note);
        if (!v || !this.audio) return;
        const t = this.audio.currentTime;
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setTargetAtTime(0, t, 0.08);
        v.osc.stop(t + 0.5);
        this.voices.delete(e.note);
        return;
      }
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 440 * 2 ** ((e.note - 69) / 12);
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
      gain.gain.setTargetAtTime(0.08, t + 0.02, 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      this.voices.get(e.note)?.osc.stop();
      this.voices.set(e.note, { osc, gain });
    } catch {
      // Audio is a nicety; ignore failures (e.g. autoplay restrictions).
    }
  }
}

export const hub = new InputHub();

// Computer keyboard: a row of white keys (A S D F G H J K L ;) with black keys above (W E  T Y U  O P).
const KEYMAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16,
};
let keyboardOctave = 4;
const typedDown = new Map<string, number>();

export function getKeyboardOctave(): number {
  return keyboardOctave;
}

export function installComputerKeyboard(onOctave?: (o: number) => void): () => void {
  const isTyping = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
  const down = (ev: KeyboardEvent) => {
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey || isTyping(ev.target)) return;
    const k = ev.key.toLowerCase();
    if (k === 'z' || k === 'x') {
      keyboardOctave = Math.min(7, Math.max(1, keyboardOctave + (k === 'z' ? -1 : 1)));
      onOctave?.(keyboardOctave);
      return;
    }
    if (!(k in KEYMAP) || typedDown.has(k)) return;
    const note = 12 * (keyboardOctave + 1) + KEYMAP[k];
    typedDown.set(k, note);
    hub.emit({ type: 'on', note, velocity: 80, source: 'keys' });
  };
  const up = (ev: KeyboardEvent) => {
    const k = ev.key.toLowerCase();
    const note = typedDown.get(k);
    if (note === undefined) return;
    typedDown.delete(k);
    hub.emit({ type: 'off', note, velocity: 0, source: 'keys' });
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}
