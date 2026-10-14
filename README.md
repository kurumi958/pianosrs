# PianoSRS

Learn to read sheet music with spaced repetition (like Anki), using a real MIDI piano as the answer button.

- **Review**: flash cards show a note, interval or chord on the staff. Play it on your keyboard. The app grades you
  automatically: a wrong key counts as *Again*, and a right answer is *Easy*, *Good* or *Hard* depending on how fast you
  played it. Scheduling is Anki's SM-2 algorithm with learning and relearning steps, a daily new-card limit, and undo.
- **Sight-read**: generated 4/4 phrases built from the notes you've learned, with weak notes weighted to come up more.
  Play straight through (the cursor waits for the right note); notes you stumble on become due in your flash cards straight away.
- **Decks**: treble and bass clef notes on the staff, ledger lines, sharps and flats, intervals and triads. Enable them as you go.
- **Stats**: accuracy, answer speed, a due forecast and your trickiest notes.
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
| `src/srs/deck.ts` | Card/deck definitions and introduction order |
| `src/srs/session.ts` | Picks the next card (learning → reviews → new → learn-ahead) |
| `src/srs/grading.ts` | Turns correctness + reaction time into a grade |
| `src/midi/input.ts` | Web MIDI, on-screen and computer-keyboard input hub |
| `src/midi/matcher.ts` | Judges notes/chords played against the target |
| `src/music/notation.ts` | Draws the staff with VexFlow |
| `src/music/phrase.ts` | Sight-reading phrase generation and accidental handling |
| `src/components/*` | React screens |

## Ideas for later

- Grand staff cards and two-handed phrases, key signatures, rhythm reading
- FSRS scheduling as an option
- Cloud sync between devices
- Native Android build with a MIDI bridge plugin (see above)
