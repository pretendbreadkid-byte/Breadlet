"use client";

// Games tab (test): the Breadlet Garden. A full-screen meadow you walk around as your equipped
// Breadlet. Every player has their own garden: buy seeds from Ted's Seed Stand (down the path), plant
// them anywhere on the two dirt rows, come back and pick them into your basket. Owners invite players
// with a link and choose who may plant and who may build (place props from the Props shop).
// Everything that costs or pays is decided by /api/fields.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Boxes, Gauge, FlipHorizontal, Minus, Move, Plus, ChevronDown, ChevronUp, Gift, Hammer, Hand, Link2, ShoppingBasket, Sprout, Trash2, UserPlus } from "lucide-react";
import { useSettings } from "./settings-tab";
import { WalkChat, WalkerSprite, useWalkWorld } from "./walk-world";
import {
  DAILY_EARN_LIMIT, GARDEN_TOKEN_ART, MAX_BASKET, MAX_SEEDS_PER_BUY, PLANT_GAP, PROPS, SEEDS,
  MAX_PROP_SCALE, MIN_PROP_SCALE, canPlaceProp, cropValue, nextSeedRestock, readyAt, seedStockFor, gardenInviteLink, inRow, propNamed, seedNamed, sizeLabel,
  type Crop, type FieldsView, type PlacedProp, type PropKind, type SeedName,
} from "../../lib/fields";
import { GardenBook, gardenBookSeen } from "./garden-book";
import { Ambient, CropArt, GARDEN, GATE, Meadow, STAND, SeedStand, WORLD, gardenCollide, propCircles } from "./garden-art";

const REACH = 120;
// How long a visitor waits after the owner leaves before the garden closes on them.
const OWNER_GONE_MS = 6000;

const clamp = (x: number, y: number) => ({ x: Math.max(40, Math.min(WORLD.width - 40, x)), y: Math.max(90, Math.min(WORLD.height - 30, y)) });
type Point = { x: number; y: number };
type Target = { kind: "stand" } | { kind: "plant"; id: string } | { kind: "spot"; x: number; y: number } | { kind: "place"; prop: PropKind; x: number; y: number };
type Panel = "shop" | "basket" | "people" | "props" | null;

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
  Pepper: "/assets/garden/seed-pepper.svg",
  "Ghost Pepper": "/assets/garden/seed-ghost-pepper.svg",
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
  const [panel, setPanel] = useState<Panel>(null);
  // What's in your hand: a seed packet, a crop from the basket, or nothing.
  const [selected, setSelected] = useState<SeedName | null>("Carrot");
  const [heldId, setHeldId] = useState<string | null>(null);
  // Harvesting: your Breadlet takes out a trowel and digs for a moment.
  const [digging, setDigging] = useState(0);
  useEffect(() => { if (!digging) return; const timer = window.setTimeout(() => setDigging(0), 1100); return () => window.clearTimeout(timer); }, [digging]);
  const [giveTo, setGiveTo] = useState<string | null>(null);
  const [hotbarOpen, setHotbarOpen] = useState(true);
  // Placing a prop: it follows the pointer until you click a spot.
  const [placing, setPlacing] = useState<PropKind | null>(null);
  const [ghost, setGhost] = useState<Point | null>(null);
  const [propMenu, setPropMenu] = useState<string | null>(null);
  // Edit mode: pick a prop, drag it around, resize or flip it. draft is the change not saved yet.
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlacedProp | null>(null);
  const dragRef = useRef<{ id: string; offX: number; offY: number; moved: boolean } | null>(null);
  const [ownerGone, setOwnerGone] = useState(false);
  // The gardening book (tutorial): opens the first time, and when you tap the garden's name.
  const [bookOpen, setBookOpen] = useState(false);
  useEffect(() => { if (!gardenBookSeen()) setBookOpen(true); }, []);
  const [now, setNow] = useState(Date.now());
  // Performance mode (saved in settings): a plainer map with no butterflies or sparkles.
  const { settings: gardenSettings, update: updateSettings } = useSettings();
  const lite = gardenSettings.gardenPerformance;
  const [buyWarn, setBuyWarn] = useState<{ seed: SeedName; amount: number; room: number } | null>(null);
  const limitWarned = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const act = useRef<{ choose: (target: any) => void; viewportPoint: (x: number, y: number) => { x: number; y: number }; post: (body: Record<string, unknown>) => Promise<unknown> }>(null!);
  const [floaters, setFloaters] = useState<{ id: number; x: number; y: number; text: string; kind: "coins" | "puff" | "crop"; seed?: SeedName }[]>([]);
  const seenCropsRef = useRef<Set<string> | null>(null);
  const skewRef = useRef(0);
  const pendingRef = useRef<Target | null>(null);
  const solidRef = useRef<ReturnType<typeof propCircles>>([]);

  const { viewportRef, me, others, walkers, connected, camera, cameraNow, walkToPoint, say } = useWalkWorld({
    room: `garden-${ownerId}`,
    player,
    world: WORLD,
    clamp,
    collide: (from, to) => gardenCollide(from, to, solidRef.current),
    spawn: () => clamp(GATE.x - 30 + Math.random() * 60, GARDEN.y + GARDEN.height + 70 + Math.random() * 40),
  });

  const apply = useCallback((data: GardenResponse, quiet = false) => {
    skewRef.current = data.now - Date.now();
    // Someone gave you a crop since the last refresh: say so.
    const crops = data.crops || [];
    const seen = seenCropsRef.current;
    const gift = seen && crops.find((crop) => crop.from && !seen.has(crop.id));
    seenCropsRef.current = new Set(crops.map((crop) => crop.id));
    setFields({ ...data, crops, plants: data.plants || [], props: data.props || [] });
    if (typeof data.tokens === "number") onBalance(data.tokens);
    if (data.breadlet) onBreadlet();
    if (data.message && !quiet) setToast(data.message);
    else if (gift) setToast(`${gift.from} gave you a ${cropName(gift)}!`);
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

  // Props you can't walk through.
  solidRef.current = useMemo(() => propCircles(fields?.props || []), [fields?.props]);

  // Visiting: when the owner leaves, the garden closes and everyone else is sent back.
  const ownerHere = Boolean(others[ownerId]);
  useEffect(() => {
    if (!fields || fields.isOwner || !connected || ownerHere) return;
    const timer = window.setTimeout(() => setOwnerGone(true), OWNER_GONE_MS);
    return () => window.clearTimeout(timer);
  }, [fields, connected, ownerHere]);
  useEffect(() => {
    if (!ownerGone) return;
    const timer = window.setTimeout(onExit, 3500);
    return () => window.clearTimeout(timer);
  }, [ownerGone, onExit]);

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

  const plants = fields?.plants || [];
  const props = fields?.props || [];
  const crops = fields?.crops || [];
  const held = crops.find((crop) => crop.id === heldId) || null;
  const plantById = (id: string) => plants.find((plant) => plant.id === id);
  const freeSpot = (x: number, y: number) => inRow(x, y) && !plants.some((plant) => Math.hypot(plant.x - x, plant.y - y) < PLANT_GAP);

  const spotOf = (target: Target): Point => {
    if (target.kind === "stand") return { x: STAND.x, y: STAND.y + 40 };
    if (target.kind === "plant") return plantById(target.id) || { x: -9999, y: -9999 };
    return { x: target.x, y: target.y };
  };
  const isNear = (target: Target) => {
    const spot = spotOf(target);
    const reach = target.kind === "stand" ? REACH + 50 : target.kind === "place" ? REACH + 80 : REACH;
    return Math.hypot(me.x - spot.x, me.y - spot.y) < reach;
  };

  const plantSeed = (x: number, y: number) => {
    if (!fields || !selected) return;
    if (!fields.canPlant) return setToast(`Ask ${fields.owner.username} to let you plant here.`);
    if (fields.seeds[selected] < 1) return setToast(`You have no ${selected} seeds. Follow the path to Ted's Seed Stand!`);
    if (!freeSpot(x, y)) return setToast(inRow(x, y) ? "That's too close to another plant." : "Plant it on one of the dirt rows.");
    void post({ action: "plant", seed: selected, x: Math.round(x), y: Math.round(y) }).then((data) => data && float(x, y, "", "puff"));
  };

  const interact = (target: Target) => {
    if (!fields) return;
    if (target.kind === "stand") return setPanel("shop");
    if (target.kind === "spot") return plantSeed(target.x, target.y);
    if (target.kind === "place") {
      void post({ action: "place", kind: target.prop, x: Math.round(target.x), y: Math.round(target.y) }).then((data) => {
        if (!data) return;
        float(target.x, target.y - 30, "", "puff");
        if ((data.propBag?.[target.prop] || 0) < 1) { setPlacing(null); setGhost(null); }
      });
      return;
    }
    const plant = plantById(target.id);
    const seed = plant && seedNamed(plant.seed);
    if (!plant || !seed) return;
    if ((plant.plantedBy || fields.owner.id) !== player.id) return setToast(`That's ${plant.plantedByName || fields.owner.username}'s ${seed.name}.`);
    if (now < readyAt(plant, seed)) return setToast(`${seed.name} is still growing: ${clock(readyAt(plant, seed) - now)} left.`);
    setDigging(Date.now());
    void post({ action: "harvest", plant: plant.id }).then((data) => data?.crop && float(plant.x, plant.y - 90, cropName(data.crop), "crop", data.crop.seed));
  };

  // The fence is solid, so walking in or out of the garden goes through the gate.
  const routeRef = useRef<Point[]>([]);
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

  // Clicking something far away walks over first, then uses it on arrival.
  const choose = (target: Target) => {
    if (isNear(target)) return interact(target);
    pendingRef.current = target;
    const spot = spotOf(target);
    goTo(spot.x, spot.y + (target.kind === "stand" ? 60 : target.kind === "place" ? 70 : 30));
  };
  useEffect(() => {
    const pending = pendingRef.current;
    if (pending && isNear(pending)) {
      pendingRef.current = null;
      interact(pending);
    }
  });

  const worldPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const live = cameraNow();
    return { x: event.clientX - rect.left + live.x, y: event.clientY - rect.top + live.y };
  };
  // A click on the ground: place the prop you're holding, plant your seed on a row, or walk.
  const clickGround = (event: React.PointerEvent<HTMLDivElement>) => {
    pendingRef.current = null;
    setPropMenu(null);
    if (editing && editId) { setEditId(null); setDraft(null); }
    const point = worldPoint(event);
    if (placing) {
      if (!canPlaceProp(placing, point.x, point.y, props)) return setToast("It can't go there. Try the grass inside the fence, off the rows.");
      return choose({ kind: "place", prop: placing, x: point.x, y: point.y });
    }
    if (selected && inRow(point.x, point.y)) return choose({ kind: "spot", x: point.x, y: point.y });
    goTo(point.x, point.y);
  };

  const targets: Target[] = useMemo(() => [{ kind: "stand" }, ...plants.map((plant) => ({ kind: "plant" as const, id: plant.id }))], [plants]);
  const nearest = targets.filter(isNear).sort((a, b) => Math.hypot(me.x - spotOf(a).x, me.y - spotOf(a).y) - Math.hypot(me.x - spotOf(b).x, me.y - spotOf(b).y))[0] || null;
  const nearestPlant = nearest?.kind === "plant" ? plantById(nearest.id) : undefined;
  const nearestSeed = nearestPlant && seedNamed(nearestPlant.seed);
  const nearestMine = Boolean(nearestPlant && (nearestPlant.plantedBy || fields?.owner.id) === player.id);
  const nearestReady = Boolean(nearestPlant && nearestSeed && now >= readyAt(nearestPlant, nearestSeed));
  const canPlantHere = Boolean(selected && fields?.canPlant && freeSpot(me.x, me.y));

  // Picking a seed or a crop puts the other away; picking the one you're holding empties your hand.
  const pickSeed = (seed: SeedName) => { setHeldId(null); setSelected((current) => (current === seed ? null : seed)); };
  const holdCrop = (id: string | null) => { setHeldId(id); if (id) setSelected(null); };
  const handSlot = () => (held ? holdCrop(null) : setPanel((open) => (open === "basket" ? null : "basket")));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key === "Escape") { setPanel(null); setGiveTo(null); setPlacing(null); setGhost(null); setPropMenu(null); setEditId(null); setDraft(null); return; }
      const number = Number(event.key);
      if (number >= 1 && number <= SEEDS.length) return pickSeed(SEEDS[number - 1].name);
      if (number === SEEDS.length + 1 || event.key.toLowerCase() === "b") return handSlot();
      if (event.key.toLowerCase() !== "e" && event.key !== " ") return;
      event.preventDefault();
      if (panel || bookOpen) return;
      if (nearestPlant && nearestMine && nearestReady) return interact(nearest!);
      if (canPlantHere) return plantSeed(me.x, me.y);
      if (nearest) interact(nearest);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hint = placing ? `Click the grass to place your ${placing} · Esc to stop`
    : nearestPlant && nearestSeed && nearestMine && nearestReady ? `Press E to pick your ${nearestPlant.size ? `${sizeLabel(nearestPlant.size)} ` : ""}${nearestSeed.name}`
    : canPlantHere ? `Press E or click a row to plant a ${selected} seed`
    : nearest?.kind === "stand" ? "Press E to shop for seeds"
    : nearestPlant && nearestSeed ? (nearestMine ? `${nearestSeed.name} ready in ${clock(readyAt(nearestPlant, nearestSeed) - now)}` : `${nearestPlant.plantedByName || fields?.owner.username}'s ${nearestSeed.name}`)
    : selected && fields && !fields.canPlant ? `Only players ${fields.owner.username} allows can plant here`
    : selected ? "Click a dirt row to plant" : "WASD / arrow keys or click to walk";

  // A held crop that got sold or given away leaves your hand.
  useEffect(() => { if (heldId && fields && !held) setHeldId(null); }, [heldId, fields, held]);
  useEffect(() => { if (!held) setGiveTo(null); }, [held]);
  const basketValue = crops.reduce((total, crop) => total + cropValue(crop.seed, crop.size), 0);
  const sell = (body: Record<string, unknown>) => void post({ action: "sell", ...body }).then((data) => data?.payout && float(me.x, me.y - 90, `+${data.payout}`));
  const give = (profileId: string) => {
    if (!held) return;
    const friend = others[profileId];
    const seed = held.seed;
    void post({ action: "give", crop: held.id, profileId }).then((data) => { if (data) { setGiveTo(null); if (friend) float(friend.x, friend.y - 90, "", "crop", seed); } });
  };

  // Owners pick who can plant and build: everyone here right now, plus anyone already allowed.
  const visitors = useMemo(() => {
    const list = new Map<string, string>();
    Object.values(others).forEach((walker) => { if (walker.id !== ownerId) list.set(walker.id, walker.username); });
    [...(fields?.helpers || []), ...(fields?.builders || [])].forEach((person) => list.set(person.id, person.username));
    return Array.from(list, ([id, username]) => ({
      id, username, here: Boolean(others[id]),
      plants: Boolean(fields?.helpers.some((person) => person.id === id)),
      builds: Boolean(fields?.builders.some((person) => person.id === id)),
    }));
  }, [others, ownerId, fields?.helpers, fields?.builders]);

  const ownerName = fields?.owner.username || (gardenId ? "A friend" : player.username);
  const alone = Object.keys(others).length === 0;
  const canEditProp = (prop: PlacedProp) => Boolean(fields && (fields.isOwner || (fields.canBuild && prop.by === player.id)));
  const selectedProp = editId ? (draft && draft.id === editId ? draft : props.find((prop) => prop.id === editId)) || null : null;
  const viewportPoint = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const live = cameraNow();
    return { x: clientX - (rect?.left || 0) + live.x, y: clientY - (rect?.top || 0) + live.y };
  };
  // Saves a moved, resized or flipped prop. If it can't go there, it snaps back.
  const saveDraft = (next: PlacedProp) => {
    setDraft(next);
    if (!canPlaceProp(next.kind, next.x, next.y, props, next.id, next.scale || 1)) {
      setToast("It can't go there. Try the grass inside the fence, off the rows.");
      setDraft(null);
      return;
    }
    void post({ action: "editProp", prop: next.id, x: next.x, y: next.y, scale: next.scale || 1, flip: Boolean(next.flip) }).then(() => setDraft(null));
  };
  // The plant and prop layers only rebuild when something in them changes, not on every step
  // you walk (walking re-renders this screen every frame).
  act.current = { choose, viewportPoint, post };
  const nearestPlantId = nearest?.kind === "plant" ? nearest.id : null;
  const ownerKey = fields?.owner.id;
  const plantLayer = useMemo(() => plants.map((plant) => {
            const seed = seedNamed(plant.seed);
            if (!seed) return null;
            // Pepper plants waiting for their next peppers show the grown plant without fruit.
            const progress = plant.regrowAt ? (now >= plant.regrowAt ? 1 : 0.999) : Math.min(1, (now - plant.plantedAt) / seed.growMs);
            const ready = progress >= 1;
            const theirs = (plant.plantedBy || ownerKey) !== player.id;
            const isNearest = nearestPlantId === plant.id;
            return (
              <button key={plant.id} type="button" onPointerDown={(event) => { event.stopPropagation(); setPropMenu(null); act.current.choose({ kind: "plant", id: plant.id }); }}
                aria-label={ready ? `Pick ${plant.seed}` : `${plant.seed} growing`}
                className={`garden-plant${ready ? " is-ready" : ""}${isNearest ? " is-near" : ""}${theirs ? " is-theirs" : ""}`} style={{ left: plant.x, top: plant.y, zIndex: Math.round(plant.y) }}>
                <span className="garden-mound" aria-hidden="true" />
                <CropArt seed={seed.name} progress={progress} size={plant.size} />
                {ready && <span className="garden-sparkles" aria-hidden="true"><i /><i /><i /><i /></span>}
                {!ready && <span className="garden-timer">{theirs ? `${plant.plantedByName || "Friend"} · ` : ""}{clock(readyAt(plant, seed) - now)}</span>}
                {ready && theirs && <span className="garden-ready">{plant.plantedByName || "Friend"}&apos;s</span>}
              </button>
            );
          }), [plants, now, nearestPlantId, ownerKey, player.id]);
  const propLayer = useMemo(() => props.map((saved) => {
            const prop = draft && draft.id === saved.id ? draft : saved;
            const def = propNamed(prop.kind);
            if (!def) return null;
            const mine = fields?.isOwner || prop.by === player.id;
            const editable = editing && canEditProp(saved);
            const selected = editing && editId === prop.id;
            const bad = selected && !canPlaceProp(prop.kind, prop.x, prop.y, props, prop.id, prop.scale || 1);
            return (
              <div key={prop.id} className={`garden-prop${mine || editable ? " is-mine" : ""}${selected ? " is-selected" : ""}${bad ? " is-bad" : ""}`} style={{ left: prop.x, top: prop.y, width: def.width * (prop.scale || 1), zIndex: Math.round(prop.y) }}
                onPointerDown={(event) => {
                  if (editing) {
                    if (!editable) return;
                    event.stopPropagation();
                    const point = act.current.viewportPoint(event.clientX, event.clientY);
                    setEditId(prop.id);
                    setDraft({ ...prop });
                    dragRef.current = { id: prop.id, offX: point.x - prop.x, offY: point.y - prop.y, moved: false };
                    return;
                  }
                  // Outside edit mode props are just scenery: picking them up is in edit mode only.
                }}>
                <img src={def.art} alt={prop.kind} draggable={false} style={prop.flip ? { transform: "scaleX(-1)" } : undefined} />
              </div>
            );
          }), [props, draft, editing, editId, propMenu, placing, busy, fields]);
  const stockNow = seedStockFor(now);
  // Buying more seeds than you could sell today gets a heads-up about the daily garden limit first.
  const buySeeds = (name: SeedName, amount: number) => {
    if (!fields) return;
    const seed = seedNamed(name)!;
    const room = Math.max(0, DAILY_EARN_LIMIT - fields.earnedToday);
    const owned = SEEDS.reduce((sum, item) => sum + fields.seeds[item.name] * item.payout, 0) + basketValue;
    if (!limitWarned.current && owned + seed.payout * amount > room) {
      setBuyWarn({ seed: name, amount, room });
      return;
    }
    void post({ action: "buy", seed: name, amount });
  };
  const gardenMoney = <span className="garden-money garden-token-money" title="Garden Tokens"><img src={GARDEN_TOKEN_ART} alt="Garden Tokens" />{(fields?.gardenTokens || 0).toLocaleString()}</span>;
  const money = <span className="garden-money"><img src="/assets/Bread%20bucks.svg" alt="" />{tokens.toLocaleString()}</span>;

  return createPortal(
    <div className="garden-screen">
      <div ref={viewportRef} onPointerDown={clickGround}
        onPointerMove={(event) => {
          if (placing) setGhost(worldPoint(event));
          const drag = dragRef.current;
          if (drag) {
            const point = worldPoint(event);
            drag.moved = true;
            setDraft((current) => (current && current.id === drag.id ? { ...current, x: Math.round(point.x - drag.offX), y: Math.round(point.y - drag.offY) } : current));
          }
        }}
        onPointerUp={() => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (drag?.moved && draft) saveDraft(draft);
        }}
        className={`explore-viewport garden-viewport${placing ? " is-placing" : ""}${lite ? " is-lite" : ""}`}>
        <div data-walk-world className="garden-world" style={{ width: WORLD.width, height: WORLD.height }}>{/* the camera transform is set every frame by useWalkWorld */}
          <Meadow isOwner={fields ? fields.isOwner : !gardenId} lite={lite} />
          <SeedStand near={nearest?.kind === "stand"} />
          <button type="button" aria-label="Ted's Seed Stand" className="garden-stand-hit" style={{ left: STAND.x, top: STAND.y }} onPointerDown={(event) => { event.stopPropagation(); choose({ kind: "stand" }); }} />

          {plantLayer}

          {propLayer}
          {placing && ghost && (() => {
            const def = propNamed(placing)!;
            const ok = canPlaceProp(placing, ghost.x, ghost.y, props);
            return <div className={`garden-prop garden-prop-ghost${ok ? "" : " is-bad"}`} style={{ left: ghost.x, top: ghost.y, width: def.width, zIndex: 99999 }}><img src={def.art} alt="" draggable={false} /></div>;
          })()}

          {!lite && <Ambient />}
          {walkers.map((walker) => <WalkerSprite key={walker.id} walker={walker} isMe={walker.id === player.id} artFor={artFor} />)}
          {held && !digging && <img data-follow-me data-follow-dx="30" data-follow-dy="-34" src={artFor(held.seed)} alt="" className="garden-held" style={{ left: 0, top: 0 }} draggable={false} />}
          {digging > 0 && <span key={digging} data-follow-me data-follow-dx="34" data-follow-dy="-30" className="garden-trowel" style={{ left: 0, top: 0 }} aria-hidden="true"><img src="/assets/garden/trowel.webp" alt="" draggable={false} /></span>}
          {held && Object.values(others).map((walker) => (
            <div key={walker.id} className="garden-give" style={{ left: walker.x, top: walker.y, zIndex: 3000 + Math.round(walker.y) }}
              onPointerEnter={() => setGiveTo(walker.id)} onPointerLeave={() => setGiveTo((id) => (id === walker.id ? null : id))} onPointerDown={(event) => { event.stopPropagation(); setGiveTo(walker.id); }}>
              <span className="garden-give-hit" aria-hidden="true" />
              {giveTo === walker.id && (
                <div className="garden-give-pop" role="dialog" aria-label={`Give to ${walker.username}`}>
                  <img src={artFor(held.seed)} alt="" />
                  <span>Give your <b>{cropName(held)}</b> to <b>{walker.username}</b>?</span>
                  <button type="button" disabled={busy} onClick={() => give(walker.id)}><Gift size={16} />Give</button>
                </div>
              )}
            </div>
          ))}
          {floaters.map((item) => item.kind === "puff"
            ? <span key={item.id} className="garden-puff" style={{ left: item.x, top: item.y }} aria-hidden="true"><i /><i /><i /><i /><i /></span>
            : item.kind === "crop" && item.seed
            ? <span key={item.id} className="garden-floater" style={{ left: item.x, top: item.y }}><img src={artFor(item.seed)} alt="" className="garden-floater-crop" />{item.text}</span>
            : <span key={item.id} className="garden-floater" style={{ left: item.x, top: item.y }}><span className="garden-burst" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span><img src="/assets/Bread%20bucks.svg" alt="" />{item.text}</span>)}
        </div>
      </div>

      <div className="garden-hud-top">
        <button type="button" onClick={onExit} className="garden-leave"><ArrowLeft size={18} />Leave</button>
        <button type="button" onClick={() => setBookOpen(true)} className="garden-title garden-title-button" title="Open the gardening book">{fields?.isOwner === false ? `${ownerName}'s Garden` : "My Garden"}</button>
        {fields && <button type="button" onClick={() => setPanel((open) => (open === "props" ? null : "props"))} className="garden-chip garden-chip-button"><Boxes size={16} />Props</button>}
        <button type="button" onClick={() => updateSettings({ gardenPerformance: !lite })} className={`garden-chip garden-chip-button${lite ? " is-on" : ""}`} aria-pressed={lite} title="A plainer map that runs smoother on slower devices"><Gauge size={16} />Performance{lite ? ": on" : ""}</button>
        {fields?.canBuild && props.length > 0 && <button type="button" onClick={() => { setEditing((on) => !on); setEditId(null); setDraft(null); setPlacing(null); }} className={`garden-chip garden-chip-button${editing ? " is-on" : ""}`} aria-pressed={editing}><Move size={16} />{editing ? "Done editing" : "Edit"}</button>}
        {fields && !fields.isOwner && <span className={`garden-chip${fields.canPlant ? " is-good" : ""}`}><Sprout size={16} />{fields.canPlant ? "You can plant" : `Ask ${ownerName} to plant`}</span>}
        {fields && !fields.isOwner && fields.canBuild && <span className="garden-chip is-good"><Hammer size={16} />You can build</span>}
      </div>

      {panel === "people" && fields && (
        <section className="garden-people" aria-label="Players">
          <header><b>{fields.isOwner ? "Your garden" : `${ownerName}'s garden`}</b><button type="button" onClick={() => setPanel(null)} aria-label="Close">×</button></header>
          {fields.isOwner && <button type="button" onClick={() => void invite()} className="garden-invite"><Link2 size={16} />Copy invite link</button>}
          {fields.isOwner ? (
            <>
              {visitors.length === 0 && <p>Nobody else is here yet. Copy the invite link and send it to your friends.</p>}
              {visitors.map((visitor) => (
                <div key={visitor.id} className="garden-person">
                  <span className={`garden-dot${visitor.here ? " is-here" : ""}`} title={visitor.here ? "In your garden" : "Not here right now"} />
                  <span className="garden-person-name">{visitor.username}</span>
                  <button type="button" disabled={busy} onClick={() => void post({ action: "permit", role: "plant", profileId: visitor.id, allow: !visitor.plants })} className={`garden-toggle${visitor.plants ? " is-on" : ""}`} aria-pressed={visitor.plants} title="Let them plant"><Sprout size={14} />Plant</button>
                  <button type="button" disabled={busy} onClick={() => void post({ action: "permit", role: "build", profileId: visitor.id, allow: !visitor.builds })} className={`garden-toggle${visitor.builds ? " is-on" : ""}`} aria-pressed={visitor.builds} title="Let them place props"><Hammer size={14} />Build</button>
                </div>
              ))}
            </>
          ) : (
            [{ id: ownerId, username: ownerName, owner: true }, ...Object.values(others).filter((walker) => walker.id !== ownerId).map((walker) => ({ id: walker.id, username: walker.username, owner: false }))].map((person) => (
              <div key={person.id} className="garden-person">
                <span className={`garden-dot${person.owner ? (ownerHere ? " is-here" : "") : " is-here"}`} />
                <span className="garden-person-name">{person.username}{person.owner ? " (owner)" : ""}</span>
              </div>
            ))
          )}
        </section>
      )}

      {editing && (
        <div className="garden-edit-bar" role="toolbar" aria-label="Edit prop">
          {!editId || !selectedProp ? <span>Edit mode: drag a prop to move it, or tap one to resize or flip it.</span> : (
            <>
              <b>{selectedProp.kind}</b>
              <button type="button" disabled={busy || (selectedProp.scale || 1) <= MIN_PROP_SCALE} onClick={() => saveDraft({ ...selectedProp, scale: Math.max(MIN_PROP_SCALE, Math.round(((selectedProp.scale || 1) - 0.1) * 10) / 10) })} aria-label="Smaller"><Minus size={16} /></button>
              <span className="garden-edit-size">{Math.round((selectedProp.scale || 1) * 100)}%</span>
              <button type="button" disabled={busy || (selectedProp.scale || 1) >= MAX_PROP_SCALE} onClick={() => saveDraft({ ...selectedProp, scale: Math.min(MAX_PROP_SCALE, Math.round(((selectedProp.scale || 1) + 0.1) * 10) / 10) })} aria-label="Bigger"><Plus size={16} /></button>
              <button type="button" disabled={busy} onClick={() => saveDraft({ ...selectedProp, flip: !selectedProp.flip })}><FlipHorizontal size={16} />Flip</button>
              <button type="button" disabled={busy} onClick={() => { const id = selectedProp.id; setEditId(null); setDraft(null); void post({ action: "pickUp", prop: id }); }}><Hand size={16} />Pick up</button>
            </>
          )}
        </div>
      )}

      {toast && <p className="garden-toast" role="status">{toast}</p>}
      {error && <div className="garden-toast is-error" role="alert">{error} <button type="button" onClick={onExit} className="garden-error-leave">Leave</button></div>}
      {ownerGone && <div className="garden-toast is-error" role="alert">{ownerName} left, so their garden closed. <button type="button" onClick={onExit} className="garden-error-leave">Leave</button></div>}

      <div className="garden-hud-bottom">
        <p className="garden-hint">{hint}</p>
        <div className={`garden-hotbar${hotbarOpen ? "" : " is-closed"}`}>
          <button type="button" onClick={() => setHotbarOpen((open) => !open)} className="garden-hotbar-toggle" aria-label={hotbarOpen ? "Hide the hotbar" : "Show the hotbar"} aria-expanded={hotbarOpen}>
            {hotbarOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
          {hotbarOpen && (
            <div className="garden-pouch" role="radiogroup" aria-label="Hotbar">
              {SEEDS.map((seed, index) => (
                <button key={seed.name} type="button" role="radio" aria-checked={selected === seed.name} onClick={() => pickSeed(seed.name)} className={`garden-pouch-slot${selected === seed.name ? " is-selected" : ""}${(fields?.seeds[seed.name] || 0) === 0 ? " is-empty" : ""}`} title={`${seed.name} seeds (${index + 1})${selected === seed.name ? " · click again to put away" : ""}`}>
                  <img src={SEED_ART[seed.name]} alt="" />
                  <b>{fields?.seeds[seed.name] || 0}</b>
                  <small>{index + 1}</small>
                </button>
              ))}
              <span className="garden-pouch-divider" aria-hidden="true" />
              <button type="button" onClick={handSlot} className={`garden-pouch-slot garden-hand-slot${held ? " is-holding is-selected" : ""}${panel === "basket" ? " is-open" : ""}`} title={held ? `Holding a ${cropName(held)}. Hover a player to give it · click to put away (${SEEDS.length + 1})` : `Basket: pick a crop to hold (${SEEDS.length + 1})`}>
                {held ? <img src={artFor(held.seed)} alt="" /> : <ShoppingBasket size={30} />}
                <b>{crops.length}</b>
                <small>{SEEDS.length + 1}</small>
              </button>
            </div>
          )}
        </div>
        <div className="garden-bottom-right">
          {!alone && <div className="garden-chat"><WalkChat placeholder="Say something…" say={say} buttonClassName="garden-say" /></div>}
          <button type="button" onClick={() => setPanel((open) => (open === "people" ? null : "people"))} className="garden-people-button" aria-label="Players and invites" title={fields?.isOwner ? "Invite players and choose who can plant and build" : "Who's here"}>
            <UserPlus size={22} />
            <b>{connected ? Object.keys(others).length + 1 : "…"}</b>
          </button>
        </div>
      </div>

      {buyWarn && (
        <div className="garden-shop-layer garden-warn-layer" onPointerDown={() => setBuyWarn(null)}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="garden-warn-title" className="garden-warn" onPointerDown={(event) => event.stopPropagation()}>
            <h2 id="garden-warn-title">That&apos;s a lot of seeds!</h2>
            <p>You can only earn <b>{DAILY_EARN_LIMIT.toLocaleString()} Bread Bucks a day</b> from gardens{buyWarn.room < DAILY_EARN_LIMIT ? <>, and you have <b>{buyWarn.room.toLocaleString()}</b> left today</> : null}. Your seeds and crops could sell for more than that, so some of them will have to wait until tomorrow (midnight UTC) to sell.</p>
            <p>You still get Garden Tokens for everything you pick.</p>
            <div className="garden-warn-buttons">
              <button type="button" onClick={() => setBuyWarn(null)}>Cancel</button>
              <button type="button" className="is-go" onClick={() => { limitWarned.current = true; const { seed, amount } = buyWarn; setBuyWarn(null); void post({ action: "buy", seed, amount }); }}>Buy anyway</button>
            </div>
          </section>
        </div>
      )}

      {bookOpen && <GardenBook seedArt={SEED_ART} artFor={artFor} onClose={() => setBookOpen(false)} />}

      {panel === "basket" && fields && (
        <div className="garden-shop-layer" onPointerDown={() => setPanel(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="garden-basket-title" className="garden-shop garden-basket" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <span className="garden-basket-icon"><ShoppingBasket size={30} /></span>
              <div><small>{crops.length} / {MAX_BASKET} crops</small><h2 id="garden-basket-title">Your basket</h2></div>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close">×</button>
            </header>
            <p className={`garden-earned${fields.earnedToday >= DAILY_EARN_LIMIT ? " is-capped" : ""}`} title="Resets at midnight UTC"><Sprout size={15} />Sold today: <b>{fields.earnedToday.toLocaleString()} / {DAILY_EARN_LIMIT.toLocaleString()}</b> Bread Bucks</p>
            <p className="garden-earned garden-token-line"><img src={GARDEN_TOKEN_ART} alt="" />Garden Tokens: <b>{fields.gardenTokens.toLocaleString()}</b> (spend them on props)</p>
            {crops.length === 0
              ? <p className="garden-basket-empty">Nothing here yet. Grow something and pick it to fill your basket!</p>
              : (
                <>
                  <div className="garden-basket-all">
                    <span>Bigger crops sell for more. Hold one, then hover a player to give it to them (gifts count toward your daily limit).</span>
                    <button type="button" disabled={busy} onClick={() => sell({ all: true })}>Sell all<img src="/assets/Bread%20bucks.svg" alt="" />{basketValue.toLocaleString()}</button>
                  </div>
                  <div className="garden-shop-list">
                    {crops.map((crop) => (
                      <div key={crop.id} className={`garden-shop-row${crop.id === heldId ? " is-held" : ""}`}>
                        <span className="garden-shop-art"><img src={artFor(crop.seed)} alt="" style={{ scale: String(0.7 + crop.size * 0.25) }} /></span>
                        <span className="garden-shop-info">
                          <b>{cropName(crop)}</b>
                          <small>Size {crop.size}x · sells for <em>{cropValue(crop.seed, crop.size)}</em></small>
                          {crop.from && <small>A gift from {crop.from}</small>}
                        </span>
                        <span className="garden-shop-buy">
                          <button type="button" onClick={() => { holdCrop(crop.id === heldId ? null : crop.id); if (crop.id !== heldId) setPanel(null); }}>{crop.id === heldId ? "Put away" : "Hold"}</button>
                          <button type="button" disabled={busy} onClick={() => sell({ crop: crop.id })}>Sell<img src="/assets/Bread%20bucks.svg" alt="" />{cropValue(crop.seed, crop.size)}</button>
                          <button type="button" className="garden-trash" disabled={busy} onClick={() => { if (window.confirm(`Throw away this ${cropName(crop)}? You won't get anything for it.`)) { if (crop.id === heldId) holdCrop(null); void post({ action: "discard", crop: crop.id }); } }} aria-label={`Throw away ${cropName(crop)}`} title="Throw away"><Trash2 size={15} /></button>
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
          </section>
        </div>
      )}

      {panel === "props" && fields && (
        <div className="garden-shop-layer" onPointerDown={() => setPanel(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="garden-props-title" className="garden-shop garden-props" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <span className="garden-basket-icon"><Boxes size={30} /></span>
              <div><small>Bought with Garden Tokens</small><h2 id="garden-props-title">Props</h2></div>
              {gardenMoney}
              <button type="button" onClick={() => setPanel(null)} aria-label="Close">×</button>
            </header>
            <p className="garden-props-note">Pick crops to get Garden Tokens: {SEEDS.map((seed) => `${seed.name} ${seed.gardenTokens}`).join(", ")}.</p>
            {!fields.canBuild && <p className="garden-props-note">You can buy props here, but only players {ownerName} lets build can place them in this garden.</p>}
            <div className="garden-shop-list">
              {PROPS.map((prop) => (
                <div key={prop.kind} className="garden-shop-row">
                  <span className="garden-shop-art"><img src={prop.art} alt="" /></span>
                  <span className="garden-shop-info">
                    <b>{prop.kind}</b>
                    <small>You have {fields.propBag[prop.kind] || 0}</small>
                  </span>
                  <span className="garden-shop-buy">
                    <button type="button" disabled={busy || fields.gardenTokens < prop.cost} onClick={() => void post({ action: "buyProp", kind: prop.kind })}><span>Buy</span><img src={GARDEN_TOKEN_ART} alt="Garden Tokens" />{prop.cost}</button>
                    <button type="button" disabled={!fields.canBuild || (fields.propBag[prop.kind] || 0) < 1} onClick={() => { setPlacing(prop.kind); setGhost(null); setSelected(null); setHeldId(null); setPanel(null); }}><Hammer size={14} />Place</button>
                    <button type="button" className="garden-trash" disabled={busy || (fields.propBag[prop.kind] || 0) < 1} onClick={() => { if (window.confirm(`Throw away one ${prop.kind} from your bag? You won't get the Garden Tokens back.`)) void post({ action: "discardProp", kind: prop.kind }); }} aria-label={`Throw away one ${prop.kind}`} title="Throw away one"><Trash2 size={15} /></button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {panel === "shop" && fields && (
        <div className="garden-shop-layer" onPointerDown={() => setPanel(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="garden-shop-title" className="garden-shop garden-seed-shop" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <img src="/assets/breadlets/other/ted.svg" alt="" />
              <div><small>Ted&apos;s Seed Stand</small><h2 id="garden-shop-title">Fresh seeds!</h2></div>
              {money}
              <button type="button" onClick={() => setPanel(null)} aria-label="Close">×</button>
            </header>
            <div className="garden-shop-list">
              <p className="garden-restock">New stock in {clock(nextSeedRestock(now) - now)}</p>
              {SEEDS.map((seed) => (
                <div key={seed.name} className={`garden-shop-row${stockNow[seed.name] ? "" : " is-out"}`}>
                  <span className="garden-shop-art"><img src={SEED_ART[seed.name]} alt="" /></span>
                  <span className="garden-shop-info">
                    <b>{seed.name}</b>
                    <small>{clock(seed.growMs)}{seed.regrowMs ? ` · then a pepper every ${clock(seed.regrowMs)}` : ""} · sells for ~<em>{seed.payout}</em></small>
                    <small>{stockNow[seed.name] ? `You have ${fields.seeds[seed.name]}` : `Out of stock · ${Math.round(seed.stock * 100)}% chance each hour`}</small>
                  </span>
                  <span className="garden-shop-buy">
                    {[1, 5].map((amount) => (
                      <button key={amount} type="button" disabled={busy || !stockNow[seed.name] || tokens < seed.cost * amount} onClick={() => buySeeds(seed.name, Math.min(amount, MAX_SEEDS_PER_BUY))}>
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
