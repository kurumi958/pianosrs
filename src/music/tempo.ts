/**
 * Judges a phrase played in time: each event (notes starting together) has an expected time;
 * key presses count for the nearest event within the hit window.
 */

export type EventStatus = 'pending' | 'ok' | 'miss';

export interface TimedEvent {
  /** Expected time in ms (same clock as the note timestamps). */
  at: number;
  pitches: number[];
}

export class TempoJudge {
  readonly status: EventStatus[];
  /** Timing error (ms, positive = late) of the first right note of each event. */
  readonly errors: (number | null)[];
  /** Key presses that weren't near any event. */
  extra = 0;
  /** Wrong keys pressed near an event. */
  wrong = 0;
  private readonly pressed: Set<number>[];

  constructor(
    private readonly events: TimedEvent[],
    private readonly windowMs: number,
    private readonly ignoreOctave = false,
  ) {
    this.status = events.map(() => 'pending');
    this.errors = events.map(() => null);
    this.pressed = events.map(() => new Set());
  }

  private norm(n: number): number {
    return this.ignoreOctave ? n % 12 : n;
  }

  /** Handle a key press at time `t`. Returns the event it was counted for, if any, and whether it was a right note. */
  noteOn(midi: number, t: number): { event: number | null; right: boolean } {
    let best: number | null = null;
    for (let i = 0; i < this.events.length; i++) {
      const d = Math.abs(t - this.events[i].at);
      if (d <= this.windowMs && (best === null || d < Math.abs(t - this.events[best].at))) best = i;
    }
    if (best === null) {
      this.extra++;
      return { event: null, right: false };
    }
    const ev = this.events[best];
    const right = ev.pitches.some((p) => this.norm(p) === this.norm(midi));
    if (!right) {
      this.wrong++;
      this.status[best] = 'miss';
      return { event: best, right };
    }
    this.errors[best] ??= t - ev.at;
    this.pressed[best].add(this.norm(midi));
    const needed = new Set(ev.pitches.map((p) => this.norm(p)));
    if (this.status[best] === 'pending' && [...needed].every((p) => this.pressed[best].has(p))) this.status[best] = 'ok';
    return { event: best, right };
  }

  /** Mark events whose window has passed without being played. Returns true if anything changed. */
  tick(now: number): boolean {
    let changed = false;
    this.events.forEach((e, i) => {
      if (this.status[i] === 'pending' && now > e.at + this.windowMs) {
        this.status[i] = 'miss';
        changed = true;
      }
    });
    return changed;
  }

  /** The event to look at now: the first one whose window hasn't closed. */
  current(now: number): number {
    const i = this.events.findIndex((e) => now <= e.at + this.windowMs);
    return i === -1 ? this.events.length : i;
  }

  finished(now: number): boolean {
    return !this.events.length || now > this.events[this.events.length - 1].at + this.windowMs;
  }
}
