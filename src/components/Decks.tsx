import { Play, Plus } from 'lucide-react';
import { useState } from 'react';
import { type CustomDeckSpec, newCustomDeck } from '../srs/custom';
import { DECK_GROUPS, type DeckDef, DECKS, type Level, LEVEL_LABEL } from '../srs/deck';
import type { AppData } from '../storage';
import { nextBatch } from '../srs/learn';
import { CustomDeckEditor } from './CustomDeckEditor';
import type { LearnPlan } from './LearnSession';
import { Group, Progress } from './Group';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
  /** Start a learning session (and study the deck). */
  onLearn: (plan: LearnPlan, deckId: string) => void;
}

/** Decks: drill one skill each, grouped by topic. Turn on any mix, with or without a course. */
export function Decks({ data, update, onLearn }: Props) {
  const [level, setLevel] = useState<Level | 'all'>('all');
  const [editing, setEditing] = useState<{ spec: CustomDeckSpec; existing: boolean } | null>(null);
  const isOn = (id: string) => data.settings.enabledDecks.includes(id);
  const toggle = (id: string) =>
    update((d) => {
      d.settings.enabledDecks = isOn(id) ? d.settings.enabledDecks.filter((x) => x !== id) : [...d.settings.enabledDecks, id];
    });
  const reset = (deck: DeckDef) => {
    if (!window.confirm(`Forget all progress on the cards in "${deck.name}"? Cards shared with other decks are reset there too.`)) return;
    update((d) => {
      for (const c of deck.cards) delete d.cards[c.id];
    });
  };
  const stats = (deck: DeckDef) => {
    const seen = deck.cards.filter((c) => data.cards[c.id] && data.cards[c.id].status !== 'new');
    const learned = seen.filter((c) => ['review', 'relearning'].includes(data.cards[c.id].status));
    return { seen: seen.length, learned: learned.length, total: deck.cards.length };
  };

  const save = (spec: CustomDeckSpec) => {
    update((d) => {
      const i = d.customDecks.findIndex((x) => x.id === spec.id);
      if (i >= 0) d.customDecks[i] = spec;
      else {
        d.customDecks.push(spec);
        d.settings.enabledDecks = [...d.settings.enabledDecks, spec.id];
      }
    });
    setEditing(null);
  };
  const remove = (spec: CustomDeckSpec) => {
    if (!window.confirm(`Delete "${spec.name}"? Progress on its cards is kept, and counts again if you build a deck with the same cards.`))
      return;
    update((d) => {
      d.customDecks = d.customDecks.filter((x) => x.id !== spec.id);
      d.settings.enabledDecks = d.settings.enabledDecks.filter((x) => x !== spec.id);
    });
  };

  const batchSize = Math.max(1, data.settings.newPerDay);
  const learn = (deck: DeckDef, group: string) =>
    onLearn({ title: deck.name, source: group, cards: nextBatch(deck, data.cards, batchSize), reviewKey: `deck:${deck.id}` }, deck.id);
  const row = (deck: DeckDef, group: string, extra?: React.ReactNode) => {
    const st = stats(deck);
    const fresh = st.total - st.seen;
    return (
      <li className="deck-row" key={deck.id}>
        <label>
          <input id={`deck-${deck.id}`} type="checkbox" checked={isOn(deck.id)} onChange={() => toggle(deck.id)} />
          <span className="deck-text">
            <b>
              {deck.name}
              {deck.level && <span className={`level-tag ${deck.level}`}>{LEVEL_LABEL[deck.level]}</span>}
            </b>
            <small>{deck.description}</small>
          </span>
        </label>
        <Progress {...st} />
        <button
          className="small learn-btn"
          disabled={!fresh}
          onClick={() => learn(deck, group)}
          title={fresh ? `Learn the next ${Math.min(fresh, batchSize)} new cards` : 'Every card in this deck has been learned'}
        >
          <Play size={11} fill="currentColor" /> {fresh ? `Learn ${Math.min(fresh, batchSize)}` : 'Learned'}
        </button>
        {extra}
        {st.seen > 0 && (
          <button className="small link" onClick={() => reset(deck)}>
            reset
          </button>
        )}
      </li>
    );
  };

  if (editing)
    return (
      <div className="page-inner">
        <CustomDeckEditor initial={editing.spec} existing={editing.existing} onSave={save} onCancel={() => setEditing(null)} />
      </div>
    );

  const custom = data.customDecks.map((spec) => ({ spec, deck: DECKS.find((d) => d.id === spec.id) })).filter((x) => x.deck);
  const customOn = custom.filter((x) => isOn(x.spec.id)).length;

  return (
    <div className="page-inner">
      <header className="page-head">
        <h2>Decks</h2>
        <p>
          Each deck drills one skill. <b>Learn</b> plays through a deck's next few new cards at your own pace; after that they come back in
          Review. A ticked deck is one you're studying. Within each group, decks are in the order you'd learn them.
        </p>
      </header>
      <div className="level-filter" role="radiogroup" aria-label="Level">
        {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((l) => (
          <button key={l} role="radio" aria-checked={level === l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
            {l === 'all' ? 'All levels' : LEVEL_LABEL[l]}
          </button>
        ))}
      </div>
      <Group
        title="Your decks"
        subtitle={
          custom.length
            ? `${custom.length} deck${custom.length === 1 ? '' : 's'}${customOn ? ` · ${customOn} on` : ''}`
            : 'Build a deck of exactly what you want to drill'
        }
        on={customOn > 0}
        defaultOpen
      >
        {custom.length > 0 && (
          <ul className="deck-list">
            {custom.map(({ spec, deck }) =>
              row(
                deck!,
                'Your decks',
                <span className="row deck-actions">
                  <button className="small link" onClick={() => setEditing({ spec, existing: true })}>
                    edit
                  </button>
                  <button className="small link" onClick={() => remove(spec)}>
                    delete
                  </button>
                </span>,
              ),
            )}
          </ul>
        )}
        <div className="custom-new">
          <button onClick={() => setEditing({ spec: newCustomDeck(), existing: false })}>
            <Plus size={15} /> New deck
          </button>
          <small className="muted">
            Notes, intervals or chords over any range and in any keys, key signatures, or your own rhythms. Cards you already know from
            other decks keep their progress.
          </small>
        </div>
      </Group>
      {DECK_GROUPS.map((g) => {
        const decks = g.decks.map((id) => DECKS.find((d) => d.id === id)!).filter((d) => level === 'all' || d.level === level);
        if (!decks.length) return null;
        const active = decks.filter((d) => isOn(d.id)).length;
        return (
          <Group
            key={g.name}
            title={g.name}
            subtitle={`${decks.length} decks${active ? ` · ${active} on` : ''}`}
            on={active > 0}
            defaultOpen={active > 0}
          >
            <ul className="deck-list">{decks.map((deck) => row(deck, g.name))}</ul>
          </Group>
        );
      })}
    </div>
  );
}
