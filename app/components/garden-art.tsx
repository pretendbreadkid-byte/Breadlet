"use client";

// Everything you see in the Breadlet Garden that isn't game logic: the meadow, the path, the fence,
// the shed, the well, the wheat field, trees, butterflies and every crop's growth stages.
// fields-world.tsx places these and handles walking, planting and harvesting.
import { memo } from "react";
import { GARDEN, GATE, ROWS, propNamed, type PlacedProp, type SeedName } from "../../lib/fields";
export { GARDEN, GATE, ROWS };

export const WORLD = { width: 2600, height: 1700 };
const FRONT = GARDEN.y + GARDEN.height;
export const STAND = { x: 380, y: 1390 };
const SIGN = { x: GATE.x + 200, y: FRONT + 92 };
const TREES = [
  { x: 260, y: 330, size: 1.1 }, { x: 640, y: 230, size: 0.9 }, { x: 2380, y: 1000, size: 1.1 }, { x: 2250, y: 1560, size: 0.95 },
  { x: 120, y: 1180, size: 1 }, { x: 1720, y: 1600, size: 0.85 }, { x: 2200, y: 300, size: 0.95 }, { x: 760, y: 1120, size: 0.85 },
] as const;

// Seeded random so the meadow looks the same for everyone in the garden.
const seeded = (start: number) => {
  let value = start;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// The dirt path from the garden gate to Ted's stand, as a smooth curve through these points.
const PATH_KEYS: [number, number][] = [[GATE.x, FRONT + 6], [GATE.x - 10, FRONT + 90], [1320, 1460], [1100, 1500], [880, 1490], [680, 1490], [520, 1475], [STAND.x + 20, STAND.y + 60]];
const PATH_POINTS = (() => {
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < PATH_KEYS.length - 1; index += 1) {
    const [a, b, c, d] = [PATH_KEYS[index - 1] || PATH_KEYS[index], PATH_KEYS[index], PATH_KEYS[index + 1], PATH_KEYS[index + 2] || PATH_KEYS[index + 1]];
    for (let step = 0; step < 20; step += 1) {
      const t = step / 20;
      const curve = (p0: number, p1: number, p2: number, p3: number) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
      points.push({ x: curve(a[0], b[0], c[0], d[0]), y: curve(a[1], b[1], c[1], d[1]) });
    }
  }
  const [lastX, lastY] = PATH_KEYS[PATH_KEYS.length - 1];
  points.push({ x: lastX, y: lastY });
  return points;
})();
const nearPath = (x: number, y: number, distance: number) => PATH_POINTS.some((point) => Math.hypot(x - point.x, y - point.y) < distance);

const blocked = (x: number, y: number) =>
  (x > GARDEN.x - 70 && x < GARDEN.x + GARDEN.width + 70 && y > GARDEN.y - 90 && y < GARDEN.y + GARDEN.height + 60)
  || (x > STAND.x - 200 && x < STAND.x + 200 && y > STAND.y - 280 && y < STAND.y + 120)
  || nearPath(x, y, 80)
  || (Math.abs(x - SIGN.x) < 100 && y > SIGN.y - 150 && y < SIGN.y + 30)
  || TREES.some((tree) => Math.hypot(x - tree.x, y - tree.y + 60) < 125 * tree.size);

// Things you can't walk through: the fence (except the gate), Ted's stand, the sign, the gate posts,
// tree trunks and props. Points are where a Breadlet's feet are.
const SOLID_BOXES: [number, number, number, number][] = [
  [GARDEN.x - 24, GARDEN.y - 30, GARDEN.x + GARDEN.width + 24, GARDEN.y + 22],
  [GARDEN.x - 24, FRONT - 30, GATE.x - 50, FRONT + 22],
  [GATE.x + 50, FRONT - 30, GARDEN.x + GARDEN.width + 24, FRONT + 22],
  [GARDEN.x - 24, GARDEN.y - 30, GARDEN.x + 22, FRONT + 22],
  [GARDEN.x + GARDEN.width - 22, GARDEN.y - 30, GARDEN.x + GARDEN.width + 24, FRONT + 22],
  [STAND.x - 125, STAND.y - 80, STAND.x + 125, STAND.y + 8],
  [SIGN.x - 45, SIGN.y - 28, SIGN.x + 45, SIGN.y + 6],
];
const SOLID_CIRCLES = [
  ...TREES.map((tree) => ({ x: tree.x - 4 * tree.size, y: tree.y - 10 * tree.size, r: 26 * tree.size })),
  { x: GATE.x - 65, y: FRONT, r: 16 }, { x: GATE.x + 65, y: FRONT, r: 16 },
];
type Circle = { x: number; y: number; r: number };
export const propCircles = (props: PlacedProp[]): Circle[] => props.flatMap((prop) => (propNamed(prop.kind)?.solid || []).map((part) => ({ x: prop.x + part.dx * (prop.scale || 1) * (prop.flip ? -1 : 1), y: prop.y - 8, r: part.r * (prop.scale || 1) })));
// Walking into something solid slides you along it instead. extra: the props placed in the garden.
export const gardenCollide = (from: { x: number; y: number }, to: { x: number; y: number }, extra: Circle[] = []) => {
  const isSolid = (x: number, y: number) =>
    SOLID_BOXES.some(([left, top, right, bottom]) => x > left && x < right && y > top && y < bottom)
    || SOLID_CIRCLES.some((circle) => Math.hypot(x - circle.x, y - circle.y) < circle.r)
    || extra.some((circle) => Math.hypot(x - circle.x, y - circle.y) < circle.r);
  if (!isSolid(to.x, to.y) || isSolid(from.x, from.y)) return to;
  if (!isSolid(to.x, from.y)) return { x: to.x, y: from.y };
  if (!isSolid(from.x, to.y)) return { x: from.x, y: to.y };
  return from;
};

type DecorKind = "flower" | "tuft" | "bush" | "rock" | "pebble" | "mushroom" | "clover" | "tall";
type Decor = { kind: DecorKind; x: number; y: number; tint: number; flip: boolean };
// Kept simple on purpose: a couple of dozen things on the grass, so the map is calm and runs smoothly.
const DECOR: Decor[] = (() => {
  const random = seeded(20261114);
  const list: Decor[] = [];
  const kinds: DecorKind[] = ["flower", "flower", "tuft", "tuft", "bush", "rock"];
  for (let tries = 0; list.length < 24 && tries < 4000; tries += 1) {
    const x = 30 + random() * (WORLD.width - 60);
    const y = 60 + random() * (WORLD.height - 90);
    if (blocked(x, y)) continue;
    list.push({ kind: kinds[Math.floor(random() * kinds.length)], x, y, tint: Math.floor(random() * 4), flip: random() < 0.5 });
  }
  return list;
})();

const FLOWER_COLORS = [["#fff", "#ffd23f"], ["#ffd23f", "#e07a12"], ["#ff8fb8", "#fff3a8"], ["#ff7a45", "#ffe066"]];

function DecorSprite({ item }: { item: Decor }) {
  const low = item.kind !== "bush" && item.kind !== "rock" && item.kind !== "tall";
  const style = { left: item.x, top: item.y, zIndex: Math.round(item.y) - (low ? 400 : 0), transform: `translate(-50%, -100%) scaleX(${item.flip ? -1 : 1})` };
  if (item.kind === "flower") {
    const [petal, middle] = FLOWER_COLORS[item.tint];
    return <svg className="garden-decor" style={style} width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><ellipse cx="15" cy="36" rx="7" ry="2" fill="rgba(0,0,0,.13)" /><path d="M15 36 C15 28 14 22 15 16" stroke="#2f8a2c" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M15 28 C9 26 7 22 8 20 C12 21 14 24 15 28Z" fill="#3fa53a" />{[0, 72, 144, 216, 288].map((angle) => <ellipse key={angle} cx="15" cy="8" rx="4.6" ry="6.4" fill={petal} stroke="rgba(0,0,0,.14)" strokeWidth="1" transform={`rotate(${angle} 15 13)`} />)}<circle cx="15" cy="13" r="4" fill={middle} /><circle cx="14" cy="12" r="1.4" fill="#fff" opacity=".7" /></svg>;
  }
  if (item.kind === "tuft") {
    const [dark, light] = [["#2a8a31", "#43b545"], ["#2f9a35", "#4fc04d"], ["#26802c", "#3aa83b"], ["#38a83b", "#5cc95a"]][item.tint];
    return <svg className="garden-decor" style={style} width="34" height="24" viewBox="0 0 34 24" aria-hidden="true"><g strokeWidth="3.4" strokeLinecap="round" fill="none"><path d="M17 23 C14 17 9 14 3 13" stroke={dark} /><path d="M17 23 C20 17 25 15 31 14" stroke={dark} /><path d="M17 23 C16 15 14 9 10 3" stroke={light} /><path d="M17 23 C17 14 19 8 24 2" stroke={light} /></g></svg>;
  }
  if (item.kind === "tall") {
    return <svg className="garden-decor garden-sway" style={{ ...style, animationDelay: `${-item.tint * 0.7}s` }} width="40" height="54" viewBox="0 0 40 54" aria-hidden="true"><ellipse cx="20" cy="52" rx="13" ry="2.5" fill="rgba(0,0,0,.14)" /><g strokeWidth="3.2" strokeLinecap="round" fill="none"><path d="M20 52 C18 38 12 24 4 14" stroke="#2a8a31" /><path d="M20 52 C21 36 24 20 30 4" stroke="#3aa83b" /><path d="M20 52 C20 40 19 28 18 10" stroke="#4fc04d" /><path d="M20 52 C24 42 30 34 37 30" stroke="#2f9a35" /></g><ellipse cx="18" cy="9" rx="2.6" ry="6" fill="#c9b36a" /><ellipse cx="30" cy="4" rx="2.4" ry="5" fill="#d8c27a" /></svg>;
  }
  if (item.kind === "clover") {
    return <svg className="garden-decor" style={style} width="34" height="20" viewBox="0 0 34 20" aria-hidden="true">{[[8, 12], [17, 8], [26, 12], [13, 16], [22, 16]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="4.4" fill={index % 2 ? "#3c9e3e" : "#4cb84a"} />)}{item.tint === 0 && <circle cx="17" cy="6" r="3" fill="#fff" />}</svg>;
  }
  if (item.kind === "bush") {
    return <img src="/assets/garden/berry-bush.svg" alt="" className="garden-decor garden-decor-img" style={{ ...style, width: 92 }} draggable={false} />;
  }
  if (item.kind === "rock") {
    return <img src="/assets/rock-3.svg" alt="" className="garden-decor garden-decor-img" style={{ ...style, width: 64 }} draggable={false} />;
  }
  if (item.kind === "pebble") {
    return <svg className="garden-decor" style={style} width="26" height="14" viewBox="0 0 26 14" aria-hidden="true"><ellipse cx="9" cy="9" rx="7" ry="4.5" fill="#a9a59c" /><ellipse cx="8" cy="7.5" rx="3" ry="1.5" fill="#d6d3cb" /><ellipse cx="20" cy="10" rx="4.5" ry="3" fill="#938f86" /></svg>;
  }
  return <svg className="garden-decor" style={style} width="30" height="32" viewBox="0 0 30 32" aria-hidden="true"><ellipse cx="15" cy="30" rx="10" ry="2.4" fill="rgba(0,0,0,.15)" /><rect x="11" y="14" width="8" height="15" rx="3" fill="#fff3df" /><path d="M2 16 C2 6 28 6 28 16Z" fill="#e5483b" /><path d="M2 16 C10 18 20 18 28 16" stroke="#b8322a" strokeWidth="2" fill="none" /><circle cx="9" cy="12" r="2.2" fill="#fff" /><circle cx="18" cy="9" r="2.6" fill="#fff" /><circle cx="23" cy="14" r="1.8" fill="#fff" /></svg>;
}

// The ground: flat grass with a few soft patches (kept plain so phones don't struggle).
function Ground() {
  const random = seeded(77);
  const patches = Array.from({ length: 10 }, () => ({ x: random() * WORLD.width, y: random() * WORLD.height, rx: 180 + random() * 220, ry: 110 + random() * 130, light: random() < 0.55 }));
  return (
    <svg className="garden-decor" style={{ left: 0, top: 0, zIndex: -1000 }} width={WORLD.width} height={WORLD.height} aria-hidden="true">
      <rect width={WORLD.width} height={WORLD.height} fill="#5cbd40" />
      {patches.map((patch, index) => <ellipse key={index} cx={patch.x} cy={patch.y} rx={patch.rx} ry={patch.ry} fill={patch.light ? "#6cc94d" : "#52b038"} />)}
    </svg>
  );
}

function Path() {
  const points = PATH_POINTS.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const plaza = { x: STAND.x + 10, y: STAND.y + 62 };
  return (
    <svg className="garden-decor" style={{ left: 0, top: 0, zIndex: -900 }} width={WORLD.width} height={WORLD.height} aria-hidden="true">
      <ellipse cx={plaza.x} cy={plaza.y} rx="178" ry="68" fill="#a87545" />
      <polyline points={points} fill="none" stroke="#a87545" strokeWidth="112" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx={plaza.x} cy={plaza.y - 2} rx="170" ry="62" fill="#d4a86e" />
      <polyline points={points} fill="none" stroke="#d4a86e" strokeWidth="100" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Side view, used for the top and bottom fences: pointed pickets on two rails, with a post every few.
function FenceRun({ width }: { width: number }) {
  const pickets = Array.from({ length: Math.floor(width / 30) + 1 }, (_, index) => index * 30);
  return (
    <svg width={width + 24} height="66" viewBox={`-12 0 ${width + 24} 66`} aria-hidden="true">
      <rect x="-8" y="56" width={width + 16} height="9" rx="4" fill="rgba(0,0,0,.16)" />
      <rect x="-6" y="22" width={width + 12} height="10" rx="4" fill="#b8773c" stroke="#3B1F0E" strokeWidth="3" />
      <rect x="-6" y="40" width={width + 12} height="10" rx="4" fill="#b8773c" stroke="#3B1F0E" strokeWidth="3" />
      {pickets.map((x, index) => index % 6 === 0
        ? <g key={x}><rect x={x - 9} y="2" width="18" height="58" rx="5" fill="#d08a4c" stroke="#3B1F0E" strokeWidth="3" /><rect x={x - 11} y="0" width="22" height="8" rx="4" fill="#e3a565" stroke="#3B1F0E" strokeWidth="3" /></g>
        : <g key={x}><path d={`M${x - 8} 58 V14 L${x} 5 L${x + 8} 14 V58Z`} fill="#e7ad6e" stroke="#3B1F0E" strokeWidth="3" strokeLinejoin="round" /><path d={`M${x + 3} 15 V55`} stroke="#c98a4b" strokeWidth="3" /></g>)}
    </svg>
  );
}

function Picket() {
  return <svg className="garden-picket" width="20" height="50" viewBox="0 0 20 50" aria-hidden="true"><ellipse cx="10" cy="47" rx="9" ry="3" fill="rgba(0,0,0,.16)" /><path d="M2 46 V12 L10 3 L18 12 V46Z" fill="#e7ad6e" stroke="#3B1F0E" strokeWidth="3" strokeLinejoin="round" /><path d="M13 13 V43" stroke="#c98a4b" strokeWidth="3" /></svg>;
}

function GatePost({ x, y }: { x: number; y: number }) {
  return (
    <svg className="garden-decor" style={{ left: x, top: y, zIndex: y + 2, transform: "translate(-50%, -100%)" }} width="40" height="96" viewBox="0 0 40 96" aria-hidden="true">
      <ellipse cx="20" cy="92" rx="16" ry="4" fill="rgba(0,0,0,.2)" />
      <rect x="9" y="22" width="22" height="70" rx="5" fill="#c98a4b" stroke="#3B1F0E" strokeWidth="3.5" />
      <rect x="22" y="26" width="5" height="62" rx="2" fill="#a86d34" />
      <circle cx="20" cy="17" r="12" fill="#e7ad6e" stroke="#3B1F0E" strokeWidth="3.5" />
      <circle cx="16" cy="13" r="3.5" fill="#fff3df" opacity=".7" />
      {[[10, 40], [30, 54], [12, 68]].map(([cx, cy]) => <g key={cy}><path d={`M${cx - 7} ${cy + 4} C${cx - 4} ${cy - 6} ${cx + 4} ${cy - 6} ${cx + 7} ${cy + 4}`} fill="#3fa53a" /><circle cx={cx} cy={cy - 3} r="3.6" fill="#ff8fb8" /><circle cx={cx} cy={cy - 3} r="1.4" fill="#fff3a8" /></g>)}
    </svg>
  );
}

function Fence({ isOwner }: { isOwner: boolean }) {
  const sides: { x: number; y: number }[] = [];
  for (let y = GARDEN.y + 40; y < FRONT - 20; y += 34) {
    sides.push({ x: GARDEN.x, y });
    sides.push({ x: GARDEN.x + GARDEN.width, y });
  }
  const leftWidth = GATE.x - GATE.width / 2 - GARDEN.x;
  const rightStart = GATE.x + GATE.width / 2;
  return (
    <>
      <div className="garden-fence-run" style={{ left: GARDEN.x - 12, top: GARDEN.y - 52, zIndex: GARDEN.y }}><FenceRun width={GARDEN.width} /></div>
      <div className="garden-fence-run" style={{ left: GARDEN.x - 12, top: FRONT - 52, zIndex: FRONT }}><FenceRun width={leftWidth} /></div>
      <div className="garden-fence-run" style={{ left: rightStart - 12, top: FRONT - 52, zIndex: FRONT }}><FenceRun width={GARDEN.x + GARDEN.width - rightStart} /></div>
      <div className="garden-fence-rail" style={{ left: GARDEN.x - 5, top: GARDEN.y, height: GARDEN.height }} />
      <div className="garden-fence-rail" style={{ left: GARDEN.x + GARDEN.width - 5, top: GARDEN.y, height: GARDEN.height }} />
      {sides.map((post, index) => <span key={index} className="garden-decor" style={{ left: post.x, top: post.y, zIndex: post.y, transform: "translate(-50%, -100%)" }}><Picket /></span>)}
      <GatePost x={GATE.x - GATE.width / 2} y={FRONT + 8} />
      <GatePost x={GATE.x + GATE.width / 2} y={FRONT + 8} />
      <img src={`/assets/garden/sign-${isOwner ? "yours" : "theirs"}.svg`} alt={isOwner ? "Your Garden" : "Their Garden"} className="garden-sign" style={{ left: SIGN.x, top: SIGN.y, zIndex: SIGN.y }} draggable={false} />
    </>
  );
}

// Trees use the Tree prop art, so the meadow matches what players can place.
function Tree({ x, y, size }: { x: number; y: number; size: number }) {
  return <img src="/assets/garden/tree-prop.svg" alt="" className="garden-decor garden-decor-img" style={{ left: x, top: y, width: 170 * size, zIndex: Math.round(y), transform: "translate(-50%, -100%)" }} draggable={false} />;
}

export const Meadow = memo(function Meadow({ isOwner }: { isOwner: boolean }) {
  return (
    <>
      <Ground />
      <Path />
      <div className="garden-lawn" style={{ left: GARDEN.x, top: GARDEN.y, width: GARDEN.width, height: GARDEN.height }} />
      {ROWS.map((row, index) => <div key={index} className="garden-row" style={{ left: row.x, top: row.y, width: row.width, height: row.height }} />)}
      {DECOR.map((item, index) => <DecorSprite key={index} item={item} />)}
      {TREES.map((tree, index) => <Tree key={index} {...tree} />)}
      <Fence isOwner={isOwner} />
    </>
  );
});

// Nothing drifts over the world any more (butterflies and cloud shadows made it laggy).
export const Ambient = memo(function Ambient() {
  return null;
});

// The raised bed every crop grows in.
export function BedArt() {
  return <img src="/assets/garden/plot.svg" alt="" className="garden-bed-art" draggable={false} />;
}

// Each crop's growth frames: the last one is the ready crop, the others play out while it grows.
const frames = (name: string, count: number) => Array.from({ length: count }, (_, index) => `/assets/garden/${name}-${index + 1}.svg`);
const CROP_FRAMES: Record<SeedName, string[]> = {
  Carrot: frames("carrot", 5),
  Potato: frames("potato", 3),
  Pumpkin: frames("pumpkin", 4),
  Avocado: frames("avocado", 4),
  "Pumpkin Dragon": frames("pumpkin-dragon", 4),
};

// The fully grown picture of a crop (for the basket and your hand).
export const cropImage = (seed: SeedName) => CROP_FRAMES[seed][CROP_FRAMES[seed].length - 1];

// size: once it's grown the crop shows at its size (a bit toned down so giants still fit the bed).
export function CropArt({ seed, progress, size = 1 }: { seed: SeedName; progress: number; size?: number }) {
  const list = CROP_FRAMES[seed];
  const ready = progress >= 1;
  const frame = ready ? list.length - 1 : Math.min(list.length - 2, Math.floor(progress * (list.length - 1)));
  return <img src={list[frame]} alt="" className={`garden-growth${ready ? " is-ready" : ""}`} style={ready ? { scale: String(0.75 + size * 0.3) } : undefined} draggable={false} />;
}

export function SeedStand({ near }: { near: boolean }) {
  return (
    <div className={`garden-stand${near ? " is-near" : ""}`} style={{ left: STAND.x, top: STAND.y, zIndex: STAND.y }}>
      <img src="/assets/garden/seed-shop.svg" alt="Ted's Seed Shop" className="garden-stand-img" draggable={false} />
    </div>
  );
}
