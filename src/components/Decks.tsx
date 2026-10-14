import { DECKS } from '../srs/deck';
import type { AppData } from '../storage';

interface Props {
  data: AppData;
  update: (fn: (d: AppData) => void) => void;
}

export function Decks({ data, update }: Props) {
  const toggle = (id: string) =>
    update((d) => {
      const on = d.settings.enabledDecks.includes(id);
      d.settings.enabledDecks = on ? d.settings.enabledDecks.filter((x) => x !== id) : [...d.settings.enabledDecks, id];
    });
  const resetDeck = (id: string) => {
    const deck = DECKS.find((d) => d.id === id)!;
    if (!confirm(`Forget all progress in "${deck.name}"?`)) return;
    update((d) => {
      for (const c of deck.cards) delete d.cards[c.id];
    });
  };

  return (
    <div className="panel">
      <h2>Decks</h2>
      <p className="muted">
        New cards are introduced from enabled decks in the order shown, a few per day. Start with the two staff decks and add the
        others as they get comfortable.
      </p>
      <ul className="decks">
        {DECKS.map((deck) => {
          const seen = deck.cards.filter((c) => data.cards[c.id] && data.cards[c.id].status !== 'new');
          const mature = seen.filter((c) => data.cards[c.id].interval >= 21);
          const on = data.settings.enabledDecks.includes(deck.id);
          return (
            <li key={deck.id} className={on ? 'on' : ''}>
              <label className="deck-toggle">
                <input type="checkbox" checked={on} onChange={() => toggle(deck.id)} />
                <span>
                  <b>{deck.name}</b>
                  <small className="muted">{deck.description}</small>
                </span>
              </label>
              <div className="deck-progress" title={`${seen.length} learned, ${mature.length} mature, ${deck.cards.length} total`}>
                <div className="bar">
                  <div className="seen" style={{ width: `${(100 * seen.length) / deck.cards.length}%` }} />
                  <div className="mature" style={{ width: `${(100 * mature.length) / deck.cards.length}%` }} />
                </div>
                <small>
                  {seen.length}/{deck.cards.length}
                </small>
                {seen.length > 0 && (
                  <button className="small link" onClick={() => resetDeck(deck.id)}>
                    reset
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
