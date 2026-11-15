"use client";

// Everything you see in the Breadlet Garden that isn't game logic: the meadow, the path, the fence,
// the shed, the well, the wheat field, trees, butterflies and every crop's growth stages.
// fields-world.tsx places these and handles walking, planting and harvesting.
import { memo, type CSSProperties } from "react";
import { PLOT_COUNT, type SeedName } from "../../lib/fields";

export const WORLD = { width: 2600, height: 1700 };
export const GARDEN = { x: 1000, y: 520, width: 860, height: 700 };
export const GATE = { y: 820, height: 110 };
export const PLOTS = Array.from({ length: PLOT_COUNT }, (_, index) => ({ x: 1150 + (index % 3) * 280, y: 680 + Math.floor(index / 3) * 190 }));
export const STAND = { x: 380, y: 1390 };
const WHEAT = { x: 2060, y: 360, width: 400, height: 380 };
const SHED = { x: 2080, y: 1215 };
const WELL = { x: 1640, y: 1470 };
const SIGNPOST = { x: 812, y: 1080 };
const SCARECROW = { x: 2265, y: 610 };
const TREES = [
  { x: 260, y: 330, size: 1.1, kind: "oak" }, { x: 520, y: 210, size: 0.85, kind: "pine" }, { x: 1430, y: 330, size: 0.9, kind: "apple" },
  { x: 2380, y: 1000, size: 1.15, kind: "oak" }, { x: 2250, y: 1530, size: 0.95, kind: "apple" }, { x: 110, y: 1180, size: 1, kind: "pine" },
  { x: 1250, y: 1580, size: 0.8, kind: "oak" }, { x: 160, y: 760, size: 0.9, kind: "apple" }, { x: 780, y: 1580, size: 0.9, kind: "pine" },
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
const PATH_KEYS: [number, number][] = [[1012, 875], [880, 884], [760, 940], [672, 1040], [612, 1165], [578, 1290], [520, 1395], [STAND.x + 20, STAND.y + 60]];
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
  || (x > WHEAT.x - 40 && x < WHEAT.x + WHEAT.width + 40 && y > WHEAT.y - 60 && y < WHEAT.y + WHEAT.height + 40)
  || (Math.abs(x - SHED.x) < 170 && y > SHED.y - 240 && y < SHED.y + 50)
  || (Math.abs(x - WELL.x) < 110 && y > WELL.y - 170 && y < WELL.y + 40)
  || (Math.abs(x - SIGNPOST.x) < 90 && y > SIGNPOST.y - 140 && y < SIGNPOST.y + 30)
  || TREES.some((tree) => Math.hypot(x - tree.x, y - tree.y + 60) < 125 * tree.size);

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
    list.push({ kind: random() < 0.75 ? "flower" : "tuft", x: x + 8, y: GARDEN.y + GARDEN.height - 8, tint: Math.floor(random() * 4), flip: random() < 0.5 });
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

function Fence({ ownerName }: { ownerName: string }) {
  const sides: { x: number; y: number }[] = [];
  for (let y = GARDEN.y + 40; y < GARDEN.y + GARDEN.height - 20; y += 34) {
    if (y < GATE.y - 14 || y > GATE.y + GATE.height + 14) sides.push({ x: GARDEN.x, y });
    sides.push({ x: GARDEN.x + GARDEN.width, y });
  }
  return (
    <>
      <div className="garden-fence-run" style={{ left: GARDEN.x - 12, top: GARDEN.y - 52, zIndex: GARDEN.y }}><FenceRun width={GARDEN.width} /></div>
      <div className="garden-fence-run" style={{ left: GARDEN.x - 12, top: GARDEN.y + GARDEN.height - 52, zIndex: GARDEN.y + GARDEN.height }}><FenceRun width={GARDEN.width} /></div>
      <div className="garden-fence-rail" style={{ left: GARDEN.x - 5, top: GARDEN.y, height: GATE.y - GARDEN.y - 20 }} />
      <div className="garden-fence-rail" style={{ left: GARDEN.x - 5, top: GATE.y + GATE.height + 10, height: GARDEN.y + GARDEN.height - GATE.y - GATE.height - 10 }} />
      <div className="garden-fence-rail" style={{ left: GARDEN.x + GARDEN.width - 5, top: GARDEN.y, height: GARDEN.height }} />
      {sides.map((post, index) => <span key={index} className="garden-decor" style={{ left: post.x, top: post.y, zIndex: post.y, transform: "translate(-50%, -100%)" }}><Picket /></span>)}
      <GatePost x={GARDEN.x} y={GATE.y - 4} />
      <GatePost x={GARDEN.x} y={GATE.y + GATE.height + 14} />
      <span className="garden-gate-sign" style={{ left: GARDEN.x - 8, top: GATE.y - 70, zIndex: GATE.y + 4 }}>{ownerName}&apos;s Garden</span>
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
          {[[0, 230, 86], [36, 196, 70], [72, 160, 54], [106, 126, 38]].map(([top, bottom, half], layer) => (
            <g key={layer}>
              <path d={`M100 ${top + 10} L${100 + half} ${bottom} Q100 ${bottom + 16} ${100 - half} ${bottom}Z`} fill="#1f6b2b" stroke="#164d1f" strokeWidth="4" strokeLinejoin="round" />
              <path d={`M100 ${top + 16} L${100 - half + 14} ${bottom - 6} Q${100 - half / 2} ${bottom + 2} 100 ${bottom - 4}Z`} fill="#2e8a39" />
            </g>
          ))}
          <path d="M100 14 L112 40 L88 40Z" fill="#3fa54a" />
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

function Wheat() {
  const rows = 6;
  const perRow = 13;
  const random = seeded(4242);
  return (
    <svg className="garden-decor" style={{ left: WHEAT.x - 20, top: WHEAT.y - 40, zIndex: WHEAT.y + WHEAT.height - 400 }} width={WHEAT.width + 40} height={WHEAT.height + 70} aria-hidden="true">
      <rect x="10" y="40" width={WHEAT.width + 20} height={WHEAT.height + 18} rx="34" fill="#7a4a22" />
      <rect x="18" y="44" width={WHEAT.width + 4} height={WHEAT.height + 4} rx="28" fill="#9b6634" />
      {Array.from({ length: rows }, (_, row) => {
        const baseY = 92 + row * ((WHEAT.height - 40) / (rows - 1));
        return (
          <g key={row}>
            <rect x="34" y={baseY - 6} width={WHEAT.width - 28} height="14" rx="7" fill="#6e4220" />
            <g className="garden-sway" style={{ animationDelay: `${-row * 0.6}s`, animationDuration: "3.2s" }}>
              {Array.from({ length: perRow }, (_, index) => {
                const x = 44 + index * ((WHEAT.width - 48) / (perRow - 1)) + (random() - 0.5) * 8;
                const height = 52 + random() * 16;
                const lean = (random() - 0.5) * 10;
                return (
                  <g key={index}>
                    <path d={`M${x} ${baseY} q${lean / 2} ${-height / 2} ${lean} ${-height}`} stroke="#b88a2a" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <path d={`M${x} ${baseY - 18} q-9 -4 -12 -14 M${x + lean / 3} ${baseY - 28} q9 -4 12 -14`} stroke="#c99a32" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                    {[0, 1, 2, 3].map((grain) => <ellipse key={grain} cx={x + lean + (grain % 2 ? 3.2 : -3.2)} cy={baseY - height + grain * 6} rx="3.6" ry="5.4" fill={grain % 2 ? "#f2c14e" : "#e3ad35"} stroke="#a77a1c" strokeWidth="1.2" />)}
                  </g>
                );
              })}
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function Scarecrow() {
  return (
    <svg className="garden-decor garden-sway-slow" style={{ left: SCARECROW.x, top: SCARECROW.y, zIndex: SCARECROW.y, transform: "translate(-50%, -100%)" }} width="130" height="176" viewBox="0 0 130 176" aria-hidden="true">
      <ellipse cx="65" cy="172" rx="30" ry="5" fill="rgba(0,0,0,.2)" />
      <rect x="60" y="60" width="10" height="112" rx="3" fill="#8a5a2b" stroke="#4a2a12" strokeWidth="3" />
      <rect x="10" y="74" width="110" height="10" rx="4" fill="#8a5a2b" stroke="#4a2a12" strokeWidth="3" />
      <path d="M14 79 l-10 -6 M14 79 l-11 3 M14 79 l-8 9 M116 79 l10 -6 M116 79 l11 3 M116 79 l8 9" stroke="#e9c06a" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M34 70 H96 L102 126 H28Z" fill="#ED7117" stroke="#3B1F0E" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M46 70 V126 M65 70 V126 M84 70 V126 M31 92 H99 M30 110 H100" stroke="#b8520c" strokeWidth="3" />
      <rect x="54" y="88" width="20" height="16" rx="3" fill="#ffcb73" stroke="#3B1F0E" strokeWidth="2.5" />
      <path d="M34 126 l-6 10 M46 126 l-2 12 M84 126 l2 12 M96 126 l6 10" stroke="#e9c06a" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="65" cy="48" r="23" fill="#e9c98a" stroke="#3B1F0E" strokeWidth="3.5" />
      <circle cx="56" cy="45" r="3.4" fill="#3B1F0E" /><circle cx="74" cy="45" r="3.4" fill="#3B1F0E" />
      <path d="M53 56 Q65 64 77 56" stroke="#3B1F0E" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M57 58 l-1 4 M65 60 v4 M73 58 l1 4" stroke="#3B1F0E" strokeWidth="2" />
      <path d="M30 32 Q65 22 100 32 L92 36 Q65 30 38 36Z" fill="#c9922f" stroke="#3B1F0E" strokeWidth="3" strokeLinejoin="round" />
      <path d="M46 31 Q48 6 65 6 Q82 6 84 31Z" fill="#e0a83a" stroke="#3B1F0E" strokeWidth="3" strokeLinejoin="round" />
      <rect x="47" y="23" width="36" height="7" fill="#ED7117" />
    </svg>
  );
}

function Shed() {
  return (
    <svg className="garden-decor" style={{ left: SHED.x, top: SHED.y, zIndex: SHED.y, transform: "translate(-50%, -100%)" }} width="260" height="240" viewBox="0 0 260 240" aria-hidden="true">
      <ellipse cx="134" cy="230" rx="122" ry="12" fill="rgba(0,0,0,.22)" />
      <rect x="34" y="100" width="192" height="128" rx="6" fill="#c98a4b" stroke="#3B1F0E" strokeWidth="5" />
      {[66, 98, 162, 194].map((x) => <path key={x} d={`M${x} 104 V224`} stroke="#a86d34" strokeWidth="3" />)}
      <rect x="104" y="140" width="56" height="88" rx="5" fill="#8a5a2b" stroke="#3B1F0E" strokeWidth="5" />
      <path d="M108 144 L156 224 M156 144 L108 224" stroke="#6e4220" strokeWidth="5" />
      <circle cx="148" cy="188" r="4" fill="#ffcb73" stroke="#3B1F0E" strokeWidth="2" />
      <rect x="176" y="126" width="38" height="34" rx="4" fill="#fff3df" stroke="#3B1F0E" strokeWidth="4" />
      <path d="M195 128 V158 M178 143 H212" stroke="#3B1F0E" strokeWidth="3" />
      <rect x="172" y="160" width="46" height="12" rx="3" fill="#8a5a2b" stroke="#3B1F0E" strokeWidth="3" />
      {[180, 192, 204, 214].map((x, index) => <circle key={x} cx={x} cy="157" r="5" fill={["#e5483b", "#ffd23f", "#ff8fb8", "#ffd23f"][index]} stroke="#3B1F0E" strokeWidth="1.5" />)}
      <path d="M50 120 L46 222 M42 118 L58 124" stroke="#6e4220" strokeWidth="5" strokeLinecap="round" />
      <path d="M72 124 L76 222" stroke="#6e4220" strokeWidth="5" strokeLinecap="round" />
      <path d="M68 120 Q76 108 84 120 L80 132 L72 132Z" fill="#a9a59c" stroke="#3B1F0E" strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 108 L130 22 L246 108 L232 116 L130 40 L28 116Z" fill="#ED7117" stroke="#3B1F0E" strokeWidth="5" strokeLinejoin="round" />
      <path d="M40 98 L130 32 L220 98" stroke="#c95a0d" strokeWidth="18" fill="none" strokeLinejoin="round" />
      <path d="M58 86 L130 34 L202 86 M78 72 L130 36 L182 72" stroke="#ff9a4a" strokeWidth="3" fill="none" strokeDasharray="10 8" />
      <circle cx="130" cy="74" r="13" fill="#fff3df" stroke="#3B1F0E" strokeWidth="4" />
      <path d="M130 64 V84 M120 74 H140" stroke="#3B1F0E" strokeWidth="3" />
      <rect x="18" y="214" width="34" height="20" rx="5" fill="#b8773c" stroke="#3B1F0E" strokeWidth="3" />
      <path d="M22 214 C22 200 30 196 34 206 C38 194 48 198 48 214" fill="#3fa53a" />
    </svg>
  );
}

function Well() {
  return (
    <svg className="garden-decor" style={{ left: WELL.x, top: WELL.y, zIndex: WELL.y, transform: "translate(-50%, -100%)" }} width="170" height="184" viewBox="0 0 170 184" aria-hidden="true">
      <ellipse cx="88" cy="176" rx="74" ry="9" fill="rgba(0,0,0,.22)" />
      <rect x="22" y="40" width="12" height="104" rx="4" fill="#8a5a2b" stroke="#3B1F0E" strokeWidth="3.5" />
      <rect x="136" y="40" width="12" height="104" rx="4" fill="#8a5a2b" stroke="#3B1F0E" strokeWidth="3.5" />
      <rect x="26" y="66" width="118" height="8" rx="4" fill="#6e4220" stroke="#3B1F0E" strokeWidth="3" />
      <path d="M85 74 V104" stroke="#e9c98a" strokeWidth="3" />
      <path d="M74 104 H96 L93 124 H77Z" fill="#a9a59c" stroke="#3B1F0E" strokeWidth="3" strokeLinejoin="round" />
      <path d="M10 46 L85 8 L160 46 L150 52 L85 20 L20 52Z" fill="#ED7117" stroke="#3B1F0E" strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M26 42 L85 12 L144 42" stroke="#c95a0d" strokeWidth="9" fill="none" strokeLinejoin="round" />
      <path d="M18 128 H152 V164 Q85 180 18 164Z" fill="#9e9a91" stroke="#3B1F0E" strokeWidth="4" strokeLinejoin="round" />
      {[[34, 140], [62, 136], [92, 140], [122, 136], [146, 142], [44, 156], [76, 158], [108, 158], [136, 156]].map(([cx, cy]) => <rect key={`${cx}-${cy}`} x={cx - 12} y={cy - 6} width="24" height="12" rx="5" fill="#b9b5ac" stroke="#7c786f" strokeWidth="2" />)}
      <ellipse cx="85" cy="128" rx="67" ry="14" fill="#b9b5ac" stroke="#3B1F0E" strokeWidth="4" />
      <ellipse cx="85" cy="129" rx="52" ry="8" fill="#2f3a2a" />
      <path d="M58 129 Q70 125 82 129" stroke="#6b8a4a" strokeWidth="2" fill="none" opacity=".7" />
    </svg>
  );
}

function Signpost() {
  return (
    <svg className="garden-decor" style={{ left: SIGNPOST.x, top: SIGNPOST.y, zIndex: SIGNPOST.y, transform: "translate(-50%, -100%)" }} width="180" height="150" viewBox="0 0 180 150" aria-hidden="true">
      <ellipse cx="92" cy="145" rx="30" ry="5" fill="rgba(0,0,0,.2)" />
      <rect x="84" y="24" width="14" height="122" rx="4" fill="#8a5a2b" stroke="#3B1F0E" strokeWidth="3.5" />
      <path d="M100 22 H160 L174 38 L160 54 H100Z" fill="#d08a4c" stroke="#3B1F0E" strokeWidth="4" strokeLinejoin="round" transform="rotate(-8 100 38)" />
      <text x="134" y="44" textAnchor="middle" fontFamily="DynaPuff, ui-rounded, system-ui, sans-serif" fontWeight="900" fontSize="15" fill="#fff3df" transform="rotate(-8 100 38)">Garden</text>
      <path d="M82 66 H20 L6 82 L20 98 H82Z" fill="#d08a4c" stroke="#3B1F0E" strokeWidth="4" strokeLinejoin="round" transform="rotate(10 82 82)" />
      <text x="46" y="88" textAnchor="middle" fontFamily="DynaPuff, ui-rounded, system-ui, sans-serif" fontWeight="900" fontSize="15" fill="#fff3df" transform="rotate(10 82 82)">Seeds</text>
      <path d="M78 146 C80 136 88 134 92 140 C96 132 106 136 106 146" fill="#3fa53a" />
    </svg>
  );
}

// The big static meadow: drawn once, it never re-renders while walking.
export const Meadow = memo(function Meadow({ ownerName }: { ownerName: string }) {
  return (
    <>
      <Ground />
      <Path />
      <div className="garden-lawn" style={{ left: GARDEN.x, top: GARDEN.y, width: GARDEN.width, height: GARDEN.height }} />
      {PLOTS.map((plot, index) => <div key={index} className="garden-pad" style={{ left: plot.x, top: plot.y }} />)}
      <Wheat />
      <Scarecrow />
      <Shed />
      <Well />
      <Signpost />
      {DECOR.map((item, index) => <DecorSprite key={index} item={item} />)}
      {TREES.map((tree, index) => <Tree key={index} index={index} {...tree} />)}
      <Fence ownerName={ownerName} />
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

// A raised wooden bed: plank frame with corner posts, dark soil and three mounded rows.
export function BedArt() {
  return (
    <svg className="garden-bed-art" viewBox="0 0 200 140" preserveAspectRatio="none" aria-hidden="true">
      <rect x="3" y="9" width="194" height="130" rx="16" fill="#4a2a12" />
      <rect x="3" y="3" width="194" height="128" rx="16" fill="#b0763c" stroke="#3B1F0E" strokeWidth="5" />
      <path d="M20 11 H180 M20 123 H180 M11 22 V110 M189 22 V110" stroke="#8f5a2a" strokeWidth="2.5" strokeDasharray="22 10" />
      <rect x="18" y="18" width="164" height="100" rx="8" fill="#4a2a12" />
      <rect x="18" y="18" width="164" height="10" rx="5" fill="#341c0b" />
      {[42, 68, 94].map((y) => (
        <g key={y}>
          <rect x="24" y={y - 9} width="152" height="20" rx="10" fill="#6e4220" />
          <rect x="28" y={y - 8} width="144" height="6" rx="3" fill="#86532a" />
          <rect x="24" y={y + 9} width="152" height="4" rx="2" fill="#3a200c" opacity=".55" />
        </g>
      ))}
      {[[34, 56], [150, 82], [96, 108], [60, 82], [128, 56]].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={index % 2 ? 2.5 : 3.4} fill={index % 2 ? "#a99c86" : "#3a200c"} />)}
      {[[3, 3], [173, 3], [3, 107], [173, 107]].map(([x, y], index) => (
        <g key={index}><rect x={x} y={y} width="24" height="24" rx="6" fill="#d08a4c" stroke="#3B1F0E" strokeWidth="4" /><circle cx={x + 12} cy={y + 12} r="2.6" fill="#3B1F0E" /></g>
      ))}
    </svg>
  );
}

// Crop growth art, stages 0-3 while growing and 4 when ready. Carrots use the drawn assets.
const CARROT_STAGES = [1, 2, 3, 4, 5].map((stage) => `/assets/garden/carrot-${stage}.svg`);

const leaf = (x: number, y: number, length: number, angle: number, width: number, fill: string, key?: string | number) => (
  <g key={key} transform={`translate(${x} ${y}) rotate(${angle})`}>
    <path d={`M0 0 C${length * 0.3} ${-width} ${length * 0.7} ${-width} ${length} 0 C${length * 0.7} ${width} ${length * 0.3} ${width} 0 0Z`} fill={fill} stroke="#1f5e22" strokeWidth="1.8" strokeLinejoin="round" />
    <path d={`M2 0 H${length * 0.8}`} stroke="#1f5e22" strokeWidth="1.2" opacity=".55" />
  </g>
);
const Mound = () => <><ellipse cx="64" cy="104" rx="32" ry="9" fill="#3a200c" opacity=".55" /><ellipse cx="64" cy="100" rx="26" ry="7" fill="#7a4a22" /><ellipse cx="60" cy="98" rx="12" ry="2.5" fill="#94602f" /></>;
const Stem = ({ top, bend = 0, width = 4 }: { top: number; bend?: number; width?: number }) => <path d={`M64 100 Q${64 + bend} ${(100 + top) / 2} ${64 + bend / 2} ${top}`} stroke="#2a7f2a" strokeWidth={width} fill="none" strokeLinecap="round" />;

function Potato({ stage }: { stage: number }) {
  const bush = (top: number, spread: number, count: number) => Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1);
    const angle = -165 + t * 150;
    const y = 96 - (index % 3) * ((96 - top) / 3) - 6;
    return leaf(64, y, spread * (0.7 + (index % 2) * 0.3), angle, spread * 0.36, index % 2 ? "#3fae3c" : "#58c652", index);
  });
  return (
    <>
      <Mound />
      {stage === 0 && <><ellipse cx="64" cy="97" rx="11" ry="7" fill="#c8955a" stroke="#7a4f22" strokeWidth="2" /><circle cx="60" cy="96" r="1.4" fill="#7a4f22" /><circle cx="67" cy="98" r="1.2" fill="#7a4f22" /></>}
      {stage === 1 && <><Stem top={80} />{leaf(64, 84, 18, -150, 7, "#58c652")}{leaf(64, 82, 18, -30, 7, "#4cbb47")}</>}
      {stage >= 2 && <><Stem top={stage === 2 ? 64 : 46} bend={-4} /><Stem top={stage === 2 ? 70 : 54} bend={10} width={3.5} />{bush(stage === 2 ? 62 : 44, stage === 2 ? 26 : 34, stage === 2 ? 7 : 11)}</>}
      {stage === 3 && [[50, 50], [78, 44], [64, 38], [88, 58]].map(([cx, cy]) => <g key={cx}>{[0, 72, 144, 216, 288].map((angle) => <ellipse key={angle} cx={cx} cy={cy - 4} rx="2.6" ry="4" fill="#fff" stroke="#c9b6e6" strokeWidth="0.8" transform={`rotate(${angle} ${cx} ${cy})`} />)}<circle cx={cx} cy={cy} r="2.4" fill="#ffd23f" /></g>)}
      {stage === 4 && <>
        <Stem top={50} bend={-4} /><Stem top={58} bend={10} width={3.5} />{bush(48, 32, 10)}
        {[[42, 104, -10], [64, 108, 4], [88, 103, 14]].map(([cx, cy, tilt]) => <g key={cx} transform={`rotate(${tilt} ${cx} ${cy})`}><ellipse cx={cx} cy={cy} rx="15" ry="11" fill="#d29d5f" stroke="#7a4f22" strokeWidth="2.5" /><ellipse cx={cx - 4} cy={cy - 4} rx="6" ry="3" fill="#e9c08a" /><circle cx={cx + 5} cy={cy + 2} r="1.6" fill="#7a4f22" /><circle cx={cx - 6} cy={cy + 4} r="1.4" fill="#7a4f22" /></g>)}
      </>}
    </>
  );
}

const lobedLeaf = (x: number, y: number, size: number, key: string | number) => (
  <g key={key}>
    {[[-0.55, 0.1], [0.55, 0.1], [0, -0.45], [-0.3, 0.45], [0.3, 0.45]].map(([dx, dy], index) => <circle key={index} cx={x + dx * size} cy={y + dy * size} r={size * 0.62} fill="#3a9c3a" stroke="#1f5e22" strokeWidth="1.8" />)}
    <circle cx={x} cy={y} r={size * 0.7} fill="#4cb84a" />
    <path d={`M${x} ${y + size * 0.5} L${x} ${y - size * 0.5} M${x} ${y} L${x - size * 0.5} ${y - size * 0.25} M${x} ${y} L${x + size * 0.5} ${y - size * 0.25}`} stroke="#2a7f2a" strokeWidth="1.6" strokeLinecap="round" />
  </g>
);

function Pumpkin({ stage }: { stage: number }) {
  const vine = <path d="M30 100 C44 90 54 102 64 96 C76 90 84 100 98 94 C104 92 108 86 104 82 C100 80 98 86 102 88" stroke="#2a7f2a" strokeWidth="3.5" fill="none" strokeLinecap="round" />;
  return (
    <>
      <Mound />
      {stage === 0 && <ellipse cx="64" cy="96" rx="7" ry="4.5" fill="#fff3df" stroke="#c9b48a" strokeWidth="1.5" transform="rotate(-20 64 96)" />}
      {stage === 1 && <><Stem top={78} /><ellipse cx="54" cy="78" rx="11" ry="7" fill="#58c652" stroke="#1f5e22" strokeWidth="1.8" transform="rotate(-20 54 78)" /><ellipse cx="74" cy="78" rx="11" ry="7" fill="#4cbb47" stroke="#1f5e22" strokeWidth="1.8" transform="rotate(20 74 78)" />{lobedLeaf(64, 70, 6, "true")}</>}
      {stage === 2 && <>{vine}<Stem top={74} />{lobedLeaf(44, 86, 12, "a")}{lobedLeaf(84, 82, 13, "b")}{lobedLeaf(64, 70, 14, "c")}</>}
      {stage === 3 && <>{vine}<Stem top={66} />{lobedLeaf(38, 84, 13, "a")}{lobedLeaf(90, 80, 14, "b")}{lobedLeaf(62, 64, 16, "c")}
        <path d="M80 72 C80 66 78 62 80 58" stroke="#2a7f2a" strokeWidth="3" fill="none" /><path d="M80 44 L83 51 L91 50 L85 55 L88 63 L80 58 L72 63 L75 55 L69 50 L77 51Z" fill="#ffd23f" stroke="#c98a1a" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="80" cy="54" r="3" fill="#f0a020" />
        <ellipse cx="66" cy="96" rx="13" ry="10" fill="#7cbf4a" stroke="#3f7a22" strokeWidth="2" /><path d="M60 88 Q58 96 60 104 M72 88 Q74 96 72 104" stroke="#5a9a32" strokeWidth="1.6" fill="none" />
      </>}
      {stage === 4 && <>{vine}{lobedLeaf(30, 78, 14, "a")}{lobedLeaf(100, 74, 15, "b")}
        <g>
          <ellipse cx="64" cy="106" rx="36" ry="5" fill="rgba(0,0,0,.25)" />
          <ellipse cx="44" cy="86" rx="20" ry="22" fill="#e86d0c" stroke="#8a3a06" strokeWidth="2.5" />
          <ellipse cx="84" cy="86" rx="20" ry="22" fill="#e86d0c" stroke="#8a3a06" strokeWidth="2.5" />
          <ellipse cx="64" cy="86" rx="22" ry="24" fill="#ff8a1f" stroke="#8a3a06" strokeWidth="2.5" />
          <ellipse cx="56" cy="74" rx="6" ry="9" fill="#ffb066" opacity=".8" />
          <path d="M64 62 C62 54 66 50 72 48" stroke="#5e3a17" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M66 54 C76 50 84 54 82 62 C78 58 72 58 66 60Z" fill="#4cb84a" stroke="#1f5e22" strokeWidth="1.6" />
        </g>
      </>}
    </>
  );
}

function Avocado({ stage }: { stage: number }) {
  const pit = (y: number) => <><ellipse cx="64" cy={y} rx="12" ry="14" fill="#8a5a2b" stroke="#4a2a12" strokeWidth="2.5" /><ellipse cx="60" cy={y - 5} rx="4" ry="5" fill="#b07a42" /></>;
  const fruit = (x: number, y: number, key: number) => (
    <g key={key}>
      <path d={`M${x} ${y - 12} V${y - 18}`} stroke="#5e3a17" strokeWidth="2.5" strokeLinecap="round" />
      <path d={`M${x} ${y - 13} C${x + 6} ${y - 13} ${x + 8} ${y - 4} ${x + 9} ${y + 3} C${x + 10} ${y + 11} ${x + 5} ${y + 15} ${x} ${y + 15} C${x - 5} ${y + 15} ${x - 10} ${y + 11} ${x - 9} ${y + 3} C${x - 8} ${y - 4} ${x - 6} ${y - 13} ${x} ${y - 13}Z`} fill="#3d6b1f" stroke="#1f3a10" strokeWidth="2.2" />
      <ellipse cx={x - 3} cy={y - 2} rx="2.5" ry="5" fill="#6a9c35" />
    </g>
  );
  // A round dome of leaves: a solid body of foliage with leaves poking out all around it.
  const canopy = (count: number, top: number, length: number) => {
    const center = { x: 64, y: top + length * 0.75 };
    return [
      <ellipse key="body" cx={center.x} cy={center.y} rx={length * 0.95} ry={length * 0.7} fill="#2f9a35" stroke="#1f5e22" strokeWidth="2" />,
      ...[0, 1].flatMap((layer) => Array.from({ length: count }, (_, index) => {
        const angle = (index + layer * 0.5) * (360 / count) - 90;
        const radians = (angle * Math.PI) / 180;
        const reach = length * (layer ? 0.25 : 0.45);
        return leaf(center.x + Math.cos(radians) * reach, center.y + Math.sin(radians) * reach * 0.7, length * (layer ? 0.75 : 0.85), angle, length * 0.24, layer ? (index % 2 ? "#58c652" : "#4cbb47") : "#3fae3c", `${layer}-${index}`);
      })),
    ];
  };
  return (
    <>
      <Mound />
      {stage === 0 && pit(96)}
      {stage === 1 && <>{pit(98)}<Stem top={62} width={3} />{leaf(64, 64, 16, -145, 5, "#58c652")}{leaf(64, 62, 16, -35, 5, "#4cbb47")}</>}
      {stage === 2 && <><Stem top={56} width={4} />{canopy(6, 34, 18)}</>}
      {stage >= 3 && <>
        <path d="M60 100 Q62 70 64 40 L68 40 Q68 70 70 100Z" fill="#8a5a2b" stroke="#4a2a12" strokeWidth="2.5" />
        {canopy(10, 12, 28)}
        {stage === 4 && [fruit(42, 52, 1), fruit(86, 50, 2), fruit(64, 62, 3)]}
      </>}
    </>
  );
}

export function CropArt({ seed, stage }: { seed: SeedName; stage: number }) {
  const ready = stage >= 4;
  if (seed === "Carrot") return <img src={CARROT_STAGES[Math.min(4, stage)]} alt="" className={`garden-growth${ready ? " is-ready" : ""}`} draggable={false} />;
  return (
    <svg className={`garden-growth${ready ? " is-ready" : ""}`} viewBox="14 13 100 100" aria-hidden="true">
      {seed === "Potato" && <Potato stage={stage} />}
      {seed === "Pumpkin" && <Pumpkin stage={stage} />}
      {seed === "Avocado" && <Avocado stage={stage} />}
    </svg>
  );
}

export function SeedStand({ near }: { near: boolean }) {
  return (
    <div className={`garden-stand${near ? " is-near" : ""}`} style={{ left: STAND.x, top: STAND.y, zIndex: STAND.y }}>
      <img src="/assets/garden/seed-shop.svg" alt="Ted's Seed Shop" className="garden-stand-img" draggable={false} />
    </div>
  );
}
