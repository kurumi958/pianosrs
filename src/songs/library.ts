import { makePassageCard, type Card } from '../srs/cards';
import { type DeckDef, setSongDecks } from '../srs/deck';
import { CORPUS } from './corpus';
import { compileSong } from './dsl';
import { parseMusicXML, readScoreFile } from './musicxml';
import { barsLabel, type Hands, handPlays, type Score } from './score';

export interface Song {
  id: string;
  title: string;
  composer: string;
  /** 1 beginner to 5 advanced (built-in songs only). */
  level?: Level;
  about?: string;
  source: 'corpus' | 'imported';
  xml: string;
  score: Score;
  /** Imported songs: when, and from which file. */
  addedAt?: number;
  fileName?: string;
}

/** How a song is split into flash cards. */
export interface SongOptions {
  /** Bars per passage. */
  bars: number;
  /** Learn each passage hands separately before hands together. */
  separateHands: boolean;
  /** Practice tempo, quarter notes per minute. */
  tempo?: number;
}

export const DEFAULT_SONG_OPTIONS: SongOptions = { bars: 2, separateHands: true };

/** Roughly ABRSM/RCM grades 1–2, 3–4, 5–6, 7–8, and beyond. */
export type Level = 1 | 2 | 3 | 4 | 5;
export const LEVEL_LABEL = { 1: 'Beginner', 2: 'Early intermediate', 3: 'Intermediate', 4: 'Late intermediate', 5: 'Advanced' } as const;

export const CORPUS_SONGS: Song[] = CORPUS.map((src) => {
  const { score, xml } = compileSong(src);
  return { id: src.id, title: src.title, composer: src.composer, level: src.level, about: src.about, source: 'corpus', xml, score };
});

/**
 * The larger corpus: public-domain pieces engraved by the Mutopia Project, converted to MusicXML (scripts/corpus/).
 * Its index (public/songs/index.json) loads at start-up; a piece's notes (public/songs/<id>.mxl) load when it's
 * opened or studied.
 */
export interface CorpusEntry {
  id: string;
  title: string;
  composer: string;
  /** The collection it's from, e.g. "25 Easy and Progressive Studies, Op. 100". */
  collection: string;
  level: Level;
  about: string;
  key: string;
  meter: string;
  bars: number;
  /** The engraving's licence, and where it came from. */
  license: string;
  source: string;
  file: string;
}

let corpusIndex: CorpusEntry[] = [];
const corpusSongs = new Map<string, Song>();
const corpusLoading = new Map<string, Promise<Song | null>>();

/** Fetch the corpus index (once). Without it (offline on first run), only the songs built into the app are listed. */
export async function loadCorpusIndex(): Promise<void> {
  if (corpusIndex.length) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}songs/index.json`);
    if (res.ok) corpusIndex = (await res.json()) as CorpusEntry[];
    libraryVersion++;
  } catch {
    // offline: the built-in songs are still there
  }
}

export function corpusEntries(): CorpusEntry[] {
  return corpusIndex;
}

export const corpusEntry = (id: string) => corpusIndex.find((e) => e.id === id);

/** Load a corpus piece's notes (once). Resolves to the song, or null if it isn't in the corpus or can't be read. */
export function ensureSong(id: string): Promise<Song | null> {
  const ready = songById(id);
  if (ready) return Promise.resolve(ready);
  const entry = corpusEntry(id);
  if (!entry) return Promise.resolve(null);
  let p = corpusLoading.get(id);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}songs/${entry.file}`);
        if (!res.ok) return null;
        const xml = readScoreFile(new Uint8Array(await res.arrayBuffer()));
        const score = parseMusicXML(xml);
        const song: Song = { id, title: entry.title, composer: entry.composer, level: entry.level, about: entry.about, source: 'corpus', xml, score };
        corpusSongs.set(id, song);
        libraryVersion++;
        return song;
      } catch {
        return null;
      } finally {
        corpusLoading.delete(id);
      }
    })();
    corpusLoading.set(id, p);
  }
  return p;
}

const imported = new Map<string, Song>();
/** Bumped whenever an imported song is added, changed or removed, so decks rebuild. */
let libraryVersion = 0;

/** Songs whose notes are loaded: the built-in ones, corpus pieces opened or studied, and imported ones. */
export function allSongs(): Song[] {
  return [...CORPUS_SONGS, ...corpusSongs.values(), ...[...imported.values()].sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0))];
}

export function songById(id: string): Song | undefined {
  return CORPUS_SONGS.find((s) => s.id === id) ?? corpusSongs.get(id) ?? imported.get(id);
}

export const songDeckId = (songId: string) => `song:${songId}`;

/**
 * Passages to learn, in order. With separate hands, each passage comes right hand, left hand, then hands
 * together (a hand that doesn't play there is skipped). After each passage, a card joins it to the one before,
 * and a last card plays the whole song. A pickup bar goes with the first passage.
 */
export function songCards(song: Song, opts: SongOptions): Card[] {
  const { score } = song;
  const n = score.measures.length;
  const full = (i: number) => (score.measures[i].meter.num * 96) / score.measures[i].meter.den;
  const first = n > 1 && score.measures[0].length < full(0) ? 1 : 0;
  const chunks: [number, number][] = [];
  for (let a = first; a < n; a += opts.bars) chunks.push([a === first ? 0 : a, Math.min(n - 1, a + opts.bars - 1)]);
  const card = (from: number, to: number, hands: Hands) =>
    makePassageCard({ song: song.id, from, to, hands, title: song.title, bars: barsLabel(score, from, to) }, score.measures[from].key);
  const out: Card[] = [];
  chunks.forEach(([from, to], i) => {
    const rh = handPlays(score, from, to, 'rh');
    const lh = handPlays(score, from, to, 'lh');
    if (rh && lh) {
      if (opts.separateHands) out.push(card(from, to, 'rh'), card(from, to, 'lh'));
      out.push(card(from, to, 'both'));
    } else if (rh || lh) out.push(card(from, to, rh ? 'rh' : 'lh'));
    if (i > 0) out.push(card(chunks[i - 1][0], to, 'both'));
  });
  if (chunks.length > 2) out.push(card(0, n - 1, 'both'));
  return out;
}

export function songDeck(song: Song, opts: SongOptions): DeckDef {
  const cards = songCards(song, opts);
  return {
    id: songDeckId(song.id),
    name: song.title,
    description: `${song.composer} · ${cards.length} passages`,
    kind: 'song',
    cards,
  };
}

let synced = '';

/** Make the song decks match the songs and their options. Cheap when nothing changed, so it can run every render. */
export function syncSongDecks(options: Record<string, SongOptions>): void {
  const songs = allSongs();
  // Only what changes the cards counts (not the practice tempo).
  const sig = JSON.stringify([libraryVersion, songs.map((s) => s.id), Object.entries(options).map(([id, o]) => [id, o.bars, o.separateHands])]);
  if (sig === synced) return;
  synced = sig;
  setSongDecks(songs.map((s) => songDeck(s, options[s.id] ?? DEFAULT_SONG_OPTIONS)));
}

// ---------------------------------------------------------------------------------------------
// Imported songs live in IndexedDB: MusicXML files are too big for localStorage.

interface StoredSong {
  id: string;
  xml: string;
  addedAt: number;
  fileName: string;
  // Songs saved by the PDF transcriber (removed for now) also hold `transcription` and `pdf`; they're left as they are.
}

const DB = 'pianosrs';
const STORE = 'songs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fromStored(s: StoredSong): Song {
  const score = parseMusicXML(s.xml);
  return {
    id: s.id,
    title: score.title,
    composer: score.composer,
    source: 'imported',
    xml: s.xml,
    score,
    addedAt: s.addedAt,
    fileName: s.fileName,
  };
}

/** Load imported songs into the library. Files that no longer parse are skipped. */
export async function loadImportedSongs(): Promise<void> {
  try {
    const stored = await tx<StoredSong[]>('readonly', (s) => s.getAll());
    for (const s of stored) {
      try {
        imported.set(s.id, fromStored(s));
      } catch {
        // A file the parser can no longer read: leave it out rather than fail the whole library.
      }
    }
  } catch {
    // IndexedDB unavailable (private mode in some browsers): built-in songs still work.
  }
}

/** Short stable id from the file's contents, so importing the same file twice doesn't duplicate it. */
function contentId(xml: string): string {
  let h = 2166136261;
  for (let i = 0; i < xml.length; i++) h = Math.imul(h ^ xml.charCodeAt(i), 16777619);
  return `u${(h >>> 0).toString(36)}`;
}

/** Add a MusicXML file to the library. Throws (with a readable message) if it can't be used. */
export async function importSong(xml: string, fileName: string): Promise<Song> {
  const id = contentId(xml);
  const stored: StoredSong = { id, xml, addedAt: Date.now(), fileName };
  const song = fromStored(stored);
  await tx('readwrite', (s) => s.put(stored));
  imported.set(id, song);
  libraryVersion++;
  return song;
}

export async function removeImportedSong(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  imported.delete(id);
  libraryVersion++;
}
