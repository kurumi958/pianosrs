import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardCopy, ExternalLink, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { keyLabel, MAJOR_KEYS, MINOR_KEYS } from '../music/notes';
import { barProblems, compileSong, type SongSource } from '../songs/dsl';
import { importSong, type Song, updateTranscription } from '../songs/library';
import { openPdf, pngSize, renderPage, renderRegion } from '../songs/pdf';
import {
  chatFixPrompt,
  chatPrompt,
  COST_PER_PAGE,
  COST_PER_PAGE_ZOOM,
  getApiKey,
  type PageTranscript,
  parseChatReply,
  setApiKey,
  transcribePage,
} from '../songs/transcribe';
import { ScoreView } from './ScoreView';

interface Props {
  /** A new PDF to transcribe… */
  file?: { bytes: Uint8Array; name: string };
  /** …or an imported song's transcription to correct (with its PDF, if kept). */
  song?: Song;
  songPdf?: Uint8Array | null;
  onDone: (songId: string) => void;
  onCancel: () => void;
}

const VOICES = [
  { key: 'rh', label: 'Right hand (top staff)' },
  { key: 'lh', label: 'Left hand (bottom staff)' },
  { key: 'rh2', label: 'Right hand, second voice' },
  { key: 'lh2', label: 'Left hand, second voice' },
] as const;
type VoiceKey = (typeof VOICES)[number]['key'];

const EMPTY: SongSource = {
  id: 'pdf',
  title: '',
  composer: '',
  level: 1,
  about: '',
  key: 'C',
  meter: '4/4',
  tempo: 80,
  rh: '',
  lh: '',
  rh2: '',
  lh2: '',
};

/** One bar per line, so bar numbers in problems match line numbers. */
const joinBars = (bars: string[]) => bars.join(' |\n');

/**
 * Turn a sheet-music PDF into a song: Claude reads each page into the app's note notation, then you check it
 * against the page, bar by bar, with the engraved result underneath, and fix anything it misread.
 */
export function PdfTranscriber({ file, song, songPdf, onDone, onCancel }: Props) {
  const bytes = file?.bytes ?? songPdf ?? null;
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [src, setSrc] = useState<SongSource>(
    song?.transcription ?? {
      ...EMPTY,
      title: file?.name.replace(/\.pdf$/i, '') ?? '',
    },
  );
  const [apiKey, setKey] = useState(getApiKey);
  const [closer, setCloser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string[]>([]);
  const [readNotes, setReadNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!bytes) return;
    let cancelled = false;
    openPdf(bytes)
      .then((d) => !cancelled && setDoc(d))
      .catch((e) => !cancelled && setError(`Couldn't open this PDF: ${e instanceof Error ? e.message : e}`));
    return () => {
      cancelled = true;
    };
  }, [bytes]);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    renderPage(doc, page, 1400).then((img) => !cancelled && setPageImage(img));
    return () => {
      cancelled = true;
    };
  }, [doc, page]);
  useEffect(() => () => abort.current?.abort(), []);

  // Live check and preview, a moment after typing stops.
  const [checked, setChecked] = useState<{
    problems: ReturnType<typeof barProblems>;
    xml: string | null;
  }>({ problems: [], xml: null });
  useEffect(() => {
    const t = window.setTimeout(() => {
      const problems = barProblems(src);
      let xml: string | null = null;
      if (!problems.length) {
        try {
          xml = compileSong(src).xml;
        } catch (e) {
          problems.push({
            bar: -1,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      setChecked({ problems, xml });
    }, 450);
    return () => window.clearTimeout(t);
  }, [src]);
  const barCount = useMemo(() => src.rh.split('|').filter((b, i, all) => b.trim() || i < all.length - 1).length, [src.rh]);

  const set = <K extends keyof SongSource>(k: K, v: SongSource[K]) => setSrc((s) => ({ ...s, [k]: v }));

  const transcribe = async () => {
    if (!doc || !apiKey) return;
    setApiKey(apiKey);
    setBusy(true);
    setError(null);
    setReadNotes([]);
    const ctl = new AbortController();
    abort.current = ctl;
    const pages = doc.numPages;
    const lines: string[] = Array.from({ length: pages }, (_, i) => `Page ${i + 1}: waiting`);
    const show = (i: number, s: string) => {
      lines[i] = s;
      setStatus([...lines]);
    };
    try {
      const results: PageTranscript[] = [];
      const read = async (p: number, context?: { key: string; meter: string; title: string }) => {
        const image = await renderPage(doc, p);
        const imageSize = pngSize(image);
        return transcribePage({
          apiKey,
          image,
          imageSize,
          zoom: closer
            ? (r) =>
                renderRegion(doc, p, {
                  x: r.x / imageSize.width,
                  y: r.y / imageSize.height,
                  width: r.width / imageSize.width,
                  height: r.height / imageSize.height,
                })
            : undefined,
          page: p,
          pages,
          context,
          signal: ctl.signal,
          onStatus: (s) => show(p - 1, s),
        });
      };
      // The first page sets the key, time and title; the rest are read three at a time with that in hand.
      results[0] = await read(1);
      show(0, `Page 1: ${results[0].bars.length} bars`);
      const context = {
        key: results[0].key,
        meter: results[0].meter,
        title: results[0].title || src.title,
      };
      const rest = Array.from({ length: pages - 1 }, (_, i) => i + 2);
      for (let i = 0; i < rest.length; i += 3) {
        await Promise.all(
          rest.slice(i, i + 3).map(async (p) => {
            results[p - 1] = await read(p, context);
            show(p - 1, `Page ${p}: ${results[p - 1].bars.length} bars`);
          }),
        );
      }
      apply(results);
    } catch (e) {
      if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Put a transcription (one result per page, or one for the whole PDF) into the editor. */
  const apply = (results: Omit<PageTranscript, 'problems'>[]) => {
    {
      const bars = results.flatMap((r) => r.bars);
      const first = results[0];
      setSrc((s) => ({
        ...s,
        title: first.title || s.title,
        composer: first.composer || s.composer,
        key: first.key,
        meter: first.meter,
        tempo: first.tempo || s.tempo,
        pickup: first.pickup,
        rh: joinBars(bars.map((b) => b.rh)),
        lh: joinBars(bars.map((b) => b.lh)),
        rh2: bars.some((b) => b.rh2.trim()) ? joinBars(bars.map((b) => b.rh2)) : '',
        lh2: bars.some((b) => b.lh2.trim()) ? joinBars(bars.map((b) => b.lh2)) : '',
      }));
      let offset = 0;
      const notes: string[] = [];
      results.forEach((r, i) => {
        if (r.notes.trim()) notes.push(`Page ${i + 1} (from bar ${offset + 1}): ${r.notes.trim()}`);
        offset += r.bars.length;
      });
      const changes = new Set(results.map((r) => `${r.key} ${r.meter}`));
      if (changes.size > 1)
        notes.push('The key or time signature seems to change between pages; songs use one throughout, so check those bars.');
      setReadNotes(notes);
    }
  };

  // Transcribing in a Claude chat (on a Claude plan, no API key): copy the instructions, paste the reply back.
  const [via, setVia] = useState<'chat' | 'api'>(getApiKey() ? 'api' : 'chat');
  const [reply, setReply] = useState('');
  const [copied, setCopied] = useState<'prompt' | 'fix' | null>(null);
  const copy = async (what: 'prompt' | 'fix') => {
    const text = what === 'prompt' ? chatPrompt(doc?.numPages ?? 1) : chatFixPrompt(checked.problems);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      setError("Couldn't copy to the clipboard; your browser may need permission.");
    }
  };
  const useReply = () => {
    setError(null);
    try {
      apply([parseChatReply(reply)]);
      setReply('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    if (!checked.xml) return;
    setSaving(true);
    setError(null);
    try {
      const { xml } = compileSong(src);
      const saved = song
        ? await updateTranscription(song.id, xml, src)
        : await importSong(xml, file!.name, {
            transcription: src,
            pdf: file!.bytes,
          });
      onDone(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const pages = doc?.numPages ?? 0;
  return (
    <div className="page-inner wide transcriber">
      <button className="small link back" onClick={onCancel}>
        <ArrowLeft size={15} /> {song ? 'Back to the song' : 'All songs'}
      </button>
      <header className="page-head">
        <h2>{song ? `Edit “${song.title}”` : 'Transcribe a PDF'}</h2>
        <p>
          A PDF is a picture of the music, so it has to be read into notes first. Claude can read the pages for you; then check the result
          against the page bar by bar and fix anything it got wrong. You can also type the notes in yourself.
        </p>
      </header>

      <div className="transcribe-grid">
        <section className="panel pdf-pane">
          {bytes ? (
            <>
              <div className="row spread">
                <b className="small">{file?.name ?? song?.fileName}</b>
                {pages > 1 && (
                  <span className="row">
                    <button className="icon-btn" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                      <ChevronLeft size={18} />
                    </button>
                    <span className="small">
                      Page {page} of {pages}
                    </span>
                    <button className="icon-btn" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
                      <ChevronRight size={18} />
                    </button>
                  </span>
                )}
              </div>
              <div className="pdf-page">
                {pageImage ? <img src={pageImage} alt={`Page ${page} of the PDF`} /> : <p className="muted">Opening the PDF…</p>}
              </div>
            </>
          ) : (
            <p className="muted">The original PDF wasn't kept for this song.</p>
          )}
        </section>

        <div className="stack">
          {bytes && (
            <section className="panel stack">
              <h3>
                <Sparkles size={17} /> Read it with Claude
              </h3>
              <div className="segmented small-seg" role="radiogroup" aria-label="How to use Claude">
                <button role="radio" aria-checked={via === 'chat'} className={via === 'chat' ? 'on' : ''} onClick={() => setVia('chat')}>
                  <b>With your Claude plan</b>
                  <small>In a Claude chat; no API key, no extra cost</small>
                </button>
                <button role="radio" aria-checked={via === 'api'} className={via === 'api' ? 'on' : ''} onClick={() => setVia('api')}>
                  <b>With an API key</b>
                  <small>Automatic; about {closer ? COST_PER_PAGE_ZOOM : COST_PER_PAGE} a page</small>
                </button>
              </div>
              {via === 'chat' ? (
                <>
                  <ol className="chat-steps small">
                    <li>
                      <button className="small" onClick={() => copy('prompt')}>
                        <ClipboardCopy size={14} /> {copied === 'prompt' ? 'Copied' : 'Copy the instructions'}
                      </button>
                    </li>
                    <li>
                      <a href="https://claude.ai/new" target="_blank" rel="noreferrer">
                        Open a new Claude chat <ExternalLink size={12} />
                      </a>
                      , choose the most capable model (Opus reads music far more accurately), attach this PDF and paste the instructions.
                    </li>
                    <li>Copy Claude's whole reply and paste it here:</li>
                  </ol>
                  <textarea
                    id="tx-reply"
                    className="text-input reply-box"
                    rows={4}
                    placeholder="Paste Claude's reply (the JSON block)…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <div className="row">
                    <button className="primary" disabled={!reply.trim()} onClick={useReply}>
                      Use this reply
                    </button>
                    {checked.problems.some((p) => p.bar >= 0) && (
                      <button
                        className="small"
                        onClick={() => copy('fix')}
                        title="Send this back to the same chat to have those bars read again"
                      >
                        <ClipboardCopy size={14} /> {copied === 'fix' ? 'Copied' : 'Copy a fix request for the bars that don’t add up'}
                      </button>
                    )}
                  </div>
                  <p className="muted small">This uses your Claude plan's usage limits; a page or two of music is a modest chat.</p>
                </>
              ) : (
                <>
                  <p className="muted small">
                    Each page is sent to Claude ({pages || '…'} page
                    {pages === 1 ? '' : 's'}, roughly {closer ? COST_PER_PAGE_ZOOM : COST_PER_PAGE} a page) using your Anthropic API key,
                    which stays in this browser. Bars that don't add up are sent back to be read again. Expect to fix a few notes, more on
                    dense or handwritten scores.
                  </p>
                  <label className="check">
                    <input type="checkbox" checked={closer} disabled={busy} onChange={(e) => setCloser(e.target.checked)} />
                    <span>
                      Look closer{' '}
                      <small className="muted">
                        (Claude zooms in on the page bar by bar. Much more accurate on dense music such as chords and inner voices, several
                        times the cost and time. Simple pieces read well without it.)
                      </small>
                    </span>
                  </label>
                  <label className="field">
                    Anthropic API key
                    <input
                      id="tx-key"
                      type="password"
                      autoComplete="off"
                      placeholder="sk-ant-…"
                      value={apiKey}
                      onChange={(e) => setKey(e.target.value)}
                    />
                  </label>
                  <div className="row">
                    <button className="primary" disabled={!doc || !apiKey || busy} onClick={transcribe}>
                      {busy ? 'Reading…' : src.rh.trim() ? 'Read it again' : `Read ${pages || ''} page${pages === 1 ? '' : 's'}`}
                    </button>
                    {busy && (
                      <button className="small" onClick={() => abort.current?.abort()}>
                        Stop
                      </button>
                    )}
                  </div>
                  {status.length > 0 && (
                    <ul className="tx-status small">
                      {status.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}

          <section className="panel stack">
            <h3>Details</h3>
            <div className="tx-meta">
              <label className="field">
                Title
                <input id="tx-title" className="text-input" value={src.title} onChange={(e) => set('title', e.target.value)} />
              </label>
              <label className="field">
                Composer
                <input id="tx-composer" className="text-input" value={src.composer} onChange={(e) => set('composer', e.target.value)} />
              </label>
              <label className="field">
                Key
                <select id="tx-key-sig" value={src.key} onChange={(e) => set('key', e.target.value)}>
                  <optgroup label="Major">
                    {MAJOR_KEYS.map((k) => (
                      <option key={k.key} value={k.key}>
                        {keyLabel(k.key)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Minor">
                    {MINOR_KEYS.map((k) => (
                      <option key={k.key} value={k.key}>
                        {keyLabel(k.key)}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <label className="field">
                Time signature
                <input id="tx-meter" className="text-input" value={src.meter} onChange={(e) => set('meter', e.target.value.trim())} />
              </label>
              <label className="field">
                Tempo (♩ per minute)
                <input
                  id="tx-tempo"
                  type="number"
                  min={20}
                  max={240}
                  value={src.tempo}
                  onChange={(e) => set('tempo', Number(e.target.value) || 80)}
                />
              </label>
              <label className="check">
                <input id="tx-pickup" type="checkbox" checked={!!src.pickup} onChange={(e) => set('pickup', e.target.checked)} />
                Starts with a pickup bar
              </label>
            </div>
          </section>
        </div>
      </div>

      <section className="panel stack">
        <div className="row spread">
          <h3>Notes, one bar per line</h3>
          <span className="muted small">{barCount} bars</span>
        </div>
        <details className="cheat small">
          <summary>How notes are written</summary>
          <p>
            Pitch, then length: <code>E4q</code> is a quarter-note E above middle C (C4). Lengths: <code>w h q e s</code> (whole to
            sixteenth), <code>.</code> for dotted (<code>q.</code>). Chords: <code>C4+E4+G4h</code>. Rests: <code>rq</code>. Sharps and
            flats:
            <code>F#4</code>, <code>Bb3</code>, always as the note sounds, key signature included. Ties: <code>G4h~ G4q</code>. Triplets:{' '}
            <code>3[C5e D5e E5e]</code>. Bars are separated by <code>|</code>, and every voice must fill each bar. A second voice on a staff
            (a held note under moving ones) goes in the second-voice boxes; leave a bar empty where it isn't needed.
          </p>
        </details>
        <div className="tx-voices">
          {VOICES.map((v) => (
            <label key={v.key} className={`field field-wide tx-voice ${v.key.endsWith('2') ? 'second' : ''}`}>
              {v.label}
              <textarea
                id={`tx-${v.key}`}
                className="text-input"
                spellCheck={false}
                rows={v.key.endsWith('2') ? 4 : 8}
                value={src[v.key as VoiceKey] ?? ''}
                onChange={(e) => set(v.key as VoiceKey, e.target.value)}
              />
            </label>
          ))}
        </div>
        {readNotes.length > 0 && (
          <div className="tx-notes">
            <b className="small">Claude wasn't sure about:</b>
            <ul className="small">
              {readNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        {checked.problems.length > 0 ? (
          <div className="tx-problems">
            <b className="small">
              {checked.problems.length} problem
              {checked.problems.length === 1 ? '' : 's'} to fix before it can be saved:
            </b>
            <ul className="small">
              {checked.problems.slice(0, 30).map((p, i) => (
                <li key={i}>{p.bar >= 0 ? `Bar ${p.bar + 1} (line ${p.bar + 1}): ${p.message}` : p.message}</li>
              ))}
              {checked.problems.length > 30 && <li>…and {checked.problems.length - 30} more.</li>}
            </ul>
          </div>
        ) : (
          checked.xml && <p className="ok-text small">✓ Every bar adds up.</p>
        )}
      </section>

      {checked.xml && (
        <section className="panel score-panel">
          <h3>How it reads</h3>
          <p className="muted small">Compare this with the PDF: wrong notes are easiest to spot here.</p>
          <ScoreView xml={checked.xml} fit="width" />
        </section>
      )}

      {error && <p className="warn">{error}</p>}
      <div className="row spread">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!checked.xml || saving || busy} onClick={save}>
          {saving ? 'Saving…' : song ? 'Save changes' : 'Save as a song'}
        </button>
      </div>
    </div>
  );
}
