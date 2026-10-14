import { useState } from 'react';
import { DECK_GROUPS, type DeckDef, DECKS, type Level, LEVEL_LABEL } from '../srs/deck';
import type { AppData } from '../storage';
import { Group, Progress } from './Group';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
}

/** Decks: drill one skill each, grouped by topic. Turn on any mix, with or without a course. */
export function Decks({ data, update }: Props) {
  const [level, setLevel] = useState<Level | 'all'>('all');
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

  return (
    <div className="page-inner">
      <header className="page-head">
        <h2>Decks</h2>
        <p>
          Each deck drills one skill. Turn on whichever you want, on their own or alongside a course; new cards come from them a few a day.
          Within each group, decks are in the order you'd learn them.
        </p>
      </header>
      <div className="level-filter" role="radiogroup" aria-label="Level">
        {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((l) => (
          <button key={l} role="radio" aria-checked={level === l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
            {l === 'all' ? 'All levels' : LEVEL_LABEL[l]}
          </button>
        ))}
      </div>
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
            <ul className="deck-list">
              {decks.map((deck) => {
                const st = stats(deck);
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
                    {st.seen > 0 && (
                      <button className="small link" onClick={() => reset(deck)}>
                        reset
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Group>
        );
      })}
    </div>
  );
}
