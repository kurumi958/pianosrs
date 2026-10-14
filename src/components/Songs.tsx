import { ArrowLeft, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { keyLabel } from '../music/notes';
import { meterName } from '../music/rhythm';
import { readScoreFile } from '../songs/musicxml';
import {
  allSongs,
  DEFAULT_SONG_OPTIONS,
  importSong,
  LEVEL_LABEL,
  removeImportedSong,
  type Song,
  songById,
  songCards,
  songDeckId,
  type SongOptions,
} from '../songs/library';
import { weakBars } from '../songs/play';
import type { Hands } from '../songs/score';
import type { AppData } from '../storage';
import { Progress } from './Group';
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
export function Songs({ data, update, openSong, onOpen, onPractice, onLibraryChange }: Props) {
  const song = openSong ? songById(openSong) : undefined;
  if (song) return <SongPage data={data} update={update} song={song} onBack={() => onOpen(null)} onPractice={onPractice} onLibraryChange={onLibraryChange} />;
  return <SongList data={data} onOpen={onOpen} onLibraryChange={onLibraryChange} />;
}

function SongList({ data, onOpen, onLibraryChange }: { data: AppData; onOpen: (id: string) => void; onLibraryChange: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const songs = allSongs();
  const builtIn = songs.filter((s) => s.source === 'corpus');
  const mine = songs.filter((s) => s.source === 'imported');

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      const xml = readScoreFile(new Uint8Array(await f.arrayBuffer()));
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
        <p className="muted small">Public-domain music, from first pieces to intermediate. Excerpts and arrangements say so.</p>
        <ul className="song-list">{builtIn.map(row)}</ul>
      </section>

      <section className="panel">
        <h3>Your songs</h3>
        <p className="muted small">
          Import any score as MusicXML (.musicxml, .xml or compressed .mxl). MuseScore, Sibelius, Finale and Dorico can all export
          it, and many public-domain scores on MuseScore.com and IMSLP come as MusicXML. Imported songs are kept in this browser, so
          hold on to your files.
        </p>
        {mine.length > 0 && <ul className="song-list">{mine.map(row)}</ul>}
        <div className="row">
          <button className="primary" disabled={busy} onClick={() => file.current?.click()}>
            <Upload size={16} /> {busy ? 'Importing…' : 'Import MusicXML…'}
          </button>
          <input
            ref={file}
            type="file"
            accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
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
}: {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  song: Song;
  onBack: () => void;
  onPractice: (f: SongFocus) => void;
  onLibraryChange: () => void;
}) {
  const deckId = songDeckId(song.id);
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
      </header>

      <section className="panel stack">
        <div className="row spread">
          <label className="check">
            <input id="song-learn" type="checkbox" checked={learning} onChange={toggleLearning} />
            <span>
              <b>Learn this song in Review</b>
              <small className="muted"> · {cards.length} passages, introduced with your new cards</small>
            </span>
          </label>
          {learning && <Progress {...p} />}
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
            <input id="song-hands" type="checkbox" checked={opts.separateHands} onChange={(e) => setOpts({ separateHands: e.target.checked })} />
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
              <button onClick={() => onPractice({ song: song.id, from: weak[0], to: weak[0], hands: 'both' })}>Practice bars to work on ({weak.length})</button>
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
          <span className="bar-cell learned" /> learned <span className="bar-cell started" /> learning <span className="bar-cell weak" /> slips lately
          · click a bar to practice its passage
        </p>
      </section>

      <section className="panel score-panel">
        <ScoreView xml={song.xml} fit="width" />
      </section>

      {song.source === 'imported' && (
        <div className="row">
          <span className="muted small">Imported from {song.fileName}</span>
          <button className="small link" onClick={remove}>
            Remove from your songs
          </button>
        </div>
      )}
      {song.source === 'corpus' && <p className="muted small">Encoded for PianoSRS from a public-domain work; this encoding is released as CC0.</p>}
    </div>
  );
}
