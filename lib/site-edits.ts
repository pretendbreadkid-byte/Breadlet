import { liveCapsules, rarityBudget, rarityOrder } from './gameplay-catalog';
import type { Capsule, Reward } from './gameplay-catalog';
import { marketPackStock, seasonalPackOpensAt } from './market-stock';

// Edit mode (/edit in chat, owner only). Changes are saved in the site_edits table (migration 0076)
// and applied on top of the built-in packs by the server and by every player's browser.

export type PackItem = { name: string; rarity: string; chance?: number };
// stock: the 0-1 chance the pack is in Ted's Shop each hour.
export type PackEdit = { name: string; price: number; art: string; stock: number; rarityChances: Record<string, number>; items: PackItem[]; removed?: boolean };
export type BlookEdit = { rarity?: string; art?: string };
export type CatalogEdits = { packs: Record<string, PackEdit>; blooks: Record<string, BlookEdit> };
export type VisualRule = { id: string; label: string; selector: string; style: Record<string, string>; text?: string; src?: string; href?: string };
export type VisualEdits = { font?: string; rules: VisualRule[] };

export const emptyCatalogEdits = (): CatalogEdits => ({ packs: {}, blooks: {} });
export const emptyVisualEdits = (): VisualEdits => ({ rules: [] });

// Art for edited Breadlets by name. The page checks this before its built-in art.
export const artOverrides: Record<string, string> = {};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const baseCapsules: Capsule[] = clone(liveCapsules);
const baseStock = clone(marketPackStock);

// A pack as edit mode shows it.
export const packEditFor = (capsule: Capsule): PackEdit => ({
  name: capsule.name,
  price: capsule.price,
  art: capsule.art,
  stock: marketPackStock.find((entry) => entry.name === capsule.name)?.chance ?? 1,
  rarityChances: { ...(capsule.rarityChances || {}) },
  items: capsule.pool.map((reward) => ({ name: reward.name, rarity: reward.rarity, ...(reward.chance !== undefined ? { chance: reward.chance } : {}) })),
});

// Unchanged Breadlets keep their built-in odds (and daily rotations); new ones share their rarity's budget.
export const capsuleFromEdit = (edit: PackEdit): Capsule => {
  const base = baseCapsules.find((capsule) => capsule.name === edit.name);
  const pool: Reward[] = edit.items.map((item) => {
    const old = base?.pool.find((reward) => reward.name === item.name);
    if (old && old.rarity === item.rarity) return { ...clone(old), chance: item.chance };
    const sameRarity = edit.items.filter((entry) => entry.rarity === item.rarity).length;
    return { name: item.name, rarity: item.rarity, weight: (rarityBudget[item.rarity] || 0.1) / sameRarity, chance: item.chance };
  });
  return {
    ...(base ? clone(base) : {}),
    name: edit.name,
    price: edit.price,
    art: edit.art,
    rarityChances: Object.keys(edit.rarityChances).length ? { ...edit.rarityChances } : undefined,
    pool,
  };
};

// Rebuilds liveCapsules and marketPackStock in place from the built-in ones plus the edits, so
// everything that imports them sees the edited packs.
export function applyCatalogEdits(edits: CatalogEdits) {
  liveCapsules.splice(0, liveCapsules.length, ...clone(baseCapsules));
  marketPackStock.splice(0, marketPackStock.length, ...clone(baseStock));
  for (const key of Object.keys(artOverrides)) delete artOverrides[key];

  for (const edit of Object.values(edits.packs || {})) {
    const index = liveCapsules.findIndex((capsule) => capsule.name === edit.name);
    const stockIndex = marketPackStock.findIndex((entry) => entry.name === edit.name);
    if (edit.removed) {
      if (index >= 0) liveCapsules.splice(index, 1);
      if (stockIndex >= 0) marketPackStock.splice(stockIndex, 1);
      continue;
    }
    const capsule = capsuleFromEdit(edit);
    if (index >= 0) liveCapsules[index] = capsule;
    else liveCapsules.push(capsule);
    if (edit.name in seasonalPackOpensAt) continue;
    if (stockIndex >= 0) marketPackStock[stockIndex] = { name: edit.name, chance: edit.stock };
    else marketPackStock.push({ name: edit.name, chance: edit.stock });
  }

  for (const [name, edit] of Object.entries(edits.blooks || {})) {
    if (edit.art) artOverrides[name] = edit.art;
    if (!edit.rarity) continue;
    for (const capsule of liveCapsules) {
      const reward = capsule.pool.find((entry) => entry.name === name);
      if (!reward || reward.rarity === edit.rarity) continue;
      const sameRarity = capsule.pool.filter((entry) => entry.rarity === edit.rarity).length + 1;
      Object.assign(reward, { rarity: edit.rarity, weight: (rarityBudget[edit.rarity] || 0.1) / sameRarity, rotation: undefined });
    }
  }
}

// Checks what edit mode sends before it is saved. Returns the cleaned edits, or an error message.
const RARITIES = new Set(rarityOrder);
const ART = /^(\/assets\/[^"'<>\\]{1,200}|\/api\/site\/image\?id=[0-9a-f-]{36})$/i;
const nameOf = (value: unknown) => (typeof value === 'string' && value.trim() && value.trim().length <= 40 ? value.trim() : '');
const isPercent = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

export function cleanCatalogEdits(input: any): CatalogEdits | string {
  const packs: Record<string, PackEdit> = {};
  for (const raw of Object.values(input?.packs || {}) as any[]) {
    const name = nameOf(raw?.name);
    if (!name) return 'Every pack needs a name (up to 40 letters).';
    if (raw.removed === true) {
      packs[name] = { name, price: 0, art: '/assets/Bread.svg', stock: 0, rarityChances: {}, items: [], removed: true };
      continue;
    }
    if (!Number.isInteger(raw.price) || raw.price < 0 || raw.price > 1000000) return `${name}: the price must be a whole number from 0 to 1,000,000.`;
    if (typeof raw.art !== 'string' || !ART.test(raw.art)) return `${name}: use a picture from /assets or upload one.`;
    if (typeof raw.stock !== 'number' || !(raw.stock >= 0 && raw.stock <= 1)) return `${name}: the shop chance must be 0-100%.`;
    const rarityChances: Record<string, number> = {};
    for (const [rarity, chance] of Object.entries(raw.rarityChances || {})) {
      if (!RARITIES.has(rarity) || !isPercent(chance)) return `${name}: rarity chances must be 0-100%.`;
      rarityChances[rarity] = chance;
    }
    if (!Array.isArray(raw.items) || !raw.items.length || raw.items.length > 80) return `${name}: a pack needs 1 to 80 Breadlets.`;
    const items: PackItem[] = [];
    for (const item of raw.items) {
      const itemName = nameOf(item?.name);
      if (!itemName || !RARITIES.has(item.rarity)) return `${name}: every Breadlet needs a name and a rarity.`;
      if (items.some((entry) => entry.name === itemName)) return `${name}: ${itemName} is in the pack twice.`;
      if (item.chance !== undefined && item.chance !== null && !isPercent(item.chance)) return `${name}: ${itemName}'s chance must be 0-100%.`;
      items.push({ name: itemName, rarity: item.rarity, ...(isPercent(item.chance) ? { chance: item.chance } : {}) });
    }
    const fixed = items.reduce((sum, item) => sum + (item.chance || 0), 0)
      + Object.entries(rarityChances).filter(([rarity]) => items.some((item) => item.rarity === rarity && item.chance === undefined)).reduce((sum, [, chance]) => sum + chance, 0);
    if (fixed > 100) return `${name}: the chances you set add up to more than 100%.`;
    packs[name] = { name, price: raw.price, art: raw.art, stock: raw.stock, rarityChances, items };
  }

  const blooks: Record<string, BlookEdit> = {};
  for (const [rawName, raw] of Object.entries(input?.blooks || {}) as [string, any][]) {
    const name = nameOf(rawName);
    if (!name) return 'Every Breadlet needs a name (up to 40 letters).';
    const edit: BlookEdit = {};
    if (raw?.rarity !== undefined) {
      if (!RARITIES.has(raw.rarity)) return `${name}: pick a rarity from the list.`;
      edit.rarity = raw.rarity;
    }
    if (raw?.art !== undefined && raw.art !== '') {
      if (typeof raw.art !== 'string' || !ART.test(raw.art)) return `${name}: use a picture from /assets or upload one.`;
      edit.art = raw.art;
    }
    if (edit.rarity || edit.art) blooks[name] = edit;
  }
  if (Object.keys(packs).length > 60 || Object.keys(blooks).length > 500) return 'That is too many edits.';
  return { packs, blooks };
}

export const STYLE_PROPS = ['color', 'background', 'font-family', 'font-size', 'font-weight', 'text-shadow', 'box-shadow', 'border', 'border-radius', 'opacity', 'display'];
// No braces, angle brackets, semicolons or @, so a value can't break out of its CSS rule.
// Selectors may use ">" (one element inside another), but never "<", so they can't end the <style> tag.
const SAFE_VALUE = /^[^{}<>;@\\]{1,200}$/;
const SAFE_SELECTOR = /^[^{}<;@]{1,2000}$/;
const SAFE_FONT = /^[A-Za-z0-9 ]{1,40}$/;
const IMAGE = /^(\/assets\/[^"'<>\\]{1,200}|\/api\/site\/image\?id=[0-9a-f-]{36}|https:\/\/[^"'<>\s]{1,300})$/i;
const LINK = /^(\/|https?:\/\/|#|mailto:)[^"'<>\s]{0,300}$/i;

export function cleanVisualEdits(input: any): VisualEdits | string {
  const font = typeof input?.font === 'string' ? input.font.trim() : '';
  if (font && !SAFE_FONT.test(font)) return 'Pick a font from the list.';
  if (!Array.isArray(input?.rules) || input.rules.length > 400) return 'That is too many page changes.';
  const rules: VisualRule[] = [];
  for (const raw of input.rules) {
    if (typeof raw?.selector !== 'string' || !SAFE_SELECTOR.test(raw.selector)) return 'One change points at something that can\'t be saved. Pick it again.';
    const style: Record<string, string> = {};
    for (const [property, value] of Object.entries(raw.style || {})) {
      if (!STYLE_PROPS.includes(property) || typeof value !== 'string' || !SAFE_VALUE.test(value.trim())) return `"${String(value)}" can't be used for ${property}.`;
      style[property] = value.trim();
    }
    const rule: VisualRule = { id: String(raw.id || '').slice(0, 40) || String(rules.length), label: String(raw.label || '').slice(0, 80), selector: raw.selector, style };
    if (typeof raw.text === 'string') rule.text = raw.text.slice(0, 500);
    if (raw.src !== undefined) {
      if (typeof raw.src !== 'string' || !IMAGE.test(raw.src)) return 'Use a picture from /assets, an https:// link, or upload one.';
      rule.src = raw.src;
    }
    if (raw.href !== undefined) {
      if (typeof raw.href !== 'string' || !LINK.test(raw.href)) return 'Links must start with /, https://, # or mailto:.';
      rule.href = raw.href;
    }
    rules.push(rule);
  }
  return { ...(font ? { font } : {}), rules };
}
