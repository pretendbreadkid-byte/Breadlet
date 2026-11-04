"use client";

// Games tab: the Breadlet Casino floor. Walk around as your Breadlet, chat in speech bubbles with
// everyone else here, and walk up to a table (roulette, slots, dice), the Cashier or the Chip Shop
// to play.
import { useCallback, useEffect, useRef, useState } from "react";
import { Users, X } from "lucide-react";
import { SLOT_SYMBOLS } from "../../lib/casino";
import { CasinoStation, Die, STATION_NAMES, WheelFace, type Station } from "./casino-games";
import { WalkChat, WalkerSprite, useWalkWorld, type WalkPlayer } from "./walk-world";

const WORLD = { width: 1600, height: 1000 };
const FLOOR = { left: 50, right: 1550, top: 200, bottom: 960 };
// Each station's footprint on the floor. Nobody can walk through it, and standing next to it lets
// you play.
const STATIONS: { id: Station; x: number; y: number; w: number; h: number }[] = [
  { id: "slots", x: 560, y: 120, w: 480, h: 120 },
  { id: "roulette", x: 230, y: 360, w: 360, h: 190 },
  { id: "dice", x: 1010, y: 360, w: 360, h: 190 },
  { id: "cashier", x: 110, y: 760, w: 300, h: 110 },
  { id: "shop", x: 1190, y: 760, w: 300, h: 110 },
];
const REACH = 70;
// Room around a Breadlet's feet so it doesn't overlap a table it's standing next to.
const PAD = { x: 26, top: 8, bottom: 8 };

function clampToFloor(x: number, y: number) {
  let px = Math.max(FLOOR.left, Math.min(FLOOR.right, x));
  let py = Math.max(FLOOR.top, Math.min(FLOOR.bottom, y));
  for (const station of STATIONS) {
    const left = station.x - PAD.x, right = station.x + station.w + PAD.x;
    const top = station.y - PAD.top, bottom = station.y + station.h + PAD.bottom;
    if (px <= left || px >= right || py <= top || py >= bottom) continue;
    // Push out the shortest way.
    const pushes = [[px - left, left, py], [right - px, right, py], [py - top, px, top], [bottom - py, px, bottom]] as const;
    const [, nx, ny] = pushes.reduce((best, push) => (push[0] < best[0] ? push : best));
    px = nx;
    py = ny;
  }
  return { x: px, y: py };
}

const distanceTo = (station: (typeof STATIONS)[number], x: number, y: number) =>
  Math.hypot(Math.max(station.x - x, 0, x - station.x - station.w), Math.max(station.y - y, 0, y - station.y - station.h));
// Where you walk to when you click a station: in front of it.
const frontOf = (station: (typeof STATIONS)[number]) => ({ x: station.x + station.w / 2, y: station.y + station.h + 40 });

export function GamesTab({ tokens, onBalance, player, artFor }: { tokens: number; onBalance: (tokens: number) => void; player: WalkPlayer; artFor: (name: string) => string }) {
  const [chips, setChips] = useState(0);
  const [chipError, setChipError] = useState("");
  const [open, setOpen] = useState<Station | null>(null);
  const pendingRef = useRef<Station | null>(null);
  const { viewportRef, me, others, walkers, connected, camera, walkTo, walkToPoint, say } = useWalkWorld({
    room: "casino-floor",
    player,
    world: WORLD,
    clamp: clampToFloor,
    spawn: () => clampToFloor(800 + (Math.random() - 0.5) * 200, 900),
  });

  useEffect(() => {
    void fetch("/api/casino").then(async (response) => {
      const data = await response.json().catch(() => null);
      if (response.ok && typeof data?.chips === "number") setChips(data.chips);
      else if (data?.error) setChipError(data.error);
    }).catch(() => setChipError("Couldn't load your chips. Try again."));
  }, []);

  const near = STATIONS.map((station) => ({ station, distance: distanceTo(station, me.x, me.y) }))
    .filter((entry) => entry.distance <= REACH)
    .sort((a, b) => a.distance - b.distance)[0]?.station.id || null;

  // Clicked a station from across the room: open it once you get there.
  useEffect(() => {
    if (pendingRef.current && pendingRef.current === near) {
      setOpen(near);
      pendingRef.current = null;
    }
  }, [near]);

  const goToStation = useCallback((id: Station) => {
    if (id === near) return setOpen(id);
    const station = STATIONS.find((entry) => entry.id === id)!;
    pendingRef.current = id;
    walkToPoint(frontOf(station).x, frontOf(station).y);
  }, [near, walkToPoint]);

  // E plays the table you're standing at; Escape walks away from it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key === "Escape") setOpen(null);
      if (event.key.toLowerCase() === "e" && near && !open) setOpen(near);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [near, open]);

  return (
    <div className="casino-floor-page flex flex-col gap-3">
      <div className="casino-floor-top">
        <h1>Breadlet Casino</h1>
        <p className="casino-balance"><img src="/assets/Bread%20bucks.svg" alt="" aria-hidden="true" />{tokens.toLocaleString()}</p>
        <p className="casino-balance casino-balance-chips"><img src="/assets/casino-chip.svg" alt="" aria-hidden="true" />{chips.toLocaleString()} Chips</p>
        <span className="casino-floor-count"><Users size={16} aria-hidden="true" />{connected ? `${Object.keys(others).length + 1} here` : "Connecting…"}</span>
      </div>
      {chipError && <p className="casino-error" role="alert">{chipError}</p>}

      <div ref={viewportRef} onPointerDown={walkTo} className="casino-floor-viewport relative flex-1 overflow-hidden">
        <div className="casino-floor-world absolute left-0 top-0" style={{ width: WORLD.width, height: WORLD.height, transform: `translate3d(${-camera.x}px, ${-camera.y}px, 0)` }}>
          <div className="casino-floor-wall" style={{ height: FLOOR.top - 20 }}>
            <span className="casino-floor-neon">♠ BREADLET CASINO ♦</span>
          </div>
          <div className="casino-floor-carpet" style={{ top: FLOOR.top - 20 }} />
          <div className="casino-floor-rug" style={{ left: 800 - 170, top: 590 }}><span>♣</span>Good luck!<span>♥</span></div>
          <div className="casino-floor-door" style={{ left: 800 - 90, top: WORLD.height - 26 }} />
          {[[70, 230], [1530, 230], [70, 640], [1530, 640]].map(([x, y]) => <span key={`${x}-${y}`} className="casino-floor-plant" style={{ left: x, top: y, zIndex: y }} aria-hidden="true">🪴</span>)}

          {STATIONS.map((station) => (
            <button key={station.id} type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => goToStation(station.id)}
              className={`casino-spot casino-spot-${station.id}${near === station.id ? " casino-spot-near" : ""}`}
              style={{ left: station.x, top: station.y, width: station.w, height: station.h, zIndex: station.y + station.h }}
              aria-label={`Play ${STATION_NAMES[station.id]}`}>
              <StationArt id={station.id} />
              <span className="casino-spot-sign">{STATION_NAMES[station.id]}</span>
            </button>
          ))}

          {walkers.map((walker) => <WalkerSprite key={walker.id} walker={walker} isMe={walker.id === player.id} artFor={artFor} />)}
        </div>

        {near && !open && (
          <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setOpen(near)} className="casino-floor-prompt">
            Play {STATION_NAMES[near]} <kbd>E</kbd>
          </button>
        )}
        <p className="casino-floor-hint pointer-events-none absolute bottom-3 left-3 z-[2000] rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white">WASD / arrow keys or tap to walk. Walk up to a table to play.</p>
      </div>

      <WalkChat placeholder="Say something to the casino…" say={say} buttonClassName="casino-play casino-floor-say" />

      {open && (
        <div className="modal-layer casino-station-layer fixed inset-0 flex items-center justify-center bg-black/70 px-3" onClick={() => setOpen(null)}>
          <div className="casino-station-card" role="dialog" aria-modal="true" aria-label={STATION_NAMES[open]} onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>{STATION_NAMES[open]}</h2>
              <button type="button" onClick={() => setOpen(null)} aria-label="Leave the table"><X size={24} strokeWidth={3} /></button>
            </header>
            <CasinoStation key={open} station={open} tokens={tokens} chips={chips} setChips={setChips} onBalance={onBalance} />
          </div>
        </div>
      )}
    </div>
  );
}

// What each station looks like on the floor.
function StationArt({ id }: { id: Station }) {
  if (id === "roulette") return (
    <span className="casino-spot-felt">
      <WheelFace className="casino-spot-wheel" />
      <span className="casino-spot-board" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} data-red={index % 2 === 0 ? "" : undefined} />)}</span>
    </span>
  );
  if (id === "dice") return (
    <span className="casino-spot-felt casino-spot-felt-dice">
      <span className="casino-spot-dice"><Die face={5} rolling={false} /><Die face={2} rolling={false} /></span>
      <span className="casino-spot-chips" aria-hidden="true"><img src="/assets/casino-chip.svg" alt="" /><img src="/assets/casino-chip.svg" alt="" /></span>
    </span>
  );
  if (id === "slots") return (
    <span className="casino-spot-machines">
      {[0, 1, 2, 3].map((machine) => (
        <span key={machine} className="casino-spot-machine">
          <span className="casino-spot-screen">{[0, 1, 2].map((reel) => <img key={reel} src={SLOT_SYMBOLS[(machine + reel * 2) % SLOT_SYMBOLS.length].art} alt="" />)}</span>
          <i className="casino-spot-lever" aria-hidden="true" />
        </span>
      ))}
    </span>
  );
  if (id === "cashier") return (
    <span className="casino-spot-counter">
      <span className="casino-spot-bars" aria-hidden="true" />
      <span className="casino-spot-chips" aria-hidden="true"><img src="/assets/casino-chip.svg" alt="" /><img src="/assets/casino-chip.svg" alt="" /><img src="/assets/casino-chip.svg" alt="" /></span>
    </span>
  );
  return (
    <span className="casino-spot-counter casino-spot-counter-shop">
      <span className="casino-spot-prizes" aria-hidden="true">🥖 🏅 💎</span>
    </span>
  );
}
