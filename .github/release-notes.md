A prototype of PianoSRS as a desktop app. It's the same app as the web version, in its own window, with your progress saved on this computer.

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
