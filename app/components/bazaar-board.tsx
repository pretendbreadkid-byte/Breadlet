"use client";

// The Bazaar as a notice board (Settings > Bazaar style): every Breadlet for sale is a paper note
// pinned to a cork board, with its art, cheapest price and how many are listed. Breadlets nobody is
// selling are tucked into a drawer under the board. Clicking a note opens the same listings pop-up
// as the booths.
import { useState, type ComponentType } from "react";

export type BoardNote = {
  name: string;
  rarity: string;
  color: string;
  lowest: number;
  quantity: number;
  rap: number;
  exist: number;
  wished: boolean;
};

// A steady little tilt and pin colour for each note, from its name (so notes don't jump around).
const hash = (text: string) => {
  let value = 7;
  for (const character of text) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value;
};
const PIN_COLORS = ["#e2483b", "#f2b233", "#4caf50", "#ED7117", "#c2569b"];

export function BazaarBoard({ notes, closed, mine, onOpen, BlookArt }: {
  notes: BoardNote[];
  closed: BoardNote[];
  mine: boolean;
  onOpen: (name: string) => void;
  BlookArt: ComponentType<{ name: string; className: string }>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const note = (item: BoardNote, small = false) => {
    const seed = hash(item.name);
    const tilt = ((seed % 7) - 3) * 0.7;
    return (
      <button key={item.name} type="button" onClick={() => onOpen(item.name)}
        className={`board-note${small ? " is-small" : ""}${item.quantity ? "" : " is-closed"}`}
        style={{ "--tilt": `${tilt}deg`, "--pin": PIN_COLORS[seed % PIN_COLORS.length], "--rarity": item.color } as Record<string, string>}
        aria-label={`${item.name}, ${item.quantity ? `${item.quantity} for sale from ${item.lowest.toLocaleString()} Bread Bucks` : "not for sale"}`}>
        <span className="board-pin" aria-hidden="true" />
        {item.wished && <span className="board-wish" title="On your wishlist">★</span>}
        <span className="board-art"><BlookArt name={item.name} className="h-full w-full" /></span>
        <span className="board-name">{item.name}</span>
        <span className="board-rarity">{item.rarity}</span>
        {!small && (item.quantity
          ? <span className="board-price"><img src="/assets/Bread%20bucks.svg" alt="" />{item.lowest.toLocaleString()}</span>
          : <span className="board-price is-none">Not for sale</span>)}
        {!small && (
          <span className="board-meta">
            {item.quantity ? <b>{item.quantity} for sale</b> : null}
            {item.rap ? <span title="Recent average price: the average of the last 10 sales">RAP {item.rap.toLocaleString()}</span> : <span>No sales yet</span>}
          </span>
        )}
      </button>
    );
  };

  return (
    <section className="board-wrap" aria-label="Bazaar notice board">
      <div className="board-frame">
        <div className="board-header" aria-hidden="true"><span>{mine ? "Your notes" : "For sale"}</span></div>
        <div className="board-cork">
          {notes.length
            ? <div className="board-grid">{notes.map((item) => note(item))}</div>
            : <p className="board-empty">{mine ? "You have no notes up. Use + List an item to pin one." : "No notes match your search yet."}</p>}
        </div>
      </div>
      {!mine && closed.length > 0 && (
        <div className="board-drawer">
          <button type="button" className="board-drawer-toggle" aria-expanded={drawerOpen} onClick={() => setDrawerOpen((open) => !open)}>
            {drawerOpen ? "Hide" : "Show"} Breadlets nobody is selling ({closed.length})
          </button>
          {drawerOpen && <div className="board-drawer-grid">{closed.map((item) => note(item, true))}</div>}
        </div>
      )}
    </section>
  );
}
