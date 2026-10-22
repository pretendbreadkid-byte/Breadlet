"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Send, Users } from "lucide-react";
import { createClient as createSupabaseClient } from "../../lib/supabase/client";
import { filterProfanity, hasSevereSlur } from "../../lib/chat-filter";

// Breadlet Explore (beta): pick an island, walk around as your equipped Breadlet and chat.
// Positions and chat bubbles are shared live through a Supabase Realtime channel per island.

type Island = { id: string; name: string; tagline: string; water: string; waterDeep: string; ground: string; shore: string; decor: string[] };

const ISLANDS: Island[] = [
  { id: "bread-beach", name: "Bread Beach", tagline: "Warm sand, toast palms and sunny waves.", water: "#35a7e8", waterDeep: "#1677c4", ground: "#f3d58f", shore: "#fff1c4", decor: ["🌴", "🍞", "⛱️", "🐚", "🦀", "🌴", "🥖", "🐚"] },
  { id: "frosty-peaks", name: "Frosty Peaks", tagline: "Snowy hills and frozen ponds.", water: "#2d6c9e", waterDeep: "#173f66", ground: "#eef7ff", shore: "#c9e4f7", decor: ["🌲", "⛄", "❄️", "🌲", "🏔️", "🧊", "🌲", "❄️"] },
  { id: "candy-cove", name: "Candy Cove", tagline: "Lollipop trees on a sugar shore.", water: "#c77ddb", waterDeep: "#8e44ad", ground: "#ffd6ec", shore: "#fff0f8", decor: ["🍭", "🍬", "🧁", "🍩", "🍭", "🍫", "🍬", "🧁"] },
  { id: "lava-loaf", name: "Lava Loaf", tagline: "A toasty volcano surrounded by lava.", water: "#ff6a1f", waterDeep: "#b3240b", ground: "#5b3b2e", shore: "#8a5a44", decor: ["🌋", "🔥", "🪨", "💎", "🔥", "🪨", "🌋", "💎"] },
];

const WORLD = { width: 1600, height: 1000 };
const ISLAND = { cx: 800, cy: 500, rx: 680, ry: 400 };
const SPEED = 240; // world pixels per second
const BUBBLE_MS = 6000;

type Walker = { id: string; username: string; blook: string; x: number; y: number; facing: 1 | -1; bubble?: { text: string; at: number } };

// Keeps a point inside the island's walkable oval.
function clampToIsland(x: number, y: number) {
  const dx = (x - ISLAND.cx) / (ISLAND.rx * 0.9);
  const dy = (y - ISLAND.cy) / (ISLAND.ry * 0.9);
  const distance = Math.hypot(dx, dy);
  if (distance <= 1) return { x, y };
  return { x: ISLAND.cx + (dx / distance) * ISLAND.rx * 0.9, y: ISLAND.cy + (dy / distance) * ISLAND.ry * 0.9 };
}

// Decorations sit at fixed spots on the island so every player sees the same layout.
const DECOR_SPOTS = [
  [0.22, 0.32], [0.7, 0.24], [0.84, 0.55], [0.3, 0.72], [0.55, 0.8], [0.14, 0.52], [0.62, 0.42], [0.42, 0.22],
].map(([u, v]) => ({ x: ISLAND.cx - ISLAND.rx + u * ISLAND.rx * 2, y: ISLAND.cy - ISLAND.ry + v * ISLAND.ry * 2 }));

const cleanBubble = (text: string) => (hasSevereSlur(text) ? "" : filterProfanity(text.slice(0, 120)));

export function BreadletExplore({ player, artFor }: { player: { id: string; username: string; equipped: string; chatMutedUntil?: string }; artFor: (name: string) => string }) {
  const [island, setIsland] = useState<Island | null>(null);
  if (!island) return <IslandPicker pick={setIsland} />;
  return <IslandWorld key={island.id} island={island} player={player} artFor={artFor} leave={() => setIsland(null)} />;
}

function IslandPicker({ pick }: { pick: (island: Island) => void }) {
  return (
    <div className="max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-4xl font-black">Breadlet Explore</h1>
        <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-950">Beta</span>
      </div>
      <p className="mt-2 text-[#bde8ff]">Pick an island, walk around as your equipped Breadlet and chat with everyone there.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {ISLANDS.map((option) => (
          <button key={option.id} onClick={() => pick(option)} className="explore-island-card group overflow-hidden rounded-3xl border-4 border-[#0b2a4d] text-left shadow-xl" style={{ background: `radial-gradient(circle at 50% 60%, ${option.water}, ${option.waterDeep})` }}>
            <div className="relative h-44">
              <div className="explore-island-blob absolute left-1/2 top-1/2 h-28 w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]" style={{ background: option.ground, boxShadow: `0 0 0 8px ${option.shore}, 0 14px 30px rgba(0,0,0,.35)` }}>
                <span className="absolute left-[18%] top-[18%] text-3xl">{option.decor[0]}</span>
                <span className="absolute right-[20%] top-[30%] text-3xl">{option.decor[1]}</span>
                <span className="absolute bottom-[14%] left-[45%] text-3xl">{option.decor[2]}</span>
              </div>
            </div>
            <div className="bg-[#0b2a4d]/90 px-5 py-4">
              <h2 className="text-2xl font-black text-white">{option.name}</h2>
              <p className="text-sm text-[#bde8ff]">{option.tagline}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function IslandWorld({ island, player, artFor, leave }: { island: Island; player: { id: string; username: string; equipped: string; chatMutedUntil?: string }; artFor: (name: string) => string; leave: () => void }) {
  const supabase = useMemo(() => createSupabaseClient(), []);
  const viewportRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<Walker>({ id: player.id, username: player.username, blook: player.equipped, ...clampToIsland(ISLAND.cx + (Math.random() - 0.5) * 300, ISLAND.cy + (Math.random() - 0.5) * 160), facing: 1 });
  const targetRef = useRef<{ x: number; y: number } | null>(null);
  const keysRef = useRef(new Set<string>());
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const lastSentRef = useRef(0);
  const [me, setMe] = useState<Walker>(meRef.current);
  const [others, setOthers] = useState<Record<string, Walker>>({});
  const [viewport, setViewport] = useState({ width: 800, height: 500 });
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);

  const broadcastPosition = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastSentRef.current < 150) return;
    lastSentRef.current = now;
    const { x, y, facing } = meRef.current;
    void channelRef.current?.send({ type: "broadcast", event: "move", payload: { id: player.id, x: Math.round(x), y: Math.round(y), facing } });
  }, [player.id]);

  // Join the island's live channel.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel(`explore-${island.id}`, { config: { presence: { key: player.id }, broadcast: { self: false } } });
    channelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ id: string; username: string; blook: string; x: number; y: number }>();
        setOthers((current) => {
          const next: Record<string, Walker> = {};
          Object.values(state).flat().forEach((entry) => {
            if (!entry.id || entry.id === player.id) return;
            next[entry.id] = current[entry.id] || { id: entry.id, username: entry.username, blook: entry.blook, x: entry.x, y: entry.y, facing: 1 };
          });
          return next;
        });
      })
      // Tell newcomers where we are right now.
      .on("presence", { event: "join" }, () => broadcastPosition(true))
      .on("broadcast", { event: "move" }, ({ payload }) => {
        setOthers((current) => current[payload.id] ? { ...current, [payload.id]: { ...current[payload.id], ...clampToIsland(Number(payload.x) || 0, Number(payload.y) || 0), facing: payload.facing === -1 ? -1 : 1 } } : current);
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const text = cleanBubble(String(payload.text || ""));
        if (!text) return;
        setOthers((current) => current[payload.id] ? { ...current, [payload.id]: { ...current[payload.id], bubble: { text, at: Date.now() } } } : current);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        setConnected(true);
        const { x, y } = meRef.current;
        void channel.track({ id: player.id, username: player.username, blook: player.equipped, x: Math.round(x), y: Math.round(y) });
      });
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [broadcastPosition, island.id, player.equipped, player.id, player.username, supabase]);

  // Track the viewport size for the camera.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Keyboard movement (ignored while typing in the chat box).
  useEffect(() => {
    const movementKeys = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      const key = event.key.toLowerCase();
      if (!movementKeys.includes(key)) return;
      event.preventDefault();
      keysRef.current.add(key);
      targetRef.current = null;
    };
    const up = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    const clear = () => keysRef.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // Movement loop: only re-renders while the player is actually moving.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const step = (time: number) => {
      const seconds = Math.min(0.05, (time - last) / 1000);
      last = time;
      const keys = keysRef.current;
      let dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      let dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      const target = targetRef.current;
      if (!dx && !dy && target) {
        const tx = target.x - meRef.current.x;
        const ty = target.y - meRef.current.y;
        const distance = Math.hypot(tx, ty);
        if (distance < 4) targetRef.current = null;
        else { dx = tx / distance; dy = ty / distance; }
      }
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        const next = clampToIsland(meRef.current.x + (dx / length) * SPEED * seconds, meRef.current.y + (dy / length) * SPEED * seconds);
        meRef.current = { ...meRef.current, ...next, facing: dx < 0 ? -1 : dx > 0 ? 1 : meRef.current.facing };
        setMe(meRef.current);
        broadcastPosition();
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [broadcastPosition]);

  // Drop chat bubbles after a few seconds.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - BUBBLE_MS;
      if (meRef.current.bubble && meRef.current.bubble.at < cutoff) { meRef.current = { ...meRef.current, bubble: undefined }; setMe(meRef.current); }
      setOthers((current) => Object.values(current).some((walker) => walker.bubble && walker.bubble.at < cutoff)
        ? Object.fromEntries(Object.entries(current).map(([id, walker]) => [id, walker.bubble && walker.bubble.at < cutoff ? { ...walker, bubble: undefined } : walker]))
        : current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const camera = {
    x: Math.max(0, Math.min(WORLD.width - viewport.width, me.x - viewport.width / 2)),
    y: Math.max(0, Math.min(WORLD.height - viewport.height, me.y - viewport.height / 2)),
  };

  const walkTo = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    targetRef.current = clampToIsland(event.clientX - rect.left + camera.x, event.clientY - rect.top + camera.y);
  };

  const sendChat = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (player.chatMutedUntil && Date.parse(player.chatMutedUntil) > Date.now()) return setNotice("You are timed out from chat right now.");
    const clean = cleanBubble(text);
    if (!clean) return setNotice("That message isn't allowed.");
    setDraft("");
    setNotice("");
    meRef.current = { ...meRef.current, bubble: { text: clean, at: Date.now() } };
    setMe(meRef.current);
    void channelRef.current?.send({ type: "broadcast", event: "chat", payload: { id: player.id, text: clean } });
  };

  const walkers = [...Object.values(others), me].sort((a, b) => a.y - b.y);

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 11rem)", minHeight: 420 }}>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={leave} className="flex items-center gap-2 rounded-xl bg-[#18558f] px-4 py-2 font-bold hover:bg-[#1f67ab]"><ArrowLeft size={18} />Islands</button>
        <h1 className="text-2xl font-black">{island.name}</h1>
        <span className="rounded-full bg-amber-300 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-950">Beta</span>
        <span className="ml-auto flex items-center gap-2 text-sm font-bold text-[#bde8ff]"><Users size={16} />{connected ? `${Object.keys(others).length + 1} here` : "Connecting…"}</span>
      </div>
      <div ref={viewportRef} onPointerDown={walkTo} className="explore-viewport relative flex-1 overflow-hidden rounded-3xl border-4 border-[#0b2a4d] shadow-xl" style={{ background: `radial-gradient(circle at 50% 50%, ${island.water}, ${island.waterDeep})` }}>
        <div className="absolute left-0 top-0" style={{ width: WORLD.width, height: WORLD.height, transform: `translate3d(${-camera.x}px, ${-camera.y}px, 0)` }}>
          <div className="absolute rounded-[50%]" style={{ left: ISLAND.cx - ISLAND.rx, top: ISLAND.cy - ISLAND.ry, width: ISLAND.rx * 2, height: ISLAND.ry * 2, background: `radial-gradient(ellipse at 50% 45%, ${island.ground} 70%, ${island.shore} 100%)`, boxShadow: `0 0 0 18px ${island.shore}55, 0 30px 60px rgba(0,0,0,.35)` }} />
          {DECOR_SPOTS.map((spot, index) => (
            <span key={index} className="pointer-events-none absolute select-none text-5xl" style={{ left: spot.x, top: spot.y, transform: "translate(-50%, -100%)" }} aria-hidden="true">{island.decor[index % island.decor.length]}</span>
          ))}
          {walkers.map((walker) => (
            <div key={walker.id} className={`explore-walker pointer-events-none absolute ${walker.id === player.id ? "" : "explore-walker-remote"}`} style={{ left: 0, top: 0, transform: `translate3d(${walker.x}px, ${walker.y}px, 0)` }}>
              {walker.bubble && <div className="explore-bubble absolute bottom-[84px] left-1/2 w-max max-w-[220px] -translate-x-1/2 break-words rounded-2xl border-2 border-white/80 bg-[#0b2a4d] px-3 py-2 text-center text-sm font-bold text-white shadow-lg">{walker.bubble.text}</div>}
              <img src={artFor(walker.blook || "Bread Blook")} alt="" draggable={false} className="absolute bottom-0 left-1/2 h-16 w-16 max-w-none object-contain drop-shadow-lg" style={{ transform: `translateX(-50%) scaleX(${walker.facing})` }} />
              <span className={`absolute left-1/2 top-1 w-max -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-black ${walker.id === player.id ? "bg-[#39a8f5] text-white" : "bg-black/60 text-white"}`}>{walker.username}</span>
            </div>
          ))}
        </div>
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-white">WASD / arrow keys or click to walk</p>
      </div>
      <form onSubmit={sendChat} className="flex gap-2">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={120} placeholder={`Say something on ${island.name}…`} className="min-w-0 flex-1 rounded-xl border border-[#3d91cd] bg-[#072a54] px-4 py-3 text-white placeholder:text-[#6ea3ce]" />
        <button type="submit" className="flex items-center gap-2 rounded-xl bg-[#39a8f5] px-5 py-3 font-black text-[#031426] hover:bg-[#73c8ff]"><Send size={18} />Say</button>
      </form>
      {notice && <p className="text-sm font-bold text-rose-200">{notice}</p>}
    </div>
  );
}
