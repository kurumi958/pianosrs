# PianoSRS

Learn to read sheet music with spaced repetition (like Anki), using a real MIDI piano as the answer button.

- **Learn, then review**: new cards are met in a **learning session**, never in Review. Click a unit in *Lessons* (or *Learn* on
  a deck or song) and play through its cards at your own pace: each tells you if you played it right (and shows the right keys
  if not), with no grades; *Next* (Enter) moves on when you're ready, and *I already know this one* skips one you can read.
  Cards you played enter the schedule (first review in about 10 minutes, or a minute if you missed it first time); ones you
  skipped stay new. *Move on after a right answer* advances by itself.
- **Review**: only cards you've learned, listed by where they came from (Lessons by course and unit, Decks by group, Songs),
  each with what's due; review one of them or everything. Flash cards show a note, interval or chord on a treble, bass or
  grand staff. Play it on your keyboard. The app grades you
  automatically: a wrong key counts as *Again*, and a right answer is *Easy*, *Good* or *Okay* (Anki's *Hard*) depending on how fast you
  played it. Scheduling uses **FSRS** (the default) or Anki's classic **SM-2**, with learning and relearning steps, daily
  review limits, and undo. *I already know this one* in a learning session (as JPDB's *Known*) counts as answering
  Good through the learning steps and once more, so the card comes back in a few days to check. All of Anki's scheduling options are in *Settings → Scheduling*: steps, desired
  retention and FSRS parameters (paste optimised ones from Anki), or SM-2's graduating/easy intervals, starting ease, easy
  bonus, interval modifier, hard and new intervals; plus maximum interval, fuzz, when the next day starts and the learn-ahead
  limit. Turning FSRS on rebuilds each card's memory by replaying its review history.
- **Sight-read**: generated phrases built from the notes you've learned, with weak notes weighted to come up more.
  Play straight through (the cursor waits for the right note or chord); notes you stumble on become due in your flash cards
  straight away. Phrases can be treble only, bass only, or **two-handed on the grand staff**, with bar patterns for a right-hand
  melody over held left-hand notes (and the reverse), melodies passing between the hands, and hands together. *Stepwise* mode makes
  lines move mostly by steps and skips, like real melodies. Phrases can be written in any major key, a minor key (harmonic
  minor, so the raised 7th appears as an accidental), or a random key you've studied: notes take the key signature, and
  accidentals within a bar are printed against it. With *Rhythms* on, bars use the rhythm patterns you've learned (one time
  signature per phrase, including 6/8 and 2/2); once you've learned ties, some notes are also held over the barline. *Wait for me* mode waits for each note; *In time* mode
  gives a one-bar count-in and keeps going with the metronome, judging every note on pitch and timing.
- **Rhythm cards**: a one-bar rhythm on a single line. Press any key for a one-bar count-in, then tap the rhythm on any key
  with the metronome. Every note must land within a quarter of a beat (80–180ms, and under half the gap to the next note
  for fast sixteenths); the grade comes from how close you were. Decks cover quarter/half/whole notes, 3/4 and 2/4 with
  dotted halves, rests, eighth notes, dotted quarters, sixteenths, dotted eighths, ties and syncopation, triplets, compound
  time (6/8, 3/8, 9/8, 12/8, where the metronome clicks dotted quarters) and cut time (2/2, clicking halves), and the
  course introduces rhythms where the book does. Tempo is always quarter notes per minute, so an eighth note lasts as long
  in 6/8 as in 4/4. MIDI timestamps and speaker latency are used for accuracy, and Settings has a
  manual latency adjustment.
- **Courses**: an *adult beginner course* that introduces notes unit by unit in the order of an adult method book
  (Faber's Adult Piano Adventures All-in-One Book 1, Units 2–16: first staff notes → bass C-D-E → treble spaces → G position →
  sharps and flats → intervals → scales → primary chords in C and G, with the G major key signature). The next unit opens once
  80% of the current one has graduated. Click a unit to see every card it teaches (learned ones ticked) and to start the
  course there (earlier units count as already known); *Open next unit now* opens the next one early.
  A second course, *late beginner to intermediate*, carries on from there in 20 units: notes around middle C, eighth rests,
  F major, naturals, D major, A minor (each key with its notes, a hand position and its primary chords), 2nds/6ths/7ths,
  triad inversions, sixteenths, 6/8, E and D minor, B♭ and E♭, major and minor triads, seventh chords, triplets and
  syncopation, ledger lines further out, A/E/A♭ major, every key signature, cut time, melodic minor and E♯/B♯/C♭/F♭.
- **Nothing is studied by default**: on first launch you choose between starting the course and picking decks yourself.
- **Topic decks**, each labelled *beginner*, *intermediate* or *advanced* (the Decks page filters by level) and listed in
  learning order within their group: landmark notes, treble and bass clef notes on the staff, ledger lines (out to C7 and
  F1), sharps and flats (and E♯, B♯, C♭, F♭), intervals (3rds–octaves, then 2nds, 6ths and 7ths), triads, inversions, every
  major and minor triad spelled with accidentals, dominant seventh chords, key-signature naturals, melodic minor's raised
  6th, eighth and sixteenth rests, plus grand-staff
  decks: *which staff?* (single notes on either staff, middle C on both), *hands together* (one note per hand in C and G
  position), *more hand positions* (middle C, F, D and A minor positions), *two notes in each hand* and *bass note + chord*, and key signatures: *name the key* (a signature on its own; play the major tonic in any
  octave) and *reading in sharp / flat keys* (the notes a signature alters, key by key up to six sharps or flats), and minor
  keys: *name the key* (the same signatures read as minor) and *the raised 7th* (harmonic minor's leading tone, which the
  signature doesn't show). Cards are
  shared by id between decks and the course, so a note learned in one counts in the other.
- **Your own decks**: *New deck* on the Decks page builds one from choices: notes, intervals (2nds to octaves) or chords
  (triads or sevenths on each note of the key's scale, in any inversions) on a staff, over any range and in any keys
  (major or minor, optionally with chromatic notes); naming key signatures up to a number of sharps or flats; or your
  own rhythms, one bar per line. A live preview shows the card count and the first few cards. Cards with the same notes
  as a built-in deck's are the same cards, so their progress carries over; decks are kept in your backup.
- **Sound**: a sampled grand piano (the Salamander Grand Piano V3, eight velocity layers) for the on-screen and computer
  keyboards and, with *Settings → Sound → Play my piano through this computer*, for your MIDI piano too: practice silently
  with headphones in the computer. Velocity picks the layer, released keys are damped (the top octaves ring on, as on a
  real piano) and the sustain pedal holds notes. The samples (23 MB in `public/piano/`) load in the background the first
  time sound is on; a simple tone plays until they're ready. The metronome is a clockwork tick (alternating slightly
  between the pendulum's two swings, the downbeat struck harder), with an optional small bell on beat 1 (*Settings → Sound
  → Metronome*); both are synthesised, see `scripts/metronome/`.
- **Things to work on**: notes you often misread in sight-reading (3+ misses in your last 10 attempts, with the keys you
  tend to play instead) and flash cards you keep forgetting (6+ lapses by default, until they go 60 days without one).
  *Practice* builds sight-reading phrases around them: weak items come up far more often, in their own key, staff and
  rhythm, mixed with notes you know. Forgotten cards can also be brought back for review today.
- **Songs**: learn real pieces a few bars at a time. Nine short public-domain first pieces are included, from *Mary Had a
  Little Lamb* and *Ode to Joy* through the *Minuet in G*, *Greensleeves*, *Für Elise*, *Gymnopédie No. 1*, Bach's *Prelude
  in C* and the opening of the *Moonlight Sonata* (excerpts and simplified arrangements say so), plus 190 complete classical
  pieces from beginner to advanced, by collection: Bach (the Anna Magdalena notebook, Little Preludes, the Two-Part
  Inventions, preludes and fugues from the Well-Tempered Clavier), Clementi, Czerny, all of Burgmüller's Op. 100 up to No. 18,
  Schumann's *Album for the Young* and *Scenes from Childhood*, Tchaikovsky, Mozart, Beethoven, Kuhlau, Haydn, Handel,
  Chopin's Preludes, Satie and Grieg. Filter them by level or search; a piece's notes load when you open or study it. You
  can also import any score as MusicXML
  (.musicxml, .xml or compressed .mxl, as exported by MuseScore, Sibelius, Finale or Dorico, or downloaded from MuseScore.com or
  IMSLP). Scores are engraved with [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/). *Learn this song* turns it into
  passage flash cards in Review: each passage (1, 2, 4 or 8 bars) right hand, left hand, then hands together, then joined to
  the passage before, and finally the whole song. Passages grade themselves: more than one slip in ten notes is Again, any
  slip is Okay, a clean run is Good, and a clean run without hesitating is Easy. You can also practice any bars, either hand,
  waiting for you or in time with a count-in and metronome; the bar strip shows which bars are learned and which keep tripping
  you up. Repeats are read once, as written; grace notes aren't judged.
- **Songs from PDFs**: a PDF is a picture of the music, so it's transcribed first. *Import MusicXML or PDF* opens a PDF in an
  editor: the page on one side, the song's details and its notes (in the app's compact notation, one bar per line) on the
  other, and the engraved result underneath. Claude reads the pages, two ways:
  - *With your Claude plan* (the default; no API key, no per-page cost): copy the app's instructions, paste them into a Claude
    chat with the PDF attached, and paste the reply back. If any bars don't add up, the app writes a fix request to send to
    the same chat.
  - *With an API key*: each page goes to Claude (`claude-opus-5-5`) automatically, with your own key, which stays in the
    browser; bars that don't add up are sent back to be read again. With *Look closer* (on by default) Claude also gets a
    zoom tool: it asks for regions of the page, which the app redraws sharply from the PDF, and reads the music bar by bar
    up close. On a dense page (Ravel's Pavane) that took note accuracy from about 56% to 98%, at roughly $1–3 a page
    instead of $0.10–0.40.
  Either way you compare the engraving with the page and fix what was misread, or type the notes in yourself. The PDF is kept
  with the song, so *Check or correct the transcription* reopens it side by side. A song keeps one key and time signature
  throughout. In a test on a one-page Bach minuet (199 notes), Opus read every note right on both runs, Sonnet 96–98%, and
  Haiku 80–89% (whole stretches an octave off); on a dense Ravel page Haiku gave up partway. So use the most capable model.
- **Stats**: accuracy, answer speed, a due forecast and your trickiest notes.
- Laid out for a landscape screen (16:9 monitor, or a tablet or phone held sideways), ideally full screen: the music fills
  the middle, and the whole 88-key keyboard is docked along the bottom at full width, so keys never move. The full-screen
  button also locks phones and tablets to landscape where supported; held upright, they show a prompt to rotate.
- Built for an 88-key piano. The on-screen piano shows all 88 keys, unlabelled by default so you read the staff rather than
  the keyboard (C labels can be turned on in Settings).
- No MIDI? The clickable on-screen piano and the computer keyboard (`A`–`;` white keys, `W E T Y U O P` black keys,
  `Z`/`X` change octave) both work.

Progress is saved in the browser's `localStorage`. Use *Settings → Export backup* to move it between devices. Imported songs
are kept in the browser's IndexedDB (scores are too big for localStorage) and aren't part of the backup, so keep your files.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (scheduler, decks, queue, matching, phrases)
npm run build    # static site in dist/ — host it anywhere (GitHub Pages, Netlify, …)
```

Web MIDI needs a secure context (https or localhost) and a Chromium-based browser (Chrome, Edge, Opera, Samsung Internet).
Firefox supports it with a permission prompt; Safari/iOS doesn't support it at all.

## First test with your piano

On first launch, Home offers a short **piano setup** (also in *Settings → MIDI → Run piano setup*): it checks the
connection, that middle C arrives as middle C (not transposed), how many keys the keyboard has, and measures your timing
offset by tapping along with clicks.

Each deck group on the **Decks** page starts with a small *Test deck*, and **Lessons** has a three-unit *Test course*. Their
cards have their own progress (ids starting with `test:`), so practicing them never touches your real cards; use *reset* to
start a test again. A quick run-through:

1. Plug the piano in (USB, or USB-OTG on Android), open the app in Chrome, allow MIDI. The sidebar should show the device name.
2. On **Decks**, press *Learn* on each of the five test decks: notes in both clefs and on ledger lines, both hands at once,
   chords, sharps and flats, key signatures (play the tonic anywhere), and rhythm cards (tap with the metronome). Then open
   **Review**: the test decks are listed with their cards due.
3. Check the grades feel fair: fast right answers Easy, slower ones Good or Okay. Adjust the thresholds in **Settings**.
4. Rhythm cards: if results say you're consistently "a bit late" (or early), set **Settings → Latency adjustment** by about
   that many milliseconds.
5. **Sight-read** in both modes, on the grand staff, with *Learned rhythms* on, and try *In time* at a slow tempo.
6. In **Lessons**, learn the test course's first unit, then review it with quick right answers: unit 2 should open.
7. **Songs**: open *Ode to Joy*, click bar 1 and play it hands together, then try *In time*. *Learn next* plays through its first
   passages; they then appear in Review under Songs.

## Desktop app

PianoSRS also runs as a desktop app for Windows, macOS and Linux, built with [Electron](https://www.electronjs.org/).
It's the same app in its own window: Electron ships Chromium, so Web MIDI works the same everywhere, including macOS
(where Safari's engine has no MIDI). Downloads are on the repository's Releases page.

```bash
npm run desktop       # build, then open the desktop app
npm run desktop:dev   # the desktop app on the Vite dev server, with hot reload
npm run dist          # installers for this platform in release/ (dist:win, dist:mac, dist:linux for one)
```

- `electron/main.cjs` serves `dist/` from `app://pianosrs` (a stable, secure origin, so saved progress stays put),
  allows MIDI, opens outside links in your browser, and keeps to one window.
- Progress is stored in the app's own profile (`%APPDATA%/PianoSRS` on Windows, `~/Library/Application Support/PianoSRS`
  on macOS), separate from any browser. Move it with *Export backup* / *Import backup*.
- The *Desktop app* GitHub workflow builds all three platforms. A `v*` tag, a manual run, or a commit message containing
  `[release]` publishes the builds as a pre-release named after `package.json`'s version.
- Not code-signed yet, so Windows SmartScreen and macOS Gatekeeper warn on first launch (the release notes explain how
  to open it anyway).

## Android

The simplest route is the web app itself: **Chrome on Android supports Web MIDI**. Plug the piano in with a USB-OTG
adapter (or pair a Bluetooth MIDI keyboard), open the hosted site in Chrome, and choose *Add to Home screen*. The app has
a web manifest and service worker, so it installs like a regular app and works offline.

A Play Store app is possible later with [Capacitor](https://capacitorjs.com/), but note that Android's **WebView does
not implement Web MIDI**. A native build needs a small plugin bridging `android.media.midi` to JavaScript. All input goes
through one hub (`src/midi/input.ts`), so that plugin only has to call
`hub.emit({ type: 'on' | 'off', note, velocity, source: 'midi' })`.

## Layout

| Path | What it does |
| --- | --- |
| `src/srs/scheduler.ts` | FSRS (via ts-fsrs) and SM-2 scheduling (pure functions) |
| `src/srs/memory.ts` | Rebuilds FSRS memory from review history; reschedules after settings change |
| `src/srs/cards.ts` | Card model (staff, key, notes per hand) and builders |
| `src/srs/deck.ts` | Topic decks, course registry, shared card lookup |
| `src/srs/course.ts` | The two courses, unit by unit |
| `src/srs/custom.ts` | Custom decks: the choices that define one, and the cards they make |
| `src/srs/generators.ts` | Card builders shared by decks and courses (notes in keys, spelled chords, hand positions, rhythms) |
| `src/audio/piano.ts` | The sampled piano: velocity layers, retuning, dampers and sustain pedal |
| `src/srs/learn.ts` | Learning sessions: putting new cards into the schedule, deck batches, Review's sections |
| `src/srs/study.ts` | Course unlocking and which cards are available to study / read |
| `src/srs/session.ts` | Picks the next card (learning → reviews → new → learn-ahead) |
| `src/srs/grading.ts` | Turns correctness + reaction time into a grade |
| `src/midi/input.ts` | Web MIDI, on-screen and computer-keyboard input hub |
| `src/midi/matcher.ts` | Judges notes/chords played against the target |
| `src/music/notation.ts` | Draws the staff with VexFlow |
| `src/music/rhythm.ts` | Rhythm patterns, tap matching and grading |
| `src/music/tempo.ts` | Judges a phrase played in time |
| `src/midi/metronome.ts` | Metronome clicks on the Web Audio clock |
| `src/music/phrase.ts` | Sight-reading phrases (single staff or two-handed), events to play, accidentals |
| `src/songs/musicxml.ts` | Reads MusicXML (and .mxl) into notes with bars, timing, staves and ties |
| `src/songs/dsl.ts` | The compact notation the included songs are written in, compiled to the score model and MusicXML |
| `src/songs/corpus.ts` | The nine first pieces |
| `src/songs/library.ts` | Song library (first pieces, the classical corpus loaded on demand, imported songs in IndexedDB) and song decks of passage cards |
| `public/songs/` | The classical corpus: `index.json` and one compressed MusicXML file per piece |
| `scripts/corpus/` | How the corpus is made from the Mutopia Project's LilyPond files (see below) |
| `src/songs/pdf.ts` | Opens PDFs and renders pages, or enlarged regions of them (pdf.js) |
| `src/songs/transcribe.ts` | Reads a page into the song notation with Claude, zooming in on request and sending back bars that don't add up |
| `src/songs/play.ts` | Note colours while playing, tie chains, bars to work on |
| `src/components/*` | React screens |

## Ideas for later

- Smaller keyboards (25–61 keys): fit cards and phrases to the instrument's range (today there is only an "any octave" fallback)
- Optimising FSRS parameters from your own review history (today: paste them from Anki)
- Per-deck scheduling presets, leeches and suspending cards
- PDF transcription: key and time signature changes within a piece; repeat signs and endings
- PDF transcription: try *Look closer* (the zoom tool) on the Pavane with a real API key, to measure its accuracy and cost per
  page outside the subagent test
- Imported songs: include them in *Export backup* (today they live only in the browser that imported them)
- Judging note lengths (releases), not just onsets; pedalling
- Songs: playing repeats and voltas as performed; dynamics, ornaments and fingering in the corpus (the converter leaves them
  out); more pieces (tuplets other than triplets, and cadenzas, aren't converted yet); looping a passage while speeding it up
- Cloud sync between devices
- Desktop app: keep progress and imported songs in a data file (so backups include songs and PDFs), automatic
  backups, the API key in the system keychain, code signing and automatic updates
- Native Android build with a MIDI bridge plugin (see above)

## The classical corpus

The pieces in `public/songs/` are the [Mutopia Project](https://www.mutopiaproject.org/)'s engravings, converted from
LilyPond to MusicXML by `scripts/corpus/`: LilyPond itself interprets each score with a small listener (`listener.ly`) that
writes out every note with its spelled pitch, written and actual length, tuplet, tie, staff, voice, clef, key and time
signature; `events2xml.py` turns those into MusicXML; `scan.py` converts whole folders of the Mutopia archive and reports what
came out; `pieces.py` lists the chosen pieces with titles, collections, levels and notes; and `build.py` writes the bundle.
Every piece is checked by `tests/library.test.ts` with the app's own MusicXML reader.

```sh
pip install lilypond                      # LilyPond 2.25 from PyPI
git clone --filter=blob:none --sparse https://github.com/MutopiaProject/MutopiaProject mutopia
(cd mutopia && git sparse-checkout set ftp/BachJS ftp/BurgmullerJFF ...)
python3 scripts/corpus/scan.py mutopia <lilypond bin dir> work BachJS/BWV772 BurgmullerJFF ...
python3 scripts/corpus/build.py mutopia work public/songs
```

## Credits

- Piano sound: [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm
  (Yamaha C5), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The MP3s come from
  [@audio-samples/piano-mp3](https://github.com/darosh/samples-piano-mp3) (velocity layers 2, 4, … 16), trimmed to 9 seconds
  with a 2-second fade and re-encoded at 96 kbps.
- Classical corpus: engraved by the volunteers of the [Mutopia Project](https://www.mutopiaproject.org/), each piece in the
  public domain or under a Creative Commons licence (CC BY 3.0, or CC BY-SA 2.5, 3.0 or 4.0) as `public/songs/index.json`
  records along with its Mutopia page, shown on the piece's page in the app. The converted files are shared under the same
  terms.
