import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { GraphicalNote, OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import { useElementSize } from '../hooks';
import { COLORS } from '../music/notation';
import type { ScoreNote } from '../songs/score';

/** The engraving library is large, so it loads the first time a score is shown. */
let osmdModule: Promise<typeof import('opensheetmusicdisplay')> | null = null;
const loadOsmd = () => (osmdModule ??= import('opensheetmusicdisplay'));

/** Identifies a written note across the app's model and the engraved score: bar, staff, position and key. */
export const noteKey = (n: Pick<ScoreNote, 'measure' | 'staff' | 'tick' | 'midi'>) => `${n.measure}:${n.staff}:${n.tick}:${n.midi}`;

const DIM = '#b9ab98';
/** Zoom levels tried when fitting a passage to its box, largest first. */
const ZOOMS = [2.4, 2.1, 1.8, 1.55, 1.3, 1.1, 0.95, 0.8, 0.68, 0.58, 0.5];

interface Props {
  xml: string;
  /** Bars to draw (indices, inclusive); the whole score by default. */
  from?: number;
  to?: number;
  /** Colours for individual notes, by noteKey. */
  colors?: Map<string, string>;
  /** Staves drawn faded, e.g. the hand you're not playing. */
  dimStaves?: number[];
  /**
   * "box": as large as fits in the box, wrapping onto more lines if that's bigger (a passage to play).
   * "width": the width of the page, growing downwards (a whole score to scroll through).
   */
  fit?: 'box' | 'width';
  /** Bars on each line (0: as many as fit). */
  barsPerLine?: number;
  /** Drawn as a sheet of paper, with margins. */
  paper?: boolean;
  /** Drawn above the music on the sheet (a title). */
  heading?: ReactNode;
}

/** A sheet's margins around the music, in px (left/right, top/bottom). */
const PAPER = { x: 36, y: 28 };

type Indexed = Map<string, { gn: GraphicalNote; staff: number }[]>;

function indexNotes(osmd: OpenSheetMusicDisplay): Indexed {
  const index: Indexed = new Map();
  for (const row of osmd.GraphicSheet.MeasureList) {
    for (const gm of row) {
      if (!gm) continue;
      const measure = gm.parentSourceMeasure.measureListIndex;
      const staff = gm.ParentStaff.idInMusicSheet;
      for (const se of gm.staffEntries) {
        const tick = Math.round(se.relInMeasureTimestamp.RealValue * 96);
        for (const gve of se.graphicalVoiceEntries) {
          for (const gn of gve.notes) {
            const n = gn.sourceNote;
            if (!n || n.isRest() || !n.Pitch) continue;
            const key = noteKey({ measure, staff, tick, midi: n.halfTone + 12 });
            index.set(key, [...(index.get(key) ?? []), { gn, staff }]);
          }
        }
      }
    }
  }
  return index;
}

/** A MusicXML score engraved with OpenSheetMusicDisplay, with notes recoloured live as you play. */
export function ScoreView({ xml, from, to, colors, dimStaves = [], fit = 'box', barsPerLine = 0, paper = false, heading }: Props) {
  const [box, size] = useElementSize<HTMLDivElement>();
  const host = useRef<HTMLDivElement>(null);
  const osmd = useRef<{ osmd: OpenSheetMusicDisplay; xml: string } | null>(null);
  const notes = useRef<Indexed>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(0);
  // Re-engrave only when the box changes size noticeably.
  const w = Math.round((size.width - (paper ? 2 * PAPER.x : 0)) / 24) * 24;
  const h = Math.round((size.height - (paper ? 2 * PAPER.y : 0)) / 24) * 24;

  useEffect(() => {
    const el = host.current;
    if (!el || w <= 0 || (fit === 'box' && h <= 0)) return;
    let cancelled = false;
    setError(null);
    (async () => {
      const { OpenSheetMusicDisplay } = await loadOsmd();
      if (cancelled) return;
      if (!osmd.current || osmd.current.xml !== xml) {
        el.innerHTML = '';
        const o = new OpenSheetMusicDisplay(el, {
          backend: 'svg',
          autoResize: false,
          autoBeam: true,
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawLyricist: false,
          drawCredits: false,
          drawPartNames: false,
          drawPartAbbreviations: false,
          drawMeasureNumbers: true,
          drawMeasureNumbersOnlyAtSystemStart: false,
          drawingParameters: 'compacttight',
          pageFormat: 'Endless',
          disableCursor: true,
          followCursor: false,
          defaultColorMusic: COLORS.ink,
        });
        await o.load(xml);
        if (cancelled) return;
        o.EngravingRules.PageBackgroundColor = 'transparent';
        osmd.current = { osmd: o, xml };
      }
      const o = osmd.current.osmd;
      // With a pickup bar, OSMD re-derives the range from bar numbers when it renders (and there, number = index).
      const r = o.EngravingRules;
      r.MinMeasureToDrawIndex = r.MinMeasureToDrawNumber = from ?? 0;
      r.MaxMeasureToDrawIndex = r.MaxMeasureToDrawNumber = to ?? Number.MAX_VALUE;
      r.RenderXMeasuresPerLineAkaSystem = barsPerLine;
      // A full last line spans the page like the others (a short one, the end of a piece, doesn't).
      r.StretchLastSystemLine = barsPerLine > 0 && from !== undefined && to !== undefined && (to - from + 1) % barsPerLine === 0;
      el.style.width = `${w}px`;
      const svgHeight = () => Number(el.querySelector('svg')?.getAttribute('height')) || el.scrollHeight;
      if (fit === 'width') {
        o.zoom = w < 700 ? 0.8 : paper ? 0.9 : 1;
        o.render();
      } else {
        // The largest size whose layout fits the box.
        for (const z of ZOOMS) {
          o.zoom = z;
          o.render();
          if (svgHeight() <= h - 8) break;
        }
      }
      if (cancelled) return;
      notes.current = indexNotes(o);
      setRendered((r) => r + 1);
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
    };
  }, [xml, from, to, fit, w, h, barsPerLine]);

  // Recolour without re-engraving.
  const dimKey = dimStaves.join(',');
  useEffect(() => {
    for (const [key, list] of notes.current) {
      for (const { gn, staff } of list) {
        const color = colors?.get(key) ?? (dimStaves.includes(staff) ? DIM : COLORS.ink);
        (gn as GraphicalNote & { setColor?: (c: string, o: object) => void }).setColor?.(color, {
          applyToNoteheads: true,
          applyToStem: true,
          applyToBeams: true,
          applyToFlag: true,
          applyToModifiers: true,
          applyToTies: true,
          applyToLedgerLines: true,
        });
      }
    }
  }, [colors, dimKey, rendered]);

  return (
    <div className={`score-view ${fit}${paper ? ' paper' : ''}`} ref={box}>
      <div className="score-sheet" style={paper ? { padding: `${PAPER.y}px ${PAPER.x}px` } : undefined}>
        {heading}
        <div className="score-host" ref={host} role="img" aria-label="Sheet music" />
      </div>
      {error && <p className="warn small">Couldn't draw this score: {error}</p>}
    </div>
  );
}
