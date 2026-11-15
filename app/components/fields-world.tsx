"use client";

// Games tab (test): the Breadlet Garden. A full-screen meadow you walk around as your equipped
// Breadlet. Every player has their own garden: buy seeds from Ted's Seed Stand (down the path), plant
// them in the fenced beds, come back and harvest. Owners invite players with a link and choose who may
// plant. Everything that costs or pays is decided by /api/fields.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Gift, Hand, Link2, ShoppingBasket, Sprout, Users } from "lucide-react";
import { WalkChat, WalkerSprite, useWalkWorld } from "./walk-world";
import { DAILY_EARN_LIMIT, MAX_BASKET, MAX_SEEDS_PER_BUY, SEEDS, cropValue, gardenInviteLink, seedNamed, sizeLabel, type Crop, type FieldsView, type SeedName } from "../../lib/fields";
import { Ambient, BedArt, gardenCollide, CropArt, cropImage, GARDEN, GATE, Meadow, PLOTS, STAND, SeedStand, WORLD } from "./garden-art";

const REACH = 130;

const clamp = (x: number, y: number) => ({ x: Math.max(40, Math.min(WORLD.width - 40, x)), y: Math.max(90, Math.min(WORLD.height - 30, y)) });
type Target = { kind: "plot"; index: number } | { kind: "stand" };

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

// Seed packet art, in the pouch and in Ted's shop.
const SEED_ART: Record<SeedName, string> = {
  Carrot: "/assets/garden/seed-carrot.svg",
  Potato: "/assets/garden/seed-potato.svg",
  Pumpkin: "/assets/garden/seed-pumpkin.svg",
  Avocado: "/assets/garden/seed-avocado.svg",
  "Pumpkin Dragon": "/assets/garden/seed-pumpkin-dragon.svg",
};

type GardenResponse = FieldsView & { tokens?: number; message?: string; breadlet?: string; payout?: number; crop?: Crop };
const cropName = (crop: Crop) => `${sizeLabel(crop.size)} ${crop.seed}`;

export function FieldsTab({ player, gardenId, tokens, onBalance, onBreadlet, onExit, artFor }: {
  player: { id: string; username: string; equipped: string; chatMutedUntil?: string };
  // The garden owner's id when visiting from an invite link; your own garden otherwise.
  gardenId?: string;
  tokens: number;
  onBalance: (tokens: number) => void;
  onBreadlet: () => void;
  onExit: () => void;
  artFor: (name: string) => string;
}) {
  const ownerId = gardenId || player.id;
  const [fields, setFields] = useState<FieldsView | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [selected, setSelected] = useState<SeedName>("Carrot");
  const [now, setNow] = useState(Date.now());
  const [floaters, setFloaters] = useState<{ id: number; x: number; y: number; text: string; kind: "coins" | "puff" | "crop"; seed?: SeedName }[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);
  // The crop in your hand (the extra hotbar slot). Hover a player while holding one to give it.
  const [heldId, setHeldId] = useState<string | null>(null);
  const [giveTo, setGiveTo] = useState<string | null>(null);
  const seenCropsRef = useRef<Set<string> | null>(null);
  const skewRef = useRef(0);
  const pendingRef = useRef<Target | null>(null);

  const { viewportRef, me, others, walkers, connected, camera, walkToPoint, say } = useWalkWorld({
    room: `garden-${ownerId}`,
    player,
    world: WORLD,
    clamp,
    collide: gardenCollide,
    spawn: () => clamp(GATE.x - 30 + Math.random() * 60, GARDEN.y + GARDEN.height + 70 + Math.random() * 40),
  });

  const apply = useCallback((data: GardenResponse, quiet = false) => {
    skewRef.current = data.now - Date.now();
    // Someone gave you a crop since the last refresh: say so.
    const crops = data.crops || [];
    const seen = seenCropsRef.current;
    const gift = seen && crops.find((crop) => crop.from && !seen.has(crop.id));
    seenCropsRef.current = new Set(crops.map((crop) => crop.id));
    setFields({ ...data, crops });
    if (gift && !data.message) setToast(`${gift.from} gave you a ${cropName(gift)}!`);
    if (typeof data.tokens === "number") onBalance(data.tokens);
    if (data.breadlet) onBreadlet();
    if (data.message && !quiet) setToast(data.message);
  }, [onBalance, onBreadlet]);

  // Load the garden, then keep it fresh so you see what visitors plant.
  useEffect(() => {
    let stopped = false;
    const query = gardenId ? `?garden=${encodeURIComponent(gardenId)}` : "";
    const refresh = async (first: boolean) => {
      const response = await fetch(`/api/fields${query}`, { cache: "no-store" }).catch(() => null);
      const data = await response?.json().catch(() => null);
      if (stopped) return;
      if (response?.ok && data) { setError(""); apply(data, true); }
      else if (first) setError(data?.error || "The garden could not load. Check your connection.");
    };
    void refresh(true);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(false); }, 8000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [apply, gardenId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + skewRef.current), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const post = async (body: Record<string, unknown>): Promise<GardenResponse | null> => {
    if (busy) return null;
    setBusy(true);
    const response = await fetch("/api/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, garden: gardenId }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy(false);
    if (response?.ok && data) { apply(data); return data; }
    setToast(data?.error || "That didn't work. Try again.");
    return null;
  };

  const float = (x: number, y: number, text: string, kind: "coins" | "puff" | "crop" = "coins", seed?: SeedName) => {
    const id = Date.now() + Math.random();
    setFloaters((list) => [...list, { id, x, y, text, kind, seed }]);
    window.setTimeout(() => setFloaters((list) => list.filter((item) => item.id !== id)), 1400);
  };

  const invite = async () => {
    const link = gardenInviteLink(window.location.origin, ownerId);
    try {
      await navigator.clipboard.writeText(link);
      setToast("Invite link copied! Send it to a friend.");
    } catch {
      window.prompt("Copy your garden invite link:", link);
    }
  };

  const spotOf = (target: Target) => (target.kind === "plot" ? PLOTS[target.index] : { x: STAND.x, y: STAND.y + 40 });
  const isNear = (target: Target) => {
    const spot = spotOf(target);
    return Math.hypot(me.x - spot.x, me.y - spot.y) < (target.kind === "stand" ? REACH + 40 : REACH);
  };

  const interact = (target: Target) => {
    if (!fields) return;
    if (target.kind === "stand") return setShopOpen(true);
    const plot = fields.plots[target.index];
    const seed = plot && seedNamed(plot.seed);
    const spot = PLOTS[target.index];
    if (plot && seed) {
      const planter = plot.plantedBy || fields.owner.id;
      if (planter !== player.id) return setToast(`That's ${plot.plantedByName || fields.owner.username}'s ${seed.name}.`);
      if (now < plot.plantedAt + seed.growMs) return setToast(`${seed.name} is still growing: ${clock(plot.plantedAt + seed.growMs - now)} left.`);
      void post({ action: "harvest", plot: target.index }).then((data) => data?.crop && float(spot.x, spot.y - 60, cropName(data.crop), "crop", data.crop.seed));
      return;
    }
    if (!fields.canPlant) return setToast(`Ask ${fields.owner.username} to let you plant here.`);
    const pick = fields.seeds[selected] > 0 ? selected : SEEDS.find((item) => fields.seeds[item.name] > 0)?.name;
    if (!pick) return setToast("You have no seeds. Follow the path to Ted's Seed Stand!");
    setSelected(pick);
    void post({ action: "plant", plot: target.index, seed: pick }).then((data) => data && float(spot.x, spot.y + 10, "", "puff"));
  };

  // The fence is solid, so walking in or out of the garden goes through the gate.
  const routeRef = useRef<{ x: number; y: number }[]>([]);
  const inGarden = (x: number, y: number) => x > GARDEN.x && x < GARDEN.x + GARDEN.width && y > GARDEN.y && y < GARDEN.y + GARDEN.height;
  const goTo = (x: number, y: number) => {
    const inside = inGarden(me.x, me.y);
    if (inside === inGarden(x, y)) { routeRef.current = []; return walkToPoint(x, y); }
    const front = GARDEN.y + GARDEN.height;
    const gateInside = { x: GATE.x, y: front - 50 }, gateOutside = { x: GATE.x, y: front + 60 };
    routeRef.current = inside ? [gateInside, gateOutside, { x, y }] : [gateOutside, gateInside, { x, y }];
    walkToPoint(routeRef.current[0].x, routeRef.current[0].y);
  };
  useEffect(() => {
    const [next, ...rest] = routeRef.current;
    if (next && rest.length && Math.hypot(me.x - next.x, me.y - next.y) < 12) {
      routeRef.current = rest;
      walkToPoint(rest[0].x, rest[0].y);
    }
  }, [me.x, me.y, walkToPoint]);
  const walkToClick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    goTo(event.clientX - rect.left + camera.x, event.clientY - rect.top + camera.y);
  };

  // Clicking something far away walks over first, then uses it on arrival.
  const choose = (event: React.PointerEvent, target: Target) => {
    event.stopPropagation();
    if (isNear(target)) return interact(target);
    pendingRef.current = target;
    const spot = spotOf(target);
    goTo(spot.x, spot.y + (target.kind === "stand" ? 60 : 90));
  };
  useEffect(() => {
    const pending = pendingRef.current;
    if (pending && isNear(pending)) {
      pendingRef.current = null;
      interact(pending);
    }
  });

  const targets: Target[] = useMemo(() => [{ kind: "stand" }, ...PLOTS.map((_, index) => ({ kind: "plot" as const, index }))], []);
  const nearest = targets.filter(isNear).sort((a, b) => Math.hypot(me.x - spotOf(a).x, me.y - spotOf(a).y) - Math.hypot(me.x - spotOf(b).x, me.y - spotOf(b).y))[0] || null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key === "Escape") { setShopOpen(false); setPeopleOpen(false); setBasketOpen(false); setGiveTo(null); return; }
      const number = Number(event.key);
      if (number >= 1 && number <= SEEDS.length) return setSelected(SEEDS[number - 1].name);
      if (number === SEEDS.length + 1 || event.key.toLowerCase() === "b") return setBasketOpen((open) => !open);
      if (event.key.toLowerCase() !== "e" && event.key !== " ") return;
      event.preventDefault();
      if (shopOpen) return;
      if (nearest) interact(nearest);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hint = !nearest ? "WASD / arrow keys or click to walk" : nearest.kind === "stand" ? "Press E to shop for seeds" : (() => {
    const plot = fields?.plots[nearest.index];
    const seed = plot && seedNamed(plot.seed);
    if (!plot || !seed) return fields && !fields.canPlant ? `Only players ${fields.owner.username} allows can plant here` : `Press E to plant a ${selected} seed`;
    if ((plot.plantedBy || fields?.owner.id) !== player.id) return `${plot.plantedByName || fields?.owner.username}'s ${seed.name}`;
    return now >= plot.plantedAt + seed.growMs ? `Press E to pick your ${plot.size ? sizeLabel(plot.size) + " " : ""}${seed.name}` : `${seed.name} ready in ${clock(plot.plantedAt + seed.growMs - now)}`;
  })();

  const crops = fields?.crops || [];
  const held = crops.find((crop) => crop.id === heldId) || null;
  // A held crop that got sold or given away leaves your hand.
  useEffect(() => { if (heldId && fields && !held) setHeldId(null); }, [heldId, fields, held]);
  useEffect(() => { if (!held) setGiveTo(null); }, [held]);
  const basketValue = crops.reduce((total, crop) => total + cropValue(crop.seed, crop.size), 0);
  const sell = (body: Record<string, unknown>) => void post({ action: "sell", ...body }).then((data) => data?.payout && float(me.x, me.y - 90, `+${data.payout}`));
  const give = (profileId: string) => {
    if (!held) return;
    const friend = others[profileId];
    void post({ action: "give", crop: held.id, profileId }).then((data) => { if (data) { setGiveTo(null); if (friend) float(friend.x, friend.y - 90, "", "crop", held.seed); } });
  };

  // Owners pick who can plant: everyone here right now, plus anyone already allowed.
  const visitors = useMemo(() => {
    const list = new Map<string, string>();
    Object.values(others).forEach((walker) => list.set(walker.id, walker.username));
    (fields?.helpers || []).forEach((helper) => list.set(helper.id, helper.username));
    return Array.from(list, ([id, username]) => ({ id, username, here: Boolean(others[id]), allowed: Boolean(fields?.helpers.some((helper) => helper.id === id)) }));
  }, [others, fields?.helpers]);

  const ownerName = fields?.owner.username || (gardenId ? "A friend" : player.username);

  return createPortal(
    <div className="garden-screen">
      <div ref={viewportRef} onPointerDown={(event) => { pendingRef.current = null; walkToClick(event); }} className="explore-viewport garden-viewport">
        <div className="garden-world" style={{ width: WORLD.width, height: WORLD.height, transform: `translate3d(${-camera.x}px, ${-camera.y}px, 0)` }}>
          <Meadow isOwner={fields ? fields.isOwner : !gardenId} />
          <SeedStand near={nearest?.kind === "stand"} />
          <button type="button" aria-label="Ted's Seed Stand" className="garden-stand-hit" style={{ left: STAND.x, top: STAND.y }} onPointerDown={(event) => choose(event, { kind: "stand" })} />

          {PLOTS.map((spot, index) => {
            const plot = fields?.plots[index] || null;
            const seed = plot && seedNamed(plot.seed);
            const progress = plot && seed ? Math.min(1, (now - plot.plantedAt) / seed.growMs) : 0;
            const ready = Boolean(plot) && progress >= 1;
            const isNearest = nearest?.kind === "plot" && nearest.index === index;
            const theirs = plot && (plot.plantedBy || fields?.owner.id) !== player.id;
            return (
              <button key={index} type="button" onPointerDown={(event) => choose(event, { kind: "plot", index })}
                aria-label={!plot ? "Empty bed: plant a seed" : ready ? `Harvest ${plot.seed}` : `${plot.seed} growing`}
                className={`garden-plot${ready ? " is-ready" : ""}${isNearest ? " is-near" : ""}`} style={{ left: spot.x, top: spot.y, zIndex: 5 }}>
                <BedArt />
                {plot && seed && <CropArt seed={seed.name} progress={progress} size={plot.size} />}
                {ready && <span className="garden-sparkles" aria-hidden="true"><i /><i /><i /><i /></span>}
                {plot && !ready && <span className="garden-timer">{theirs ? `${plot.plantedByName || "Friend"} · ` : ""}{clock(plot.plantedAt + (seed?.growMs || 0) - now)}</span>}
                {plot && ready && <span className="garden-ready">{theirs ? `${plot.plantedByName || "Friend"}'s` : "Ready!"}</span>}
                {plot && !ready && <span className="garden-bar"><i style={{ width: `${progress * 100}%` }} /></span>}
              </button>
            );
          })}

          <Ambient />
          {walkers.map((walker) => <WalkerSprite key={walker.id} walker={walker} isMe={walker.id === player.id} artFor={artFor} />)}
          {held && <img src={cropImage(held.seed)} alt="" className="garden-held" style={{ left: me.x + 30 * me.facing, top: me.y - 34, zIndex: Math.round(me.y) + 1 }} draggable={false} />}
          {held && Object.values(others).map((walker) => (
            <div key={walker.id} className="garden-give" style={{ left: walker.x, top: walker.y, zIndex: 3000 + Math.round(walker.y) }}
              onPointerEnter={() => setGiveTo(walker.id)} onPointerLeave={() => setGiveTo((id) => (id === walker.id ? null : id))} onPointerDown={(event) => { event.stopPropagation(); setGiveTo(walker.id); }}>
              <span className="garden-give-hit" aria-hidden="true" />
              {giveTo === walker.id && (
                <div className="garden-give-pop" role="dialog" aria-label={`Give to ${walker.username}`}>
                  <img src={cropImage(held.seed)} alt="" />
                  <span>Give your <b>{cropName(held)}</b> to <b>{walker.username}</b>?</span>
                  <button type="button" disabled={busy} onClick={() => give(walker.id)}><Gift size={16} />Give</button>
                </div>
              )}
            </div>
          ))}
          {floaters.map((item) => item.kind === "puff"
            ? <span key={item.id} className="garden-puff" style={{ left: item.x, top: item.y }} aria-hidden="true"><i /><i /><i /><i /><i /></span>
            : item.kind === "crop" && item.seed
            ? <span key={item.id} className="garden-floater" style={{ left: item.x, top: item.y }}><img src={cropImage(item.seed)} alt="" className="garden-floater-crop" />{item.text}</span>
            : <span key={item.id} className="garden-floater" style={{ left: item.x, top: item.y }}><span className="garden-burst" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span><img src="/assets/Bread%20bucks.svg" alt="" />{item.text}</span>)}
        </div>
      </div>

      <div className="garden-hud-top">
        <button type="button" onClick={onExit} className="garden-leave"><ArrowLeft size={18} />Leave</button>
        <span className="garden-title">{fields?.isOwner === false ? `${ownerName}'s Garden` : "My Garden"} <small>Test</small></span>
        {fields?.isOwner && <button type="button" onClick={() => void invite()} className="garden-chip garden-chip-button"><Link2 size={16} />Invite</button>}
        {fields && !fields.isOwner && <span className={`garden-chip${fields.canPlant ? " is-good" : ""}`}><Sprout size={16} />{fields.canPlant ? "You can plant" : `Ask ${ownerName} to plant`}</span>}
        {fields && <span className={`garden-chip ml-auto${fields.earnedToday >= DAILY_EARN_LIMIT ? " is-capped" : ""}`} title="Bread Bucks earned from gardens today (resets at midnight UTC)"><Sprout size={16} />{fields.earnedToday.toLocaleString()} / {DAILY_EARN_LIMIT.toLocaleString()} today</span>}
        <span className={`garden-chip${fields ? "" : " ml-auto"}`}><img src="/assets/Bread%20bucks.svg" alt="" />{tokens.toLocaleString()}</span>
        <button type="button" onClick={() => setPeopleOpen((open) => !open)} disabled={!fields?.isOwner} className="garden-chip garden-chip-button" title={fields?.isOwner ? "Who can plant" : "Players here"}><Users size={16} />{connected ? Object.keys(others).length + 1 : "…"}</button>
      </div>

      {peopleOpen && fields?.isOwner && (
        <section className="garden-people" aria-label="Who can plant">
          <header><b>Who can plant</b><button type="button" onClick={() => setPeopleOpen(false)} aria-label="Close">×</button></header>
          {visitors.length === 0 && <p>Nobody else is here yet. Tap <b>Invite</b> to copy a link for your friends.</p>}
          {visitors.map((visitor) => (
            <div key={visitor.id} className="garden-person">
              <span className={`garden-dot${visitor.here ? " is-here" : ""}`} title={visitor.here ? "In your garden" : "Not here right now"} />
              <span className="garden-person-name">{visitor.username}</span>
              <button type="button" disabled={busy} onClick={() => void post({ action: "permit", profileId: visitor.id, allow: !visitor.allowed })} className={`garden-toggle${visitor.allowed ? " is-on" : ""}`} aria-pressed={visitor.allowed}>{visitor.allowed ? "Can plant" : "Let plant"}</button>
            </div>
          ))}
        </section>
      )}

      {toast && <p className="garden-toast" role="status">{toast}</p>}
      {error && <div className="garden-toast is-error" role="alert">{error} <button type="button" onClick={onExit} className="garden-error-leave">Leave</button></div>}

      <div className="garden-hud-bottom">
        <p className="garden-hint">{hint}</p>
        <div className="garden-pouch" role="radiogroup" aria-label="Seed pouch">
          {SEEDS.map((seed, index) => (
            <button key={seed.name} type="button" role="radio" aria-checked={selected === seed.name} onClick={() => setSelected(seed.name)} className={`garden-pouch-slot${selected === seed.name ? " is-selected" : ""}${(fields?.seeds[seed.name] || 0) === 0 ? " is-empty" : ""}`} title={`${seed.name} seeds (${index + 1})`}>
              <img src={SEED_ART[seed.name]} alt="" />
              <b>{fields?.seeds[seed.name] || 0}</b>
              <small>{index + 1}</small>
            </button>
          ))}
          <span className="garden-pouch-divider" aria-hidden="true" />
          <button type="button" onClick={() => setBasketOpen((open) => !open)} className={`garden-pouch-slot garden-hand-slot${held ? " is-holding" : ""}${basketOpen ? " is-selected" : ""}`} title={held ? `Holding a ${cropName(held)}. Hover a player to give it (${SEEDS.length + 1})` : `Basket: pick a crop to hold (${SEEDS.length + 1})`}>
            {held ? <img src={cropImage(held.seed)} alt="" /> : <Hand size={30} />}
            <b>{crops.length}</b>
            <small>{SEEDS.length + 1}</small>
          </button>
        </div>
        <div className="garden-chat"><WalkChat placeholder="Say something…" say={say} buttonClassName="garden-say" /></div>
      </div>

      {basketOpen && fields && (
        <div className="garden-shop-layer" onPointerDown={() => setBasketOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="garden-basket-title" className="garden-shop garden-basket" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <span className="garden-basket-icon"><ShoppingBasket size={34} /></span>
              <div><small>{crops.length} / {MAX_BASKET} crops</small><h2 id="garden-basket-title">Your basket</h2></div>
              <button type="button" onClick={() => setBasketOpen(false)} aria-label="Close">×</button>
            </header>
            {crops.length === 0
              ? <p className="garden-basket-empty">Nothing here yet. Grow something and pick it to fill your basket!</p>
              : (
                <>
                  <div className="garden-basket-all">
                    <span>Bigger crops sell for more. Hold one, then hover a player to give it to them.</span>
                    <button type="button" disabled={busy} onClick={() => sell({ all: true })}>Sell all<img src="/assets/Bread%20bucks.svg" alt="" />{basketValue.toLocaleString()}</button>
                  </div>
                  <div className="garden-shop-list">
                    {crops.map((crop) => (
                      <div key={crop.id} className={`garden-shop-row${crop.id === heldId ? " is-held" : ""}`}>
                        <span className="garden-shop-art"><img src={cropImage(crop.seed)} alt="" style={{ scale: String(0.7 + crop.size * 0.25) }} /></span>
                        <span className="garden-shop-info">
                          <b>{cropName(crop)}</b>
                          <small>Size {crop.size}x · sells for <em>{cropValue(crop.seed, crop.size)}</em></small>
                          {crop.from && <small>A gift from {crop.from}</small>}
                        </span>
                        <span className="garden-shop-buy">
                          <button type="button" onClick={() => { setHeldId(crop.id === heldId ? null : crop.id); if (crop.id !== heldId) setBasketOpen(false); }}>{crop.id === heldId ? "Put away" : "Hold"}</button>
                          <button type="button" disabled={busy} onClick={() => sell({ crop: crop.id })}>Sell<img src="/assets/Bread%20bucks.svg" alt="" />{cropValue(crop.seed, crop.size)}</button>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
          </section>
        </div>
      )}

      {shopOpen && fields && (
        <div className="garden-shop-layer" onPointerDown={() => setShopOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="garden-shop-title" className="garden-shop" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <img src="/assets/ted-shopkeeper.svg" alt="" />
              <div><small>Ted&apos;s Seed Stand</small><h2 id="garden-shop-title">Fresh seeds!</h2></div>
              <button type="button" onClick={() => setShopOpen(false)} aria-label="Close">×</button>
            </header>
            <div className="garden-shop-list">
              {SEEDS.map((seed) => (
                <div key={seed.name} className="garden-shop-row">
                  <span className="garden-shop-art"><img src={SEED_ART[seed.name]} alt="" /></span>
                  <span className="garden-shop-info">
                    <b>{seed.name} seed</b>
                    <small>Grows in {clock(seed.growMs)} · sells for about <em>{seed.payout}</em> (more if it grows big)</small>
                    <small>You have {fields.seeds[seed.name]}</small>
                  </span>
                  <span className="garden-shop-buy">
                    {[1, 5].map((amount) => (
                      <button key={amount} type="button" disabled={busy || tokens < seed.cost * amount} onClick={() => void post({ action: "buy", seed: seed.name, amount: Math.min(amount, MAX_SEEDS_PER_BUY) })}>
                        <span>x{amount}</span><img src="/assets/Bread%20bucks.svg" alt="" />{seed.cost * amount}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>,
    document.body,
  );
}
