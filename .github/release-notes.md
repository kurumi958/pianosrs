A prototype of PianoSRS as a desktop app. It's the same app as the web version, in its own window, with your progress saved on this computer.

## New in 0.3.1

- **Songs look like sheet music**: a song's score is drawn as a page with its title, and a steady number of bars per line so busy music isn't crammed.
- **Page turns**: *Practice the whole song* shows one page at a time (3–6 lines) and turns it as you play: at the end of the page, at the start of its last bar, or halfway through it, with an optional countdown. ‹ › look ahead or back.
- **Better sight-reading phrases**: melodies move like real tunes (no more bars of one repeated note), end on the home note, and on the grand staff the hands never land on the same key: the left hand stays below the right.

## New in 0.3.0

- **190 classical pieces** in Songs, complete and ready to learn a few bars at a time: Bach (the Anna Magdalena notebook, Little Preludes, all fifteen Two-Part Inventions, preludes and fugues from the Well-Tempered Clavier), Clementi, Czerny, Burgmüller's Op. 100, Schumann's *Album for the Young* and *Scenes from Childhood*, Tchaikovsky, Mozart, Beethoven (including all of *Für Elise* and the *Moonlight* Sonata's first two movements), Kuhlau, Haydn, Handel, Chopin's Preludes, Satie and Grieg. Browse them by collection, filter by level (now up to *Advanced*) or search. Engraved by the Mutopia Project; repeat signs, dynamics and ornaments aren't shown yet.
- **A real piano sound**: your MIDI piano and the on-screen keyboard play a sampled grand (the Salamander Grand Piano, eight velocity layers, with sustain pedal), so you can practise silently on headphones. Turn it on in *Settings → Sound*.
- **A clockwork metronome**: an analogue-style tick, with an optional bell on the first beat.
- The PDF transcriber is removed for now; import songs as MusicXML.

## Which file to download

| Computer | File |
| --- | --- |
| Windows | `PianoSRS-…-windows-setup.exe` (installs it, with a Start menu entry) or `PianoSRS-…-windows-portable.exe` (runs without installing) |
| Mac with Apple silicon (M1 and later) | `PianoSRS-…-mac-arm64.dmg` |
| Older Intel Mac | `PianoSRS-…-mac-x64.dmg` |
| Linux | `PianoSRS-…-linux-x86_64.AppImage` (make it executable, then run it) |

## First launch

The app isn't code-signed yet, so your computer will warn you the first time:

- **Windows**: "Windows protected your PC" → *More info* → *Run anyway*.
- **macOS**: if it says the app "is damaged" or "can't be opened", drag it to Applications, then run `xattr -cr /Applications/PianoSRS.app` in Terminal once and open it again.

Connect your piano by USB before or after opening the app; it shows up in the instrument panel at the bottom left. Progress from the web version doesn't carry over automatically: use *Settings → Export backup* there and *Import backup* here.
