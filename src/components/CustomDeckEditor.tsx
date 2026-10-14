import { useMemo, useState } from 'react';
import { keyLabel, MAJOR_KEYS, MINOR_KEYS, naturalRange, pitchName } from '../music/notes';
import {
  type CustomDeckSpec,
  type CustomKind,
  customCards,
  describeCustom,
  MAX_CUSTOM_CARDS,
  ordinal,
  rhythmProblems,
} from '../srs/custom';
import { CardPreview } from './Staff';

interface Props {
  initial: CustomDeckSpec;
  /** True when editing a deck that already exists (rather than making a new one). */
  existing: boolean;
  onSave: (spec: CustomDeckSpec) => void;
  onCancel: () => void;
}

const KINDS: { kind: CustomKind; label: string; hint: string }[] = [
  { kind: 'notes', label: 'Notes', hint: 'One note at a time' },
  { kind: 'intervals', label: 'Intervals', hint: 'Two notes at once' },
  { kind: 'chords', label: 'Chords', hint: 'Triads or 7ths, any inversion' },
  { kind: 'keys', label: 'Key signatures', hint: 'Name the key' },
  { kind: 'rhythms', label: 'Rhythms', hint: 'Tap one-bar rhythms' },
];

/** Every white key on the piano, for the range menus. */
const WHITE_KEYS = naturalRange('A0', 'C8').map(pitchName);

const PRESETS: Record<CustomDeckSpec['staff'], { label: string; low: string; high: string }[]> = {
  treble: [
    { label: 'On the staff', low: 'C4', high: 'G5' },
    { label: 'With ledger lines', low: 'G3', high: 'D6' },
    { label: 'High ledger lines', low: 'A5', high: 'C7' },
  ],
  bass: [
    { label: 'On the staff', low: 'F2', high: 'C4' },
    { label: 'With ledger lines', low: 'C2', high: 'G4' },
    { label: 'Low ledger lines', low: 'E1', high: 'E2' },
  ],
  grand: [
    { label: 'Both staves', low: 'F2', high: 'G5' },
    { label: 'With ledger lines', low: 'C2', high: 'C6' },
  ],
};

const METERS = ['2/4', '3/4', '4/4', '2/2', '3/8', '6/8', '9/8', '12/8', '5/4', '7/8'];

function Chips<T extends string | number>({
  options,
  selected,
  onToggle,
  label,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
  label: string;
}) {
  return (
    <div className="pick-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          aria-pressed={selected.includes(o.value)}
          className={selected.includes(o.value) ? 'on' : ''}
          onClick={() => onToggle(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Build a deck from choices: what to read, on which staff, over what range, in which keys. */
export function CustomDeckEditor({ initial, existing, onSave, onCancel }: Props) {
  const [spec, setSpec] = useState<CustomDeckSpec>(initial);
  const set = <K extends keyof CustomDeckSpec>(k: K, v: CustomDeckSpec[K]) => setSpec((s) => ({ ...s, [k]: v }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const cards = useMemo(() => customCards(spec), [spec]);
  const problems = spec.kind === 'rhythms' ? rhythmProblems(spec) : [];
  const usesStaff = spec.kind === 'notes' || spec.kind === 'intervals' || spec.kind === 'chords';
  const sample = cards.slice(0, 6);
  const tooMany = cards.length >= MAX_CUSTOM_CARDS;
  const why = !spec.name.trim()
    ? 'Give the deck a name.'
    : usesStaff && !spec.keys.length
      ? 'Pick at least one key.'
      : !cards.length
        ? 'These choices make no cards.'
        : '';

  const setKind = (kind: CustomKind) =>
    setSpec((s) => ({ ...s, kind, staff: kind !== 'notes' && s.staff === 'grand' ? 'treble' : s.staff }));
  const setStaff = (staff: CustomDeckSpec['staff']) =>
    setSpec((s) => ({ ...s, staff, low: PRESETS[staff][0].low, high: PRESETS[staff][0].high }));

  return (
    <section className="panel stack custom-editor">
      <h3>{existing ? 'Edit deck' : 'New deck'}</h3>
      <label className="cfield">
        Name
        <input
          className="text-input"
          value={spec.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Ledger lines in D major"
        />
      </label>

      <div className="cfield">
        What to read
        <div className="kind-pick">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              className={spec.kind === k.kind ? 'on' : ''}
              aria-pressed={spec.kind === k.kind}
              onClick={() => setKind(k.kind)}
            >
              <b>{k.label}</b>
              <small>{k.hint}</small>
            </button>
          ))}
        </div>
      </div>

      {usesStaff && (
        <>
          <div className="cfield">
            Staff
            <Chips
              label="Staff"
              options={[
                { value: 'treble', label: 'Treble clef' },
                { value: 'bass', label: 'Bass clef' },
                ...(spec.kind === 'notes' ? [{ value: 'grand' as const, label: 'Grand staff' }] : []),
              ]}
              selected={[spec.staff]}
              onToggle={(v) => setStaff(v)}
            />
          </div>
          <div className="cfield">
            Range
            <div className="row wrap">
              <select value={spec.low} onChange={(e) => set('low', e.target.value)} aria-label="Lowest note">
                {WHITE_KEYS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              to
              <select value={spec.high} onChange={(e) => set('high', e.target.value)} aria-label="Highest note">
                {WHITE_KEYS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              {PRESETS[spec.staff].map((p) => (
                <button key={p.label} className="small" onClick={() => setSpec((s) => ({ ...s, low: p.low, high: p.high }))}>
                  {p.label}
                </button>
              ))}
            </div>
            <small className="muted">Middle C is C4. The range counts written notes; sharps and flats follow the key.</small>
          </div>
          <div className="cfield">
            Keys
            <Chips
              label="Major keys"
              options={MAJOR_KEYS.map((k) => ({ value: k.key, label: keyLabel(k.key) }))}
              selected={spec.keys}
              onToggle={(v) => set('keys', toggle(spec.keys, v))}
            />
            <Chips
              label="Minor keys"
              options={MINOR_KEYS.map((k) => ({ value: k.key, label: keyLabel(k.key) }))}
              selected={spec.keys}
              onToggle={(v) => set('keys', toggle(spec.keys, v))}
            />
            <small className="muted">
              Cards are written with the key signature, and the notes follow the key's scale (minor keys include the raised 7th).
            </small>
          </div>
        </>
      )}

      {spec.kind === 'notes' && (
        <label className="check">
          <input type="checkbox" checked={spec.chromatic} onChange={(e) => set('chromatic', e.target.checked)} />
          Also the sharps, flats and naturals outside the key
        </label>
      )}

      {spec.kind === 'intervals' && (
        <div className="cfield">
          Intervals
          <Chips
            label="Intervals"
            options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n, label: n === 8 ? 'Octave' : ordinal(n) }))}
            selected={spec.intervals}
            onToggle={(v) => set('intervals', toggle(spec.intervals, v))}
          />
        </div>
      )}

      {spec.kind === 'chords' && (
        <>
          <div className="cfield">
            Chords
            <Chips
              label="Chord type"
              options={[
                { value: 'triads', label: 'Triads' },
                { value: 'sevenths', label: 'Seventh chords' },
              ]}
              selected={[spec.chord]}
              onToggle={(v) => setSpec((s) => ({ ...s, chord: v, inversions: s.inversions.filter((i) => v === 'sevenths' || i < 3) }))}
            />
          </div>
          <div className="cfield">
            Inversions
            <Chips
              label="Inversions"
              options={[0, 1, 2, ...(spec.chord === 'sevenths' ? [3] : [])].map((i) => ({
                value: i,
                label: i ? `${ordinal(i)} inversion` : 'Root position',
              }))}
              selected={spec.inversions}
              onToggle={(v) => set('inversions', toggle(spec.inversions, v))}
            />
            <small className="muted">
              One chord on each note of the key's scale, so a key's chords come out major, minor or diminished as they should.
            </small>
          </div>
        </>
      )}

      {spec.kind === 'keys' && (
        <div className="row wrap">
          <Chips
            label="Major or minor"
            options={[
              { value: 'major', label: 'Major' },
              { value: 'minor', label: 'Minor' },
              { value: 'both', label: 'Both' },
            ]}
            selected={[spec.keyMode]}
            onToggle={(v) => set('keyMode', v)}
          />
          <label className="opt">
            Up to
            <select value={spec.maxAccidentals} onChange={(e) => set('maxAccidentals', Number(e.target.value))}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} sharp{n === 1 ? '' : 's'} or flat{n === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {spec.kind === 'rhythms' && (
        <>
          <label className="opt">
            Time signature
            <select value={spec.meter} onChange={(e) => set('meter', e.target.value)}>
              {METERS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="cfield">
            One bar per line
            <textarea className="text-input mono" rows={5} value={spec.rhythms} onChange={(e) => set('rhythms', e.target.value)} />
            <small className="muted">
              w h q e s are whole, half, quarter, eighth and sixteenth; add <code>.</code> for dotted, <code>r</code> for a rest (
              <code>qr</code>), <code>~</code> to tie to the next note, and <code>3[e e e]</code> for a triplet. Example:{' '}
              <code>q. e er e q</code>
            </small>
          </label>
          {problems.length > 0 && (
            <ul className="warn small">
              {problems.map((p) => (
                <li key={p.line}>
                  Line {p.line}: {p.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="custom-preview">
        <p>
          <b>
            {cards.length} card{cards.length === 1 ? '' : 's'}
          </b>{' '}
          <span className="muted">
            · {describeCustom(spec)}
            {tooMany && ` (the first ${MAX_CUSTOM_CARDS}; narrow the range or keys for the rest)`}
          </span>
        </p>
        {sample.length > 0 && (
          <div className="preview-grid">
            {sample.map((c) => (
              <div key={c.id} className="preview-card">
                <CardPreview card={c} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row spread">
        <button className="link" onClick={onCancel}>
          Cancel
        </button>
        <div className="row">
          {why && <span className="muted small">{why}</span>}
          <button className="primary" disabled={!!why} onClick={() => onSave({ ...spec, name: spec.name.trim() })}>
            {existing ? 'Save changes' : 'Create deck'}
          </button>
        </div>
      </div>
    </section>
  );
}
