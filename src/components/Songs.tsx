import { ArrowLeft, ChevronRight, Play, Search, Upload } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { keyLabel } from '../music/notes';
import { meterName } from '../music/rhythm';
import { readScoreFile } from '../songs/musicxml';
import { isPdf } from '../songs/pdf';
// The PDF editor (with pdf.js and the Claude API client) loads only when a PDF is opened.
const PdfTranscriber = lazy(() => import('./PdfTranscriber').then((m) => ({ default: m.PdfTranscriber })));
import {
  allSongs,
  CORPUS_SONGS,
  corpusEntries,
  type CorpusEntry,
  corpusEntry,
  DEFAULT_SONG_OPTIONS,
  ensureSong,
  importSong,
  type Level,
  LEVEL_LABEL,
  removeImportedSong,
  type Song,
  songById,
  songCards,
  songDeckId,
  type SongOptions,
  songPdf,
} from '../songs/library';
import { weakBars } from '../songs/play';
import type { Hands } from '../songs/score';
import type { AppData } from '../storage';
import { Progress } from './Group';
import type { LearnPlan } from './LearnSession';
import { ScoreView } from './ScoreView';

export interface SongFocus {
  song: string;
  from: number;
  to: number;
  hands: Hands;
}

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  /** Open a song on its page (null for the list). */
  openSong: string | null;
  onOpen: (id: string | null) => void;
  onPractice: (f: SongFocus) => void;
  /** The library changed (a song was imported or removed). */
  onLibraryChange: () => void;
  /** Start a learning session (and study the song). */
  onLearn: (plan: LearnPlan, deckId: string) => void;
}

const isSeen = (data: AppData, id: string) => !!data.cards[id] && data.cards[id].status !== 'new';
const isLearned = (data: AppData, id: string) => ['review', 'relearning'].includes(data.cards[id]?.status ?? '');

function progressOf(data: AppData, song: Song) {
  const cards = songCards(song, data.songs[song.id] ?? DEFAULT_SONG_OPTIONS);
  return {
    total: cards.length,
    seen: cards.filter((c) => isSeen(data, c.id)).length,
    learned: cards.filter((c) => isLearned(data, c.id)).length,
  };
}

const summary = (song: Song) => {
  const m = song.score.measures;
  const pickup = m.length > 1 && m[0].length < (m[0].meter.num * 96) / m[0].meter.den;
  return `${keyLabel(m[0].key)} · ${meterName(m[0].meter)} · ${m.length - (pickup ? 1 : 0)} bars`;
};

/** Songs: learn real pieces a few bars at a time, as flash cards and in free practice. */
export function Songs({ data, update, openSong, onOpen, onPractice, onLibraryChange, onLearn }: Props) {
  // Transcribing a PDF: a new file, or an imported song's transcription (with its PDF) to correct.
  const [transcribe, setTranscribe] = useState<{
    file?: { bytes: Uint8Array; name: string };
    songId?: string;
    pdf?: Uint8Array | null;
  } | null>(null);
  const song = openSong ? songById(openSong) : undefined;
  // A piece from the larger corpus loads its notes when it's opened.
  const [failed, setFailed] = useState<string | null>(null);
  const pending = openSong && !song && corpusEntry(openSong) ? openSong : null;
  useEffect(() => {
    if (!pending) return;
    let live = true;
    ensureSong(pending).then((s) => {
      if (!live) return;
      if (s) onLibraryChange();
      else setFailed(pending);
    });
    return () => {
      live = false;
    };
  }, [pending, onLibraryChange]);
  if (transcribe) {
    const editing = transcribe.songId ? songById(transcribe.songId) : undefined;
    return (
      <Suspense fallback={<p className="muted">Opening the PDF editor…</p>}>
        <PdfTranscriber
          file={transcribe.file}
          song={editing}
          songPdf={transcribe.pdf}
          onDone={(id) => {
            setTranscribe(null);
            onLibraryChange();
            onOpen(id);
          }}
          onCancel={() => setTranscribe(null)}
        />
      </Suspense>
    );
  }
  if (pending)
    return (
      <div className="page-inner song-page">
        <button className="small link back" onClick={() => onOpen(null)}>
          <ArrowLeft size={15} /> All songs
        </button>
        <p className="muted">{failed === pending ? `Couldn't load ${corpusEntry(pending)!.title}.` : `Opening ${corpusEntry(pending)!.title}…`}</p>
      </div>
    );
  if (song)
    return (
      <SongPage
        data={data}
        update={update}
        song={song}
        onBack={() => onOpen(null)}
        onPractice={onPractice}
        onLibraryChange={onLibraryChange}
        onLearn={onLearn}
        onEditTranscription={async () => setTranscribe({ songId: song.id, pdf: await songPdf(song.id) })}
      />
    );
  return <SongList data={data} onOpen={onOpen} onLibraryChange={onLibraryChange} onPdf={(file) => setTranscribe({ file })} />;
}

function SongList({
  data,
  onOpen,
  onLibraryChange,
  onPdf,
}: {
  data: AppData;
  onOpen: (id: string) => void;
  onLibraryChange: () => void;
  onPdf: (file: { bytes: Uint8Array; name: string }) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState<Level | 'all'>('all');
  const [query, setQuery] = useState('');
  const songs = allSongs();
  const mine = songs.filter((s) => s.source === 'imported');
  const q = query.trim().toLowerCase();
  const filtering = level !== 'all' || !!q;
  const matches = (x: { title: string; composer: string; level?: Level; collection?: string }) =>
    (level === 'all' || x.level === level) && (!q || `${x.title} ${x.composer} ${x.collection ?? ''}`.toLowerCase().includes(q));
  const firstPieces = CORPUS_SONGS.filter(matches);
  const isStudied = (id: string) => data.settings.enabledDecks.includes(songDeckId(id));
  // The larger corpus, by collection, in the order of the index.
  const groups: { title: string; composer?: string; entries: CorpusEntry[] }[] = [];
  for (const e of corpusEntries().filter(matches)) {
    let g = groups.find((x) => x.title === e.collection);
    if (!g) groups.push((g = { title: e.collection, entries: [] }));
    g.entries.push(e);
  }
  for (const g of groups) {
    const composers = new Set(g.entries.map((e) => e.composer));
    if (composers.size === 1 && !g.title.includes(g.entries[0].composer.split(' ').pop()!)) g.composer = g.entries[0].composer;
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (isPdf(bytes)) return onPdf({ bytes, name: f.name });
      const xml = readScoreFile(bytes);
      const s = await importSong(xml, f.name);
      onLibraryChange();
      onOpen(s.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const entryRow = (e: CorpusEntry) => {
    const loaded = songById(e.id);
    if (loaded) return row(loaded);
    return (
      <li key={e.id}>
        <button className="song-card" onClick={() => onOpen(e.id)}>
          <span className="song-text">
            <b>{e.title}</b>
            <small>{e.composer}</small>
            <small className="muted">
              {e.key} · {e.meter} · {e.bars} bars
            </small>
          </span>
          <span className="song-meta">
            <span className={`level l${e.level}`}>{LEVEL_LABEL[e.level]}</span>
          </span>
        </button>
      </li>
    );
  };

  const row = (s: Song) => {
    const learning = data.settings.enabledDecks.includes(songDeckId(s.id));
    const p = progressOf(data, s);
    return (
      <li key={s.id}>
        <button className="song-card" onClick={() => onOpen(s.id)}>
          <span className="song-text">
            <b>{s.title}</b>
            <small>{s.composer}</small>
            <small className="muted">{summary(s)}</small>
          </span>
          <span className="song-meta">
            {s.level && <span className={`level l${s.level}`}>{LEVEL_LABEL[s.level]}</span>}
            {learning ? <Progress {...p} /> : null}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="page-inner">
      <header className="page-head">
        <h2>Songs</h2>
        <p>
          Learn real pieces a few bars at a time. Each song you learn becomes flash cards of short passages (hands separately, then
          together, then joined up) that come back in Review, and you can practice any bars of it whenever you like.
        </p>
      </header>

      <section className="panel">
        <h3>Included songs</h3>
        <p className="muted small">
          Public-domain music, from first pieces to advanced: short arrangements to start with, then complete classical pieces engraved by
          the Mutopia Project.
        </p>
        <div className="song-filters">
          <div className="level-filter" role="radiogroup" aria-label="Level">
            {(['all', 1, 2, 3, 4, 5] as const).map((l) => (
              <button key={l} role="radio" aria-checked={level === l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
                {l === 'all' ? 'All levels' : LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
          <label className="song-search">
            <Search size={15} />
            <input type="search" placeholder="Search title or composer" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        {firstPieces.length > 0 && (
          <>
            <h4 className="song-group-title">First pieces</h4>
            <ul className="song-list">{firstPieces.map(row)}</ul>
          </>
        )}
        {groups.map((g) => (
          <details key={g.title} className="song-group" open={filtering || g.entries.some((e) => isStudied(e.id))}>
            <summary>
              <ChevronRight size={16} className="chev" />
              <span>
                <b>{g.title}</b>
                {g.composer && <small className="muted"> · {g.composer}</small>}
              </span>
              <small className="muted">{g.entries.length === 1 ? '1 piece' : `${g.entries.length} pieces`}</small>
            </summary>
            <ul className="song-list">{g.entries.map(entryRow)}</ul>
          </details>
        ))}
        {!firstPieces.length && !groups.length && <p className="muted">No songs match.</p>}
      </section>

      <section className="panel">
        <h3>Your songs</h3>
        <p className="muted small">
          Import a score as MusicXML (.musicxml, .xml or compressed .mxl), which MuseScore, Sibelius, Finale and Dorico all export, or as a
          PDF. A PDF is a picture of the music, so it's read into notes first (by Claude, with your API key, or typed in by you), and you
          check the result against the page. Imported songs are kept in this browser, so hold on to your files.
        </p>
        {mine.length > 0 && <ul className="song-list">{mine.map(row)}</ul>}
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => file.current?.click()}>
            <Upload size={16} /> {busy ? 'Importing…' : 'Import MusicXML or PDF…'}
          </button>
          <input
            ref={file}
            type="file"
            accept=".musicxml,.xml,.mxl,.pdf,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,application/pdf"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          {error && <span className="warn small">{error}</span>}
        </div>
      </section>
    </div>
  );
}

function SongPage({
  data,
  update,
  song,
  onBack,
  onPractice,
  onLibraryChange,
  onLearn,
  onEditTranscription,
}: {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  song: Song;
  onBack: () => void;
  onPractice: (f: SongFocus) => void;
  onLibraryChange: () => void;
  onLearn: Props['onLearn'];
  onEditTranscription: () => void;
}) {
  const deckId = songDeckId(song.id);
  const entry = corpusEntry(song.id);
  const learning = data.settings.enabledDecks.includes(deckId);
  const opts = data.songs[song.id] ?? DEFAULT_SONG_OPTIONS;
  const cards = songCards(song, opts);
  const p = progressOf(data, song);
  const { measures } = song.score;
  const weak = weakBars(data.songBars[song.id]);
  const history = data.songBars[song.id] ?? {};

  const setOpts = (o: Partial<SongOptions>) =>
    update((d) => {
      d.songs[song.id] = { ...(d.songs[song.id] ?? DEFAULT_SONG_OPTIONS), ...o };
    });
  const unlearned = cards.filter((c) => !isSeen(data, c.id));
  const batch = unlearned.slice(0, Math.max(1, data.settings.newPerDay));
  const learnNext = () => onLearn({ title: song.title, source: 'Songs', cards: batch, reviewKey: `deck:${deckId}` }, deckId);
  const toggleLearning = () =>
    update((d) => {
      d.settings.enabledDecks = learning ? d.settings.enabledDecks.filter((x) => x !== deckId) : [...d.settings.enabledDecks, deckId];
    });

  // Each bar's state from its passage cards (not the joins): learned, started, or not yet.
  const barState = (i: number) => {
    const covering = cards.filter((c) => c.passage!.from <= i && c.passage!.to >= i && c.passage!.to - c.passage!.from < opts.bars + 1);
    if (!covering.length) return '';
    if (covering.every((c) => isLearned(data, c.id))) return 'learned';
    if (covering.some((c) => isSeen(data, c.id))) return 'started';
    return '';
  };
  const chunkOf = (i: number): [number, number] => {
    const c = cards.find((x) => x.passage!.from <= i && x.passage!.to >= i && x.passage!.to - x.passage!.from < opts.bars + 1);
    return c ? [c.passage!.from, c.passage!.to] : [i, i];
  };

  const remove = async () => {
    if (!window.confirm(`Remove "${song.title}" from your songs? Progress on its cards is kept in case you import it again.`)) return;
    await removeImportedSong(song.id);
    update((d) => {
      d.settings.enabledDecks = d.settings.enabledDecks.filter((x) => x !== deckId);
    });
    onLibraryChange();
    onBack();
  };

  return (
    <div className="page-inner song-page">
      <button className="small link back" onClick={onBack}>
        <ArrowLeft size={15} /> All songs
      </button>
      <header className="page-head">
        <h2>{song.title}</h2>
        <p>
          {song.composer}
          {song.level ? ` · ${LEVEL_LABEL[song.level]}` : ''} · {summary(song)}
        </p>
        {song.about && <p className="muted">{song.about}</p>}
        {entry && (
          <p className="muted small">
            {entry.collection} · Engraved by the{' '}
            <a href={entry.source} target="_blank" rel="noreferrer">
              Mutopia Project
            </a>{' '}
            ({entry.license}); converted for PianoSRS without repeat signs, dynamics or ornaments.
          </p>
        )}
      </header>

      <section className="panel stack">
        <div className="row spread">
          <label className="check">
            <input id="song-learn" type="checkbox" checked={learning} onChange={toggleLearning} />
            <span>
              <b>Study this song</b>
              <small className="muted"> · {cards.length} passages: learn a few at a time, then they come back in Review</small>
            </span>
          </label>
          <span className="row">
            {learning && <Progress {...p} />}
            <button className="small learn-btn" disabled={!batch.length} onClick={learnNext}>
              <Play size={11} fill="currentColor" /> {batch.length ? `Learn next ${batch.length}` : 'All learned'}
            </button>
          </span>
        </div>
        <div className="row">
          <label className="opt inline">
            Bars per passage
            <select id="song-bars" value={opts.bars} onChange={(e) => setOpts({ bars: Number(e.target.value) })}>
              {[1, 2, 4, 8].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              id="song-hands"
              type="checkbox"
              checked={opts.separateHands}
              onChange={(e) => setOpts({ separateHands: e.target.checked })}
            />
            Hands separately first
          </label>
        </div>
        {p.seen > 0 && <p className="muted small">Changing how the song is split makes new passages; progress on the old ones is kept.</p>}
      </section>

      <section className="panel stack">
        <div className="row spread">
          <h3>Bars</h3>
          <div className="row">
            {weak.length > 0 && (
              <button onClick={() => onPractice({ song: song.id, from: weak[0], to: weak[0], hands: 'both' })}>
                Practice bars to work on ({weak.length})
              </button>
            )}
            <button className="primary" onClick={() => onPractice({ song: song.id, from: 0, to: measures.length - 1, hands: 'both' })}>
              Practice the whole song
            </button>
          </div>
        </div>
        <div className="bar-strip" role="list">
          {measures.map((m) => {
            const recent = history[m.index] ?? [];
            const slips = recent.reduce((a, b) => a + b, 0);
            const [from, to] = chunkOf(m.index);
            return (
              <button
                key={m.index}
                role="listitem"
                className={`bar-cell ${barState(m.index)} ${weak.includes(m.index) ? 'weak' : ''}`}
                title={`Bar ${m.number}${recent.length ? ` · ${slips} slip${slips === 1 ? '' : 's'} in the last ${recent.length} plays` : ''}. Click to practice its passage.`}
                onClick={() => onPractice({ song: song.id, from, to, hands: 'both' })}
              >
                {m.number}
              </button>
            );
          })}
        </div>
        <p className="muted small legend">
          <span className="bar-cell learned" /> learned <span className="bar-cell started" /> learning <span className="bar-cell weak" />{' '}
          slips lately · click a bar to practice its passage
        </p>
      </section>

      <section className="panel score-panel">
        <ScoreView xml={song.xml} fit="width" />
      </section>

      {song.source === 'imported' && (
        <div className="row">
          <span className="muted small">
            {song.transcription ? 'Transcribed from' : 'Imported from'} {song.fileName}
          </span>
          {song.transcription && (
            <button className="small" onClick={onEditTranscription}>
              Check or correct the transcription
            </button>
          )}
          <button className="small link" onClick={remove}>
            Remove from your songs
          </button>
        </div>
      )}
      {song.source === 'corpus' && (
        <p className="muted small">Encoded for PianoSRS from a public-domain work; this encoding is released as CC0.</p>
      )}
    </div>
  );
}
