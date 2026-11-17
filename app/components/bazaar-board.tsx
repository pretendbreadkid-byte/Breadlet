"use client";

// The Bazaar's Breadlets as paper notices (public/assets/bazaar/notice-<rarity>.svg, the pin is the
// rarity's colour) instead of booths, laid out on the normal Bazaar background. Each notice shows just
// the Breadlet; hovering shows its name and price (on phones that tag is always shown). Ones nobody
// is selling come after, faded. Clicking a notice opens the same listings pop-up as the booths did.
// Settings > Layout > Bazaar style can switch back to booths.
import type { ComponentType } from "react";

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

// Price tags (the default look): small dark hang tags with a rarity stripe, the Breadlet, its name
// and its price always showing.
export function BazaarTags({ notes, mine, onOpen, BlookArt }: {
  notes: BoardNote[];
  mine: boolean;
  onOpen: (name: string) => void;
  BlookArt: ComponentType<{ name: string; className: string }>;
}) {
  if (!notes.length) {
    return <p className="bazaar-empty mt-6 rounded-2xl border p-8 text-center">{mine ? "You have no active listings." : "No listings match your search yet."}</p>;
  }
  return (
    <section className="tag-grid" aria-label="Breadlets for sale">
      {notes.map((item) => (
        <button key={item.name} type="button" onClick={() => onOpen(item.name)} className={`price-tag${item.quantity ? "" : " is-closed"}`}
          style={{ "--rarity": item.color } as Record<string, string>}
          aria-label={`${item.name} (${item.rarity}), ${item.quantity ? `${item.quantity} for sale from ${item.lowest.toLocaleString()} Bread Bucks` : "not for sale"}`}>
          <span className="price-tag-hole" aria-hidden="true" />
          {item.wished && <span className="price-tag-wish" title="On your wishlist">★</span>}
          <span className="price-tag-art"><BlookArt name={item.name} className="h-full w-full" /></span>
          <span className="price-tag-name">{item.name}</span>
          {item.quantity
            ? <span className="price-tag-price"><img src="/assets/Bread%20bucks.svg" alt="" />{item.lowest.toLocaleString()}</span>
            : <span className="price-tag-price is-none">Not for sale</span>}
          <span className="price-tag-meta">{item.quantity ? `${item.quantity} for sale` : item.rarity}</span>
        </button>
      ))}
    </section>
  );
}

export function BazaarBoard({ notes, mine, onOpen, BlookArt }: {
  notes: BoardNote[];
  mine: boolean;
  onOpen: (name: string) => void;
  BlookArt: ComponentType<{ name: string; className: string }>;
}) {
  if (!notes.length) {
    return <p className="bazaar-empty mt-6 rounded-2xl border p-8 text-center">{mine ? "You have no active listings." : "No listings match your search yet."}</p>;
  }
  return (
    <section className="board-grid" aria-label="Breadlets for sale">
      {notes.map((item) => (
        <button key={item.name} type="button" onClick={() => onOpen(item.name)}
          className={`board-note${item.quantity ? "" : " is-closed"}`}
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
      ))}
    </section>
  );
}
