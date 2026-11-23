"use client";

// Butterfly Catching: walk around the Butterfly Meadow as your Breadlet (like the Garden, and you
// see other players there too) and catch butterflies by walking into them before the round ends.
// The server rolls each round and pays for what you caught (lib/butterflies.ts, /api/fields).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Sprout } from "lucide-react";
import { WalkChat, WalkerSprite, useWalkWorld, type WalkPlayer } from "./walk-world";

type Kind = "Orange" | "Blue" | "Golden";
type Butterfly = { id: string; kind: Kind; at: number; x: number; y: number; angle: number; wave: number };
type Round = { id: string; butterflies: Butterfly[]; roundMs: number; flightMs: number };

const WORLD = { width: 2000, height: 1400 };
const EDGE = 70;
const CATCH_RADIUS = 72;
const DRIFT = 55; // pixels a second
const VALUES: Record<Kind, number> = { Orange: 6, Blue: 10, Golden: 25 };
// Breadlet's own butterflies: four rounded wings with spots, a little body with a smiley face and
// curly antennae. Each kind has its own colours; the Golden one sparkles.
const PALETTE: Record<Kind, { wing: string; edge: string; inner: string; spot: string; body: string }> = {
  Orange: { wing: "#ff9a2e", edge: "#9c4310", inner: "#ffc15e", spot: "#fff3d6", body: "#5a2f12" },
  Blue: { wing: "#4aa8ff", edge: "#1d4f8f", inner: "#9fd4ff", spot: "#ffffff", body: "#2b2140" },
  Golden: { wing: "#ffd23f", edge: "#a0700a", inner: "#fff09a", spot: "#ffffff", body: "#6b4a12" },
};
export function ButterflyArt({ kind, className }: { kind: Kind; className?: string }) {
  const c = PALETTE[kind];
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden="true">
      {kind === "Golden" && <circle cx="60" cy="50" r="46" fill="#fff6b0" opacity=".45" />}
      <g stroke={c.edge} strokeWidth="4" strokeLinejoin="round">
        <path d="M56 46C46 18 18 4 8 16c-9 11 2 34 26 36 10 1 18-1 22-6Z" fill={c.wing} />
        <path d="M64 46c10-28 38-42 48-30 9 11-2 34-26 36-10 1-18-1-22-6Z" fill={c.wing} />
        <path d="M56 54c-16 0-34 8-34 22 0 12 14 18 24 10 7-6 11-18 10-32Z" fill={c.wing} />
        <path d="M64 54c16 0 34 8 34 22 0 12-14 18-24 10-7-6-11-18-10-32Z" fill={c.wing} />
      </g>
      <path d="M50 42C42 26 26 18 19 24c-6 6 1 20 15 22 7 1 13 0 16-4Z" fill={c.inner} />
      <path d="M70 42c8-16 24-24 31-18 6 6-1 20-15 22-7 1-13 0-16-4Z" fill={c.inner} />
      <g fill={c.spot}>
        <circle cx="20" cy="22" r="4.5" /><circle cx="100" cy="22" r="4.5" />
        <circle cx="31" cy="36" r="3" /><circle cx="89" cy="36" r="3" />
        <circle cx="36" cy="76" r="4" /><circle cx="84" cy="76" r="4" />
      </g>
      <path d="M55 30c-4-10-8-16-14-18M65 30c4-10 8-16 14-18" stroke={c.body} strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="41" cy="12" r="3.5" fill={c.body} /><circle cx="79" cy="12" r="3.5" fill={c.body} />
      <rect x="53" y="30" width="14" height="52" rx="7" fill={c.body} />
      <circle cx="60" cy="34" r="11" fill={c.body} />
      <circle cx="56" cy="33" r="2.6" fill="#fff" /><circle cx="64" cy="33" r="2.6" fill="#fff" />
      <circle cx="56.6" cy="33.4" r="1.3" fill="#111" /><circle cx="64.6" cy="33.4" r="1.3" fill="#111" />
      <path d="M56.5 38.5c2 2 5 2 7 0" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      {kind === "Golden" && <g fill="#fff"><path d="M14 52l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" /><path d="M104 56l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6Z" /></g>}
    </svg>
  );
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
        <svg key={`b${index}`} className="bm-decor" style={{ left: bush.x - 50, top: bush.y - 50, zIndex: Math.round(bush.y) }} width="100" height="64" viewBox="0 0 100 64" aria-hidden="true">
          <path d="M8 58c-6-14 4-28 18-26 2-14 20-22 32-12 12-8 30 2 28 16 12 4 14 20 6 22Z" fill="#3f9d3a" stroke="#256b22" strokeWidth="3" />
          <circle cx={30 + bush.r * 30} cy="34" r="4" fill={bush.r > 0.5 ? "#ff5d7a" : "#ffd23f"} />
          <circle cx={60 - bush.r * 20} cy="42" r="4" fill={bush.r > 0.5 ? "#ff5d7a" : "#ffd23f"} />
        </svg>
      ))}
      {items.trees.map((tree, index) => (
        <svg key={`t${index}`} className="bm-decor bm-tree" style={{ left: tree.x - 80, top: tree.y - 190, zIndex: Math.round(tree.y) }} width="160" height="200" viewBox="0 0 160 200" aria-hidden="true">
          <ellipse cx="80" cy="192" rx="46" ry="8" fill="rgba(0,40,0,.22)" />
          <path d="M70 190c4-30 4-60 2-90h16c-2 30-2 60 2 90Z" fill="#8a5426" stroke="#55300f" strokeWidth="3" />
          <path d="M80 12c30 0 52 22 50 50 18 10 18 40-4 48-6 18-30 22-46 14-16 8-40 4-46-14-22-8-22-38-4-48-2-28 20-50 50-50Z" fill={tree.r > 0.5 ? "#4cae3e" : "#5bbf45"} stroke="#2a7322" strokeWidth="3.5" />
          <path d="M52 52c8-12 22-18 36-16" stroke="#7fd96a" strokeWidth="5" strokeLinecap="round" fill="none" />
          {tree.r > 0.35 && <><circle cx="60" cy="80" r="6" fill="#ff7a59" /><circle cx="104" cy="66" r="6" fill="#ff7a59" /><circle cx="88" cy="100" r="6" fill="#ff7a59" /></>}
        </svg>
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
