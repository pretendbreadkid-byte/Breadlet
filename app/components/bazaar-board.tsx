"use client";

// The Bazaar as a notice board (Settings > Layout > Bazaar style): every Breadlet for sale is a
// paper notice (public/assets/bazaar/notice-<rarity>.svg, the pin is the rarity's colour) pinned to
// a cork board with just the Breadlet on it. Hovering a notice shows its name and price (on phones
// that tag is always shown). Breadlets nobody is selling are tucked into a drawer under the board.
// Clicking a notice opens the same listings pop-up as the booths.
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

const NOTICES = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "secret", "unique", "breadled"];
const noticeFor = (rarity: string) => `/assets/bazaar/notice-${NOTICES.includes(rarity.toLowerCase()) ? rarity.toLowerCase() : "common"}.svg`;

// A steady little tilt for each notice, from its name (so notices don't jump around).
const tiltFor = (text: string) => {
  let value = 7;
  for (const character of text) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return ((value % 7) - 3) * 0.8;
};

export function BazaarBoard({ notes, closed, mine, onOpen, BlookArt }: {
  notes: BoardNote[];
  closed: BoardNote[];
  mine: boolean;
  onOpen: (name: string) => void;
  BlookArt: ComponentType<{ name: string; className: string }>;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const notice = (item: BoardNote, small = false) => (
    <button key={item.name} type="button" onClick={() => onOpen(item.name)}
      className={`board-note${small ? " is-small" : ""}${item.quantity ? "" : " is-closed"}`}
      style={{ "--tilt": `${tiltFor(item.name)}deg`, backgroundImage: `url(${noticeFor(item.rarity)})` } as Record<string, string>}
      aria-label={`${item.name} (${item.rarity}), ${item.quantity ? `${item.quantity} for sale from ${item.lowest.toLocaleString()} Bread Bucks` : "not for sale"}`}>
      {item.wished && <span className="board-wish" title="On your wishlist">★</span>}
      <span className="board-art"><BlookArt name={item.name} className="h-full w-full" /></span>
      <span className="board-tag" aria-hidden="true">
        <b>{item.name}</b>
        {item.quantity
          ? <span className="board-tag-price"><img src="/assets/Bread%20bucks.svg" alt="" />{item.lowest.toLocaleString()}{item.quantity > 1 && <small>· {item.quantity} for sale</small>}</span>
          : <span className="board-tag-price is-none">Not for sale</span>}
      </span>
    </button>
  );

  return (
    <section className="board-wrap" aria-label="Bazaar notice board">
      <div className="board-frame">
        <div className="board-cork">
          {notes.length
            ? <div className="board-grid">{notes.map((item) => notice(item))}</div>
            : <p className="board-empty">{mine ? "You have no notices up. Use + List an item to pin one." : "No notices match your search yet."}</p>}
        </div>
      </div>
      {!mine && closed.length > 0 && (
        <div className="board-drawer">
          <button type="button" className="board-drawer-toggle" aria-expanded={drawerOpen} onClick={() => setDrawerOpen((open) => !open)}>
            {drawerOpen ? "Hide" : "Show"} Breadlets nobody is selling ({closed.length})
          </button>
          {drawerOpen && <div className="board-drawer-grid">{closed.map((item) => notice(item, true))}</div>}
        </div>
      )}
    </section>
  );
}
