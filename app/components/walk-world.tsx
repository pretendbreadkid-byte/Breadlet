"use client";

// Shared by Breadlet Explore and the Casino: walk around a world as your equipped Breadlet and chat
// in speech bubbles. Positions and bubbles are shared live through a Supabase Realtime channel.
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { createClient as createSupabaseClient } from "../../lib/supabase/client";
import { filterProfanity, hasSevereSlur } from "../../lib/chat-filter";
import { isStaffLookalike } from "../../lib/admin-access";

export type Walker = { id: string; username: string; blook: string; x: number; y: number; facing: 1 | -1; bubble?: { text: string; at: number } };
export type WalkPlayer = { id: string; username: string; equipped: string; chatMutedUntil?: string };
type Point = { x: number; y: number };

const SPEED = 240; // world pixels per second
const BUBBLE_MS = 6000;

const cleanBubble = (text: string) => (hasSevereSlur(text) ? "" : filterProfanity(text.slice(0, 120)));

// collide (optional) turns a step from one point toward another into where you can actually go,
// so worlds can have solid things you can't walk through.
export function useWalkWorld({ room, player, world, clamp, spawn, collide }: { room: string; player: WalkPlayer; world: { width: number; height: number }; clamp: (x: number, y: number) => Point; spawn: () => Point; collide?: (from: Point, to: Point) => Point }) {
  const supabase = useMemo(() => createSupabaseClient(), []);
  const viewportRef = useRef<HTMLDivElement>(null);
  const clampRef = useRef(clamp);
  clampRef.current = clamp;
  const collideRef = useRef(collide);
  collideRef.current = collide;
  const meRef = useRef<Walker | null>(null);
  if (!meRef.current) meRef.current = { id: player.id, username: player.username, blook: player.equipped, ...spawn(), facing: 1 };
  const targetRef = useRef<Point | null>(null);
  const keysRef = useRef(new Set<string>());
  // The on-screen joystick on phones and tablets: x/y from -1 to 1.
  const stickRef = useRef({ x: 0, y: 0 });
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const lastSentRef = useRef(0);
  const [me, setMe] = useState<Walker>(meRef.current);
  // Smooth movement: every frame the loop below moves the sprites and the camera straight on the
  // page (no React re-render per step). React state only catches up a few times a second, for the
  // things that read positions (who's nearest, the give pop-up, and so on).
  // targetsRef: where other players last said they are; shownRef: where we're drawing them now
  // (they glide toward their target instead of jumping each time an update arrives).
  const targetsRef = useRef<Record<string, Point & { facing: 1 | -1 }>>({});
  const shownRef = useRef<Record<string, Point>>({});
  const viewportSizeRef = useRef({ width: 800, height: 500 });
  const worldSizeRef = useRef(world);
  worldSizeRef.current = world;
  const lastSyncRef = useRef(0);
  const [others, setOthers] = useState<Record<string, Walker>>({});
  const [viewport, setViewport] = useState({ width: 800, height: 500 });
  const [connected, setConnected] = useState(false);

  const broadcastPosition = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastSentRef.current < 150) return;
    lastSentRef.current = now;
    const { x, y, facing } = meRef.current!;
    void channelRef.current?.send({ type: "broadcast", event: "move", payload: { id: player.id, x: Math.round(x), y: Math.round(y), facing } });
  }, [player.id]);

  // Join the room's live channel.
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel(room, { config: { presence: { key: player.id }, broadcast: { self: false } } });
    channelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ id: string; username: string; blook: string; x: number; y: number }>();
        setOthers((current) => {
          const next: Record<string, Walker> = {};
          Object.values(state).flat().forEach((entry) => {
            if (!entry.id || entry.id === player.id) return;
            next[entry.id] = current[entry.id] || { id: entry.id, username: entry.username, blook: entry.blook, x: entry.x, y: entry.y, facing: 1 };
            if (!targetsRef.current[entry.id]) targetsRef.current[entry.id] = { x: next[entry.id].x, y: next[entry.id].y, facing: next[entry.id].facing };
          });
          return next;
        });
      })
      // Tell newcomers where we are right now.
      .on("presence", { event: "join" }, () => broadcastPosition(true))
      .on("broadcast", { event: "move" }, ({ payload }) => {
        const spot = clampRef.current(Number(payload.x) || 0, Number(payload.y) || 0);
        const facing: 1 | -1 = payload.facing === -1 ? -1 : 1;
        targetsRef.current[payload.id] = { ...spot, facing };
        setOthers((current) => current[payload.id] ? { ...current, [payload.id]: { ...current[payload.id], ...spot, facing } } : current);
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const text = cleanBubble(String(payload.text || ""));
        if (!text) return;
        setOthers((current) => current[payload.id] ? { ...current, [payload.id]: { ...current[payload.id], bubble: { text, at: Date.now() } } } : current);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        setConnected(true);
        const { x, y } = meRef.current!;
        void channel.track({ id: player.id, username: player.username, blook: player.equipped, x: Math.round(x), y: Math.round(y) });
      });
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [broadcastPosition, room, player.equipped, player.id, player.username, supabase]);

  // Track the viewport size for the camera.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      viewportSizeRef.current = { width: element.clientWidth, height: element.clientHeight };
      setViewport(viewportSizeRef.current);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Keyboard movement (ignored while typing).
  useEffect(() => {
    const movementKeys = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
    const typing = (target: EventTarget | null) => ["INPUT", "TEXTAREA", "SELECT"].includes((target as HTMLElement)?.tagName);
    const down = (event: KeyboardEvent) => {
      if (typing(event.target)) return;
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

  // Draws everyone where they are right now, straight on the page.
  const movingRef = useRef(false);
  const drawFrame = useCallback((seconds: number) => {
    const root = viewportRef.current;
    if (!root) return;
    const mine = meRef.current!;
    const view = viewportSizeRef.current;
    const size = worldSizeRef.current;
    const camX = Math.max(0, Math.min(size.width - view.width, mine.x - view.width / 2));
    const camY = Math.max(0, Math.min(size.height - view.height, mine.y - view.height / 2));
    const worldEl = root.querySelector<HTMLElement>("[data-walk-world]");
    if (worldEl) worldEl.style.transform = `translate3d(${-camX}px, ${-camY}px, 0)`;
    const place = (element: HTMLElement | null, x: number, y: number, facing: number) => {
      if (!element) return;
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      element.style.zIndex = String(Math.round(y));
      const art = element.querySelector<HTMLElement>("[data-walker-art]");
      if (art) art.style.transform = `translateX(-50%) scaleX(${facing})`;
    };
    place(root.querySelector<HTMLElement>(`[data-walker="${mine.id}"]`), mine.x, mine.y, mine.facing);
    // Things that ride along with you (the crop in your hand): data-follow-dx / data-follow-dy.
    root.querySelectorAll<HTMLElement>("[data-follow-me]").forEach((element) => {
      element.style.left = `${mine.x + Number(element.dataset.followDx || 0) * mine.facing}px`;
      element.style.top = `${mine.y + Number(element.dataset.followDy || 0)}px`;
      element.style.zIndex = String(Math.round(mine.y) + 1);
    });
    // Other players glide toward where they last said they were.
    const blend = 1 - Math.exp(-seconds * 12);
    for (const [id, target] of Object.entries(targetsRef.current)) {
      const shown = shownRef.current[id] || (shownRef.current[id] = { x: target.x, y: target.y });
      const gap = Math.hypot(target.x - shown.x, target.y - shown.y);
      if (gap > 400) { shown.x = target.x; shown.y = target.y; } // a big jump (teleport): don't slide across the map
      else { shown.x += (target.x - shown.x) * blend; shown.y += (target.y - shown.y) * blend; }
      place(root.querySelector<HTMLElement>(`[data-walker="${CSS.escape(id)}"]`), shown.x, shown.y, target.facing);
    }
  }, []);

  // Movement loop.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const step = (time: number) => {
      const seconds = Math.min(0.05, (time - last) / 1000);
      last = time;
      const keys = keysRef.current;
      let dx = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      let dy = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
      let pace = 1;
      const stick = stickRef.current;
      const push = Math.hypot(stick.x, stick.y);
      if (!dx && !dy && push > 0.15) { dx = stick.x; dy = stick.y; pace = Math.min(1, push); }
      const target = targetRef.current;
      const current = meRef.current!;
      if (!dx && !dy && target) {
        const tx = target.x - current.x;
        const ty = target.y - current.y;
        const distance = Math.hypot(tx, ty);
        if (distance < 4) targetRef.current = null;
        else { dx = tx / distance; dy = ty / distance; }
      }
      const wasMoving = movingRef.current;
      movingRef.current = Boolean(dx || dy);
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        const stepTo = clampRef.current(current.x + (dx / length) * SPEED * pace * seconds, current.y + (dy / length) * SPEED * pace * seconds);
        const next = collideRef.current ? collideRef.current(current, stepTo) : stepTo;
        // Stuck against something (a table): stop walking toward the clicked spot.
        if (Math.hypot(next.x - current.x, next.y - current.y) < 0.5) targetRef.current = null;
        meRef.current = { ...current, ...next, facing: dx < 0 ? -1 : dx > 0 ? 1 : current.facing };
        broadcastPosition();
        // React catches up ~8 times a second while walking, and once more when you stop.
        if (time - lastSyncRef.current > 120) { lastSyncRef.current = time; setMe(meRef.current!); }
      } else if (wasMoving) setMe(meRef.current!);
      drawFrame(seconds);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [broadcastPosition, drawFrame]);

  // Phones and tablets get a joystick in the bottom-left corner to walk with. It's added straight to
  // the page so every walkable world (Garden, Butterfly Meadow, Explore) gets it without extra code.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const base = document.createElement("div");
    base.className = "walk-stick";
    base.setAttribute("aria-hidden", "true");
    const knob = document.createElement("div");
    knob.className = "walk-stick-knob";
    base.appendChild(knob);
    document.body.appendChild(base);
    const reach = 46;
    let pointer: number | null = null;
    const move = (event: PointerEvent) => {
      const box = base.getBoundingClientRect();
      let x = event.clientX - (box.left + box.width / 2);
      let y = event.clientY - (box.top + box.height / 2);
      const distance = Math.hypot(x, y);
      if (distance > reach) { x *= reach / distance; y *= reach / distance; }
      knob.style.transform = `translate(${x}px, ${y}px)`;
      stickRef.current = { x: x / reach, y: y / reach };
      targetRef.current = null;
    };
    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = null;
      knob.style.transform = "";
      stickRef.current = { x: 0, y: 0 };
    };
    const press = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      pointer = event.pointerId;
      base.setPointerCapture(pointer);
      move(event);
    };
    const drag = (event: PointerEvent) => { if (event.pointerId === pointer) move(event); };
    base.addEventListener("pointerdown", press);
    base.addEventListener("pointermove", drag);
    base.addEventListener("pointerup", release);
    base.addEventListener("pointercancel", release);
    return () => { base.remove(); stickRef.current = { x: 0, y: 0 }; };
  }, []);

  // Drop chat bubbles after a few seconds.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - BUBBLE_MS;
      const current = meRef.current!;
      if (current.bubble && current.bubble.at < cutoff) { meRef.current = { ...current, bubble: undefined }; setMe(meRef.current); }
      setOthers((list) => Object.values(list).some((walker) => walker.bubble && walker.bubble.at < cutoff)
        ? Object.fromEntries(Object.entries(list).map(([id, walker]) => [id, walker.bubble && walker.bubble.at < cutoff ? { ...walker, bubble: undefined } : walker]))
        : list);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Where the camera is right now (event handlers use this, so clicks land where you see them).
  const cameraNow = useCallback(() => {
    const mine = meRef.current!;
    const view = viewportSizeRef.current;
    const size = worldSizeRef.current;
    return {
      x: Math.max(0, Math.min(size.width - view.width, mine.x - view.width / 2)),
      y: Math.max(0, Math.min(size.height - view.height, mine.y - view.height / 2)),
    };
  }, []);
  const camera = {
    x: Math.max(0, Math.min(world.width - viewport.width, me.x - viewport.width / 2)),
    y: Math.max(0, Math.min(world.height - viewport.height, me.y - viewport.height / 2)),
  };

  const walkToPoint = useCallback((x: number, y: number) => { targetRef.current = clampRef.current(x, y); }, []);
  // Click or tap on the world to walk there.
  const walkTo = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const live = cameraNow();
    walkToPoint(event.clientX - rect.left + live.x, event.clientY - rect.top + live.y);
  };

  // Shows a speech bubble over your Breadlet. Returns an error message, or "" when it worked.
  const say = (text: string) => {
    if (player.chatMutedUntil && Date.parse(player.chatMutedUntil) > Date.now()) return "You are timed out from chat right now.";
    if (isStaffLookalike(player.username)) return "Your username looks like a staff account, so you cannot chat.";
    const clean = cleanBubble(text);
    if (!clean) return "That message isn't allowed.";
    meRef.current = { ...meRef.current!, bubble: { text: clean, at: Date.now() } };
    setMe(meRef.current);
    void channelRef.current?.send({ type: "broadcast", event: "chat", payload: { id: player.id, text: clean } });
    return "";
  };

  const walkers = [...Object.values(others), me].sort((a, b) => a.y - b.y);
  return { viewportRef, me, others, walkers, connected, camera, cameraNow, walkTo, walkToPoint, say };
}

export function WalkerSprite({ walker, isMe, artFor }: { walker: Walker; isMe: boolean; artFor: (name: string) => string }) {
  // Only the first position comes from React; after that the movement loop in useWalkWorld moves
  // the sprite every frame, so React re-renders never snap it back to an older spot.
  const start = useRef(walker).current;
  return (
    <div data-walker={walker.id} className={`explore-walker pointer-events-none absolute ${isMe ? "" : "explore-walker-remote"}`} style={{ left: 0, top: 0, transform: `translate3d(${start.x}px, ${start.y}px, 0)`, zIndex: Math.round(start.y) }}>
      {walker.bubble && <div className="explore-bubble absolute bottom-[84px] left-1/2 w-max max-w-[220px] -translate-x-1/2 break-words rounded-2xl border-2 border-white/80 bg-[#27251F] px-3 py-2 text-center text-sm font-bold text-white shadow-lg">{walker.bubble.text}</div>}
      <img data-walker-art src={artFor(walker.blook || "Bread Blook")} alt="" draggable={false} className="absolute bottom-0 left-1/2 h-16 w-16 max-w-none object-contain drop-shadow-lg" style={{ transform: `translateX(-50%) scaleX(${start.facing})` }} />
      <span className={`absolute left-1/2 top-1 w-max -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-black ${isMe ? "bg-[#ED7117] text-white" : "bg-black/60 text-white"}`}>{walker.username}</span>
    </div>
  );
}

// The "say something" box under a world.
export function WalkChat({ placeholder, say, buttonClassName }: { placeholder: string; say: (text: string) => string; buttonClassName?: string }) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const problem = say(text);
    setNotice(problem);
    if (!problem) setDraft("");
  };
  return (
    <>
      <form onSubmit={send} className="flex gap-2">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={120} placeholder={placeholder} className="min-w-0 flex-1 rounded-xl border border-[#3d91cd] bg-[#072a54] px-4 py-3 text-white placeholder:text-[#6ea3ce]" />
        <button type="submit" className={buttonClassName || "flex items-center gap-2 rounded-xl bg-[#39a8f5] px-5 py-3 font-black text-[#031426] hover:bg-[#73c8ff]"}><Send size={18} />Say</button>
      </form>
      {notice && <p className="text-sm font-bold text-rose-200">{notice}</p>}
    </>
  );
}
