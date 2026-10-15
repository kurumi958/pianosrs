import type { ReactNode } from 'react';
import { useHeldNotes, useKeyMarks } from '../hooks';
import { Piano } from './Piano';

interface Props {
  /** Context: counts, where you are, what's being practiced. */
  left: ReactNode;
  /** The music box. */
  music: ReactNode;
  /** Toggles and options. */
  right: ReactNode;
  status: ReactNode;
  statusTone?: 'correct' | 'wrong' | '';
  /** Grade buttons or phrase controls. */
  bottom: ReactNode;
  showLabels: boolean;
  /** Overlay inside the music box (results). */
  overlay?: ReactNode;
  /** The music is a page of sheet music lying on a desk. */
  desk?: boolean;
}

/**
 * The practice layout shared by flash cards and sight-reading, so the music, the keyboard and the
 * buttons are in exactly the same place on both: [context | music | options], a status line,
 * the full 88-key keyboard, then the bottom bar.
 */
export function PlayScreen({ left, music, right, status, statusTone = '', bottom, showLabels, overlay, desk }: Props) {
  const held = useHeldNotes();
  const marks = useKeyMarks();
  return (
    <div className="play-screen">
      <div className="play-top">
        <aside className="play-side left">{left}</aside>
        <div className={desk ? 'music-box desk' : 'music-box'}>
          {music}
          {overlay}
        </div>
        <aside className="play-side right">{right}</aside>
      </div>
      <div className={`status-line ${statusTone}`} aria-live="polite">
        {status}
      </div>
      <div className="keyboard">
        <Piano held={held} answer={marks.answer} wrong={marks.wrong} showLabels={showLabels} />
      </div>
      <div className="bottom-bar">{bottom}</div>
    </div>
  );
}
