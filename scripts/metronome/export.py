"""Write the metronome's sounds: the B1 clockwork tick (two pendulum swings) and the 'ting' bell, as short mono WAVs.
Levels are relative to each other: the tick peaks at 0.6; the bell is mixed as in the demo (0.3 of the tick's peak)."""
import sys, os
import numpy as np
from scipy.io import wavfile
sys.path.insert(0, os.path.dirname(__file__))
import gen

out = sys.argv[1]
SR = gen.SR
ticks = [gen.clockwork_solid(False, i, damp=0.55, weight=0.0) for i in (0, 1)]
peak = max(np.max(np.abs(t)) for t in ticks)
bell = gen.BELLS['ting']()
bell = bell / np.max(np.abs(bell)) * 0.3 * 0.6

def write(name, x):
    x = x.copy()
    f = int(SR * 0.012)
    x[-f:] *= np.linspace(1, 0, f)
    wavfile.write(os.path.join(out, name), SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))

for k, t in enumerate(ticks):
    write(f'tick-{k + 1}.wav', t / peak * 0.6)
write('bell.wav', bell)
print('written')
