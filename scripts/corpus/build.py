"""Bundle the pieces chosen in pieces.py into the app: public/songs/<id>.mxl and public/songs/index.json.

  python3 build.py <mutopia checkout> <scan work dir> <app public/songs dir>

Reads <scan work dir>/report.jsonl and xml/ (written by scan.py), sets each piece's title and composer, records its
licence and Mutopia page, and writes a compressed MusicXML file per piece plus the index the app loads at start-up.
Pieces that didn't convert, or whose licence can't be found, are left out and listed.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
import zipfile
from html import escape

sys.path.insert(0, os.path.dirname(__file__))
from pieces import COMPOSER_OF, COMPOSERS, PIECES  # noqa: E402

CONTAINER = (
    '<?xml version="1.0" encoding="UTF-8"?>\n<container><rootfiles>'
    '<rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>\n'
)

# Licence texts and URLs found in Mutopia files, and the name the app shows.
LICENCES = [
    (r'by-sa/4\.0|ShareAlike 4\.0|Share-Alike 4\.0', 'CC BY-SA 4.0'),
    (r'by-sa/3\.0|ShareAlike 3\.0', 'CC BY-SA 3.0'),
    (r'by-sa/2\.5|ShareAlike 2\.5', 'CC BY-SA 2.5'),
    (r'licenses/by/3\.0|Attribution 3\.0', 'CC BY 3.0'),
    (r'licenses/by/4\.0|Attribution 4\.0', 'CC BY 4.0'),
    (r'Public Domain|publicdomain', 'Public domain'),
]

KEYS_MAJOR = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯']
KEYS_MINOR = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯']


def licence(ly: str) -> str | None:
    """The engraving's licence: from the file's header, else anywhere in it or the files beside it."""
    texts = [open(ly, encoding='utf-8', errors='replace').read()]
    folder = os.path.dirname(ly)
    texts += [open(f, encoding='utf-8', errors='replace').read() for f in sorted(glob.glob(os.path.join(folder, '*.ly'))) if f != ly]
    for text in texts:
        m = re.search(r'^\s*(?:license|copyright)\s*=\s*"([^"]+)"', text, re.M)
        candidates = [m.group(1)] if m else []
        candidates.append(text)
        for c in candidates:
            for pattern, name in LICENCES:
                if re.search(pattern, c, re.I):
                    return name
    return None


def mutopia_id(ly: str) -> str | None:
    for f in [ly, *glob.glob(os.path.join(os.path.dirname(ly), '*.ly'))]:
        m = re.search(r'Mutopia-\d{4}/\d\d/\d\d-(\d+)', open(f, encoding='utf-8', errors='replace').read())
        if m:
            return m.group(1)
    return None


def title_mode(title: str, xml: str) -> str:
    """Correct the score's major/minor (guessed from how it ends, which a major last chord can fool) when the title
    names the key: "Fugue No. 2 in C minor"."""
    m = re.search(r'\bin ([A-G][♭♯]?)( minor| major)?\b', title)
    k = re.search(r'<fifths>(-?\d+)</fifths>', xml)
    if not m or not k:
        return xml
    fifths = int(k.group(1))
    tonic = m.group(1)
    mode = 'minor' if m.group(2) == ' minor' or (not m.group(2) and tonic == KEYS_MINOR[fifths + 7] and tonic != KEYS_MAJOR[fifths + 7]) else 'major'
    if tonic != (KEYS_MINOR if mode == 'minor' else KEYS_MAJOR)[fifths + 7]:
        return xml  # the title's key isn't the one the piece starts in
    return re.sub(rf'<fifths>{fifths}</fifths><mode>\w+</mode>', f'<fifths>{fifths}</fifths><mode>{mode}</mode>', xml)


def key_name(xml: str) -> str:
    m = re.search(r'<fifths>(-?\d+)</fifths>(?:<mode>(\w+)</mode>)?', xml)
    if not m:
        return ''
    fifths, mode = int(m.group(1)), m.group(2) or 'major'
    return f'{KEYS_MINOR[fifths + 7]} minor' if mode == 'minor' else f'{KEYS_MAJOR[fifths + 7]} major'


def main(root: str, work: str, out: str) -> None:
    rows = {}
    for line in open(os.path.join(work, 'report.jsonl'), encoding='utf-8'):
        r = json.loads(line)
        if 'name' in r:
            rows[(r['name'], r.get('score', 0))] = r
    os.makedirs(out, exist_ok=True)
    for old in glob.glob(os.path.join(out, '*.mxl')):
        os.remove(old)
    index, skipped, ids = [], [], set()
    for collection, entries in PIECES:
        for name, score, pid, title, level, about in entries:
            assert pid not in ids, f'duplicate id {pid}'
            ids.add(pid)
            r = rows.get((name, score))
            if not r or 'error' in r:
                skipped.append(f'{pid}: {r["error"] if r else "not converted"}')
                continue
            ly = os.path.join(root, r['file'])
            lic = licence(ly)
            if not lic:
                skipped.append(f'{pid}: no licence found')
                continue
            composer = COMPOSER_OF.get(pid) or COMPOSERS[name.split('-')[0]]
            xml = title_mode(title, open(r['xml'], encoding='utf-8').read())
            xml = re.sub(r'<work-title>.*?</work-title>', f'<work-title>{escape(title)}</work-title>', xml, count=1)
            xml = re.sub(r'<creator type="composer">.*?</creator>', f'<creator type="composer">{escape(composer)}</creator>', xml, count=1)
            xml = re.sub(r'<rights>.*?</rights>', f'<rights>{escape(lic)} (Mutopia Project)</rights>', xml, count=1)
            file = f'{pid}.mxl'
            with zipfile.ZipFile(os.path.join(out, file), 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
                z.writestr('META-INF/container.xml', CONTAINER)
                z.writestr('score.xml', xml)
            mid = mutopia_id(ly)
            index.append({
                'id': pid,
                'title': title,
                'composer': composer,
                'collection': collection,
                'level': level,
                'about': about,
                'key': key_name(xml),
                'meter': r['meter'],
                # Counted as the app does: a pickup isn't a bar.
                'bars': r['bars'] - (1 if re.search(r'<measure number="[^"]*" implicit="yes"', xml[:2000]) else 0),
                'license': lic,
                'source': f'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id={mid}' if mid else 'https://www.mutopiaproject.org/',
                'file': file,
            })
    with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=0)
        f.write('\n')
    size = sum(os.path.getsize(p) for p in glob.glob(os.path.join(out, '*')))
    print(f'{len(index)} pieces, {size / 1e6:.1f} MB')
    for s in skipped:
        print('skipped', s)


if __name__ == '__main__':
    main(*sys.argv[1:4])
