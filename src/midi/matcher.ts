export type MatchResult = 'pending' | 'correct' | 'wrong';

/**
 * Judges one attempt at playing a set of target notes (a single note or a chord).
 * Notes can be pressed in any order; the attempt is correct once every target note has
 * been pressed, and wrong as soon as any non-target note is pressed.
 */
export class AttemptMatcher {
  private readonly target: Set<number>;
  private readonly pressed = new Set<number>();
  private result: MatchResult = 'pending';
  readonly wrongNotes: number[] = [];

  constructor(target: number[], private readonly ignoreOctave = false) {
    this.target = new Set(target.map((n) => this.norm(n)));
  }

  private norm(n: number): number {
    return this.ignoreOctave ? n % 12 : n;
  }

  get state(): MatchResult {
    return this.result;
  }

  noteOn(midi: number): MatchResult {
    if (this.result !== 'pending') return this.result;
    const n = this.norm(midi);
    if (!this.target.has(n)) {
      this.wrongNotes.push(midi);
      this.result = 'wrong';
      return this.result;
    }
    this.pressed.add(n);
    if (this.pressed.size === this.target.size) this.result = 'correct';
    return this.result;
  }
}
