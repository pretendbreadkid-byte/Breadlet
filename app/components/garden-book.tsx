"use client";

// The Breadlet Gardening Book: the garden tutorial. It opens the first time a player walks into a
// garden, and again whenever they tap the garden's name. Each spread has pictures on the left page
// and the explanation on the right.
import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { DAILY_EARN_LIMIT, MAX_BASKET, PROPS, SEEDS, type SeedName } from "../../lib/fields";

export const GARDEN_BOOK_SEEN_KEY = "breadlet-garden-book-seen";
export const gardenBookSeen = () => {
  try { return window.localStorage.getItem(GARDEN_BOOK_SEEN_KEY) === "1"; } catch { return true; }
};
const markSeen = () => {
  try { window.localStorage.setItem(GARDEN_BOOK_SEEN_KEY, "1"); } catch { /* private window: it just opens again */ }
};

type Spread = { title: string; pictures: { src: string; label?: string }[]; lines: string[] };

const minutes = (ms: number) => (ms >= 3600000 ? `${ms / 3600000} hour${ms === 3600000 ? "" : "s"}` : `${ms / 60000} minutes`);

export function GardenBook({ seedArt, artFor, onClose }: { seedArt: Record<SeedName, string>; artFor: (name: string) => string; onClose: () => void }) {
  const spreads: Spread[] = [
    {
      title: "The Breadlet Gardening Book",
      pictures: [{ src: "/assets/garden/seed-shop.svg" }],
      lines: [
        "Welcome to your garden!",
        "Grow crops on the two dirt rows, pick them into your basket, then sell them for Bread Bucks or give them to friends.",
        "Turn the page to learn how.",
      ],
    },
    {
      title: "Planting",
      pictures: SEEDS.slice(0, 3).map((seed) => ({ src: seedArt[seed.name], label: seed.name })),
      lines: [
        "Follow the path to Ted's Seed Stand and buy some seeds.",
        "Pick a seed packet on your hotbar (keys 1 to 5). Click the same one again to put it away.",
        "Click anywhere on a dirt row (or press E while standing on one) to plant it. Plants need a little room, so don't plant them right on top of each other.",
      ],
    },
    ...SEEDS.map((seed): Spread => ({
      title: seed.name,
      pictures: [{ src: seedArt[seed.name], label: "Seed" }, { src: artFor(seed.name), label: "Grown" }],
      lines: [
        `Seed: ${seed.cost} Bread Bucks`,
        `Grows in ${minutes(seed.growMs)}`,
        `Sells for about ${seed.payout} (more if it grows big)`,
        `A 1 in ${Math.round(1 / seed.breadletChance)} chance to find the ${seed.name} Breadlet when you pick it!`,
      ],
    })),
    {
      title: "Picking and selling",
      pictures: [{ src: artFor("Carrot"), label: "Tiny" }, { src: artFor("Carrot"), label: "Giant" }],
      lines: [
        "When a crop is fully grown, walk up and press E (or click it) to pick it.",
        "Every crop grows to a random size, from Tiny to Giant. Bigger crops sell for more!",
        `Picked crops go into your basket (the last hotbar slot, or key 6). It holds ${MAX_BASKET} crops.`,
        `Sell one at a time or press Sell all. You can earn up to ${DAILY_EARN_LIMIT.toLocaleString()} Bread Bucks a day from gardens.`,
      ],
    },
    {
      title: "Sharing",
      pictures: [{ src: artFor("Pumpkin"), label: "Hold it" }],
      lines: [
        "Press Hold on a crop in your basket to carry it.",
        "Hover over another player while you hold it, then press Give.",
        "Use the player button next to the chat to copy your invite link, and choose who can plant and who can build in your garden.",
        "When the owner leaves, the garden closes for everyone else.",
      ],
    },
    {
      title: "Props",
      pictures: PROPS.slice(0, 4).map((prop) => ({ src: prop.art, label: prop.kind })),
      lines: [
        "Press Props next to the garden name to buy decorations.",
        "Press Place, then click the grass inside the fence (not on the rows). It shows red where it can't go.",
        "Hover a prop you placed to pick it back up.",
        "Have fun growing!",
      ],
    },
  ];
  const [page, setPage] = useState(0);
  const spread = spreads[page];
  const close = () => { markSeen(); onClose(); };
  const last = page === spreads.length - 1;

  return (
    <div className="garden-shop-layer garden-book-layer" onPointerDown={close}>
      <section className="garden-book" role="dialog" aria-modal="true" aria-labelledby="garden-book-title" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" className="garden-book-close" onClick={close} aria-label="Close the book"><X size={18} /></button>
        <div className="garden-book-page garden-book-left">
          <div className={`garden-book-pictures is-${Math.min(spread.pictures.length, 4)}`}>
            {spread.pictures.map((picture, index) => (
              <figure key={index}>
                <img src={picture.src} alt="" draggable={false} />
                {picture.label && <figcaption>{picture.label}</figcaption>}
              </figure>
            ))}
          </div>
          <span className="garden-book-number">{page * 2 + 1}</span>
        </div>
        <div className="garden-book-spine" aria-hidden="true" />
        <div className="garden-book-page garden-book-right">
          <h2 id="garden-book-title">{spread.title}</h2>
          {spread.lines.map((line, index) => <p key={index}>{line}</p>)}
          <span className="garden-book-number">{page * 2 + 2}</span>
        </div>
        <nav className="garden-book-nav">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} />Back</button>
          <span>{page + 1} / {spreads.length}</span>
          {last
            ? <button type="button" onClick={close}>Start gardening!</button>
            : <button type="button" onClick={() => setPage(page + 1)}>Next<ChevronRight size={18} /></button>}
        </nav>
      </section>
    </div>
  );
}
