"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { chanceFor, legacyCapsules, liveCapsules, rarityOrder } from "../../lib/gameplay-catalog";
import { seasonalPackOpensAt } from "../../lib/market-stock";
import { applyCatalogEdits, artOverrides, capsuleFromEdit, emptyCatalogEdits, emptyVisualEdits, packEditFor } from "../../lib/site-edits";
import type { CatalogEdits, PackEdit, VisualEdits, VisualRule } from "../../lib/site-edits";
import { shrinkImage } from "../../lib/shrink-image";

// Edit mode: the owner types /edit in chat to change packs, odds, Breadlets and how the site looks.
// Edits save to the database (migration 0076) and show for everyone without a new deploy.

export const TOGGLE_EDIT_MODE = "breadlet-toggle-edit-mode";
const EDITS_CHANGED = "breadlet-site-edits-changed";

type SiteEdits = { ready: boolean; catalog: CatalogEdits; visual: VisualEdits };
let siteEdits: SiteEdits = { ready: false, catalog: emptyCatalogEdits(), visual: emptyVisualEdits() };
let requested = false;

const publish = (next: SiteEdits) => {
  siteEdits = next;
  applyCatalogEdits(next.catalog);
  window.dispatchEvent(new Event(EDITS_CHANGED));
};

// The saved edits. The first caller loads them; every caller re-renders when they change.
export function useSiteEdits() {
  const [edits, setEdits] = useState(siteEdits);
  useEffect(() => {
    const changed = () => setEdits(siteEdits);
    window.addEventListener(EDITS_CHANGED, changed);
    if (!requested) {
      requested = true;
      fetch("/api/site/edits")
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => { if (data) publish({ ready: data.ready !== false, catalog: data.catalog || emptyCatalogEdits(), visual: data.visual || emptyVisualEdits() }); })
        .catch(() => undefined);
    }
    return () => window.removeEventListener(EDITS_CHANGED, changed);
  }, []);
  return edits;
}

// Saves catalog or page edits. Returns an error message, or "" when it worked.
const saveEdits = async (body: { catalog?: CatalogEdits; visual?: VisualEdits }) => {
  const response = await fetch("/api/site/edits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const result = await response?.json().catch(() => null);
  if (!response?.ok) return result?.error || "Could not save. Try again.";
  publish({ ...siteEdits, ready: true, ...result });
  return "";
};

const SYSTEM_FONTS = ["DynaPuff", "Arial", "Impact", "Georgia", "Verdana", "Trebuchet MS", "Courier New", "Comic Sans MS"];
const GOOGLE_FONTS = ["Fredoka", "Baloo 2", "Bangers", "Luckiest Guy", "Titan One", "Lilita One", "Nunito", "Poppins", "Press Start 2P"];
const FONTS = [...SYSTEM_FONTS, ...GOOGLE_FONTS];
const fontLink = (font: string) => `https://fonts.googleapis.com/css2?family=${font.replace(/ /g, "+")}:wght@400;700;900&display=swap`;
const fontName = (value = "") => value.split(",")[0].replace(/["']/g, "").trim();

const cssFor = (visual: VisualEdits) => [
  visual.font ? `body, body *:not([data-edit-ui]):not([data-edit-ui] *) { font-family: "${visual.font}", sans-serif !important; }` : "",
  ...visual.rules.map((rule) => {
    const declarations = Object.entries(rule.style).map(([property, value]) => `${property}: ${value} !important;`).join(" ");
    return declarations ? `${rule.selector} { ${declarations} }` : "";
  }),
].join("\n");

const googleFontsIn = (visual: VisualEdits) => Array.from(new Set(
  [visual.font, ...visual.rules.map((rule) => fontName(rule.style["font-family"]))].filter((font): font is string => Boolean(font) && GOOGLE_FONTS.includes(font!)),
));

// Applies the page edits for everyone: styles through a stylesheet, and pictures, links and text
// by re-setting them whenever React redraws the page.
export function SiteVisualEdits({ visual }: { visual: VisualEdits }) {
  const css = useMemo(() => cssFor(visual), [visual]);
  useEffect(() => {
    const rules = visual.rules.filter((rule) => rule.src || rule.href || rule.text !== undefined);
    if (!rules.length) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      for (const rule of rules) {
        let nodes: NodeListOf<Element>;
        try { nodes = document.querySelectorAll(rule.selector); } catch { continue; }
        nodes.forEach((node) => {
          if (node.closest("[data-edit-ui]")) return;
          if (rule.src && node instanceof HTMLImageElement && node.getAttribute("src") !== rule.src) node.setAttribute("src", rule.src);
          if (rule.href && node instanceof HTMLAnchorElement && node.getAttribute("href") !== rule.href) node.setAttribute("href", rule.href);
          // Changes the existing text node, so React can still update or remove it later.
          const only = node.childNodes.length === 1 ? node.firstChild : null;
          if (rule.text !== undefined && only?.nodeType === Node.TEXT_NODE && only.nodeValue !== rule.text) only.nodeValue = rule.text;
        });
      }
    };
    apply();
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(apply); });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["src", "href"] });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [visual]);
  return (
    <>
      {googleFontsIn(visual).map((font) => <link key={font} rel="stylesheet" href={fontLink(font)} />)}
      {css && <style>{css}</style>}
    </>
  );
}

// "Every one like it": the tag and its classes. "Just this one": that plus its place in the page.
const classes = (element: Element, limit = Infinity) => Array.from(element.classList).slice(0, limit).map((name) => `.${CSS.escape(name)}`).join("");
const likeSelector = (element: Element) => `${element.tagName.toLowerCase()}${classes(element)}`;
// The boxes around it only keep their first two classes, so the path stays short enough to save.
const exactSelector = (element: Element) => {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== document.body && parts.length < 14) {
    if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
    const parent: Element | null = node.parentElement;
    const tag = node.tagName;
    const position = parent ? Array.from(parent.children).filter((child) => child.tagName === tag).indexOf(node) + 1 : 1;
    parts.unshift(`${tag.toLowerCase()}${classes(node, node === element ? Infinity : 2)}:nth-of-type(${position})`);
    node = parent;
  }
  return parts.join(" > ");
};
const labelFor = (element: Element) => {
  const words = element instanceof HTMLImageElement ? element.alt || "picture" : (element.textContent || "").trim();
  return `${element.tagName.toLowerCase()} ${words ? `"${words.slice(0, 40)}"` : ""}`.trim();
};
const ownText = (element: Element) => (element.childNodes.length === 1 && element.firstChild?.nodeType === Node.TEXT_NODE ? element.firstChild.nodeValue || "" : null);
const toHex = (color: string) => {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return match ? `#${match.slice(1, 4).map((part) => Number(part).toString(16).padStart(2, "0")).join("")}` : "#000000";
};
// The address inside a CSS background-image, as a path on this site when it is one.
const backgroundUrl = (value: string) => {
  const match = value.match(/^url\("?([^")]+)"?\)$/);
  if (!match) return "";
  return match[1].startsWith(window.location.origin) ? match[1].slice(window.location.origin.length) : match[1];
};
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Highlights what the mouse is over, and hands back what gets clicked (instead of clicking it).
function usePicker(active: boolean, onPick: (element: Element) => void) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!active) { setBox(null); return; }
    const isEditor = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("[data-edit-ui]"));
    // A picture under the mouse wins, even when an overlay or glow sits on top of it. Use "Pick the
    // bigger box around it" to get the box instead.
    const pickable = (event: MouseEvent) => {
      const picture = document.elementsFromPoint(event.clientX, event.clientY).find((element) => element instanceof HTMLImageElement && !isEditor(element));
      if (picture) return picture;
      let element = event.target as Element;
      while (element instanceof SVGElement && element.parentElement) element = element.parentElement;
      return element;
    };
    const move = (event: MouseEvent) => setBox(isEditor(event.target) ? null : pickable(event).getBoundingClientRect());
    const block = (event: Event) => { if (!isEditor(event.target)) { event.preventDefault(); event.stopPropagation(); } };
    const click = (event: MouseEvent) => {
      if (isEditor(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      onPick(pickable(event));
    };
    document.addEventListener("mousemove", move, true);
    document.addEventListener("mousedown", block, true);
    document.addEventListener("click", click, true);
    return () => {
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("mousedown", block, true);
      document.removeEventListener("click", click, true);
    };
  }, [active, onPick]);
  return box;
}

function ImageField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      // SVGs stay SVGs (so animated ones keep moving) when they fit; bigger ones become a picture.
      const data = file.type === "image/svg+xml" && file.size <= 500000
        ? await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read that file."));
          reader.readAsDataURL(file);
        })
        : await shrinkImage(file, { maxLength: 690000, maxSide: 1024 });
      const response = await fetch("/api/site/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Upload failed.");
      onChange(result.url);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="edit-image">
      {value && <img src={value} alt="" />}
      <input value={value} onChange={(change) => onChange(change.target.value)} placeholder="/assets/... or upload" />
      <label className="edit-button">
        {busy ? "Uploading..." : "Upload"}
        <input type="file" accept="image/*" hidden disabled={busy} onChange={(change) => { void upload(change.target.files?.[0]); change.currentTarget.value = ""; }} />
      </label>
      {error && <p className="edit-error">{error}</p>}
    </div>
  );
}

const STYLE_FIELDS: { property: string; label: string; color?: boolean; placeholder?: string; options?: string[] }[] = [
  { property: "color", label: "Text color", color: true },
  { property: "background", label: "Background", color: true },
  { property: "font-size", label: "Text size", placeholder: "e.g. 24px" },
  { property: "font-weight", label: "Boldness", options: ["400", "700", "900"] },
  { property: "text-shadow", label: "Text shadow", placeholder: "e.g. 0 3px 0 #13120F" },
  { property: "box-shadow", label: "Box shadow", placeholder: "e.g. 0 6px 0 #13120F" },
  { property: "border", label: "Border", placeholder: "e.g. 3px solid #13120F" },
  { property: "border-radius", label: "Corner roundness", placeholder: "e.g. 16px" },
  { property: "opacity", label: "See-through", placeholder: "0 to 1" },
];

function PageTab({ edits }: { edits: SiteEdits }) {
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<Element | null>(null);
  const [scope, setScope] = useState<"one" | "all">("one");
  const [style, setStyle] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState({ text: null as string | null, src: "", href: "", background: "" });
  const [text, setText] = useState("");
  const [src, setSrc] = useState("");
  const [href, setHref] = useState("");
  const [status, setStatus] = useState("");

  const choose = useCallback((element: Element) => {
    const start = {
      text: ownText(element),
      src: element instanceof HTMLImageElement ? element.getAttribute("src") || "" : "",
      href: element instanceof HTMLAnchorElement ? element.getAttribute("href") || "" : "",
      // A box whose picture is a CSS background (bag art, banners).
      background: element instanceof HTMLImageElement ? "" : backgroundUrl(getComputedStyle(element).backgroundImage),
    };
    setTarget(element);
    setPicking(false);
    setStyle({});
    setOriginal(start);
    setText(start.text || "");
    setSrc(start.src || start.background);
    setHref(start.href);
    setStatus("");
  }, []);
  const box = usePicker(picking, choose);

  const selector = target ? (scope === "one" ? exactSelector(target) : likeSelector(target)) : "";
  const computed = target ? getComputedStyle(target) : null;
  const setProperty = (property: string, value: string) => setStyle((current) => {
    const next = { ...current };
    if (value) next[property] = value; else delete next[property];
    return next;
  });
  const previewFont = fontName(style["font-family"]);

  const saveFont = async (font: string) => setStatus(await saveEdits({ visual: { ...edits.visual, font: font || undefined } }) || "Site font saved.");
  const save = async () => {
    if (!target) return;
    const rule: VisualRule = { id: newId(), label: labelFor(target), selector, style: { ...style } };
    if (original.text !== null && text !== original.text) rule.text = text;
    if (target instanceof HTMLImageElement && src && src !== original.src) rule.src = src;
    if (!(target instanceof HTMLImageElement) && original.background && src && src !== original.background) rule.style["background-image"] = `url("${src}")`;
    if (target instanceof HTMLAnchorElement && href && href !== original.href) rule.href = href;
    if (!Object.keys(rule.style).length && rule.text === undefined && !rule.src && !rule.href) return setStatus("Change something first.");
    const error = await saveEdits({ visual: { ...edits.visual, rules: [...edits.visual.rules, rule] } });
    setStatus(error || "Saved! Everyone sees it after a refresh.");
    if (!error) setStyle({});
  };

  return (
    <div className="edit-section">
      <label className="edit-field">
        <span>Font for the whole site</span>
        <select value={edits.visual.font || ""} onChange={(change) => void saveFont(change.target.value)}>
          <option value="">Normal fonts</option>
          {FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
        </select>
      </label>
      <button type="button" className="edit-button edit-wide" onClick={() => setPicking(!picking)}>
        {picking ? "Click anything on the page... (click here to stop)" : "Pick something on the page"}
      </button>
      {box && <div data-edit-ui className="edit-highlight" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />}
      {target && (
        <>
          <p className="edit-picked">Editing <b>{labelFor(target)}</b></p>
          <div className="edit-row">
            <button type="button" className="edit-button" disabled={!target.parentElement || target.parentElement === document.body} onClick={() => target.parentElement && choose(target.parentElement)}>Pick the bigger box around it</button>
          </div>
          <div className="edit-row">
            <label><input type="radio" checked={scope === "one"} onChange={() => setScope("one")} /> Just this one</label>
            <label><input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Every one like it</label>
          </div>
          {original.text !== null && <label className="edit-field"><span>Text</span><input value={text} onChange={(change) => setText(change.target.value)} /></label>}
          {(target instanceof HTMLImageElement || original.background) && <div className="edit-field"><span>Picture</span><ImageField value={src} onChange={setSrc} /></div>}
          {target instanceof HTMLAnchorElement && <label className="edit-field"><span>Link goes to</span><input value={href} onChange={(change) => setHref(change.target.value)} placeholder="/ or https://..." /></label>}
          <label className="edit-field">
            <span>Font</span>
            <select value={previewFont} onChange={(change) => setProperty("font-family", change.target.value ? `"${change.target.value}", sans-serif` : "")}>
              <option value="">Keep ({fontName(computed?.fontFamily)})</option>
              {FONTS.map((font) => <option key={font} value={font}>{font}</option>)}
            </select>
          </label>
          {STYLE_FIELDS.map((field) => (
            <label key={field.property} className="edit-field">
              <span>{field.label}</span>
              <span className="edit-inputs">
                {field.color && <input type="color" value={style[field.property]?.startsWith("#") ? style[field.property] : toHex(computed?.getPropertyValue(field.property === "background" ? "background-color" : field.property) || "")} onChange={(change) => setProperty(field.property, change.target.value)} />}
                {field.options
                  ? <select value={style[field.property] || ""} onChange={(change) => setProperty(field.property, change.target.value)}><option value="">Keep</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
                  : <input value={style[field.property] || ""} onChange={(change) => setProperty(field.property, change.target.value)} placeholder={field.placeholder || computed?.getPropertyValue(field.property) || ""} />}
              </span>
            </label>
          ))}
          <label className="edit-row"><input type="checkbox" checked={style.display === "none"} onChange={(change) => setProperty("display", change.target.checked ? "none" : "")} /> Hide it</label>
          <button type="button" className="edit-button edit-save edit-wide" onClick={() => void save()}>Save this change</button>
          {previewFont && GOOGLE_FONTS.includes(previewFont) && <link rel="stylesheet" href={fontLink(previewFont)} />}
          {selector && Object.keys(style).length > 0 && <style data-edit-ui>{cssFor({ rules: [{ id: "preview", label: "", selector, style }] })}</style>}
        </>
      )}
      {status && <p className="edit-status">{status}</p>}
    </div>
  );
}

const optionalNumber = (value: string) => (value.trim() === "" ? undefined : Number(value));

function PacksTab({ edits }: { edits: SiteEdits }) {
  const [draft, setDraft] = useState<PackEdit | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [status, setStatus] = useState("");
  const preview = useMemo(() => (draft && draft.items.length ? capsuleFromEdit(draft) : null), [draft]);

  const open = (name: string) => {
    const capsule = liveCapsules.find((entry) => entry.name === name);
    if (!capsule) return;
    setDraft(packEditFor(capsule));
    setIsNew(false);
    setStatus("");
  };
  const create = () => {
    setDraft({ name: "", price: 25, art: "/assets/Bread.svg", stock: 0.5, rarityChances: {}, items: [{ name: "", rarity: "Common" }] });
    setIsNew(true);
    setStatus("");
  };
  const update = (changes: Partial<PackEdit>) => setDraft((current) => current && { ...current, ...changes });
  const updateItem = (index: number, changes: Partial<PackEdit["items"][number]>) =>
    setDraft((current) => current && { ...current, items: current.items.map((item, at) => (at === index ? { ...item, ...changes } : item)) });
  const store = async (packs: Record<string, PackEdit>, done: string) => {
    const error = await saveEdits({ catalog: { ...edits.catalog, packs } });
    setStatus(error || done);
    return !error;
  };
  const save = async () => {
    if (!draft) return;
    if (isNew && liveCapsules.some((capsule) => capsule.name === draft.name.trim())) return setStatus("A pack already has that name.");
    const pack = { ...draft, name: draft.name.trim(), items: draft.items.filter((item) => item.name.trim()).map((item) => ({ ...item, name: item.name.trim() })) };
    if (await store({ ...edits.catalog.packs, [pack.name]: pack }, "Saved! The shop and the odds update for everyone in a few seconds.")) setIsNew(false);
  };
  const remove = async () => {
    if (!draft || !window.confirm(`Take ${draft.name} out of the shop? You can bring it back from the Changes tab.`)) return;
    if (await store({ ...edits.catalog.packs, [draft.name]: { ...draft, removed: true } }, `${draft.name} is out of the shop.`)) setDraft(null);
  };
  const reset = async () => {
    if (!draft) return;
    const packs = { ...edits.catalog.packs };
    delete packs[draft.name];
    if (await store(packs, `${draft.name} is back to how it was.`)) setDraft(null);
  };

  if (!draft) {
    return (
      <div className="edit-section">
        <button type="button" className="edit-button edit-save edit-wide" onClick={create}>+ Make a new pack</button>
        <div className="edit-list">
          {liveCapsules.map((capsule) => (
            <button key={capsule.name} type="button" className="edit-list-item" onClick={() => open(capsule.name)}>
              <img src={capsule.art} alt="" /> {capsule.name}{edits.catalog.packs[capsule.name] ? " (edited)" : ""}
            </button>
          ))}
        </div>
        {status && <p className="edit-status">{status}</p>}
      </div>
    );
  }

  const tiers = rarityOrder.filter((rarity) => draft.items.some((item) => item.rarity === rarity));
  const total = preview ? preview.pool.reduce((sum, reward) => sum + chanceFor(preview, reward), 0) : 0;
  return (
    <div className="edit-section">
      <button type="button" className="edit-link" onClick={() => setDraft(null)}>&larr; All packs</button>
      <label className="edit-field"><span>Name</span><input value={draft.name} disabled={!isNew} onChange={(change) => update({ name: change.target.value })} /></label>
      <label className="edit-field"><span>Price</span><input type="number" min={0} value={draft.price} onChange={(change) => update({ price: Math.max(0, Math.floor(Number(change.target.value) || 0)) })} /></label>
      <div className="edit-field"><span>Bag picture</span><ImageField value={draft.art} onChange={(art) => update({ art })} /></div>
      {!(draft.name in seasonalPackOpensAt) && (
        <label className="edit-field"><span>Chance it&apos;s in the shop each hour (%)</span><input type="number" min={0} max={100} value={Math.round(draft.stock * 1000) / 10} onChange={(change) => update({ stock: Math.min(1, Math.max(0, (Number(change.target.value) || 0) / 100)) })} /></label>
      )}
      <p className="edit-help">Leave a % blank to use the normal odds. A rarity % is shared by every Breadlet of that rarity.</p>
      {tiers.map((rarity) => (
        <label key={rarity} className="edit-field">
          <span>All {rarity} together (%)</span>
          <input type="number" min={0} max={100} step="any" value={draft.rarityChances[rarity] ?? ""} placeholder="normal" onChange={(change) => {
            const rarityChances = { ...draft.rarityChances };
            const value = optionalNumber(change.target.value);
            if (value === undefined) delete rarityChances[rarity]; else rarityChances[rarity] = value;
            update({ rarityChances });
          }} />
        </label>
      ))}
      <table className="edit-table">
        <thead><tr><th>Breadlet</th><th>Rarity</th><th>Set %</th><th>Odds</th><th /></tr></thead>
        <tbody>
          {draft.items.map((item, index) => {
            const reward = preview?.pool.find((entry) => entry.name === item.name);
            return (
              <tr key={index}>
                <td><input value={item.name} onChange={(change) => updateItem(index, { name: change.target.value })} placeholder="Name" /></td>
                <td><select value={item.rarity} onChange={(change) => updateItem(index, { rarity: change.target.value })}>{rarityOrder.map((rarity) => <option key={rarity}>{rarity}</option>)}</select></td>
                <td><input type="number" min={0} max={100} step="any" value={item.chance ?? ""} placeholder="-" onChange={(change) => updateItem(index, { chance: optionalNumber(change.target.value) })} /></td>
                <td>{preview && reward ? `${chanceFor(preview, reward).toFixed(3)}%` : "-"}</td>
                <td><button type="button" className="edit-x" aria-label={`Remove ${item.name}`} onClick={() => update({ items: draft.items.filter((_, at) => at !== index) })}>x</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="edit-button" onClick={() => update({ items: [...draft.items, { name: "", rarity: "Common" }] })}>+ Add a Breadlet</button>
      <p className="edit-help">Odds add up to {total.toFixed(2)}%. New Breadlets get added to the game when you save; give them a picture in the Breadlets tab.</p>
      <div className="edit-row">
        <button type="button" className="edit-button edit-save" onClick={() => void save()}>Save pack</button>
        {!isNew && edits.catalog.packs[draft.name] && <button type="button" className="edit-button" onClick={() => void reset()}>Undo my edits</button>}
        {!isNew && <button type="button" className="edit-button edit-danger" onClick={() => void remove()}>Take out of shop</button>}
      </div>
      {status && <p className="edit-status">{status}</p>}
    </div>
  );
}

function BreadletsTab({ edits }: { edits: SiteEdits }) {
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [rarity, setRarity] = useState("");
  const [art, setArt] = useState("");
  const [status, setStatus] = useState("");
  const rarityOf = (blook: string) => [...liveCapsules, ...legacyCapsules].flatMap((capsule) => capsule.pool).find((reward) => reward.name === blook)?.rarity || "Common";
  const names = useMemo(() => Array.from(new Set([...liveCapsules, ...legacyCapsules].flatMap((capsule) => capsule.pool.map((reward) => reward.name)))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edits.catalog]);
  const shown = names.filter((entry) => entry.toLowerCase().includes(search.toLowerCase())).slice(0, 60);

  const open = (blook: string) => {
    setName(blook);
    setRarity(edits.catalog.blooks[blook]?.rarity || rarityOf(blook));
    setArt(edits.catalog.blooks[blook]?.art || "");
    setStatus("");
  };
  const store = async (blooks: CatalogEdits["blooks"], done: string) => setStatus(await saveEdits({ catalog: { ...edits.catalog, blooks } }) || done);
  const save = () => store({ ...edits.catalog.blooks, [name]: { rarity, ...(art ? { art } : {}) } }, `${name} saved! Players see it after a refresh.`);
  const reset = () => {
    const blooks = { ...edits.catalog.blooks };
    delete blooks[name];
    return store(blooks, `${name}'s picture is back to normal. Set the rarity back by hand if you changed it.`);
  };

  if (name) {
    return (
      <div className="edit-section">
        <button type="button" className="edit-link" onClick={() => setName("")}>&larr; All Breadlets</button>
        <h3 className="edit-title">{name}</h3>
        <label className="edit-field"><span>Rarity</span><select value={rarity} onChange={(change) => setRarity(change.target.value)}>{rarityOrder.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
        <div className="edit-field"><span>Picture (blank keeps the normal one)</span><ImageField value={art} onChange={setArt} /></div>
        <p className="edit-help">Changing the rarity changes it for everyone who owns one, and its odds in every pack.</p>
        <div className="edit-row">
          <button type="button" className="edit-button edit-save" onClick={() => void save()}>Save Breadlet</button>
          {edits.catalog.blooks[name] && <button type="button" className="edit-button" onClick={() => void reset()}>Undo picture</button>}
        </div>
        {status && <p className="edit-status">{status}</p>}
      </div>
    );
  }
  return (
    <div className="edit-section">
      <input className="edit-search" value={search} onChange={(change) => setSearch(change.target.value)} placeholder="Find a Breadlet..." />
      <div className="edit-list">
        {shown.map((entry) => (
          <button key={entry} type="button" className="edit-list-item" onClick={() => open(entry)}>
            {artOverrides[entry] && <img src={artOverrides[entry]} alt="" />} {entry}{edits.catalog.blooks[entry] ? " (edited)" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChangesTab({ edits }: { edits: SiteEdits }) {
  const [status, setStatus] = useState("");
  const removeRule = async (id: string) => setStatus(await saveEdits({ visual: { ...edits.visual, rules: edits.visual.rules.filter((rule) => rule.id !== id) } }) || "Change removed.");
  const resetPack = async (name: string) => {
    const packs = { ...edits.catalog.packs };
    delete packs[name];
    setStatus(await saveEdits({ catalog: { ...edits.catalog, packs } }) || `${name} is back to how it was.`);
  };
  const packs = Object.values(edits.catalog.packs);
  return (
    <div className="edit-section">
      {!edits.ready && <p className="edit-error">Run migration 0076_edit_mode.sql in Supabase first, or nothing can be saved.</p>}
      <h3 className="edit-title">Page changes</h3>
      {edits.visual.font && <div className="edit-change">Site font: {edits.visual.font} <button type="button" className="edit-x" onClick={async () => setStatus(await saveEdits({ visual: { ...edits.visual, font: undefined } }) || "Font reset.")}>x</button></div>}
      {!edits.visual.rules.length && !edits.visual.font && <p className="edit-help">None yet.</p>}
      {[...edits.visual.rules].reverse().map((rule) => (
        <div key={rule.id} className="edit-change" title={rule.selector}>
          {rule.label || rule.selector.slice(0, 40)}
          <span className="edit-help"> {[...Object.keys(rule.style), rule.text !== undefined && "text", rule.src && "picture", rule.href && "link"].filter(Boolean).join(", ")}</span>
          <button type="button" className="edit-x" aria-label="Remove this change" onClick={() => void removeRule(rule.id)}>x</button>
        </div>
      ))}
      <h3 className="edit-title">Packs</h3>
      {!packs.length && <p className="edit-help">None yet.</p>}
      {packs.map((pack) => (
        <div key={pack.name} className="edit-change">
          {pack.name}{pack.removed ? " (out of the shop)" : ""}
          <button type="button" className="edit-x" aria-label={`Undo ${pack.name}`} onClick={() => void resetPack(pack.name)}>x</button>
        </div>
      ))}
      <h3 className="edit-title">Breadlets</h3>
      {!Object.keys(edits.catalog.blooks).length && <p className="edit-help">None yet.</p>}
      {Object.entries(edits.catalog.blooks).map(([name, edit]) => <div key={name} className="edit-change">{name}: {[edit.rarity, edit.art && "new picture"].filter(Boolean).join(", ")}</div>)}
      {status && <p className="edit-status">{status}</p>}
    </div>
  );
}

const TABS = [
  { id: "page", label: "Page" },
  { id: "packs", label: "Packs" },
  { id: "breadlets", label: "Breadlets" },
  { id: "changes", label: "Changes" },
] as const;

// The edit mode side panel. Rendered into <body> so the game's own styles don't touch it.
export function EditModePanel({ close }: { close: () => void }) {
  const edits = useSiteEdits();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("page");
  const [small, setSmall] = useState(false);
  if (small) {
    return createPortal(<button type="button" data-edit-ui className="edit-pill" onClick={() => setSmall(false)}>Edit mode</button>, document.body);
  }
  return createPortal(
    <aside data-edit-ui className="edit-panel" aria-label="Edit mode">
      <header className="edit-header">
        <b>Edit mode</b>
        <button type="button" className="edit-button" onClick={() => setSmall(true)}>Hide</button>
        <button type="button" className="edit-button" onClick={close}>Exit</button>
      </header>
      <nav className="edit-tabs">
        {TABS.map((entry) => <button key={entry.id} type="button" aria-pressed={tab === entry.id} onClick={() => setTab(entry.id)}>{entry.label}</button>)}
      </nav>
      {tab === "page" && <PageTab edits={edits} />}
      {tab === "packs" && <PacksTab edits={edits} />}
      {tab === "breadlets" && <BreadletsTab edits={edits} />}
      {tab === "changes" && <ChangesTab edits={edits} />}
    </aside>,
    document.body,
  );
}
