// Breadlet Fall Fiesta: a leaf shower at the top of every hour, and a shop that takes leaves.
// The server re-checks all of this (see app/api/events/fiesta and migration 0071).

export const SHOWER_MINUTES = 5;
export const LEAVES_PER_SHOWER = 10;

export type FiestaItem = { name: string; price: number; art: string; badge?: boolean };

export const FIESTA_SHOP: FiestaItem[] = [
  { name: "Acorn", price: 25, art: "/assets/fall/acorn.svg" },
  { name: "Pilgrim Hat", price: 50, art: "/assets/fall/pilgrim-hat.webp" },
  { name: "Fall Leaf", price: 100, art: "/assets/fall/fall-leaf.webp" },
  { name: "Fall Fiesta", price: 300, art: "/assets/fall-badge.svg", badge: true },
];

const HOUR = 3600000;

// The shower for the hour `now` is in: when it starts, and whether it's still falling.
export const showerAt = (now: number) => {
  const startsAt = Math.floor(now / HOUR) * HOUR;
  const endsAt = startsAt + SHOWER_MINUTES * 60000;
  return { startsAt, endsAt, live: now < endsAt, nextAt: startsAt + HOUR };
};
