"use client";

// Butterfly Catching: walk around the Butterfly Meadow as your Breadlet (like the Garden, and you
// see other players there too) and catch butterflies by walking into them before the round ends.
// The server rolls each round and pays for what you caught (lib/butterflies.ts, /api/fields).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Sprout } from "lucide-react";
import { ButterflySvg } from "./garden-art";
import { WalkChat, WalkerSprite, useWalkWorld, type WalkPlayer } from "./walk-world";

type Kind = "Orange" | "Blue" | "Golden";
type Butterfly = { id: string; kind: Kind; at: number; x: number; y: number; angle: number; wave: number };
type Round = { id: string; butterflies: Butterfly[]; roundMs: number; flightMs: number };

const WORLD = { width: 2000, height: 1400 };
const EDGE = 70;
const CATCH_RADIUS = 72;
const DRIFT = 55; // pixels a second
const VALUES: Record<Kind, number> = { Orange: 6, Blue: 10, Golden: 25 };
// The same butterflies that fly around the Garden, one colour per kind.
const WING: Record<Kind, string> = { Orange: "#ff7a45", Blue: "#7cc4ff", Golden: "#ffd23f" };
export function ButterflyArt({ kind, className }: { kind: Kind; className?: string }) {
  return <ButterflySvg color={WING[kind]} className={className} />;
}

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) : {};
  return { ok: Boolean(response?.ok), data: data as any };
}

const clamp = (x: number, y: number) => ({
  x: Math.max(EDGE, Math.min(WORLD.width - EDGE, x)),
  y: Math.max(EDGE + 40, Math.min(WORLD.height - EDGE, y)),
});
// Bounces a drifting value back and forth between low and high.
const fold = (value: number, low: number, high: number) => {
  const span = high - low;
  const t = (((value - low) % (2 * span)) + 2 * span) % (2 * span);
  return low + (t <= span ? t : 2 * span - t);
};
// Where a butterfly is, ms after it appeared.
function butterflyAt(butterfly: Butterfly, ms: number) {
  const seconds = ms / 1000;
  const x = butterfly.x * WORLD.width + Math.cos(butterfly.angle) * DRIFT * seconds + Math.sin(seconds * 2.2 * butterfly.wave) * 46;
  const y = butterfly.y * WORLD.height + Math.sin(butterfly.angle) * DRIFT * seconds + Math.cos(seconds * 3.1 * butterfly.wave) * 28;
  return { x: fold(x, EDGE, WORLD.width - EDGE), y: fold(y, EDGE + 40, WORLD.height - EDGE) };
}

// The meadow's own scenery, scattered the same way every time.
function seeded(seed: number) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return value / 2147483647; };
}
const FLOWER_COLOURS = ["#ff8fb0", "#ffd23f", "#ffffff", "#ff9f43", "#c99cff"];
function Scenery() {
  const items = useMemo(() => {
    const rand = seeded(42);
    const pick = (count: number, margin = 120) => Array.from({ length: count }, () => ({ x: margin + rand() * (WORLD.width - margin * 2), y: margin + rand() * (WORLD.height - margin * 2), r: rand() }));
    return { trees: pick(9, 150), bushes: pick(14), patches: pick(26, 80), rocks: pick(8), logs: pick(3, 220) };
  }, []);
  return (
    <>
      <div className="bm-pond" style={{ left: 1320, top: 360 }} aria-hidden="true"><span /></div>
      <div className="bm-path" aria-hidden="true" />
      {items.patches.map((patch, index) => (
        <svg key={`f${index}`} className="bm-decor" style={{ left: patch.x - 40, top: patch.y - 30, zIndex: Math.round(patch.y) - 40 }} width="80" height="60" viewBox="0 0 80 60" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((petal) => {
            const fx = 12 + ((petal * 17 + index * 7) % 56);
            const fy = 14 + ((petal * 23 + index * 11) % 34);
            const colour = FLOWER_COLOURS[(index + petal) % FLOWER_COLOURS.length];
            return (
              <g key={petal}>
                <path d={`M${fx} ${fy + 4}v12`} stroke="#3f8f32" strokeWidth="2.4" strokeLinecap="round" />
                {[0, 72, 144, 216, 288].map((turn) => <ellipse key={turn} cx={fx} cy={fy - 4} rx="3.2" ry="5" fill={colour} transform={`rotate(${turn} ${fx} ${fy})`} />)}
                <circle cx={fx} cy={fy} r="2.6" fill="#f08a2c" />
              </g>
            );
          })}
        </svg>
      ))}
      {items.rocks.map((rock, index) => (
        <svg key={`r${index}`} className="bm-decor" style={{ left: rock.x - 26, top: rock.y - 18, zIndex: Math.round(rock.y) }} width="52" height="34" viewBox="0 0 52 34" aria-hidden="true">
          <path d="M6 30c-4-8 2-20 14-24 10-3 22 1 26 10 3 7-1 14-6 14Z" fill="#a39a8c" stroke="#6d6458" strokeWidth="3" />
          <path d="M16 12c5-3 11-3 15-1" stroke="#c9c1b3" strokeWidth="3" strokeLinecap="round" fill="none" />
        </svg>
      ))}
      {items.logs.map((log, index) => (
        <svg key={`l${index}`} className="bm-decor" style={{ left: log.x - 60, top: log.y - 22, zIndex: Math.round(log.y) }} width="120" height="44" viewBox="0 0 120 44" aria-hidden="true">
          <rect x="8" y="8" width="100" height="28" rx="14" fill="#9a5a2a" stroke="#5c3212" strokeWidth="3" />
          <ellipse cx="104" cy="22" rx="10" ry="14" fill="#e0b07a" stroke="#5c3212" strokeWidth="3" />
          <ellipse cx="104" cy="22" rx="4" ry="6" fill="none" stroke="#a9733c" strokeWidth="2" />
          <path d="M30 16h40M24 28h30" stroke="#6e3c16" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      ))}
      {items.bushes.map((bush, index) => (
        <img key={`b${index}`} src="/assets/garden/berry-bush.svg" alt="" className="bm-decor bm-decor-img" style={{ left: bush.x, top: bush.y, width: 92, zIndex: Math.round(bush.y) }} draggable={false} />
      ))}
      {items.trees.map((tree, index) => (
        <img key={`t${index}`} src="/assets/garden/tree-prop.svg" alt="" className="bm-decor bm-decor-img bm-tree" style={{ left: tree.x, top: tree.y, width: 150 + tree.r * 40, zIndex: Math.round(tree.y) }} draggable={false} />
      ))}
    </>
  );
}

export function ButterflyCatch({ player, onBalance, onExit, onGarden, artFor }: {
  player: WalkPlayer;
  onBalance: (tokens: number) => void;
  onExit: () => void;
  onGarden: () => void;
  artFor: (name: string) => string;
}) {
  const [earned, setEarned] = useState(0);
  const [limit, setLimit] = useState(1500);
  const [round, setRound] = useState<Round | null>(null);
  const [left, setLeft] = useState(0);
  const [score, setScore] = useState(0);
  const [pops, setPops] = useState<{ id: string; x: number; y: number; value: number }[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const startRef = useRef(0);
  const caughtRef = useRef<string[]>([]);
  const finishedRef = useRef(false);
  const layerRef = useRef<HTMLDivElement>(null);

  const { viewportRef, me, walkers, connected, cameraNow, walkToPoint, say } = useWalkWorld({
    room: "butterfly-meadow",
    player,
    world: WORLD,
    clamp,
    spawn: () => clamp(WORLD.width / 2 - 60 + Math.random() * 120, WORLD.height - 200 + Math.random() * 60),
  });
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => {
    void post({ action: "butterflyStatus" }).then(({ ok, data }) => {
      if (ok) { setEarned(Number(data.earnedToday) || 0); setLimit(Number(data.limit) || 1500); }
    });
  }, []);

  const finish = useCallback(async (current: Round) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setBusy(true);
    const { ok, data } = await post({ action: "butterflyFinish", round: current.id, caught: caughtRef.current });
    setBusy(false);
    setRound(null);
    setMessage(data.message || data.error || (ok ? "Round over." : "Something went wrong."));
    if (ok) {
      setEarned(Number(data.earnedToday) || 0);
      if (typeof data.tokens === "number") onBalance(data.tokens);
    }
  }, [onBalance]);

  // Every frame: move the butterflies (straight on the page, no re-render), catch any you're
  // touching, and end the round when time runs out.
  useEffect(() => {
    if (!round) return;
    let frame = 0;
    let lastLeft = -1;
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const secondsLeft = Math.max(0, Math.ceil((round.roundMs - elapsed) / 1000));
      if (secondsLeft !== lastLeft) { lastLeft = secondsLeft; setLeft(secondsLeft); }
      if (elapsed >= round.roundMs) { void finish(round); return; }
      const mine = meRef.current;
      for (const butterfly of round.butterflies) {
        const element = layerRef.current?.querySelector<HTMLElement>(`[data-bf="${butterfly.id}"]`);
        if (!element) continue;
        const since = elapsed - butterfly.at;
        const caught = caughtRef.current.includes(butterfly.id);
        if (since < 0 || since > round.flightMs || caught) { element.style.display = "none"; continue; }
        const spot = butterflyAt(butterfly, since);
        const fade = Math.min(1, since / 600, (round.flightMs - since) / 600);
        const flap = 0.5 + Math.abs(Math.sin(elapsed / 85 + butterfly.at)) * 0.5;
        const facing = Math.cos(butterfly.angle) + Math.cos(since / 1000 * 2.2 * butterfly.wave) * 0.8 >= 0 ? 1 : -1;
        element.style.display = "";
        element.style.opacity = String(fade);
        element.style.zIndex = String(Math.round(spot.y) + 60);
        element.style.transform = `translate3d(${spot.x}px, ${spot.y - 70}px, 0) translate(-50%, -50%) scaleX(${facing * flap})`;
        // The butterfly hovers above its spot; walk onto the spot to catch it.
        if (Math.hypot(spot.x - mine.x, spot.y - mine.y) < CATCH_RADIUS) {
          caughtRef.current = [...caughtRef.current, butterfly.id];
          element.style.display = "none";
          const value = VALUES[butterfly.kind];
          setScore((current) => current + value);
          const pop = { id: butterfly.id, x: spot.x, y: spot.y - 80, value };
          setPops((list) => [...list, pop]);
          window.setTimeout(() => setPops((list) => list.filter((item) => item.id !== pop.id)), 900);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [round, finish]);

  const start = async () => {
    setBusy(true);
    setMessage("");
    const { ok, data } = await post({ action: "butterflyStart" });
    setBusy(false);
    if (!ok) { setMessage(data.error || "Couldn't start a round."); return; }
    caughtRef.current = [];
    finishedRef.current = false;
    setScore(0);
    setPops([]);
    setEarned(Number(data.earnedToday) || 0);
    startRef.current = performance.now();
    setLeft(Math.ceil(data.round.roundMs / 1000));
    setRound(data.round);
  };

  // Click or tap the meadow to walk there (a butterfly counts as the meadow too).
  const clickGround = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, input, form, .bm-hud")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const camera = cameraNow();
    walkToPoint(event.clientX - rect.left + camera.x, event.clientY - rect.top + camera.y);
  };

  const full = earned >= limit;
  // While you play, the bar counts what you've caught this round too (the server pays it at the end).
  const shown = Math.min(limit, earned + (round ? score : 0));
  // Leaving mid-round still hands in what you caught.
  const roundRef = useRef<Round | null>(null);
  roundRef.current = round;
  useEffect(() => () => {
    const current = roundRef.current;
    if (!current || finishedRef.current) return;
    finishedRef.current = true;
    void fetch("/api/fields", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "butterflyFinish", round: current.id, caught: caughtRef.current }) }).catch(() => null);
  }, []);
  const leave = async (then: () => void) => {
    if (round && !finishedRef.current) await finish(round);
    then();
  };
  return createPortal(
    <div className="garden-screen bm-screen">
      <div ref={viewportRef} onPointerDown={clickGround} className="explore-viewport garden-viewport bm-viewport">
        <div data-walk-world className="garden-world bm-world" style={{ width: WORLD.width, height: WORLD.height }}>
          <Scenery />
          <div ref={layerRef}>
            {round && round.butterflies.map((butterfly) => (
              <div key={butterfly.id} data-bf={butterfly.id} className={`bm-butterfly is-${butterfly.kind.toLowerCase()}`} style={{ display: "none" }}>
                <ButterflyArt kind={butterfly.kind} />
              </div>
            ))}
          </div>
          {pops.map((pop) => <span key={pop.id} className="bf-pop" style={{ left: pop.x, top: pop.y, zIndex: 99999 }}>+{pop.value}</span>)}
          {walkers.map((walker) => <WalkerSprite key={walker.id} walker={walker} isMe={walker.id === player.id} artFor={artFor} />)}
        </div>
      </div>

      <div className="bm-hud bm-top">
        <div className="bf-top-buttons">
          <button type="button" className="bf-back" onClick={() => void leave(onExit)}><ArrowLeft size={18} />Back</button>
          <button type="button" className="bf-back" onClick={() => void leave(onGarden)}><Sprout size={18} />Garden</button>
        </div>
        <img src="/assets/butterflies/butterfly-catching-logo.svg" alt="Butterfly Catching" className="bf-logo" />
        <div className="bm-top-right">
          <div className="bf-meter" aria-label={`${shown} of ${limit} Bread Bucks earned today`}>
            <span style={{ width: `${Math.min(100, (shown / limit) * 100)}%` }} />
            <b><img src="/assets/Bread%20bucks.svg" alt="" />{shown.toLocaleString()} / {limit.toLocaleString()} today</b>
          </div>
          {round && <div className="bf-round"><span>⏱ {left}s</span><span>+{score}</span></div>}
        </div>
      </div>

      {!round && (
        <div className="bm-hud bf-card bm-card">
          <h2>{busy ? "Counting your catch…" : message ? "Round over" : "Butterfly Meadow"}</h2>
          {message ? <p>{message}</p> : <p>Walk around the meadow (WASD, arrow keys or tap) and walk into butterflies to catch them. Each round lasts 60 seconds.</p>}
          <ul className="bf-key">
            {(Object.keys(VALUES) as Kind[]).map((kind) => (
              <li key={kind}><ButterflyArt kind={kind} />{kind}<b>{VALUES[kind]}</b></li>
            ))}
          </ul>
          <button type="button" className="bf-start" disabled={busy || full} onClick={() => void start()}>
            {full ? "Come back tomorrow" : message ? "Play again" : "Start catching"}
          </button>
          <small>Up to {limit.toLocaleString()} Bread Bucks a day from butterflies.{connected ? "" : " Connecting…"}</small>
        </div>
      )}

      <div className="bm-hud bm-chat"><WalkChat placeholder="Say something…" say={say} buttonClassName="bm-say" /></div>
    </div>,
    document.body,
  );
}

// The pop-up when you open the Garden: pick the Breadlet Garden or Butterfly Catching.
export function GardenChooser({ onPick, onClose }: { onPick: (mode: "garden" | "butterflies") => void; onClose: () => void }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="garden-chooser-layer" role="dialog" aria-modal="true" aria-label="Choose a game" onClick={onClose}>
      <div className="garden-chooser" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="garden-choice is-garden" onClick={() => onPick("garden")}>
          <img src="/assets/butterflies/breadlet-garden-logo.svg" alt="" />
          <b>Breadlet Garden</b>
          <span>Plant seeds, grow crops and build your garden.</span>
        </button>
        <button type="button" className="garden-choice is-butterflies" onClick={() => onPick("butterflies")}>
          <img src="/assets/butterflies/butterfly-catching-logo.svg" alt="" />
          <b>Butterfly Catching</b>
          <span>Walk the meadow and catch butterflies for up to 1,500 Bread Bucks a day.</span>
        </button>
      </div>
    </div>
  );
}
