"use client";

import { useEffect, useRef, useState } from "react";
import { FIESTA_SHOP, LEAVES_PER_SHOWER, SHOWER_MINUTES, showerAt } from "../../lib/fall-fiesta";

// Breadlet Fall Fiesta: the hourly leaf shower over the whole game, and the Event tab's leaf shop.

type Fiesta = { ready: boolean; leaves: number; caught: number; bought: string[]; adminEndsAt: number | null };

const FIESTA_CHANGED = "breadlet-fiesta-changed";
const FIESTA_REFRESH = "breadlet-fiesta-refresh";
// Reload the player's leaves: an admin just started a leaf shower.
export const refreshFiesta = () => window.dispatchEvent(new Event(FIESTA_REFRESH));
const announce = (changes: Partial<Fiesta>) => window.dispatchEvent(new CustomEvent(FIESTA_CHANGED, { detail: changes }));
const fiestaPost = (body: Record<string, string>) => fetch("/api/events/fiesta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);

const useNow = () => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};

// When the leaves stop falling, or null if none are falling right now.
const fallingUntil = (fiesta: Fiesta | null, now: number) => {
  if (fiesta?.adminEndsAt && fiesta.adminEndsAt > now) return fiesta.adminEndsAt;
  const shower = showerAt(now);
  return shower.live ? shower.endsAt : null;
};

// The player's leaves. Loads once per `hour` and when an admin starts a shower, so idle players don't poll Supabase.
const useFiesta = (hour: number | null) => {
  const [fiesta, setFiesta] = useState<Fiesta | null>(null);
  const [refreshes, setRefreshes] = useState(0);
  useEffect(() => {
    if (hour === null && !refreshes) return;
    let stale = false;
    fetch("/api/events/fiesta", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((state) => { if (!stale && state) setFiesta(state); })
      .catch(() => undefined);
    return () => { stale = true; };
  }, [hour, refreshes]);
  useEffect(() => {
    const refresh = () => setRefreshes((count) => count + 1);
    window.addEventListener(FIESTA_REFRESH, refresh);
    return () => window.removeEventListener(FIESTA_REFRESH, refresh);
  }, []);
  useEffect(() => {
    const changed = (event: Event) => setFiesta((current) => current && { ...current, ...(event as CustomEvent<Partial<Fiesta>>).detail });
    window.addEventListener(FIESTA_CHANGED, changed);
    return () => window.removeEventListener(FIESTA_CHANGED, changed);
  }, []);
  return fiesta;
};

const newLeaf = (id: number, delay: number) => ({
  id,
  left: Math.random() * 88,
  delay,
  duration: 2.5 + Math.random() * 1.5,
  size: 120 + Math.random() * 60,
  spin: Math.random() < 0.5 ? -1 : 1,
});

export function FallFiestaLayer() {
  const now = useNow();
  const shower = showerAt(now);
  const fiesta = useFiesta(shower.live ? shower.startsAt : null);
  const until = fallingUntil(fiesta, now);
  if (!until || !fiesta?.ready || fiesta.caught >= LEAVES_PER_SHOWER) return null;
  return <LeafShower key={until} caught={fiesta.caught} />;
}

function LeafShower({ caught }: { caught: number }) {
  const count = useRef(5);
  // A negative delay starts a leaf partway down, so leaves are falling straight away.
  const [leaves, setLeaves] = useState(() => Array.from({ length: 5 }, (_, index) => newLeaf(index, -Math.random() * 3)));
  const [pops, setPops] = useState<{ id: number; x: number; y: number; text: string }[]>([]);
  const busy = useRef(false);

  const pop = (x: number, y: number, text: string) => {
    const id = Date.now() + Math.random();
    setPops((current) => [...current, { id, x, y, text }]);
    window.setTimeout(() => setPops((current) => current.filter((item) => item.id !== id)), 1100);
  };

  const catchLeaf = async (leafId: number, x: number, y: number) => {
    if (busy.current) return;
    busy.current = true;
    // A new leaf takes the caught one's place after a short wait, so the shower keeps falling.
    setLeaves((current) => current.map((leaf) => (leaf.id === leafId ? newLeaf(count.current++, 2) : leaf)));
    const response = await fiestaPost({ action: "catch" });
    const result = await response?.json().catch(() => null);
    busy.current = false;
    if (response?.ok) {
      pop(x, y, "+1 🍂");
      announce(result);
    } else if (result?.error?.includes("every leaf")) {
      announce({ caught: LEAVES_PER_SHOWER });
    } else {
      pop(x, y, "Missed!");
    }
  };

  return (
    <div className="admin-bread-rain" aria-label="Leaf shower">
      {leaves.map((leaf) => (
        <button
          key={leaf.id}
          type="button"
          aria-label="Catch leaf"
          className="admin-bread fiesta-leaf"
          onClick={(click) => void catchLeaf(leaf.id, click.clientX, click.clientY)}
          style={{ left: `${leaf.left}%`, width: leaf.size, height: leaf.size, animationDelay: `${leaf.delay}s`, animationDuration: `${leaf.duration}s`, "--bread-spin": leaf.spin } as React.CSSProperties}
        >
          <img src="/assets/fall/fall-leaf.webp" alt="" draggable={false} />
        </button>
      ))}
      {pops.map((item) => <span key={item.id} className="admin-bread-pop" style={{ left: item.x, top: item.y }}>{item.text}</span>)}
      <p className="admin-rain-counter">🍂 Leaf Shower! Click the leaves · {caught}/{LEAVES_PER_SHOWER} caught</p>
    </div>
  );
}

const steps = [
  { title: "Wait for the leaf shower", text: `Leaves fall across all of Breadlet for the first ${SHOWER_MINUTES} minutes of every hour. There's nothing to buy or switch on.` },
  { title: "Click the leaves", text: `Each leaf you click is worth 1 leaf, and you can catch up to ${LEAVES_PER_SHOWER} per shower.` },
  { title: "Spend your leaves", text: "Buy the Fall Fiesta Breadlets and badge in the leaf shop above. You can buy each one once." },
];

// The next event, Breadlet Breaks Bad: Breadlets revealed so far.
const UPCOMING_BREADLETS = [
  { name: "Heisenberg Sketch", art: "/assets/breaking-bad/heisenberg-sketch.png" },
  { name: "Methylamine", art: "/assets/breaking-bad/methylamine.png" },
  { name: "Gus Fring", art: "/assets/breaking-bad/gus-fring.svg" },
  { name: "Flask", art: "/assets/breaking-bad/flask.svg" },
];

export function EventTab({ isGuest, onBought }: { isGuest: boolean; onBought: () => void }) {
  const now = useNow();
  const shower = showerAt(now);
  const fiesta = useFiesta(isGuest ? null : shower.startsAt);
  const [buying, setBuying] = useState("");
  const [notice, setNotice] = useState("");
  const until = fallingUntil(fiesta, now);
  const left = Math.max(0, (until ?? shower.nextAt) - now);
  const units = [
    { label: "Minutes", value: Math.floor(left / 60000) },
    { label: "Seconds", value: Math.floor(left / 1000) % 60 },
  ];

  const buy = async (name: string) => {
    setBuying(name);
    setNotice("");
    const response = await fiestaPost({ action: "buy", item: name });
    const result = await response?.json().catch(() => null);
    setBuying("");
    if (!response?.ok) return setNotice(result?.error || "Could not buy that. Try again.");
    announce(result);
    onBought();
    setNotice(`${name} is yours!`);
  };

  return (
    <div className="event-page mx-auto w-full max-w-4xl">
      {!until && <div className="event-leaves" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <img key={index} src="/assets/fall/fall-leaf.webp" alt="" style={{ "--leaf-index": index } as React.CSSProperties} />)}</div>}
      <img src="/assets/fall-fiesta-logo.webp" alt="Breadlet Fall Fiesta" className="event-logo" />
      <p className="event-soon">{until ? "Leaves are falling!" : "Next leaf shower"}</p>
      <div className="event-countdown event-countdown-short" role="timer" aria-label={until ? "Time left in this leaf shower" : "Time until the next leaf shower"}>
        {units.map((unit) => <div key={unit.label} className="event-countdown-unit"><b>{String(unit.value).padStart(2, "0")}</b><span>{unit.label}</span></div>)}
      </div>
      <section className="event-rewards" aria-labelledby="event-rewards-title">
        <h2 id="event-rewards-title">Leaf shop</h2>
        {isGuest ? <p>Log in to catch leaves and buy these.</p> : fiesta?.ready === false ? <p>The leaf shop is opening soon.</p> : <p className="event-wallet"><img src="/assets/fall/fall-leaf.webp" alt="" aria-hidden="true" />{fiesta ? `${fiesta.leaves} leaves` : "Loading your leaves…"}</p>}
        <ul>
          {FIESTA_SHOP.map((item) => {
            const owned = Boolean(fiesta?.bought.includes(item.name));
            return (
              <li key={item.name}>
                <img src={item.art} alt="" aria-hidden="true" />
                <b>{item.name}{item.badge ? " Badge" : ""}</b>
                <button type="button" className="dark-action-button event-buy" disabled={owned || !fiesta?.ready || fiesta.leaves < item.price || Boolean(buying)} onClick={() => void buy(item.name)}>
                  {owned ? "Owned" : buying === item.name ? "Buying…" : `${item.price} leaves`}
                </button>
              </li>
            );
          })}
        </ul>
        {notice && <p role="status" className="event-notice">{notice}</p>}
      </section>
      <section className="event-how">
        <h2>How the Fiesta works</h2>
        <ol>
          {steps.map((step, index) => <li key={step.title}><span className="event-step-number">{index + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}
        </ol>
      </section>

      {/* Teaser for the next event. On purpose it says nothing about how it works yet. */}
      <section className="event-upcoming" aria-labelledby="event-upcoming-title">
        <p id="event-upcoming-title" className="event-upcoming-tag">Upcoming event</p>
        <img src="/assets/breaking-bad/logo.svg" alt="Breadlet Breaks Bad" className="event-upcoming-logo" />
        <h3>Breadlets so far</h3>
        <ul>
          {UPCOMING_BREADLETS.map((breadlet) => <li key={breadlet.name}><img src={breadlet.art} alt="" /><span>{breadlet.name}</span></li>)}
          <li className="event-upcoming-more"><span className="event-upcoming-question" aria-hidden="true">?</span><span>More coming soon</span></li>
        </ul>
      </section>
    </div>
  );
}
