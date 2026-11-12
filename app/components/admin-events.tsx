"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient as createSupabaseClient } from "../../lib/supabase/client";
import { SHOWER_MINUTES } from "../../lib/fall-fiesta";
import { refreshFiesta } from "./fall-fiesta";

// "Admin abuse": live events the owner starts for everyone online (see migration 0058).

type EventKind = "disco" | "barrel_roll" | "announcement" | "bread_rain" | "leaf_shower"
  | "upside_down" | "earthquake" | "snowstorm" | "confetti" | "lights_out" | "ted_jumpscare" | "parade";
type AdminEvent = { id: string; kind: EventKind; message: string; created_at: string; ends_at: string };

const MAX_CATCHES = 5;
const isLive = (event: AdminEvent) => new Date(event.ends_at).getTime() > Date.now();
const isFresh = (event: AdminEvent) => Date.now() - new Date(event.created_at).getTime() < 5000;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function AdminEventsLayer({ onReward }: { onReward: () => void }) {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const rolled = useRef(new Set<string>());

  const add = useCallback((event: AdminEvent) => {
    if (!isLive(event)) return;
    if (event.kind === "leaf_shower") refreshFiesta();
    setEvents((current) => (current.some((item) => item.id === event.id) ? current : [...current, event]));
  }, []);

  useEffect(() => {
    fetch("/api/events", { cache: "no-store" }).then((response) => (response.ok ? response.json() : [])).then((rows) => Array.isArray(rows) && rows.forEach(add)).catch(() => undefined);
    const supabase = createSupabaseClient();
    const channel = supabase?.channel("admin-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "admin_events" }, (payload) => add(payload.new as AdminEvent))
      .subscribe();
    return () => { if (channel) void supabase?.removeChannel(channel); };
  }, [add]);

  // Drop events once they end (only ticks while something is running).
  useEffect(() => {
    if (!events.length) return;
    const timer = window.setInterval(() => setEvents((current) => current.filter(isLive)), 1000);
    return () => window.clearInterval(timer);
  }, [events.length]);

  // Barrel roll: spin the page once, only for events that just started (not on page load).
  useEffect(() => {
    events.filter((event) => event.kind === "barrel_roll" && !rolled.current.has(event.id)).forEach((event) => {
      rolled.current.add(event.id);
      if (isFresh(event) && !reducedMotion()) document.body.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 1400, easing: "ease-in-out" });
    });
  }, [events]);

  // Whole-page effects stay on <html> while their event runs.
  const live = (kind: EventKind) => events.some((event) => event.kind === kind);
  const motion = !reducedMotion();
  const upsideDown = live("upside_down");
  const earthquake = live("earthquake") && motion;
  useEffect(() => {
    document.documentElement.classList.toggle("admin-upside-down", upsideDown);
    document.documentElement.classList.toggle("admin-earthquake", earthquake);
    return () => document.documentElement.classList.remove("admin-upside-down", "admin-earthquake");
  }, [upsideDown, earthquake]);

  const disco = live("disco") && motion;
  const confetti = events.find((event) => event.kind === "confetti");
  const jumpscare = events.find((event) => event.kind === "ted_jumpscare" && isFresh(event));
  const parade = events.find((event) => event.kind === "parade");
  const announcement = [...events].reverse().find((event) => event.kind === "announcement");
  const rain = events.find((event) => event.kind === "bread_rain");

  return (
    <>
      {disco && <div className="admin-disco-overlay" aria-hidden="true" />}
      {announcement && (
        <div key={announcement.id} className="admin-announcement" role="status" aria-live="assertive">
          <p className="admin-announcement-tag">📢 Announcement</p>
          <p className="admin-announcement-text">{announcement.message}</p>
        </div>
      )}
      {rain && <BreadRain key={rain.id} event={rain} onReward={onReward} />}
      {live("snowstorm") && <Snowstorm />}
      {confetti && <Confetti key={confetti.id} />}
      {live("lights_out") && <LightsOut />}
      {jumpscare && <div key={jumpscare.id} className="admin-jumpscare" aria-hidden="true"><img src="/assets/ted-shopkeeper.svg" alt="" /><span>BOO!</span></div>}
      {parade && <Parade key={parade.id} />}
    </>
  );
}

function BreadRain({ event, onReward }: { event: AdminEvent; onReward: () => void }) {
  const breads = useMemo(() => Array.from({ length: 18 }, (_, index) => ({
    id: index,
    left: 3 + Math.random() * 90,
    delay: Math.random() * 6,
    duration: 4 + Math.random() * 3,
    size: 52 + Math.random() * 28,
    spin: Math.random() < 0.5 ? -1 : 1,
  })), []);
  const [caught, setCaught] = useState<number[]>([]);
  const [count, setCount] = useState(0);
  const [pops, setPops] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const busy = useRef(false);

  const pop = (x: number, y: number, text: string) => {
    const id = Date.now() + Math.random();
    setPops((current) => [...current, { id, x, y, text }]);
    window.setTimeout(() => setPops((current) => current.filter((item) => item.id !== id)), 1100);
  };

  const catchBread = async (breadId: number, x: number, y: number) => {
    if (busy.current || count >= MAX_CATCHES) return;
    busy.current = true;
    setCaught((current) => [...current, breadId]);
    const response = await fetch("/api/events/catch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: event.id }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    busy.current = false;
    if (response?.ok) {
      setCount(Number(result?.catches) || count + 1);
      pop(x, y, "+10 🍞");
      onReward();
    } else {
      pop(x, y, result?.error ? "Too slow!" : "Missed!");
      if (result?.error?.includes("most breads")) setCount(MAX_CATCHES);
    }
  };

  const done = count >= MAX_CATCHES;
  return (
    <div className="admin-bread-rain" aria-label="Bread rain">
      {!done && breads.filter((bread) => !caught.includes(bread.id)).map((bread) => (
        <button
          key={bread.id}
          type="button"
          aria-label="Catch bread"
          className="admin-bread"
          onClick={(click) => void catchBread(bread.id, click.clientX, click.clientY)}
          style={{ left: `${bread.left}%`, width: bread.size, height: bread.size, animationDelay: `${bread.delay}s`, animationDuration: `${bread.duration}s`, "--bread-spin": bread.spin } as React.CSSProperties}
        >
          <img src="/assets/Bread.svg" alt="" draggable={false} />
        </button>
      ))}
      {pops.map((item) => <span key={item.id} className="admin-bread-pop" style={{ left: item.x, top: item.y }}>{item.text}</span>)}
      <p className="admin-rain-counter">🍞 Bread Rain! {done ? "You caught the max: +50 Bread Bucks!" : `Click the breads · ${count}/${MAX_CATCHES} caught`}</p>
    </div>
  );
}

function Snowstorm() {
  const flakes = useMemo(() => Array.from({ length: 70 }, (_, index) => ({ id: index, left: Math.random() * 100, size: 4 + Math.random() * 9, delay: -Math.random() * 10, duration: 6 + Math.random() * 7, drift: (Math.random() - 0.5) * 120 })), []);
  return (
    <div className="admin-snow" aria-hidden="true">
      {flakes.map((flake) => <i key={flake.id} style={{ left: `${flake.left}%`, width: flake.size, height: flake.size, animationDelay: `${flake.delay}s`, animationDuration: `${flake.duration}s`, "--drift": `${flake.drift}px` } as React.CSSProperties} />)}
    </div>
  );
}

const CONFETTI_COLORS = ["#ff4d6d", "#ffd23f", "#3bceac", "#4cc9f0", "#b388ff", "#ff8c42"];
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 140 }, (_, index) => ({ id: index, left: Math.random() * 100, color: CONFETTI_COLORS[index % CONFETTI_COLORS.length], delay: Math.random() * 0.8, duration: 2.6 + Math.random() * 2.4, spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 720), drift: (Math.random() - 0.5) * 260, wide: Math.random() < 0.5 })), []);
  return (
    <div className="admin-confetti" aria-hidden="true">
      {pieces.map((piece) => <i key={piece.id} style={{ left: `${piece.left}%`, background: piece.color, width: piece.wide ? 12 : 7, height: piece.wide ? 7 : 14, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, "--spin": `${piece.spin}deg`, "--drift": `${piece.drift}px` } as React.CSSProperties} />)}
    </div>
  );
}

// Lights out: the screen goes dark except a flashlight that follows the mouse or finger.
function LightsOut() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      ref.current?.style.setProperty("--x", `${event.clientX}px`);
      ref.current?.style.setProperty("--y", `${event.clientY}px`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", move);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", move); };
  }, []);
  return <div ref={ref} className="admin-lights-out" aria-hidden="true"><span>🔦 Lights out!</span></div>;
}

const PARADE = ["/assets/Bread.svg", "/assets/american-flag.svg", "/assets/winter/frozen-ted.svg", "/assets/megalodon.svg", "/assets/gold-play-button.svg", "/assets/sugar-glider.svg", "/assets/crimsonoctopus.svg", "/assets/camera.svg", "/assets/winter/fireplace.svg", "/assets/ted-shopkeeper.svg"];
function Parade() {
  return (
    <div className="admin-parade" aria-hidden="true">
      <div className="admin-parade-line">
        {PARADE.map((art, index) => <img key={art} src={art} alt="" style={{ animationDelay: `${index * 0.12}s` }} />)}
      </div>
    </div>
  );
}

type EventButton = { kind: EventKind; emoji: string; label: string; detail: string; tone: string };
const EVENT_GROUPS: { title: string; buttons: EventButton[] }[] = [
  { title: "Rewards", buttons: [
    { kind: "bread_rain", emoji: "🍞", label: "Bread Rain", detail: "45s of falling breads · +10 each, max 50", tone: "gold" },
    { kind: "leaf_shower", emoji: "🍂", label: "Leaf Shower", detail: `${SHOWER_MINUTES} min of leaves for the Fall Fiesta`, tone: "orange" },
  ] },
  { title: "Screen chaos", buttons: [
    { kind: "disco", emoji: "🪩", label: "Disco Mode", detail: "Rainbow colors for 60s", tone: "pink" },
    { kind: "barrel_roll", emoji: "🌀", label: "Barrel Roll", detail: "Everyone's screen spins once", tone: "blue" },
    { kind: "upside_down", emoji: "🙃", label: "Upside Down", detail: "The whole site flips for 15s", tone: "purple" },
    { kind: "earthquake", emoji: "🌋", label: "Earthquake", detail: "Screens shake for 8s", tone: "red" },
    { kind: "lights_out", emoji: "🔦", label: "Lights Out", detail: "Pitch black + a flashlight for 30s", tone: "dark" },
  ] },
  { title: "Party", buttons: [
    { kind: "confetti", emoji: "🎉", label: "Confetti", detail: "A big confetti blast", tone: "green" },
    { kind: "snowstorm", emoji: "❄️", label: "Snowstorm", detail: "Snow falls for 60s", tone: "ice" },
    { kind: "parade", emoji: "🎺", label: "Breadlet Parade", detail: "Breadlets march across the screen", tone: "gold" },
    { kind: "ted_jumpscare", emoji: "👻", label: "Ted Jumpscare", detail: "Ted pops up. BOO!", tone: "dark" },
  ] },
];

// Owner controls in the Admin Panel.
export function AdminAbusePanel() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<EventKind | null>(null);

  const start = async (kind: EventKind) => {
    setBusy(kind);
    setStatus(null);
    const response = await fetch("/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, message }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setBusy(null);
    if (!response?.ok) return setStatus({ text: result?.error || "Could not start that event.", ok: false });
    if (kind === "announcement") setMessage("");
    setStatus({ text: "Started for everyone online!", ok: true });
  };

  return (
    <section className="abuse-panel">
      <header className="abuse-panel-header">
        <span className="abuse-panel-icon" aria-hidden="true">😈</span>
        <div>
          <h2>Admin Abuse</h2>
          <p>Live events for every player online right now.</p>
        </div>
      </header>
      <form onSubmit={(submit) => { submit.preventDefault(); void start("announcement"); }} className="abuse-announce">
        <span aria-hidden="true">📢</span>
        <input value={message} onChange={(change) => setMessage(change.target.value)} maxLength={120} placeholder="Mega announcement for everyone…" aria-label="Announcement" />
        <button type="submit" disabled={Boolean(busy) || !message.trim()}>{busy === "announcement" ? "Sending…" : "Announce"}</button>
      </form>
      {EVENT_GROUPS.map((group) => (
        <div key={group.title} className="abuse-group">
          <h3>{group.title}</h3>
          <div className="abuse-grid">
            {group.buttons.map((button) => (
              <button key={button.kind} type="button" disabled={Boolean(busy)} onClick={() => void start(button.kind)} className={`abuse-card abuse-${button.tone}`}>
                <span className="abuse-card-emoji" aria-hidden="true">{button.emoji}</span>
                <span className="abuse-card-label">{busy === button.kind ? "Starting…" : button.label}</span>
                <span className="abuse-card-detail">{button.detail}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {status && <p role="status" className={`abuse-status ${status.ok ? "is-ok" : "is-error"}`}>{status.text}</p>}
    </section>
  );
}
