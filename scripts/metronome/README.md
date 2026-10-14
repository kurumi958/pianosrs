# Metronome sounds

`public/metronome/` holds the metronome's tick (two pendulum swings) and its bell, synthesised rather than recorded:

- **Tick** (`tick-1.wav`, `tick-2.wav`): a clockwork escapement. A short noise transient (the pallet striking) excites a
  wooden case modelled as ~30 damped resonances spread between 600 Hz and 8 kHz, with lower ones ringing longer; a quieter,
  brighter second click lands 6 ms later (the escape wheel), then a little small-room ambience. The two files differ
  slightly, as a real pendulum's two swings do. (`clockwork_solid(damp=0.55)` in `gen.py`, "B1".)
- **Bell** (`bell.wav`): a small spring-struck bell ("ting"): three inharmonic partials from 3.35 kHz, each a slightly
  detuned pair so it wavers like a real bell, plus a hammer transient. Mixed at 0.3 of the tick's level.

Regenerate with `python3 scripts/metronome/export.py public/metronome` (needs numpy and scipy). `gen.py` also has the other
candidates that were auditioned: a wooden pyramid metronome with a bell, a woodblock, more solid clockwork variants and two
other bells; `python3 scripts/metronome/gen.py <dir> [variants|bells]` writes demos of them.
