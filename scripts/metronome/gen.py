"""Modal synthesis of mechanical metronome clicks. Each click: an impulse/noise transient exciting a few damped
resonant modes (the wooden case), optional bell for the accent, then a small-room ambience."""
import numpy as np, sys, os
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
rng = np.random.default_rng(7)

def modes(freqs, decays_ms, amps, dur=0.25, detune=0.0):
    t = np.arange(int(SR * dur)) / SR
    out = np.zeros_like(t)
    for f, d, a in zip(freqs, decays_ms, amps):
        f = f * (1 + detune * rng.uniform(-1, 1))
        out += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi)) * np.exp(-t / (d / 1000))
    return out

def case(lo, hi, n, decay_k, tilt, seed, dur=0.25, detune=0.004):
    """A wooden case: many resonant modes spread log-uniformly between lo and hi Hz. Lower modes ring longer and
    louder (decay ~ k * (1000/f)^0.7 ms, amplitude ~ f^-tilt), as in a real hollow wooden box."""
    r = np.random.default_rng(seed)
    f = np.exp(r.uniform(np.log(lo), np.log(hi), n))
    d = decay_k * (1000 / f) ** 0.7
    a = f ** -tilt * r.uniform(0.4, 1.0, n)
    return modes(f, d, a / a.max(), dur, detune)

def noise_burst(ms, lo, hi, dur=0.25):
    n = np.zeros(int(SR * dur))
    k = int(SR * ms / 1000)
    burst = rng.standard_normal(k) * np.exp(-np.arange(k) / (k / 4))
    sos = butter(2, [lo, hi], btype='band', fs=SR, output='sos')
    n[:k] = sosfilt(sos, burst)
    return n

def room(x, amount=0.12, size=0.18):
    """A small wooden room: dense early reflections fading over ~size seconds."""
    amount *= 0.45
    n = int(SR * size * 0.7)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (n / 9))
    ir = sosfilt(butter(1, 3500, fs=SR, output='sos'), ir)
    ir[0] = 0
    wet = fftconvolve(x, ir)[: len(x)]
    wet /= np.max(np.abs(wet)) + 1e-9
    return x + amount * wet * np.max(np.abs(x))

def norm(x, peak=0.8):
    return x / (np.max(np.abs(x)) + 1e-9) * peak

def bell(f0=2350, dur=0.9):
    # A small struck bell: inharmonic partials, the higher ones dying faster.
    ratios = [1.0, 2.72, 5.16, 8.43]
    t = np.arange(int(SR * dur)) / SR
    out = np.zeros_like(t)
    for r, d, a in zip(ratios, [520, 260, 120, 60], [1.0, 0.45, 0.25, 0.12]):
        out += a * np.sin(2 * np.pi * f0 * r * t) * np.exp(-t / (d / 1000))
    out[: int(SR * 0.002)] *= np.linspace(0, 1, int(SR * 0.002))
    return out

def pad(x, n):
    y = np.zeros(n)
    y[: min(n, len(x))] = x[:n]
    return y

# --- The voices -------------------------------------------------------------------------------------------------
def wittner(accent, i):
    """Wooden pyramid (Wittner/Maelzel style): a hollow 'tock' from the case, with the bell on the downbeat."""
    body = case(380, 6000, 28, 30, 0.55, seed=11) + 0.6 * modes([520, 1180], [40, 22], [1.0, 0.5])
    click = noise_burst(1.6, 1500, 7000)
    x = 0.9 * body + 0.8 * click
    x *= 1 + 0.06 * (1 if i % 2 else -1)  # the pendulum's two swings differ slightly: tick-tock
    if accent:
        x = pad(x, int(SR * 0.9)) + 0.32 * bell()
    return room(x, 0.10)

def clockwork(accent, i):
    """Clockwork escapement (Seth Thomas style): a drier, sharper double click, lower body; accent a bit fuller."""
    d = int(SR * 0.0035)  # pallet strike, then the escape wheel landing 3.5 ms later
    a = case(600, 8000, 24, 14, 0.35, seed=21, dur=0.2) + 0.9 * noise_burst(1.0, 2500, 9000, 0.2)
    b = case(600, 8000, 24, 10, 0.35, seed=22, dur=0.2) + 0.5 * noise_burst(0.8, 3000, 9000, 0.2)
    x = a.copy()
    x[d:] += 0.55 * b[: len(x) - d]
    x *= 1 + 0.08 * (1 if i % 2 else -1)
    if accent:
        x *= 1.35
    return room(x, 0.08, 0.14)

def woodblock(accent, i):
    """Orchestral woodblock: a hollow, pitched knock; the accent on the higher-pitched side of the block."""
    f = 1350 if accent else 980
    x = modes([f, f * 2.3, f * 3.9], [60, 25, 10], [1.0, 0.35, 0.15], dur=0.3) + 0.25 * case(700, 7000, 16, 10, 0.4, seed=31, dur=0.3) + 0.5 * noise_burst(1.0, 800, 6000, 0.3)
    return room(x, 0.12)

def digital(accent, i):
    """The current click: a sine beep, for comparison."""
    t = np.arange(int(SR * 0.08)) / SR
    f = 1600 if accent else 1000
    env = np.minimum(t / 0.002, 1) * np.exp(-t / 0.012)
    return np.sin(2 * np.pi * f * t) * env

VOICES = {'A-wooden-pyramid': wittner, 'B-clockwork': clockwork, 'C-woodblock': woodblock, 'Z-current-digital': digital}

def demo(fn, bpm=96, bars=3, beats=4):
    beat = int(SR * 60 / bpm)
    total = beat * beats * bars + SR
    out = np.zeros(total)
    for i in range(beats * bars):
        c = fn(i % beats == 0, i)
        f = int(SR * 0.012)
        c[-f:] *= np.linspace(1, 0, f)  # no click where the sound is cut off
        s = i * beat
        out[s : s + len(c)] += c[: total - s]
    return norm(out)

if __name__ == '__main__':
    outdir = sys.argv[1]
    for name, fn in VOICES.items():
        wavfile.write(os.path.join(outdir, f'{name}.wav'), SR, (demo(fn) * 32767).astype(np.int16))
    print('ok')

def thump(f=210, ms=9, dur=0.2):
    """A short, dull low knock: the mass of the mechanism hitting, not a resonance."""
    t = np.arange(int(SR * dur)) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t / (ms / 1000)) * np.minimum(t / 0.0006, 1)

def clockwork_solid(accent, i, damp=0.5, weight=0.0, second=0.22, gap_ms=6.0, roomy=0.05):
    """Clockwork, made more solid: the case rings less (damp scales its decays), the second click is quieter and
    further away (so the two don't comb-filter into a hollow sound), and an optional low knock adds weight."""
    d = int(SR * gap_ms / 1000)
    a = case(600, 8000, 32, 14 * damp, 0.3, seed=21, dur=0.2) + 1.1 * noise_burst(0.9, 1800, 9000, 0.2)
    b = case(900, 8000, 20, 9 * damp, 0.3, seed=42, dur=0.2) + 0.6 * noise_burst(0.6, 3500, 9000, 0.2)
    x = a + weight * thump()
    x[d:] += second * b[: len(x) - d]
    x *= 1 + 0.08 * (1 if i % 2 else -1)
    if accent:
        x *= 1.35
    return room(x, roomy, 0.12) if roomy else x

VARIANTS = {
    'B1-clockwork-tighter': lambda a, i: clockwork_solid(a, i, damp=0.55, weight=0.0),
    'B2-clockwork-solid': lambda a, i: clockwork_solid(a, i, damp=0.45, weight=0.55),
    'B3-clockwork-dense-dry': lambda a, i: clockwork_solid(a, i, damp=0.35, weight=0.8, second=0.15, roomy=0.0),
}

if __name__ == '__main__' and len(sys.argv) > 2 and sys.argv[2] == 'variants':
    for name, fn in VARIANTS.items():
        wavfile.write(os.path.join(sys.argv[1], f'{name}.wav'), SR, (demo(fn) * 32767).astype(np.int16))
    print('variants ok')

def struck_bell(f0, ratios, decays_ms, amps, beat_hz, strike, dur=1.6):
    """A struck bell: inharmonic partials, each a slightly detuned pair (a real bell isn't perfectly round, so its
    partials beat), higher partials dying faster, and a short metallic strike transient from the hammer."""
    t = np.arange(int(SR * dur)) / SR
    out = np.zeros_like(t)
    for k, (r, d, a) in enumerate(zip(ratios, decays_ms, amps)):
        f = f0 * r
        bh = beat_hz * (1 + 0.6 * k)
        env = np.exp(-t / (d / 1000))
        out += a * env * (np.sin(2 * np.pi * f * t) + 0.7 * np.sin(2 * np.pi * (f + bh) * t + 0.9))
    hit = noise_burst(0.7, f0 * 1.5, min(16000, f0 * 6), dur)
    out = out / np.max(np.abs(out)) + strike * hit / (np.max(np.abs(hit)) + 1e-9)
    out[: int(SR * 0.001)] *= np.linspace(0, 1, int(SR * 0.001))
    return out

BELLS = {
    # Classic small bell on a wooden pyramid metronome: bright, a clear ding, rings about half a second.
    'classic': lambda: struck_bell(2280, [1.0, 2.76, 5.40, 8.93], [420, 200, 90, 45], [1.0, 0.42, 0.22, 0.1], 1.6, 0.18),
    # Antique brass bell: lower and warmer, a longer, rounder ring.
    'brass': lambda: struck_bell(1420, [1.0, 2.0, 2.92, 4.16, 5.43], [900, 520, 300, 160, 90], [1.0, 0.5, 0.35, 0.2, 0.1], 1.1, 0.12, dur=2.2),
    # Little spring-struck bell: high and tinny, a quick 'ting'.
    'ting': lambda: struck_bell(3350, [1.0, 2.41, 4.62], [190, 90, 40], [1.0, 0.35, 0.15], 2.5, 0.28, dur=0.9),
}

def with_bell(kind, level=0.3):
    bell = BELLS[kind]()
    def fn(accent, i):
        x = clockwork_solid(accent, i, damp=0.55, weight=0.0)
        if not accent:
            return x
        y = pad(x, len(bell))
        return y + level * bell * np.max(np.abs(x))
    return fn

if __name__ == '__main__' and len(sys.argv) > 2 and sys.argv[2] == 'bells':
    for kind in BELLS:
        wavfile.write(os.path.join(sys.argv[1], f'B1-bell-{kind}.wav'), SR, (demo(with_bell(kind)) * 32767).astype(np.int16))
    print('bells ok')
