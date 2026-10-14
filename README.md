# PianoSRS

Learn to read sheet music with spaced repetition (like Anki), using a real MIDI piano as the answer button.

- **Review**: flash cards show a note, interval or chord on a treble, bass or grand staff. Play it on your keyboard. The app grades you
  automatically: a wrong key counts as *Again*, and a right answer is *Easy*, *Good* or *Hard* depending on how fast you
  played it. Scheduling is Anki's SM-2 algorithm with learning and relearning steps, a daily new-card limit, and undo.
- **Sight-read**: generated 4/4 phrases built from the notes you've learned, with weak notes weighted to come up more.
  Play straight through (the cursor waits for the right note or chord); notes you stumble on become due in your flash cards
  straight away. Phrases can be treble only, bass only, or **two-handed on the grand staff**, with bar patterns for a right-hand
  melody over held left-hand notes (and the reverse), melodies passing between the hands, and hands together. *Stepwise* mode makes
  lines move mostly by steps and skips, like real melodies. Phrases can be written in any major key, or in a random key you've
  studied: notes take the key signature, and accidentals within a bar are printed against it. With *Rhythms* on, bars use the
  rhythm patterns you've learned (one time signature per phrase). *Wait for me* mode waits for each note; *In time* mode
  gives a one-bar count-in and keeps going with the metronome, judging every note on pitch and timing.
- **Rhythm cards**: a one-bar rhythm on a single line. Press any key for a one-bar count-in, then tap the rhythm on any key
  with the metronome. Every note must land within a quarter of a beat (80–180ms); the grade comes from how close you were.
  Decks cover quarter/half/whole notes, 3/4 and 2/4 with dotted halves, rests, eighth notes and dotted quarters, and the
  course introduces rhythms where the book does. MIDI timestamps and speaker latency are used for accuracy, and Settings has a
  manual latency adjustment.
- **Courses**: an *adult beginner course* that introduces notes unit by unit in the order of an adult method book
  (Faber's Adult Piano Adventures All-in-One Book 1, Units 2–16: first staff notes → bass C-D-E → treble spaces → G position →
  sharps and flats → intervals → scales → primary chords in C and G, with the G major key signature). The next unit opens once
  80% of the current one has graduated; you can start at any unit (earlier units count as already known) or open the next unit early.
- **Nothing is studied by default**: on first launch you choose between starting the course and picking decks yourself.
- **Topic decks**: treble and bass clef notes on the staff, ledger lines, sharps and flats, intervals and triads, plus grand-staff
  decks: *which staff?* (single notes on either staff, middle C on both), *hands together* (one note per hand in C and G
  position) and *bass note + chord*, and key signatures: *name the key* (a signature on its own; play the major tonic in any
  octave) and *reading in sharp / flat keys* (the notes a signature alters, key by key up to six sharps or flats). Cards are
  shared by id between decks and the course, so a note learned in one counts in the other.
- **Stats**: accuracy, answer speed, a due forecast and your trickiest notes.
- Built for an 88-key piano. The on-screen piano shows all 88 keys, unlabelled by default so you read the staff rather than
  the keyboard (C labels can be turned on in Settings).
- No MIDI? The clickable on-screen piano and the computer keyboard (`A`–`;` white keys, `W E T Y U O P` black keys,
  `Z`/`X` change octave) both work.

Progress is saved in the browser's `localStorage`. Use *Settings → Export backup* to move it between devices.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (scheduler, decks, queue, matching, phrases)
npm run build    # static site in dist/ — host it anywhere (GitHub Pages, Netlify, …)
```

Web MIDI needs a secure context (https or localhost) and a Chromium-based browser (Chrome, Edge, Opera, Samsung Internet).
Firefox supports it with a permission prompt; Safari/iOS doesn't support it at all.

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
| `src/srs/scheduler.ts` | SM-2 scheduling (pure functions) |
| `src/srs/cards.ts` | Card model (staff, key, notes per hand) and builders |
| `src/srs/deck.ts` | Topic decks, course registry, shared card lookup |
| `src/srs/course.ts` | The adult beginner course, unit by unit |
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
| `src/components/*` | React screens |

## Ideas for later

- Custom decks: build your own from a range of notes, clefs, keys and intervals
- Smaller keyboards (25–61 keys): fit cards and phrases to the instrument's range (today there is only an "any octave" fallback)
- Minor keys
- Ties, sixteenth notes, triplets, 6/8; judging note lengths (releases), not just onsets
- FSRS scheduling as an option
- Cloud sync between devices
- Native Android build with a MIDI bridge plugin (see above)
