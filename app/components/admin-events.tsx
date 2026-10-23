"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient as createSupabaseClient } from "../../lib/supabase/client";

// "Admin abuse": live events the owner starts for everyone online (see migration 0058).

type AdminEvent = { id: string; kind: "disco" | "barrel_roll" | "announcement" | "bread_rain"; message: string; created_at: string; ends_at: string };

const MAX_CATCHES = 5;
const isLive = (event: AdminEvent) => new Date(event.ends_at).getTime() > Date.now();
const isFresh = (event: AdminEvent) => Date.now() - new Date(event.created_at).getTime() < 5000;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function AdminEventsLayer({ onReward }: { onReward: () => void }) {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const rolled = useRef(new Set<string>());

  const add = useCallback((event: AdminEvent) => {
    if (!isLive(event)) return;
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

  const disco = events.some((event) => event.kind === "disco") && !reducedMotion();
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

const EVENT_BUTTONS: { kind: AdminEvent["kind"]; label: string; detail: string }[] = [
  { kind: "disco", label: "🪩 Disco Mode", detail: "Rainbow colors on everyone's screen for 60s" },
  { kind: "barrel_roll", label: "🌀 Barrel Roll", detail: "Everyone's screen does a full spin" },
  { kind: "bread_rain", label: "🍞 Bread Rain", detail: "45s of falling breads, +10 each, max 50 per player" },
];

// Owner controls in the Admin Panel.
export function AdminAbusePanel() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async (kind: AdminEvent["kind"]) => {
    setBusy(true);
    setStatus("");
    const response = await fetch("/api/admin/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, message }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) return setStatus(result?.error || "Could not start that event.");
    if (kind === "announcement") setMessage("");
    setStatus("Event started for everyone online!");
  };

  return (
    <div className="rounded-3xl border border-[#3d91cd] bg-[#103f75] p-6 shadow-md">
      <h2 className="text-xl font-black text-[#bde8ff]">😈 Admin Abuse</h2>
      <p className="mt-1 text-sm opacity-80">Live events for every player online right now.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {EVENT_BUTTONS.map((button) => (
          <button key={button.kind} type="button" disabled={busy} onClick={() => void start(button.kind)} className="dark-action-button flex-col !items-start text-left disabled:opacity-50">
            <span className="text-base">{button.label}</span>
            <span className="text-xs font-bold opacity-70">{button.detail}</span>
          </button>
        ))}
      </div>
      <form onSubmit={(submit) => { submit.preventDefault(); void start("announcement"); }} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input value={message} onChange={(change) => setMessage(change.target.value)} maxLength={120} placeholder="Mega announcement for everyone…" className="min-w-0 flex-1 rounded-xl border border-[#3d91cd] bg-[#072a54] px-4 py-3 text-white placeholder:text-[#6ea3ce]" />
        <button type="submit" disabled={busy || !message.trim()} className="dark-action-button justify-center disabled:opacity-50">📢 Announce</button>
      </form>
      {status && <p className="mt-2 text-sm font-bold">{status}</p>}
    </div>
  );
}
