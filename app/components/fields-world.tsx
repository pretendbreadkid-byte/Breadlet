"use client";

// Games tab (test, admin only): the Breadlet Garden. A full-screen meadow you walk around as your
// equipped Breadlet. Buy seeds from Ted's Seed Stand, plant them in the fenced garden, come back and
// harvest. Everything that costs or pays is decided by /api/fields.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Users } from "lucide-react";
import { WalkChat, WalkerSprite, useWalkWorld } from "./walk-world";
import { MAX_SEEDS_PER_BUY, PLOT_COUNT, SEEDS, seedNamed, type FieldsView, type SeedName } from "../../lib/fields";

const WORLD = { width: 2600, height: 1700 };
const REACH = 130;

// The fenced garden in the middle, with a gate on its left side facing the seed stand.
const GARDEN = { x: 1000, y: 520, width: 860, height: 700 };
const GATE = { y: 820, height: 110 };
const PLOTS = Array.from({ length: PLOT_COUNT }, (_, index) => ({ x: 1150 + (index % 3) * 280, y: 680 + Math.floor(index / 3) * 190 }));
const STAND = { x: 640, y: 880 };
const WHEAT = { x: 2060, y: 360, width: 400, height: 380 };
const TREES = [
  { x: 260, y: 330, size: 1.1 }, { x: 520, y: 210, size: 0.85 }, { x: 1430, y: 330, size: 0.9 }, { x: 2380, y: 980, size: 1.15 },
  { x: 2200, y: 1460, size: 0.95 }, { x: 380, y: 1430, size: 1.05 }, { x: 1250, y: 1520, size: 0.8 }, { x: 140, y: 900, size: 0.9 },
];

const clamp = (x: number, y: number) => ({ x: Math.max(40, Math.min(WORLD.width - 40, x)), y: Math.max(90, Math.min(WORLD.height - 30, y)) });
type Target = { kind: "plot"; index: number } | { kind: "stand" };

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

// Seeded random so the meadow's flowers and bushes are in the same spots for everyone.
const seeded = (start: number) => {
  let value = start;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
type Decor = { kind: "flower" | "tuft" | "bush" | "rock" | "mushroom" | "clover"; x: number; y: number; tint: number; flip: boolean };
const blocked = (x: number, y: number) =>
  (x > GARDEN.x - 70 && x < GARDEN.x + GARDEN.width + 70 && y > GARDEN.y - 90 && y < GARDEN.y + GARDEN.height + 60)
  || (x > STAND.x - 200 && x < STAND.x + 200 && y > STAND.y - 230 && y < STAND.y + 70)
  || (x > STAND.x + 100 && x < GARDEN.x && y > GATE.y - 20 && y < GATE.y + GATE.height + 40)
  || (x > WHEAT.x - 30 && x < WHEAT.x + WHEAT.width + 30 && y > WHEAT.y - 30 && y < WHEAT.y + WHEAT.height + 30)
  || TREES.some((tree) => Math.hypot(x - tree.x, y - tree.y + 60) < 120 * tree.size);
const DECOR: Decor[] = (() => {
  const random = seeded(20261114);
  const kinds: Decor["kind"][] = ["flower", "flower", "flower", "tuft", "tuft", "tuft", "tuft", "clover", "bush", "rock", "mushroom"];
  const list: Decor[] = [];
  for (let tries = 0; list.length < 230 && tries < 3000; tries += 1) {
    const x = 30 + random() * (WORLD.width - 60);
    const y = 60 + random() * (WORLD.height - 90);
    if (blocked(x, y)) continue;
    list.push({ kind: kinds[Math.floor(random() * kinds.length)], x, y, tint: Math.floor(random() * 4), flip: random() < 0.5 });
  }
  return list;
})();

const FLOWER_COLORS = [["#fff", "#ffd23f"], ["#ffd23f", "#e07a12"], ["#ff8fb8", "#fff3a8"], ["#c79bff", "#ffe066"]];

function DecorSprite({ item }: { item: Decor }) {
  const style = { left: item.x, top: item.y, zIndex: Math.round(item.y) - (item.kind === "bush" || item.kind === "rock" ? 0 : 400), transform: `translate(-50%, -100%) scaleX(${item.flip ? -1 : 1})` };
  if (item.kind === "flower") {
    const [petal, middle] = FLOWER_COLORS[item.tint];
    return <svg className="garden-decor" style={style} width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M15 36 C15 28 14 22 15 16" stroke="#2f8a2c" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M15 28 C9 26 7 22 8 20 C12 21 14 24 15 28Z" fill="#3fa53a" />{[0, 72, 144, 216, 288].map((angle) => <ellipse key={angle} cx="15" cy="8" rx="4.6" ry="6.4" fill={petal} stroke="rgba(0,0,0,.12)" strokeWidth="1" transform={`rotate(${angle} 15 13)`} />)}<circle cx="15" cy="13" r="4" fill={middle} /></svg>;
  }
  if (item.kind === "tuft") {
    const shade = ["#2f9a35", "#38a83b", "#2a8a31", "#43b545"][item.tint];
    return <svg className="garden-decor" style={style} width="34" height="22" viewBox="0 0 34 22" aria-hidden="true"><g stroke={shade} strokeWidth="3.4" strokeLinecap="round" fill="none"><path d="M17 21 C16 14 14 8 10 3" /><path d="M17 21 C17 13 19 7 23 1" /><path d="M17 21 C14 16 9 13 4 12" /><path d="M17 21 C20 16 25 14 30 13" /></g></svg>;
  }
  if (item.kind === "clover") {
    return <svg className="garden-decor" style={style} width="34" height="20" viewBox="0 0 34 20" aria-hidden="true">{[[8, 12], [17, 8], [26, 12], [13, 16], [22, 16]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="4.4" fill={index % 2 ? "#3c9e3e" : "#48b448"} />)}</svg>;
  }
  if (item.kind === "bush") {
    return <svg className="garden-decor" style={style} width="96" height="66" viewBox="0 0 96 66" aria-hidden="true"><ellipse cx="48" cy="60" rx="42" ry="6" fill="rgba(0,0,0,.14)" /><circle cx="28" cy="38" r="22" fill="#2f8a2c" /><circle cx="66" cy="38" r="22" fill="#2f8a2c" /><circle cx="48" cy="26" r="25" fill="#3aa23a" /><circle cx="40" cy="20" r="9" fill="#5cc35a" opacity=".8" />{item.tint < 2 && <><circle cx="30" cy="34" r="3.4" fill="#ff5d5d" /><circle cx="60" cy="24" r="3.4" fill="#ff5d5d" /><circle cx="66" cy="42" r="3.4" fill="#ff5d5d" /></>}</svg>;
  }
  if (item.kind === "rock") {
    return <svg className="garden-decor" style={style} width="48" height="32" viewBox="0 0 48 32" aria-hidden="true"><ellipse cx="24" cy="29" rx="21" ry="3.5" fill="rgba(0,0,0,.16)" /><path d="M4 27 C3 16 12 6 24 6 C37 6 45 15 44 27Z" fill="#a7a49c" /><path d="M10 14 C14 9 20 8 25 9" stroke="#d6d3cb" strokeWidth="4" strokeLinecap="round" fill="none" /></svg>;
  }
  return <svg className="garden-decor" style={style} width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect x="11" y="14" width="8" height="14" rx="3" fill="#fff3df" /><path d="M2 16 C2 6 28 6 28 16Z" fill="#e5483b" /><circle cx="9" cy="12" r="2.2" fill="#fff" /><circle cx="18" cy="9" r="2.6" fill="#fff" /><circle cx="23" cy="14" r="1.8" fill="#fff" /></svg>;
}

function Tree({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <svg className="garden-decor" style={{ left: x, top: y, zIndex: Math.round(y), transform: `translate(-50%, -100%) scale(${size})`, transformOrigin: "50% 100%" }} width="220" height="260" viewBox="0 0 220 260" aria-hidden="true">
      <ellipse cx="110" cy="248" rx="80" ry="12" fill="rgba(0,0,0,.18)" />
      <path d="M96 250 C98 210 96 180 92 160 L128 160 C124 180 122 210 124 250Z" fill="#8a5a2b" stroke="#5e3a17" strokeWidth="4" />
      <path d="M108 200 C110 186 109 176 106 168" stroke="#5e3a17" strokeWidth="3" fill="none" />
      <circle cx="62" cy="122" r="50" fill="#2b8a2f" /><circle cx="158" cy="122" r="50" fill="#2b8a2f" />
      <circle cx="110" cy="80" r="66" fill="#36a23a" /><circle cx="70" cy="96" r="40" fill="#36a23a" /><circle cx="152" cy="98" r="42" fill="#36a23a" />
      <circle cx="86" cy="54" r="22" fill="#57c457" opacity=".8" /><circle cx="140" cy="70" r="14" fill="#57c457" opacity=".6" />
    </svg>
  );
}

function Fence() {
  const posts: { x: number; y: number }[] = [];
  for (let x = GARDEN.x; x <= GARDEN.x + GARDEN.width; x += 72) { posts.push({ x, y: GARDEN.y }); posts.push({ x, y: GARDEN.y + GARDEN.height }); }
  for (let y = GARDEN.y + 72; y < GARDEN.y + GARDEN.height; y += 72) {
    if (y < GATE.y - 10 || y > GATE.y + GATE.height + 10) posts.push({ x: GARDEN.x, y });
    posts.push({ x: GARDEN.x + GARDEN.width, y });
  }
  return (
    <>
      <div className="garden-fence-h" style={{ left: GARDEN.x, top: GARDEN.y - 30, width: GARDEN.width, zIndex: GARDEN.y }} />
      <div className="garden-fence-h" style={{ left: GARDEN.x, top: GARDEN.y + GARDEN.height - 30, width: GARDEN.width, zIndex: GARDEN.y + GARDEN.height }} />
      <div className="garden-fence-v" style={{ left: GARDEN.x - 6, top: GARDEN.y, height: GATE.y - GARDEN.y, zIndex: GATE.y }} />
      <div className="garden-fence-v" style={{ left: GARDEN.x - 6, top: GATE.y + GATE.height, height: GARDEN.y + GARDEN.height - GATE.y - GATE.height, zIndex: GARDEN.y + GARDEN.height }} />
      <div className="garden-fence-v" style={{ left: GARDEN.x + GARDEN.width - 6, top: GARDEN.y, height: GARDEN.height, zIndex: GARDEN.y + GARDEN.height }} />
      {posts.map((post, index) => <span key={index} className="garden-post" style={{ left: post.x, top: post.y, zIndex: post.y + 1 }} />)}
      <span className="garden-gate-sign" style={{ left: GARDEN.x - 70, top: GATE.y - 40, zIndex: GATE.y }}>Garden</span>
    </>
  );
}

// The big static meadow: drawn once, it never re-renders while walking.
const Meadow = memo(function Meadow() {
  return (
    <>
      <div className="garden-path" style={{ left: STAND.x + 60, top: GATE.y + 10, width: GARDEN.x - STAND.x - 40, height: GATE.height - 20 }} />
      <div className="garden-soil-bed" style={{ left: GARDEN.x, top: GARDEN.y, width: GARDEN.width, height: GARDEN.height }} />
      <div className="garden-wheat" style={{ left: WHEAT.x, top: WHEAT.y, width: WHEAT.width, height: WHEAT.height, zIndex: WHEAT.y + WHEAT.height - 400 }} />
      {DECOR.map((item, index) => <DecorSprite key={index} item={item} />)}
      {TREES.map((tree, index) => <Tree key={index} {...tree} />)}
      <Fence />
    </>
  );
});

function Sprouts({ stage }: { stage: 0 | 1 | 2 }) {
  return (
    <svg className="garden-sprouts" viewBox="0 0 160 70" aria-hidden="true">
      {[30, 80, 130].map((x) => stage === 0
        ? <g key={x}><ellipse cx={x} cy="56" rx="16" ry="7" fill="#5a3317" /><circle cx={x - 4} cy="53" r="2.4" fill="#e9c98a" /><circle cx={x + 5} cy="55" r="2" fill="#e9c98a" /></g>
        : stage === 1
          ? <g key={x}><path d={`M${x} 60 C${x} 50 ${x} 44 ${x} 38`} stroke="#2f8a2c" strokeWidth="4" strokeLinecap="round" /><path d={`M${x} 44 C${x - 14} 44 ${x - 18} 34 ${x - 16} 30 C${x - 6} 30 ${x} 36 ${x} 44Z`} fill="#4cbb47" /><path d={`M${x} 42 C${x + 14} 42 ${x + 18} 32 ${x + 16} 28 C${x + 6} 28 ${x} 34 ${x} 42Z`} fill="#5fcf58" /></g>
          : <g key={x}><path d={`M${x} 62 C${x} 44 ${x} 30 ${x} 16`} stroke="#2a7f2a" strokeWidth="5" strokeLinecap="round" />{[[-1, 46], [1, 36], [-1, 26], [1, 18]].map(([side, y]) => <path key={y} d={`M${x} ${y} C${x + side * 22} ${y} ${x + side * 28} ${y - 14} ${x + side * 24} ${y - 18} C${x + side * 10} ${y - 16} ${x} ${y - 8} ${x} ${y}Z`} fill={y % 20 ? "#3fae3c" : "#58c652"} />)}</g>)}
    </svg>
  );
}

function SeedStand({ near }: { near: boolean }) {
  return (
    <div className={`garden-stand${near ? " is-near" : ""}`} style={{ left: STAND.x, top: STAND.y, zIndex: STAND.y }}>
      <img src="/assets/ted-shopkeeper.svg" alt="" className="garden-stand-ted" />
      <svg className="garden-stand-art" width="300" height="250" viewBox="0 0 300 250" aria-hidden="true">
        <ellipse cx="150" cy="242" rx="140" ry="10" fill="rgba(0,0,0,.18)" />
        <rect x="28" y="40" width="14" height="200" rx="4" fill="#8a5a2b" stroke="#3B1F0E" strokeWidth="4" />
        <rect x="258" y="40" width="14" height="200" rx="4" fill="#8a5a2b" stroke="#3B1F0E" strokeWidth="4" />
        <path d="M10 22 L290 22 L282 66 L18 66Z" fill="#fff3df" stroke="#3B1F0E" strokeWidth="5" strokeLinejoin="round" />
        {[0, 1, 2, 3, 4, 5, 6].filter((index) => index % 2 === 0).map((index) => <path key={index} d={`M${10 + index * 40} 22 L${50 + index * 40} 22 L${49 + index * 39} 66 L${18 + index * 38.6} 66Z`} fill="#ED7117" />)}
        {Array.from({ length: 7 }, (_, index) => <path key={index} d={`M${18 + index * 37.7} 64 a18.8 16 0 0 0 37.7 0`} fill={index % 2 ? "#fff3df" : "#ED7117"} stroke="#3B1F0E" strokeWidth="4" />)}
        <path d="M10 22 L290 22" stroke="#3B1F0E" strokeWidth="5" />
        <rect x="16" y="150" width="268" height="90" rx="10" fill="#c27b3e" stroke="#3B1F0E" strokeWidth="5" />
        <path d="M18 180 H282 M18 210 H282" stroke="#9a5a26" strokeWidth="4" />
        <rect x="10" y="138" width="280" height="22" rx="8" fill="#e09a55" stroke="#3B1F0E" strokeWidth="5" />
      </svg>
      <div className="garden-stand-packets">{SEEDS.map((seed) => <span key={seed.name} className={`garden-packet garden-packet-${seed.name.toLowerCase()}`} />)}</div>
      <span className="garden-stand-sign">Ted&apos;s Seeds</span>
    </div>
  );
}

export function FieldsTab({ player, tokens, onBalance, onBreadlet, onExit, artFor }: {
  player: { id: string; username: string; equipped: string; chatMutedUntil?: string };
  tokens: number;
  onBalance: (tokens: number) => void;
  onBreadlet: () => void;
  onExit: () => void;
  artFor: (name: string) => string;
}) {
  const [fields, setFields] = useState<FieldsView | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [selected, setSelected] = useState<SeedName>("Carrot");
  const [now, setNow] = useState(Date.now());
  const [floaters, setFloaters] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const skewRef = useRef(0);
  const pendingRef = useRef<Target | null>(null);

  const { viewportRef, me, others, walkers, connected, camera, walkTo, walkToPoint, say } = useWalkWorld({
    room: "garden-test",
    player,
    world: WORLD,
    clamp,
    spawn: () => clamp(STAND.x + 200 + Math.random() * 80, STAND.y + 120),
  });

  const apply = useCallback((data: FieldsView & { tokens?: number; message?: string; breadlet?: string }) => {
    skewRef.current = data.now - Date.now();
    setFields(data);
    if (typeof data.tokens === "number") onBalance(data.tokens);
    if (data.breadlet) onBreadlet();
    if (data.message) setToast(data.message);
  }, [onBalance, onBreadlet]);

  useEffect(() => {
    void fetch("/api/fields", { cache: "no-store" }).then(async (response) => {
      const data = await response.json().catch(() => null);
      if (response.ok && data) apply(data);
      else setError(data?.error || "The garden could not load.");
    }).catch(() => setError("Could not reach the garden. Check your connection."));
  }, [apply]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + skewRef.current), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const post = async (body: Record<string, unknown>) => {
    if (busy) return null;
    setBusy(true);
    const response = await fetch("/api/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy(false);
    if (response?.ok && data) { apply(data); return data; }
    setToast(data?.error || "That didn't work. Try again.");
    return null;
  };

  const float = (x: number, y: number, text: string) => {
    const id = Date.now() + Math.random();
    setFloaters((list) => [...list, { id, x, y, text }]);
    window.setTimeout(() => setFloaters((list) => list.filter((item) => item.id !== id)), 1400);
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
      if (now < plot.plantedAt + seed.growMs) return setToast(`${seed.name} is still growing: ${clock(plot.plantedAt + seed.growMs - now)} left.`);
      void post({ action: "harvest", plot: target.index }).then((data) => data && float(spot.x, spot.y - 60, `+${seed.payout}`));
      return;
    }
    const pick = fields.seeds[selected] > 0 ? selected : SEEDS.find((item) => fields.seeds[item.name] > 0)?.name;
    if (!pick) return setToast("You have no seeds. Buy some at Ted's Seed Stand!");
    setSelected(pick);
    void post({ action: "plant", plot: target.index, seed: pick });
  };

  // Clicking something far away walks over first, then uses it on arrival.
  const choose = (event: React.PointerEvent, target: Target) => {
    event.stopPropagation();
    if (isNear(target)) return interact(target);
    pendingRef.current = target;
    const spot = spotOf(target);
    walkToPoint(spot.x, spot.y + (target.kind === "stand" ? 60 : 90));
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
      if (event.key === "Escape") return setShopOpen(false);
      const number = Number(event.key);
      if (number >= 1 && number <= SEEDS.length) return setSelected(SEEDS[number - 1].name);
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
    if (!plot || !seed) return `Press E to plant a ${selected} seed`;
    return now >= plot.plantedAt + seed.growMs ? `Press E to harvest your ${seed.name}` : `${seed.name} ready in ${clock(plot.plantedAt + seed.growMs - now)}`;
  })();

  return createPortal(
    <div className="garden-screen">
      <div ref={viewportRef} onPointerDown={(event) => { pendingRef.current = null; walkTo(event); }} className="explore-viewport garden-viewport">
        <div className="garden-world" style={{ width: WORLD.width, height: WORLD.height, transform: `translate3d(${-camera.x}px, ${-camera.y}px, 0)` }}>
          <Meadow />
          <SeedStand near={nearest?.kind === "stand"} />
          <button type="button" aria-label="Ted's Seed Stand" className="garden-stand-hit" style={{ left: STAND.x, top: STAND.y }} onPointerDown={(event) => choose(event, { kind: "stand" })} />

          {PLOTS.map((spot, index) => {
            const plot = fields?.plots[index] || null;
            const seed = plot && seedNamed(plot.seed);
            const progress = plot && seed ? Math.min(1, (now - plot.plantedAt) / seed.growMs) : 0;
            const ready = Boolean(plot) && progress >= 1;
            const isNearest = nearest?.kind === "plot" && nearest.index === index;
            return (
              <button key={index} type="button" onPointerDown={(event) => choose(event, { kind: "plot", index })}
                aria-label={!plot ? "Empty plot: plant a seed" : ready ? `Harvest ${plot.seed}` : `${plot.seed} growing`}
                className={`garden-plot${ready ? " is-ready" : ""}${isNearest ? " is-near" : ""}`} style={{ left: spot.x, top: spot.y, zIndex: 5 }}>
                {plot && !ready && <Sprouts stage={progress < 0.3 ? 0 : progress < 0.7 ? 1 : 2} />}
                {plot && ready && <img src={artFor(plot.seed)} alt="" className="garden-crop" />}
                {plot && !ready && <span className="garden-timer">{clock(plot.plantedAt + (seed?.growMs || 0) - now)}</span>}
                {plot && ready && <span className="garden-ready">Ready!</span>}
                {plot && !ready && <span className="garden-bar"><i style={{ width: `${progress * 100}%` }} /></span>}
              </button>
            );
          })}

          {walkers.map((walker) => <WalkerSprite key={walker.id} walker={walker} isMe={walker.id === player.id} artFor={artFor} />)}
          {floaters.map((item) => <span key={item.id} className="garden-floater" style={{ left: item.x, top: item.y }}><img src="/assets/Bread%20bucks.svg" alt="" />{item.text}</span>)}
        </div>
      </div>

      <div className="garden-hud-top">
        <button type="button" onClick={onExit} className="garden-leave"><ArrowLeft size={18} />Leave</button>
        <span className="garden-title">Breadlet Garden <small>Test</small></span>
        <span className="garden-chip ml-auto"><img src="/assets/Bread%20bucks.svg" alt="" />{tokens.toLocaleString()}</span>
        <span className="garden-chip"><Users size={16} />{connected ? Object.keys(others).length + 1 : "…"}</span>
      </div>

      {toast && <p className="garden-toast" role="status">{toast}</p>}
      {error && <p className="garden-toast is-error" role="alert">{error}</p>}

      <div className="garden-hud-bottom">
        <p className="garden-hint">{hint}</p>
        <div className="garden-pouch" role="radiogroup" aria-label="Seed pouch">
          {SEEDS.map((seed, index) => (
            <button key={seed.name} type="button" role="radio" aria-checked={selected === seed.name} onClick={() => setSelected(seed.name)} className={`garden-pouch-slot${selected === seed.name ? " is-selected" : ""}${(fields?.seeds[seed.name] || 0) === 0 ? " is-empty" : ""}`} title={`${seed.name} seeds (${index + 1})`}>
              <img src={artFor(seed.name)} alt="" />
              <b>{fields?.seeds[seed.name] || 0}</b>
              <small>{index + 1}</small>
            </button>
          ))}
        </div>
        <div className="garden-chat"><WalkChat placeholder="Say something…" say={say} buttonClassName="garden-say" /></div>
      </div>

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
                  <span className="garden-shop-art"><img src={artFor(seed.name)} alt="" /></span>
                  <span className="garden-shop-info">
                    <b>{seed.name} seed</b>
                    <small>Grows in {clock(seed.growMs)} · sells for <em>{seed.payout}</em></small>
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
