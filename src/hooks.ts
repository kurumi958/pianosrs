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

export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
