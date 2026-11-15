"use client";

// Everything you see in the Breadlet Garden that isn't game logic: the meadow, the path, the fence,
// the shed, the well, the wheat field, trees, butterflies and every crop's growth stages.
// fields-world.tsx places these and handles walking, planting and harvesting.
import { memo, type CSSProperties } from "react";
import { PLOT_COUNT, type SeedName } from "../../lib/fields";

export const WORLD = { width: 2600, height: 1700 };
export const GARDEN = { x: 1000, y: 520, width: 860, height: 700 };
// The gate is in the middle of the front (bottom) fence, facing you.
export const GATE = { x: 1430, width: 130 };
const FRONT = GARDEN.y + GARDEN.height;
export const PLOTS = Array.from({ length: PLOT_COUNT }, (_, index) => ({ x: 1150 + (index % 3) * 280, y: 680 + Math.floor(index / 3) * 190 }));
export const STAND = { x: 380, y: 1390 };
const SIGN = { x: GATE.x - 190, y: FRONT + 96 };
const TREES = [
  { x: 260, y: 330, size: 1.1, kind: "oak" }, { x: 520, y: 210, size: 0.85, kind: "pine" }, { x: 1430, y: 330, size: 0.9, kind: "apple" },
  { x: 2380, y: 1000, size: 1.15, kind: "oak" }, { x: 2250, y: 1530, size: 0.95, kind: "apple" }, { x: 110, y: 1180, size: 1, kind: "pine" },
  { x: 1700, y: 1600, size: 0.8, kind: "oak" }, { x: 160, y: 760, size: 0.9, kind: "apple" }, { x: 760, y: 1120, size: 0.9, kind: "pine" },
  { x: 1830, y: 250, size: 0.95, kind: "pine" }, { x: 2520, y: 230, size: 0.9, kind: "oak" }, { x: 900, y: 260, size: 0.75, kind: "oak" },
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
const PATH_KEYS: [number, number][] = [[GATE.x, FRONT + 6], [GATE.x - 8, FRONT + 100], [1300, 1395], [1100, 1440], [880, 1425], [680, 1445], [520, 1460], [STAND.x + 20, STAND.y + 60]];
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

// Things you can't walk through: the fence (except the gate), the beds, Ted's stand, the sign,
// the gate posts and tree trunks. Points are where a Breadlet's feet are.
const SOLID_BOXES: [number, number, number, number][] = [
  [GARDEN.x - 24, GARDEN.y - 30, GARDEN.x + GARDEN.width + 24, GARDEN.y + 22],
  [GARDEN.x - 24, FRONT - 30, GATE.x - 50, FRONT + 22],
  [GATE.x + 50, FRONT - 30, GARDEN.x + GARDEN.width + 24, FRONT + 22],
  [GARDEN.x - 24, GARDEN.y - 30, GARDEN.x + 22, FRONT + 22],
  [GARDEN.x + GARDEN.width - 22, GARDEN.y - 30, GARDEN.x + GARDEN.width + 24, FRONT + 22],
  [STAND.x - 125, STAND.y - 80, STAND.x + 125, STAND.y + 8],
  [SIGN.x - 45, SIGN.y - 28, SIGN.x + 45, SIGN.y + 6],
  ...PLOTS.map((plot): [number, number, number, number] => [plot.x - 88, plot.y - 50, plot.x + 88, plot.y + 42]),
];
const SOLID_CIRCLES = [
  ...TREES.map((tree) => ({ x: tree.x, y: tree.y - 14 * tree.size, r: 34 * tree.size })),
  { x: GATE.x - 65, y: FRONT, r: 16 }, { x: GATE.x + 65, y: FRONT, r: 16 },
];
const isSolid = (x: number, y: number) =>
  SOLID_BOXES.some(([left, top, right, bottom]) => x > left && x < right && y > top && y < bottom)
  || SOLID_CIRCLES.some((circle) => Math.hypot(x - circle.x, y - circle.y) < circle.r);
// Walking into something solid slides you along it instead.
export const gardenCollide = (from: { x: number; y: number }, to: { x: number; y: number }) => {
  if (!isSolid(to.x, to.y) || isSolid(from.x, from.y)) return to;
  if (!isSolid(to.x, from.y)) return { x: to.x, y: from.y };
  if (!isSolid(from.x, to.y)) return { x: from.x, y: to.y };
  return from;
};

type DecorKind = "flower" | "tuft" | "bush" | "rock" | "pebble" | "mushroom" | "clover" | "tall";
type Decor = { kind: DecorKind; x: number; y: number; tint: number; flip: boolean };
const DECOR: Decor[] = (() => {
  const random = seeded(20261114);
  const list: Decor[] = [];
  const kinds: DecorKind[] = ["flower", "flower", "flower", "tuft", "tuft", "tuft", "tuft", "tall", "clover", "bush", "rock", "mushroom", "pebble"];
  for (let tries = 0; list.length < 260 && tries < 4000; tries += 1) {
    const x = 30 + random() * (WORLD.width - 60);
    const y = 60 + random() * (WORLD.height - 90);
    if (blocked(x, y)) continue;
    list.push({ kind: kinds[Math.floor(random() * kinds.length)], x, y, tint: Math.floor(random() * 4), flip: random() < 0.5 });
  }
  // Grass and pebbles spilling over both edges of the path, so it doesn't have a hard edge.
  PATH_POINTS.forEach((point, index) => {
    if (index % 3 || index >= PATH_POINTS.length - 6) return;
    const next = PATH_POINTS[index + 1];
    const length = Math.hypot(next.x - point.x, next.y - point.y) || 1;
    const normal = { x: -(next.y - point.y) / length, y: (next.x - point.x) / length };
    [-1, 1].forEach((side) => {
      const reach = 46 + random() * 14;
      const roll = random();
      list.push({ kind: roll < 0.6 ? "tuft" : roll < 0.8 ? "flower" : "pebble", x: point.x + normal.x * reach * side, y: point.y + normal.y * reach * side + 8, tint: Math.floor(random() * 4), flip: random() < 0.5 });
    });
  });
  // Flower borders along the inside of the garden fence.
  for (let x = GARDEN.x + 34; x < GARDEN.x + GARDEN.width - 20; x += 30 + random() * 12) {
    list.push({ kind: random() < 0.75 ? "flower" : "tuft", x, y: GARDEN.y + 44, tint: Math.floor(random() * 4), flip: random() < 0.5 });
    if (Math.abs(x + 8 - GATE.x) > GATE.width / 2 + 20) list.push({ kind: random() < 0.75 ? "flower" : "tuft", x: x + 8, y: FRONT - 8, tint: Math.floor(random() * 4), flip: random() < 0.5 });
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
    return <svg className="garden-decor" style={style} width="96" height="68" viewBox="0 0 96 68" aria-hidden="true"><ellipse cx="50" cy="62" rx="44" ry="7" fill="rgba(0,0,0,.18)" /><circle cx="28" cy="40" r="22" fill="#25782a" /><circle cx="68" cy="40" r="22" fill="#25782a" /><circle cx="48" cy="28" r="25" fill="#329a36" /><circle cx="30" cy="36" r="17" fill="#36a23a" /><circle cx="64" cy="34" r="17" fill="#36a23a" /><circle cx="40" cy="20" r="10" fill="#5cc35a" opacity=".85" /><circle cx="62" cy="26" r="5" fill="#5cc35a" opacity=".6" />{item.tint < 2 && <>{[[30, 36], [58, 22], [68, 44], [44, 44]].map(([cx, cy]) => <g key={cx}><circle cx={cx} cy={cy} r="3.8" fill="#e8413a" /><circle cx={cx - 1} cy={cy - 1.2} r="1.2" fill="#fff" opacity=".8" /></g>)}</>}</svg>;
  }
  if (item.kind === "rock") {
    return <svg className="garden-decor" style={style} width="52" height="36" viewBox="0 0 52 36" aria-hidden="true"><ellipse cx="26" cy="32" rx="23" ry="4" fill="rgba(0,0,0,.18)" /><path d="M4 30 C2 18 12 7 25 7 C39 7 48 17 47 30Z" fill="#8f8b82" /><path d="M7 28 C6 18 14 10 25 10 C36 10 43 18 43 28Z" fill="#a9a59c" /><path d="M12 16 C16 11 22 10 27 11" stroke="#d6d3cb" strokeWidth="4" strokeLinecap="round" fill="none" />{item.tint === 1 && <path d="M30 30 C31 24 36 20 42 21 C43 25 40 30 30 30Z" fill="#4cb84a" />}</svg>;
  }
  if (item.kind === "pebble") {
    return <svg className="garden-decor" style={style} width="26" height="14" viewBox="0 0 26 14" aria-hidden="true"><ellipse cx="9" cy="9" rx="7" ry="4.5" fill="#a9a59c" /><ellipse cx="8" cy="7.5" rx="3" ry="1.5" fill="#d6d3cb" /><ellipse cx="20" cy="10" rx="4.5" ry="3" fill="#938f86" /></svg>;
  }
  return <svg className="garden-decor" style={style} width="30" height="32" viewBox="0 0 30 32" aria-hidden="true"><ellipse cx="15" cy="30" rx="10" ry="2.4" fill="rgba(0,0,0,.15)" /><rect x="11" y="14" width="8" height="15" rx="3" fill="#fff3df" /><path d="M2 16 C2 6 28 6 28 16Z" fill="#e5483b" /><path d="M2 16 C10 18 20 18 28 16" stroke="#b8322a" strokeWidth="2" fill="none" /><circle cx="9" cy="12" r="2.2" fill="#fff" /><circle cx="18" cy="9" r="2.6" fill="#fff" /><circle cx="23" cy="14" r="1.8" fill="#fff" /></svg>;
}

// The ground: a big grass field with soft light and dark patches and blades everywhere.
function Ground() {
  const random = seeded(77);
  const patches = Array.from({ length: 46 }, () => ({ x: random() * WORLD.width, y: random() * WORLD.height, rx: 140 + random() * 260, ry: 90 + random() * 160, light: random() < 0.55 }));
  const blades = (size: number, count: number, salt: number) => {
    const local = seeded(salt);
    return Array.from({ length: count }, (_, index) => {
      const x = local() * size;
      const y = local() * size;
      const lean = (local() - 0.5) * 8;
      return <path key={index} d={`M${x} ${y} q${lean / 2} -5 ${lean} -9`} stroke={["#4aa634", "#6fcf4f", "#3f9a2e", "#7ad85a"][index % 4]} strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".8" />;
    });
  };
  return (
    <svg className="garden-decor" style={{ left: 0, top: 0, zIndex: -1000 }} width={WORLD.width} height={WORLD.height} aria-hidden="true">
      <defs>
        <radialGradient id="garden-patch-light"><stop offset="0" stopColor="#8ddc62" stopOpacity=".55" /><stop offset="1" stopColor="#8ddc62" stopOpacity="0" /></radialGradient>
        <radialGradient id="garden-patch-dark"><stop offset="0" stopColor="#3a952f" stopOpacity=".42" /><stop offset="1" stopColor="#3a952f" stopOpacity="0" /></radialGradient>
        <pattern id="garden-blades-a" width="96" height="96" patternUnits="userSpaceOnUse">{blades(96, 16, 5)}</pattern>
        <pattern id="garden-blades-b" width="151" height="151" patternUnits="userSpaceOnUse">{blades(151, 18, 9)}</pattern>
      </defs>
      <rect width={WORLD.width} height={WORLD.height} fill="#5cbd40" />
      {patches.map((patch, index) => <ellipse key={index} cx={patch.x} cy={patch.y} rx={patch.rx} ry={patch.ry} fill={`url(#garden-patch-${patch.light ? "light" : "dark"})`} />)}
      <rect width={WORLD.width} height={WORLD.height} fill="url(#garden-blades-a)" />
      <rect width={WORLD.width} height={WORLD.height} fill="url(#garden-blades-b)" />
    </svg>
  );
}

function Path() {
  const points = PATH_POINTS.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const random = seeded(31);
  const stones = PATH_POINTS.filter((_, index) => index % 2 === 0).map((point) => ({ x: point.x + (random() - 0.5) * 60, y: point.y + (random() - 0.5) * 50, r: 3 + random() * 4, light: random() < 0.5 }));
  const plaza = { x: STAND.x + 10, y: STAND.y + 62 };
  return (
    <svg className="garden-decor" style={{ left: 0, top: 0, zIndex: -900 }} width={WORLD.width} height={WORLD.height} aria-hidden="true">
      <ellipse cx={plaza.x} cy={plaza.y} rx="190" ry="78" fill="#3f8f2f" opacity=".3" />
      <polyline points={points} fill="none" stroke="#3f8f2f" strokeWidth="128" strokeLinecap="round" strokeLinejoin="round" opacity=".3" />
      <ellipse cx={plaza.x} cy={plaza.y} rx="178" ry="68" fill="#a87545" />
      <polyline points={points} fill="none" stroke="#a87545" strokeWidth="112" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx={plaza.x} cy={plaza.y - 2} rx="170" ry="62" fill="#d4a86e" />
      <polyline points={points} fill="none" stroke="#d4a86e" strokeWidth="100" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke="#e3bf8a" strokeWidth="58" strokeLinecap="round" strokeLinejoin="round" opacity=".75" />
      <ellipse cx={plaza.x} cy={plaza.y - 4} rx="120" ry="38" fill="#e3bf8a" opacity=".75" />
      <polyline points={points} fill="none" stroke="#c49460" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 26" opacity=".7" />
      {stones.map((stone, index) => <g key={index}><ellipse cx={stone.x} cy={stone.y + 1.5} rx={stone.r + 1} ry={stone.r * 0.7 + 1} fill="#8f6a40" opacity=".5" /><ellipse cx={stone.x} cy={stone.y} rx={stone.r} ry={stone.r * 0.7} fill={stone.light ? "#cfc3a8" : "#ab9f88"} /></g>)}
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

function Tree({ x, y, size, kind, index }: { x: number; y: number; size: number; kind: "oak" | "pine" | "apple"; index: number }) {
  const style: CSSProperties = { left: x, top: y, zIndex: Math.round(y), transform: `translate(-50%, -100%) scale(${size})`, transformOrigin: "50% 100%" };
  const sway = { animationDelay: `${-index * 0.9}s`, animationDuration: `${5 + (index % 3)}s` };
  if (kind === "pine") {
    return (
      <svg className="garden-decor" style={style} width="200" height="280" viewBox="0 0 200 280" aria-hidden="true">
        <ellipse cx="104" cy="268" rx="70" ry="12" fill="rgba(0,0,0,.22)" />
        <rect x="90" y="210" width="20" height="60" rx="5" fill="#7a4a22" stroke="#4a2a12" strokeWidth="4" />
        <g className="garden-sway" style={sway}>
          {/* Four stacked tiers, bottom first, so each one tucks under the tier above it. */}
          {[[118, 226, 88], [78, 178, 72], [42, 132, 56], [10, 88, 40]].map(([top, bottom, half], layer) => (
            <g key={layer}>
              <path d={`M100 ${top} L${100 + half} ${bottom} Q100 ${bottom + 14} ${100 - half} ${bottom}Z`} fill="#226f2e" stroke="#164d1f" strokeWidth="4" strokeLinejoin="round" />
              <path d={`M100 ${top + 8} L${100 - half + 12} ${bottom - 2} Q${100 - half / 2} ${bottom + 6} 100 ${bottom + 7}Z`} fill="#2f8f3b" />
              <path d={`M${100 - half + 16} ${bottom - 1} Q100 ${bottom + 10} ${100 + half - 16} ${bottom - 1}`} stroke="#164d1f" strokeWidth="3" fill="none" opacity=".35" />
            </g>
          ))}
        </g>
      </svg>
    );
  }
  return (
    <svg className="garden-decor" style={style} width="220" height="264" viewBox="0 0 220 264" aria-hidden="true">
      <ellipse cx="116" cy="250" rx="86" ry="13" fill="rgba(0,0,0,.22)" />
      <path d="M94 252 C98 214 96 184 90 162 L130 162 C124 184 122 214 126 252Z" fill="#8a5a2b" stroke="#4a2a12" strokeWidth="4" />
      <path d="M94 252 C90 244 82 244 76 248 M126 252 C130 244 138 244 144 248" stroke="#4a2a12" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M110 214 C112 196 110 182 104 170" stroke="#5e3a17" strokeWidth="3" fill="none" />
      <g className="garden-sway" style={sway}>
        <circle cx="60" cy="126" r="52" fill="#1f6b2b" /><circle cx="160" cy="126" r="52" fill="#1f6b2b" /><circle cx="110" cy="150" r="46" fill="#1f6b2b" />
        <circle cx="110" cy="82" r="68" fill="#2e8a39" /><circle cx="66" cy="100" r="44" fill="#2e8a39" /><circle cx="154" cy="102" r="44" fill="#2e8a39" />
        <circle cx="96" cy="66" r="44" fill="#3aa23f" /><circle cx="140" cy="80" r="30" fill="#3aa23f" />
        <circle cx="84" cy="50" r="20" fill="#5cc35a" opacity=".85" /><circle cx="140" cy="66" r="12" fill="#5cc35a" opacity=".7" /><circle cx="56" cy="96" r="10" fill="#5cc35a" opacity=".55" />
        {kind === "apple" && [[70, 120], [140, 106], [112, 140], [160, 140], [92, 92], [50, 140]].map(([cx, cy]) => <g key={cx}><circle cx={cx} cy={cy} r="8" fill="#e5483b" stroke="#8f1f17" strokeWidth="2" /><circle cx={cx - 2.5} cy={cy - 2.5} r="2.4" fill="#fff" opacity=".75" /><path d={`M${cx} ${cy - 8} l2 -5`} stroke="#5e3a17" strokeWidth="2" strokeLinecap="round" /></g>)}
      </g>
    </svg>
  );
}

export const Meadow = memo(function Meadow({ isOwner }: { isOwner: boolean }) {
  return (
    <>
      <Ground />
      <Path />
      <div className="garden-lawn" style={{ left: GARDEN.x, top: GARDEN.y, width: GARDEN.width, height: GARDEN.height }} />
      {PLOTS.map((plot, index) => <div key={index} className="garden-pad" style={{ left: plot.x, top: plot.y }} />)}
      {DECOR.map((item, index) => <DecorSprite key={index} item={item} />)}
      {TREES.map((tree, index) => <Tree key={index} index={index} {...tree} />)}
      <Fence isOwner={isOwner} />
    </>
  );
});

// Things drifting over the world: cloud shadows and butterflies.
const BUTTERFLIES = [
  { x: 640, y: 520, color: "#ffb347", reach: 150, time: 9 }, { x: 1300, y: 420, color: "#fff3df", reach: 220, time: 12 },
  { x: 1980, y: 900, color: "#ff8fb8", reach: 120, time: 8 }, { x: 420, y: 1000, color: "#ffd23f", reach: 180, time: 11 },
  { x: 1500, y: 1380, color: "#ff7a45", reach: 160, time: 10 }, { x: 2200, y: 260, color: "#fff3df", reach: 140, time: 9.5 },
  { x: 900, y: 1380, color: "#ffd23f", reach: 130, time: 7.5 },
];
export const Ambient = memo(function Ambient() {
  return (
    <>
      {BUTTERFLIES.map((fly, index) => (
        <div key={index} className="garden-fly" style={{ left: fly.x, top: fly.y, "--reach": `${fly.reach}px`, animationDuration: `${fly.time}s`, animationDelay: `${-index * 1.7}s` } as CSSProperties}>
          <div className="garden-fly-bob" style={{ animationDelay: `${-index * 0.5}s` }}>
            <svg width="30" height="24" viewBox="0 0 30 24" aria-hidden="true">
              <g className="garden-wing garden-wing-left"><path d="M14 12 C8 0 0 2 2 10 C0 16 8 20 14 13Z" fill={fly.color} stroke="#3B1F0E" strokeWidth="1.6" /></g>
              <g className="garden-wing garden-wing-right"><path d="M16 12 C22 0 30 2 28 10 C30 16 22 20 16 13Z" fill={fly.color} stroke="#3B1F0E" strokeWidth="1.6" /></g>
              <rect x="13.6" y="6" width="2.8" height="13" rx="1.4" fill="#3B1F0E" />
            </svg>
          </div>
        </div>
      ))}
      {[220, 900, 1380].map((top, index) => <div key={top} className="garden-cloud" style={{ top, animationDelay: `${-index * 47}s`, animationDuration: `${120 + index * 25}s` }} />)}
    </>
  );
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

export function CropArt({ seed, progress }: { seed: SeedName; progress: number }) {
  const list = CROP_FRAMES[seed];
  const ready = progress >= 1;
  const frame = ready ? list.length - 1 : Math.min(list.length - 2, Math.floor(progress * (list.length - 1)));
  return <img src={list[frame]} alt="" className={`garden-growth${ready ? " is-ready" : ""}`} draggable={false} />;
}

export function SeedStand({ near }: { near: boolean }) {
  return (
    <div className={`garden-stand${near ? " is-near" : ""}`} style={{ left: STAND.x, top: STAND.y, zIndex: STAND.y }}>
      <img src="/assets/garden/seed-shop.svg" alt="Ted's Seed Shop" className="garden-stand-img" draggable={false} />
    </div>
  );
}
