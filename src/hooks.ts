import { useEffect, useRef, useState } from 'react';
import { hub, type MidiStatus, type NoteEvent } from './midi/input';

/** Subscribe to note events; the latest callback is always used without resubscribing. */
export function useNoteEvents(fn: (e: NoteEvent) => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => hub.subscribe((e) => ref.current(e)), []);
}

/** The set of currently held notes, for highlighting the on-screen piano. */
export function useHeldNotes(): Set<number> {
  const [held, setHeld] = useState<Set<number>>(() => new Set(hub.held));
  useEffect(() => hub.subscribe(() => setHeld(new Set(hub.held))), []);
  return held;
}

export function useMidiStatus(): MidiStatus {
  const [s, setS] = useState(hub.status);
  useEffect(() => hub.onStatus(setS), []);
  return s;
}

export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }),
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// Keys to highlight on the shared keyboard. The keyboard lives in the app shell so it never moves between
// screens; screens publish what it should show.
export interface KeyMarks {
  answer: number[];
  wrong: number[];
}
const NO_MARKS: KeyMarks = { answer: [], wrong: [] };
let keyMarks = NO_MARKS;
const markListeners = new Set<(m: KeyMarks) => void>();
function setKeyMarks(m: KeyMarks) {
  keyMarks = m;
  markListeners.forEach((l) => l(m));
}

/** Show these keys on the keyboard while the calling screen is mounted. */
export function useShowOnKeyboard(answer: number[], wrong: number[]): void {
  const key = `${answer.join(',')}|${wrong.join(',')}`;
  useEffect(() => setKeyMarks({ answer, wrong }), [key]);
  useEffect(() => () => setKeyMarks(NO_MARKS), []);
}

export function useKeyMarks(): KeyMarks {
  const [m, setM] = useState(keyMarks);
  useEffect(() => {
    markListeners.add(setM);
    return () => {
      markListeners.delete(setM);
    };
  }, []);
  return m;
}
