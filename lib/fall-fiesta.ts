// Breadlet Fall Fiesta: a leaf shower at the top of every hour, and a shop that takes leaves.
// The server re-checks all of this (see app/api/events/fiesta and migration 0071).

export const SHOWER_MINUTES = 5;
export const LEAVES_PER_SHOWER = 10;

export type FiestaItem = { name: string; price: number; art: string; badge?: boolean };

export const FIESTA_SHOP: FiestaItem[] = [
  { name: "Acorn", price: 25, art: "/assets/breadlets/fall-fiesta/acorn.svg" },
  { name: "Pilgrim Hat", price: 50, art: "/assets/breadlets/fall-fiesta/pilgrim-hat.webp" },
  { name: "Fall Leaf", price: 100, art: "/assets/breadlets/fall-fiesta/fall-leaf.webp" },
  { name: "Pumpkin Dragon", price: 400, art: "/assets/breadlets/fall-fiesta/pumpkin-dragon.svg" },
  { name: "Fall Fiesta", price: 300, art: "/assets/badges/fall-fiesta.svg", badge: true },
];

const HOUR = 3600000;

// The shower for the hour `now` is in: when it starts, and whether it's still falling.
export const showerAt = (now: number) => {
  const startsAt = Math.floor(now / HOUR) * HOUR;
  const endsAt = startsAt + SHOWER_MINUTES * 60000;
  return { startsAt, endsAt, live: now < endsAt, nextAt: startsAt + HOUR };
};

// The Fall Fiesta ended at midnight Central (Nov 23, 2026). After that no leaves fall, the Event
// tab shows Breadlet Breaks Bad, and leftover leaves can be redeemed (migration 0113).
export const FIESTA_ENDS_AT = Date.parse("2026-11-23T06:00:00Z");
export const fiestaOver = (now = Date.now()) => now >= FIESTA_ENDS_AT;

// What leftover leaves buy after the event (besides any Fall Breadlets you haven't bought yet).
export const LEFTOVER_CLAN_THEME_PRICE = 1000;
export const LEFTOVER_BLOOKBERRY_PRICE = 100;
export const LEFTOVER_BUCKS_PER_LEAF = 5;
