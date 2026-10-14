import { useEffect, useState } from 'react';
import { default_w, migrateParameters } from 'ts-fsrs';
import { rescheduleReviews } from '../srs/memory';
import { parseSteps } from '../srs/scheduler';
import { type AppData, DEFAULT_SRS, type SrsSettings } from '../storage';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
}

function Num({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-text">
        {label}
        {hint && <small className="muted">{hint}</small>}
      </span>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </label>
  );
}

/** A text setting that's only saved once it's valid, with the reason shown while it isn't. */
function Text({
  id,
  label,
  hint,
  value,
  validate,
  onCommit,
  multiline = false,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  validate: (s: string) => string | null;
  onCommit: (s: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const error = validate(draft);
  const commit = () => {
    if (!error && draft !== value) onCommit(draft);
  };
  const Input = multiline ? 'textarea' : 'input';
  return (
    <label className={`field ${multiline ? 'field-wide' : ''}`} htmlFor={id}>
      <span className="field-text">
        {label}
        {hint && <small className="muted">{hint}</small>}
        {error && <small className="warn">{error}</small>}
      </span>
      <Input
        id={id}
        className={`text-input ${error ? 'invalid' : ''}`}
        value={draft}
        rows={multiline ? 3 : undefined}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !multiline) commit();
        }}
      />
    </label>
  );
}

const stepsError = (s: string) => (parseSteps(s) === null ? 'Use delays like "1m 10m", in minutes (m), hours (h) or days (d).' : null);

const parseParams = (s: string): number[] | null => {
  const nums = s
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (nums.some((n) => !Number.isFinite(n)) || ![17, 19, 21].includes(nums.length)) return null;
  return [...migrateParameters(nums)];
};

/** Scheduling options, laid out like Anki's deck options. */
export function SchedulingSettings({ data, update }: Props) {
  const srs = data.settings.srs;
  const fsrsOn = srs.algorithm === 'fsrs';
  const [rescheduled, setRescheduled] = useState<number | null>(null);
  const set = <K extends keyof SrsSettings>(k: K, v: SrsSettings[K]) =>
    update((d) => {
      d.settings.srs = { ...d.settings.srs, [k]: v };
    });
  const isDefaultParams = srs.fsrsParams.length === default_w.length && srs.fsrsParams.every((w, i) => Math.abs(w - default_w[i]) < 1e-9);

  return (
    <section className="panel stack">
      <h3>Scheduling</h3>
      <p className="muted small">How cards are spaced out over time, with the same options as Anki's deck settings. They apply to every deck and course.</p>

      <div className="segmented" role="radiogroup" aria-label="Scheduler">
        {(['fsrs', 'sm2'] as const).map((a) => (
          <button key={a} role="radio" aria-checked={srs.algorithm === a} className={srs.algorithm === a ? 'on' : ''} onClick={() => set('algorithm', a)}>
            <b>{a === 'fsrs' ? 'FSRS' : 'SM-2'}</b>
            <small>{a === 'fsrs' ? 'Recommended. Learns how your memory works.' : "Anki's classic algorithm, based on ease."}</small>
          </button>
        ))}
      </div>
      {fsrsOn && (
        <p className="muted small">
          FSRS estimates how well you know each card and schedules it for when you're about to forget. Cards you studied before turning it
          on get their memory rebuilt from your review history.
        </p>
      )}

      <h4>Daily limits</h4>
      <Num id="srs-new" label="New cards per day" value={data.settings.newPerDay} min={0} max={9999} onChange={(v) => update((d) => void (d.settings.newPerDay = v))} />
      <Num id="srs-reviews" label="Maximum reviews per day" value={srs.maxReviewsPerDay} min={0} max={9999} onChange={(v) => set('maxReviewsPerDay', v)} />

      <h4>Learning</h4>
      <Text
        id="srs-learn-steps"
        label="Learning steps"
        hint="Delays before a new card graduates"
        value={srs.learningSteps}
        validate={stepsError}
        onCommit={(v) => set('learningSteps', v.trim())}
      />
      <Text
        id="srs-relearn-steps"
        label="Relearning steps"
        hint="Delays after forgetting a card"
        value={srs.relearningSteps}
        validate={(s) => (s.trim() === '' ? null : stepsError(s))}
        onCommit={(v) => set('relearningSteps', v.trim())}
      />

      {fsrsOn ? (
        <>
          <h4>FSRS</h4>
          <Num
            id="srs-retention"
            label="Desired retention"
            hint="Chance of remembering a card when it's due. Higher means more reviews; 0.90 is the usual choice."
            value={srs.desiredRetention}
            min={0.7}
            max={0.99}
            step={0.01}
            onChange={(v) => set('desiredRetention', Math.round(v * 100) / 100)}
          />
          <Text
            id="srs-params"
            label="FSRS parameters"
            hint={isDefaultParams ? 'The standard defaults. Paste optimised parameters from Anki to personalise.' : 'Custom parameters.'}
            value={srs.fsrsParams.map((w) => +w.toFixed(4)).join(', ')}
            validate={(s) => (parseParams(s) ? null : 'Paste 21 numbers (FSRS-6), or 19 or 17 from an older version.')}
            onCommit={(v) => set('fsrsParams', parseParams(v)!)}
            multiline
          />
          <div className="row">
            {!isDefaultParams && (
              <button className="small" onClick={() => set('fsrsParams', [...default_w])}>
                Use default parameters
              </button>
            )}
            <button
              className="small"
              onClick={() => {
                let moved = 0;
                update((d) => void (moved = rescheduleReviews(d)));
                setRescheduled(moved);
              }}
              title="Apply the current retention and parameters to cards already scheduled"
            >
              Reschedule cards now
            </button>
            {rescheduled !== null && (
              <span className="muted small">
                {rescheduled} card{rescheduled === 1 ? '' : 's'} rescheduled.
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <h4>SM-2</h4>
          <Num id="srs-grad" label="Graduating interval (days)" value={srs.graduatingIntervalDays} min={1} max={365} onChange={(v) => set('graduatingIntervalDays', v)} />
          <Num id="srs-easy-ivl" label="Easy interval (days)" value={srs.easyIntervalDays} min={1} max={365} onChange={(v) => set('easyIntervalDays', v)} />
          <Num id="srs-ease" label="Starting ease" value={srs.startingEase} min={1.3} max={5} step={0.05} onChange={(v) => set('startingEase', v)} />
          <Num id="srs-bonus" label="Easy bonus" value={srs.easyBonus} min={1} max={5} step={0.05} onChange={(v) => set('easyBonus', v)} />
          <Num id="srs-modifier" label="Interval modifier" value={srs.intervalModifier} min={0.5} max={2} step={0.05} onChange={(v) => set('intervalModifier', v)} />
          <Num id="srs-hard" label="Okay interval" hint="Anki's Hard interval" value={srs.hardMultiplier} min={1} max={3} step={0.05} onChange={(v) => set('hardMultiplier', v)} />
          <Num
            id="srs-lapse"
            label="New interval"
            hint="Multiplies the interval after you forget a card"
            value={srs.lapseMultiplier}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => set('lapseMultiplier', v)}
          />
          <Num id="srs-min-ivl" label="Minimum interval (days)" value={srs.minimumLapseIntervalDays} min={1} max={365} onChange={(v) => set('minimumLapseIntervalDays', v)} />
        </>
      )}

      <h4>Intervals</h4>
      <Num id="srs-max-ivl" label="Maximum interval (days)" value={srs.maxIntervalDays} min={1} max={36500} onChange={(v) => set('maxIntervalDays', v)} />
      <label className="check">
        <input id="srs-fuzz" type="checkbox" checked={srs.fuzz} onChange={(e) => set('fuzz', e.target.checked)} />
        Spread out reviews by a few percent (fuzz), so cards learned together don't keep coming back together
      </label>

      <h4>Cards you keep forgetting</h4>
      <Num
        id="srs-leech"
        label="Forgotten this many times"
        hint='Cards forgotten this often are listed under "Things to work on"'
        value={srs.leechThreshold}
        min={2}
        max={30}
        onChange={(v) => set('leechThreshold', v)}
      />

      <h4>Days</h4>
      <Num id="srs-day-start" label="Next day starts at (hour, 0–23)" value={srs.dayStartHour} min={0} max={23} onChange={(v) => set('dayStartHour', v)} />
      <Num
        id="srs-learn-ahead"
        label="Learn-ahead limit (minutes)"
        hint="When nothing else is due, show learning cards due within this long"
        value={srs.learnAheadMin}
        min={0}
        max={240}
        onChange={(v) => set('learnAheadMin', v)}
      />

      <div className="row">
        <button
          className="small link"
          onClick={() =>
            window.confirm('Reset all scheduling options to their defaults? Your cards and their progress are kept.') &&
            update((d) => {
              d.settings.srs = { ...DEFAULT_SRS, fsrsParams: [...DEFAULT_SRS.fsrsParams] };
              d.settings.newPerDay = 10;
            })
          }
        >
          Reset scheduling to defaults
        </button>
      </div>
    </section>
  );
}
