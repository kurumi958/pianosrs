"""Convert every LilyPond score under some Mutopia folders and report what came out, to choose pieces from.

  python3 scan.py <mutopia checkout> <lilypond bin dir> <work dir> <folder under ftp/> [...]

For each .ly file (skipping MIDI-only variants and include files) it updates the syntax with convert-ly, runs LilyPond
with listener.ly, converts each score in it with events2xml.py, and writes <work>/xml/<name>-<n>.xml plus a line in
<work>/report.jsonl: header fields (title, composer, opus, licence…), bars, key, meter, notes per hand, the fastest
note, the most notes at once in a hand, or why it couldn't be converted.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(__file__))
import events2xml as ex  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LISTENER = os.path.join(HERE, 'listener.ly')


def header(text: str) -> dict[str, str]:
    out = {}
    m = re.search(r'\\header\s*{(.*?)\n\s*}', text, re.S)
    body = m.group(1) if m else text
    for key in ('title', 'subtitle', 'composer', 'opus', 'piece', 'license', 'copyright', 'source', 'style', 'mutopiatitle', 'mutopiaopus', 'date', 'mutopiainstrument', 'meter', 'footer'):
        mm = re.search(rf'^\s*{key}\s*=\s*"((?:[^"\\]|\\.)*)"', body, re.M)
        if mm:
            out[key] = mm.group(1)
    return out


def stats(events: list[ex.Ev]) -> dict:
    notes = [e for e in events if e.kind == 'note']
    per_staff = {}
    for e in notes:
        per_staff[e.staff] = per_staff.get(e.staff, 0) + 1
    at_once = {}
    for e in notes:
        at_once[(e.staff, e.time)] = at_once.get((e.staff, e.time), 0) + 1
    return {
        'notes': len(notes),
        'fastest': min((e.length for e in notes), default=0),
        'max_chord': max(at_once.values(), default=0),
        'tuplets': sum(1 for e in notes if e.scale != 1),
        'low': min((e.midi for e in notes), default=0),
        'high': max((e.midi for e in notes), default=0),
    }


def run_one(ly: str, root: str, bindir: str, work: str) -> list[dict]:
    rel = os.path.relpath(ly, root)
    name = re.sub(r'[^A-Za-z0-9]+', '-', os.path.splitext(rel.replace('ftp/', ''))[0]).strip('-')
    tmp = os.path.join(work, 'tmp', name)
    ev = os.path.join(tmp, 'out.events')
    if os.environ.get('REUSE') and os.path.exists(ev):
        # Convert again from the events LilyPond already wrote (after a converter fix).
        return convert_events(ev, {'file': rel, 'name': name, **header(open(ly, encoding='utf-8', errors='replace').read())}, name, work)
    shutil.rmtree(tmp, ignore_errors=True)
    try:
        shutil.copytree(os.path.dirname(ly), tmp, symlinks=True)
    except shutil.Error:
        pass  # a missing extra (a Makefile left out of the checkout): the score files are copied
    src = os.path.join(tmp, os.path.basename(ly))
    text = open(src, encoding='utf-8', errors='replace').read()
    meta = header(text)
    base = {'file': rel, 'name': name, **meta}
    subprocess.run([os.path.join(bindir, 'convert-ly'), '-e', src], cwd=tmp, capture_output=True, timeout=120)
    text = open(src, encoding='utf-8', errors='replace').read()
    open(src, 'w', encoding='utf-8').write(f'\\include "{LISTENER}"\n' + text)
    r = subprocess.run(
        [os.path.join(bindir, 'lilypond'), '-dno-print-pages', '-dbackend=null', '-o', 'out', os.path.basename(src)],
        cwd=tmp,
        capture_output=True,
        text=True,
        timeout=600,
        # LilyPond's garbage collector can crash mid-piece once the listener allocates enough (a segfault or
        # floating point exception, at a different bar each run); one piece needs only a few hundred MB without it.
        env={**os.environ, 'GC_DONT_GC': '1'},
    )
    if r.returncode < 0:
        return [{**base, 'error': f'LilyPond crashed (signal {-r.returncode})'}]
    if not os.path.exists(ev):
        err = (r.stderr or '').strip().splitlines()
        return [{**base, 'error': 'no events: ' + ' | '.join(l for l in err if 'rror' in l)[:300]}]
    return convert_events(ev, base, name, work)


def convert_events(ev: str, base: dict, name: str, work: str) -> list[dict]:
    rows = []
    for idx, (events, ties) in ex.read_scores(ev).items():
        row = {**base, 'score': idx}
        try:
            st = stats(events)
            xml = ex.convert(events, ties, {'title': base.get('title', ''), 'composer': base.get('composer', ''), 'rights': base.get('license') or base.get('copyright', '')})
            out = os.path.join(work, 'xml', f'{name}-{idx}.xml')
            open(out, 'w', encoding='utf-8').write(xml)
            ms = ex.build_measures(events)
            row.update(st, bars=len(ms), meter=ms[0].meter, fifths=ms[0].fifths, xml=out)
        except Exception as e:  # noqa: BLE001
            row['error'] = f'{type(e).__name__}: {e}'
        rows.append(row)
    return rows


def _safe(ly, root, bindir, work):
    try:
        return run_one(ly, root, bindir, work)
    except Exception as e:  # noqa: BLE001
        return [{'file': os.path.relpath(ly, root), 'error': f'{type(e).__name__}: {e}'}]


if __name__ == '__main__':
    root, bindir, work, *folders = sys.argv[1:]
    os.makedirs(os.path.join(work, 'xml'), exist_ok=True)
    files = []
    for f in folders:
        if f.endswith('.ly'):
            files.append(os.path.join(root, f))  # a single file, e.g. to retry it
            continue
        for dp, _, fs in os.walk(os.path.join(root, 'ftp', f)):
            for x in fs:
                if x.endswith('.ly') and 'midi' not in x.lower() and '-lyt-' not in x:
                    files.append(os.path.join(dp, x))
    files.sort()
    with ThreadPoolExecutor(max_workers=int(os.environ.get('JOBS', '6'))) as pool, open(os.path.join(work, 'report.jsonl'), 'a') as rep:
        for rows in pool.map(lambda ly: _safe(ly, root, bindir, work), files):
            for row in rows:
                rep.write(json.dumps(row, ensure_ascii=False) + '\n')
                rep.flush()
                print(row.get('name'), row.get('score', ''), row.get('error', f"{row.get('bars')} bars, {row.get('notes')} notes"), flush=True)

