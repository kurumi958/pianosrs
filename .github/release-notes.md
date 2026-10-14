A prototype of PianoSRS as a desktop app. It's the same app as the web version, in its own window, with your progress saved on this computer.

## New in 0.2.0

- **Learn, then review.** New cards are learned in ungraded learning sessions: click a unit in Lessons, or *Learn* on a deck or song, and play through at your own pace. Review then shows only cards you've learned, grouped by lesson, deck and song.
- **A new sidebar**: Home · Practice (Sight-read, Things to work on) · Learn (Lessons, Review) · Library (Decks, Songs) · You.
- **The curriculum filled out**: a second course (*Late beginner to intermediate*, 20 units), 14 new decks, levels on every deck, and a custom deck builder.
- **Lessons**: units show their cards and let you start the course anywhere.
- **New logo**: the keyboard colonnade.
- PDF transcription with an API key can zoom in on dense music (*Look closer*).

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
