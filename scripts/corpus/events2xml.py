"""Turn the note events LilyPond writes with listener.ly into MusicXML for PianoSRS.

The events are LilyPond's own interpretation of the score, so pitches (spelled), rhythms, ties, tuplets, clefs, keys and
time signatures are exactly what it would engrave. This writes them back out as a two-staff MusicXML part:

- Measures come from each event's position in its bar (a pickup bar is kept short).
- Voices: within each bar, each staff's LilyPond voices that have notes become MusicXML voices 1–4 (staff 1) and 5–8
  (staff 2), highest first; a voice with only rests is dropped when another voice in that bar has notes.
- Gaps inside a voice (spacer rests) become <forward>; notes crossing a barline are split and tied.
- Grace notes, dynamics, slurs and articulations are left out: PianoSRS doesn't use them.

Raises Unsupported for scores the app can't represent: not exactly two staves, or rhythms finer than the app's grid
(24 ticks a quarter: no quintuplets or 64ths).
"""
from __future__ import annotations

import sys
from collections import defaultdict
from dataclasses import dataclass, field
from fractions import Fraction as F
from xml.sax.saxutils import escape

TPQ = 24
WHOLE = 4 * TPQ
STEPS = 'CDEFGAB'
TYPES = {0: 'whole', 1: 'half', 2: 'quarter', 3: 'eighth', 4: '16th', 5: '32nd', 6: '64th'}
SEMITONE = [0, 2, 4, 5, 7, 9, 11]


class Unsupported(Exception):
    pass


def ticks(r: F) -> int:
    t = r * WHOLE
    if t.denominator != 1:
        raise Unsupported(f'rhythm finer than the app supports ({r} of a whole note)')
    return int(t)


@dataclass
class Ev:
    kind: str
    staff: int
    voice: int
    time: int
    bar: int
    pos: int
    step: int = 0
    alter: F = F(0)
    octave: int = 0
    log: int = 2
    dots: int = 0
    scale: F = F(1)
    length: int = 0
    clef: str = 'clefs.G:-2'
    fifths: int = 0
    meter: str = '4/4'
    tie: bool = False
    tied_over: bool = False

    @property
    def midi(self) -> int:
        return 12 * (self.octave + 5) + SEMITONE[self.step] + int(self.alter * 2)

    @property
    def end(self) -> int:
        return self.time + self.length


def read_scores(path: str) -> dict[int, tuple[list[Ev], set[tuple[int, int]]]]:
    """The events of each score in the file (a file can hold several pieces or movements)."""
    lines: dict[int, list[list[str]]] = defaultdict(list)
    for line in open(path, encoding='utf-8'):
        f = line.rstrip('\n').split('\t')
        if len(f) < 8 or (f[0] != 'tie' and len(f) < 17):
            continue  # an incomplete last line
        lines[int(f[1])].append([f[0]] + f[2:])
    return {k: parse_events(v) for k, v in sorted(lines.items())}


def parse_events(rows: list[list[str]]) -> tuple[list[Ev], set[tuple[int, int]]]:
    events: list[Ev] = []
    ties: set[tuple[int, int]] = set()
    for f in rows:
        kind, staff, voice, time, bar, pos = f[0], int(f[1]), int(f[2]), ticks(F(f[3])), int(f[4]), ticks(F(f[5]))
        if kind == 'tie':
            ties.add((voice, time))
            continue
        step, alter, octave, log, dots, scale, length, clef, fifths, meter = f[6:16]
        events.append(
            Ev(
                kind,
                staff,
                voice,
                time,
                bar,
                pos,
                int(step) if step else 0,
                F(alter) if alter else F(0),
                int(octave) if octave else 0,
                int(log),
                int(dots),
                F(scale),
                ticks(F(length)),
                clef,
                int(fifths),
                meter,
            )
        )
    return events, ties


def mark_ties(events: list[Ev], ties: set[tuple[int, int]]) -> None:
    """A tie event belongs to the notes its voice starts at that moment; the next note of the same pitch that starts
    when one ends is held over from it."""
    by_voice: dict[int, list[Ev]] = defaultdict(list)
    for e in events:
        if e.kind == 'note':
            by_voice[e.voice].append(e)
    for notes in by_voice.values():
        starts: dict[tuple[int, int], Ev] = {(n.time, n.midi): n for n in notes}
        for n in notes:
            if (n.voice, n.time) in ties:
                nxt = starts.get((n.end, n.midi))
                if nxt:
                    n.tie = True
                    nxt.tied_over = True


@dataclass
class Measure:
    start: int
    length: int
    meter: str
    fifths: int
    implicit: bool = False
    clefs: dict[int, str] = field(default_factory=dict)


def build_measures(events: list[Ev]) -> list[Measure]:
    starts: dict[int, Ev] = {}
    for e in events:
        if e.pos < 0:
            # A pickup (anacrusis): LilyPond counts its position down to the barline, so it starts a short bar that
            # ends at time - pos. At the start of a piece that bar begins at 0.
            num, den = map(int, e.meter.split('/'))
            start = max(0, (e.time - e.pos) - WHOLE * num // den)
        else:
            start = e.time - e.pos
        starts.setdefault(start, e)
    order = sorted(starts)
    end = max(e.end for e in events)
    measures = []
    for i, s in enumerate(order):
        nxt = order[i + 1] if i + 1 < len(order) else end
        first = starts[s]
        num, den = map(int, first.meter.split('/'))
        full = WHOLE * num // den
        start = max(0, s)
        length = nxt - start
        if length <= 0:
            continue
        measures.append(Measure(start, length, first.meter, first.fifths, implicit=(s < 0 or (i == 0 and length < full))))
    return measures


def split_value(t: int) -> list[tuple[int, int, int]]:
    """A plain (non-tuplet) length in ticks as note values: (ticks, log, dots), longest first."""
    out = []
    values = []
    for log in range(0, 6):
        base = WHOLE >> log
        for dots in (2, 1, 0):
            v = base * (2 - F(1, 2**dots)) if dots else F(base)
            if v.denominator == 1:
                values.append((int(v), log, dots))
    values.sort(reverse=True)
    while t > 0:
        for v, log, dots in values:
            if v <= t:
                out.append((v, log, dots))
                t -= v
                break
        else:
            raise Unsupported(f'cannot write a length of {t} ticks')
    return out


def pitch_xml(e: Ev) -> str:
    alter = float(e.alter * 2)
    a = f'<alter>{int(alter) if alter == int(alter) else alter}</alter>' if alter else ''
    return f'<pitch><step>{STEPS[e.step]}</step>{a}<octave>{e.octave + 4}</octave></pitch>'


def clef_xml(staff_no: int, clef: str) -> str:
    glyph, pos = clef.split(':')
    pos = int(pos)
    sign = {'clefs.G': 'G', 'clefs.F': 'F', 'clefs.C': 'C', 'clefs.percussion': 'percussion'}.get(glyph.split('_')[0], 'G')
    line = 3 + pos // 2
    return f'<clef number="{staff_no}"><sign>{sign}</sign><line>{line}</line></clef>'


def final_mode(events: list[Ev], measures: list[Measure]):
    """Major or minor, from how the piece ends: classical pieces end on their keynote, so a lowest final note on the
    relative minor's keynote means the key signature is minor. Applies to the signature the piece ends in; any other
    signature in the piece is taken as major."""
    notes = [e for e in events if e.kind == 'note']
    last_start = max(e.time for e in notes)
    bass = min((e for e in notes if e.time == last_start), key=lambda e: e.midi)
    end_fifths = measures[-1].fifths
    minor_tonic = (end_fifths * 7 + 9) % 12
    ends_minor = bass.midi % 12 == minor_tonic
    return lambda fifths: 'minor' if ends_minor and fifths == end_fifths else 'major'


def convert(events: list[Ev], ties: set[tuple[int, int]], meta: dict[str, str]) -> str:
    staves = sorted({e.staff for e in events})
    if len(staves) != 2:
        raise Unsupported(f'{len(staves)} staves')
    # The upper staff is the one with the higher notes.
    mean = {s: sum(e.midi for e in events if e.staff == s and e.kind == 'note') / max(1, sum(1 for e in events if e.staff == s and e.kind == 'note')) for s in staves}
    top, bottom = sorted(staves, key=lambda s: -mean[s])
    staff_no = {top: 1, bottom: 2}
    mark_ties(events, ties)
    measures = build_measures(events)

    # Notes that run past their barline are split at it, tied.
    pieces: list[Ev] = []
    bounds = [m.start for m in measures] + [measures[-1].start + measures[-1].length]
    for e in events:
        cut = next((b for b in bounds if e.time < b < e.end), None)
        if cut is None:
            pieces.append(e)
            continue
        if e.scale != 1:
            raise Unsupported('tuplet across a barline')
        t = e.time
        parts = []
        for b in [b for b in bounds if e.time < b < e.end] + [e.end]:
            for v, log, dots in split_value(b - t):
                parts.append(Ev(**{**e.__dict__, 'time': t, 'length': v, 'log': log, 'dots': dots, 'tie': True, 'tied_over': True}))
                t += v
        parts[0].tied_over = e.tied_over
        parts[-1].tie = e.tie
        if e.kind == 'rest':
            for p in parts:
                p.tie = p.tied_over = False
        pieces.extend(parts)

    def measure_of(t: int) -> int:
        lo, hi = 0, len(measures) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if measures[mid].start <= t:
                lo = mid
            else:
                hi = mid - 1
        return lo

    cells: dict[tuple[int, int], dict[int, list[Ev]]] = defaultdict(lambda: defaultdict(list))
    for e in pieces:
        cells[(measure_of(e.time), staff_no[e.staff])][e.voice].append(e)

    mode_of = final_mode(pieces, measures)
    out: list[str] = ['<?xml version="1.0" encoding="UTF-8"?>', '<score-partwise version="4.0">']
    out.append(f'<work><work-title>{escape(meta.get("title", ""))}</work-title></work>')
    rights = escape(meta.get('rights', ''))
    out.append(
        f'<identification><creator type="composer">{escape(meta.get("composer", ""))}</creator>'
        f'<rights>{rights}</rights><encoding><software>PianoSRS corpus converter (LilyPond events)</software></encoding></identification>'
    )
    out.append('<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">')
    prev_meter, prev_fifths = None, None
    clef_now: dict[int, str] = {}
    for mi, m in enumerate(measures):
        out.append(f'<measure number="{mi if measures[0].implicit else mi + 1}"{" implicit=\"yes\"" if m.implicit and mi == 0 else ""}>')
        attrs = []
        if mi == 0:
            attrs.append(f'<divisions>{TPQ}</divisions>')
        if m.fifths != prev_fifths:
            attrs.append(f'<key><fifths>{m.fifths}</fifths><mode>{mode_of(m.fifths)}</mode></key>')
        if m.meter != prev_meter:
            num, den = m.meter.split('/')
            attrs.append(f'<time><beats>{num}</beats><beat-type>{den}</beat-type></time>')
        if mi == 0:
            attrs.append('<staves>2</staves>')
        prev_meter, prev_fifths = m.meter, m.fifths
        # Clefs at the start of the bar: each staff's first event's clef.
        for s in (1, 2):
            first = min((e for v in cells[(mi, s)].values() for e in v), key=lambda e: e.time, default=None)
            if first and clef_now.get(s) != first.clef:
                attrs.append(clef_xml(s, first.clef))
                clef_now[s] = first.clef
        if attrs:
            out.append('<attributes>' + ''.join(attrs) + '</attributes>')

        pos = m.start
        for s in (1, 2):
            voices = cells[(mi, s)]
            with_notes = {v: es for v, es in voices.items() if any(e.kind == 'note' for e in es)}
            chosen = with_notes or voices
            lanes = sorted(chosen.items(), key=lambda kv: -sum(e.midi for e in kv[1] if e.kind == 'note') / max(1, sum(1 for e in kv[1] if e.kind == 'note')))
            if not lanes:
                continue
            for li, (_, es) in enumerate(lanes[:4]):
                vno = li + 1 + (4 if s == 2 else 0)
                stem = '' if len(lanes) == 1 else f'<stem>{"up" if li == 0 else "down"}</stem>'
                if pos != m.start:
                    out.append(f'<backup><duration>{pos - m.start}</duration></backup>')
                    pos = m.start
                es = sorted(es, key=lambda e: (e.time, -e.midi if e.kind == 'note' else 0))
                last_start = None
                tuplet_left = 0
                for e in es:
                    if e.time == last_start and e.kind == 'note':
                        chord = '<chord/>'
                    else:
                        chord = ''
                        if e.time > pos:
                            out.append(f'<forward><duration>{e.time - pos}</duration><voice>{vno}</voice><staff>{s}</staff></forward>')
                            pos = e.time
                        elif e.time < pos:
                            continue  # overlapping notes in one voice: keep the first
                        last_start = e.time
                    if e.time != m.start and e.clef != clef_now.get(s) and not chord:
                        out.append(f'<attributes>{clef_xml(s, e.clef)}</attributes>')
                        clef_now[s] = e.clef
                    notations = []
                    if e.kind == 'note':
                        body = pitch_xml(e)
                    else:
                        body = '<rest/>'
                    ties_xml = ''
                    if e.tied_over:
                        ties_xml += '<tie type="stop"/>'
                        notations.append('<tied type="stop"/>')
                    if e.tie:
                        ties_xml += '<tie type="start"/>'
                        notations.append('<tied type="start"/>')
                    tm = ''
                    if e.scale != 1:
                        normal, actual = e.scale.numerator, e.scale.denominator
                        tm = f'<time-modification><actual-notes>{actual}</actual-notes><normal-notes>{normal}</normal-notes></time-modification>'
                        if not chord:
                            if tuplet_left <= 0:
                                notations.append('<tuplet type="start"/>')
                                tuplet_left = e.length * actual  # a group spans `actual` notes of this (played) length
                            tuplet_left -= e.length
                            if tuplet_left <= 0:
                                notations.append('<tuplet type="stop"/>')
                    dots = '<dot/>' * e.dots
                    note_type = TYPES.get(e.log, 'quarter')
                    nots = f'<notations>{"".join(notations)}</notations>' if notations else ''
                    out.append(
                        f'<note>{chord}{body}<duration>{e.length}</duration>{ties_xml}<voice>{vno}</voice>'
                        f'<type>{note_type}</type>{dots}{tm}{stem}<staff>{s}</staff>{nots}</note>'
                    )
                    if not chord:
                        pos = e.end
        out.append('</measure>')
    out.append('</part></score-partwise>')
    return '\n'.join(out)


if __name__ == '__main__':
    events, ties = read_scores(sys.argv[1])[0]
    meta = dict(kv.split('=', 1) for kv in sys.argv[3:])
    open(sys.argv[2], 'w', encoding='utf-8').write(convert(events, ties, meta))
