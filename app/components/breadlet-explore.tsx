"use client";

import { useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { WalkChat, WalkerSprite, useWalkWorld } from "./walk-world";

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
  const { viewportRef, others, walkers, connected, camera, walkTo, say } = useWalkWorld({
    room: `explore-${island.id}`,
    player,
    world: WORLD,
    clamp: clampToIsland,
    spawn: () => clampToIsland(ISLAND.cx + (Math.random() - 0.5) * 300, ISLAND.cy + (Math.random() - 0.5) * 160),
  });

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
          {walkers.map((walker) => <WalkerSprite key={walker.id} walker={walker} isMe={walker.id === player.id} artFor={artFor} />)}
        </div>
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-white">WASD / arrow keys or click to walk</p>
      </div>
      <WalkChat placeholder={`Say something on ${island.name}…`} say={say} />
    </div>
  );
}
