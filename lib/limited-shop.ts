// Breadlets sold straight off Ted's shelf for a short time, like a bag but with no roll: you buy
// the Breadlet itself. The server (app/api/shop) checks the dates and the price.
export type LimitedShopItem = {
  name: string;
  price: number;
  art: string;
  prompt: string;
  // Sold until this moment (ISO time).
  endsAt: string;
};

export const LIMITED_SHOP: LimitedShopItem[] = [
  {
    name: "American Flag",
    price: 500,
    art: "/assets/american-flag.svg",
    prompt: "Buy the American Flag to celebrate Veterans Day!",
    // Through November 13, 2026 (US Eastern).
    endsAt: "2026-11-14T05:00:00.000Z",
  },
];

export const LIMITED_SHOP_NAMES = LIMITED_SHOP.map((item) => item.name);

export const limitedItemsOnSale = (now = Date.now()) => LIMITED_SHOP.filter((item) => Date.parse(item.endsAt) > now);
