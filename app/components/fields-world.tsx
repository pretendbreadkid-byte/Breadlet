"use client";

// Games tab (test, admin only): Breadlet Fields. Walk around as your equipped Breadlet; the garden is on
// the left (plant seeds, come back and harvest) and the dig site on the right (a few shovels an hour).
// Everything that pays out is decided by /api/fields.
import { useCallback, useEffect, useRef, useState } from "react";
import { Shovel, Sprout, Users } from "lucide-react";
import { WalkChat, WalkerSprite, useWalkWorld } from "./walk-world";
import { DIG_COLUMNS, DIG_TILES, PLOT_COUNT, SEEDS, SHOVELS_PER_HOUR, seedNamed, type DigPrize, type FieldsView, type SeedName } from "../../lib/fields";

const WORLD = { width: 1500, height: 820 };
const REACH = 120;

// Garden: 3 x 2 plots on the left. Dig site: 5 x 4 tiles on the right.
const PLOTS = Array.from({ length: PLOT_COUNT }, (_, index) => ({ x: 170 + (index % 3) * 190, y: 330 + Math.floor(index / 3) * 190 }));
const TILES = Array.from({ length: DIG_TILES }, (_, index) => ({ x: 900 + (index % DIG_COLUMNS) * 112, y: 290 + Math.floor(index / DIG_COLUMNS) * 112 }));

const clamp = (x: number, y: number) => ({ x: Math.max(40, Math.min(WORLD.width - 40, x)), y: Math.max(110, Math.min(WORLD.height - 30, y)) });
type Target = { kind: "plot" | "tile"; index: number };

const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

export function FieldsTab({ player, tokens, onBalance, onBreadlet, artFor }: {
  player: { id: string; username: string; equipped: string; chatMutedUntil?: string };
  tokens: number;
  onBalance: (tokens: number) => void;
  onBreadlet: () => void;
  artFor: (name: string) => string;
}) {
  const [fields, setFields] = useState<FieldsView | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [seedMenu, setSeedMenu] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const skewRef = useRef(0);
  const pendingRef = useRef<Target | null>(null);

  const { viewportRef, me, others, walkers, connected, camera, walkTo, walkToPoint, say } = useWalkWorld({
    room: "fields-test",
    player,
    world: WORLD,
    clamp,
    spawn: () => clamp(750 + (Math.random() - 0.5) * 80, 640),
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
      else setError(data?.error || "Fields could not load.");
    }).catch(() => setError("Could not reach Fields. Check your connection."));
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

  // A new hour: fetch the fresh dig board and shovels.
  const refillsAt = fields?.dig.refillsAt || 0;
  useEffect(() => {
    if (!refillsAt || now < refillsAt) return;
    void fetch("/api/fields", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => data && apply(data)).catch(() => undefined);
  }, [now, refillsAt, apply]);

  const post = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    const response = await fetch("/api/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy(false);
    if (response?.ok && data) apply(data);
    else setToast(data?.error || "That didn't work. Try again.");
  };

  const spotOf = (target: Target) => (target.kind === "plot" ? PLOTS : TILES)[target.index];
  const isNear = (target: Target) => {
    const spot = spotOf(target);
    return Math.hypot(me.x - spot.x, me.y - spot.y) < REACH;
  };

  const interact = (target: Target) => {
    if (!fields) return;
    if (target.kind === "plot") {
      const plot = fields.plots[target.index];
      const seed = plot && seedNamed(plot.seed);
      if (!plot || !seed) return setSeedMenu(target.index);
      if (now >= plot.plantedAt + seed.growMs) return void post({ action: "harvest", plot: target.index });
      return setToast(`${seed.name} is still growing: ${clock(plot.plantedAt + seed.growMs - now)} left.`);
    }
    if (fields.dig.dug[target.index]) return setToast("You already dug there.");
    if (fields.dig.shovels <= 0) return setToast(`Out of shovels. More in ${clock(fields.dig.refillsAt - now)}.`);
    void post({ action: "dig", tile: target.index });
  };

  // Clicking something far away walks over first, then uses it on arrival.
  const choose = (event: React.PointerEvent, target: Target) => {
    event.stopPropagation();
    setSeedMenu(null);
    if (isNear(target)) return interact(target);
    pendingRef.current = target;
    const spot = spotOf(target);
    walkToPoint(spot.x, spot.y + 40);
  };
  useEffect(() => {
    const pending = pendingRef.current;
    if (pending && isNear(pending)) {
      pendingRef.current = null;
      interact(pending);
    }
  });

  // E or Space uses whatever is closest.
  const closest = (): Target | null => {
    const all: Target[] = [...PLOTS.map((_, index) => ({ kind: "plot" as const, index })), ...TILES.map((_, index) => ({ kind: "tile" as const, index }))];
    const near = all.filter(isNear).sort((a, b) => Math.hypot(me.x - spotOf(a).x, me.y - spotOf(a).y) - Math.hypot(me.x - spotOf(b).x, me.y - spotOf(b).y));
    return near[0] || null;
  };
  const nearest = closest();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key === "Escape") return setSeedMenu(null);
      if (event.key.toLowerCase() !== "e" && event.key !== " ") return;
      event.preventDefault();
      if (nearest) interact(nearest);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const prizeArt = (prize: DigPrize) => prize.kind === "tokens" ? <><img src="/assets/Bread%20bucks.svg" alt="" /><b>{prize.amount}</b></> : prize.kind === "breadlet" ? <img src={artFor(prize.name)} alt={prize.name} className="fields-find" /> : <span className="fields-dirt">dirt</span>;

  if (error) return <p className="fields-error" role="alert">{error}</p>;

  return (
    <div className="fields-page" style={{ height: "calc(100vh - 11rem)", minHeight: 460 }}>
      <div className="fields-top">
        <h1>Breadlet Fields</h1>
        <span className="fields-chip-test">Test</span>
        <span className="fields-chip"><img src="/assets/Bread%20bucks.svg" alt="" />{tokens.toLocaleString()}</span>
        <span className="fields-chip"><Shovel size={16} />{fields ? `${fields.dig.shovels}/${SHOVELS_PER_HOUR}` : "…"}{fields && fields.dig.shovels < SHOVELS_PER_HOUR && <small>refill {clock(fields.dig.refillsAt - now)}</small>}</span>
        <span className="fields-chip ml-auto"><Users size={16} />{connected ? `${Object.keys(others).length + 1} here` : "Connecting…"}</span>
      </div>
      <div ref={viewportRef} onPointerDown={(event) => { setSeedMenu(null); pendingRef.current = null; walkTo(event); }} className="explore-viewport fields-viewport">
        <div className="fields-world" style={{ width: WORLD.width, height: WORLD.height, transform: `translate3d(${-camera.x}px, ${-camera.y}px, 0)` }}>
          <div className="fields-garden-ground" />
          <div className="fields-dig-ground" />
          <div className="fields-path" />
          <span className="fields-sign" style={{ left: 360, top: 150 }}><Sprout size={18} />Garden</span>
          <span className="fields-sign" style={{ left: 1124, top: 150 }}><Shovel size={18} />Dig Site</span>

          {PLOTS.map((spot, index) => {
            const plot = fields?.plots[index] || null;
            const seed = plot && seedNamed(plot.seed);
            const progress = plot && seed ? Math.min(1, (now - plot.plantedAt) / seed.growMs) : 0;
            const ready = progress >= 1;
            const target: Target = { kind: "plot", index };
            return (
              <button key={index} type="button" onPointerDown={(event) => choose(event, target)} aria-label={!plot ? "Empty plot: plant a seed" : ready ? `Harvest ${plot.seed}` : `${plot.seed} growing`}
                className={`fields-plot${ready ? " is-ready" : ""}${nearest?.kind === "plot" && nearest.index === index ? " is-near" : ""}`} style={{ left: spot.x, top: spot.y }}>
                {!plot && <span className="fields-plot-empty">+ Plant</span>}
                {plot && !ready && <><span className="fields-sprout" style={{ transform: `scale(${0.6 + progress * 0.6})` }}>🌱</span><span className="fields-bar"><i style={{ width: `${progress * 100}%` }} /></span></>}
                {plot && ready && <><img src={artFor(plot.seed)} alt="" className="fields-crop" /><span className="fields-ready">Ready!</span></>}
              </button>
            );
          })}

          {TILES.map((spot, index) => {
            const prize = fields?.dig.dug[index];
            const target: Target = { kind: "tile", index };
            return (
              <button key={index} type="button" onPointerDown={(event) => choose(event, target)} aria-label={prize ? "Dug" : "Dig here"}
                className={`fields-tile${prize ? " is-dug" : ""}${nearest?.kind === "tile" && nearest.index === index ? " is-near" : ""}`} style={{ left: spot.x, top: spot.y }}>
                {prize && prizeArt(prize)}
              </button>
            );
          })}

          {walkers.map((walker) => <WalkerSprite key={walker.id} walker={walker} isMe={walker.id === player.id} artFor={artFor} />)}
        </div>

        {nearest && seedMenu === null && <p className="fields-hint">Press <b>E</b> or click to {nearest.kind === "tile" ? "dig" : !fields?.plots[nearest.index] ? "plant" : "check your crop"}</p>}
        {!nearest && <p className="fields-hint">WASD / arrow keys or click to walk</p>}
        {toast && <p className="fields-toast" role="status">{toast}</p>}

        {seedMenu !== null && (
          <div className="fields-seeds" role="dialog" aria-label="Pick a seed" onPointerDown={(event) => event.stopPropagation()}>
            <header><b>Plant a seed</b><button type="button" onClick={() => setSeedMenu(null)} aria-label="Close">×</button></header>
            {SEEDS.map((seed) => (
              <button key={seed.name} type="button" disabled={busy || tokens < seed.cost} onClick={() => { const plot = seedMenu; setSeedMenu(null); void post({ action: "plant", plot, seed: seed.name as SeedName }); }}>
                <img src={artFor(seed.name)} alt="" />
                <span><b>{seed.name}</b><small>Grows in {clock(seed.growMs)} · sells for {seed.payout}</small></span>
                <em><img src="/assets/Bread%20bucks.svg" alt="" />{seed.cost}</em>
              </button>
            ))}
          </div>
        )}
      </div>
      <WalkChat placeholder="Say something in the Fields…" say={say} buttonClassName="fields-say" />
    </div>
  );
}
