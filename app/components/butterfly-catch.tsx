"use client";

// Butterfly Catching: tap butterflies as they flutter across the meadow before the round ends.
// The server rolls each round and pays for what you caught (lib/butterflies.ts, /api/fields).
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";

type Kind = "Orange" | "Blue" | "Golden";
type Butterfly = { id: string; kind: Kind; at: number; y: number; dir: 1 | -1; wave: number };
type Round = { id: string; butterflies: Butterfly[]; roundMs: number; flightMs: number };

const VALUES: Record<Kind, number> = { Orange: 6, Blue: 10, Golden: 25 };
const ART: Record<Kind, string> = {
  Orange: "/assets/butterflies/butterfly.svg",
  Blue: "/assets/butterflies/blue-butterfly.svg",
  Golden: "/assets/butterflies/butterfly.svg",
};

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = response ? await response.json().catch(() => ({})) : {};
  return { ok: Boolean(response?.ok), data: data as any };
}

export function ButterflyCatch({ onBalance, onExit, onGarden }: { onBalance: (tokens: number) => void; onExit: () => void; onGarden: () => void }) {
  const [earned, setEarned] = useState(0);
  const [limit, setLimit] = useState(1500);
  const [round, setRound] = useState<Round | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [caught, setCaught] = useState<string[]>([]);
  const [pops, setPops] = useState<{ id: string; x: number; y: number; value: number }[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const startRef = useRef(0);
  const caughtRef = useRef<string[]>([]);
  const finishedRef = useRef(false);

  useEffect(() => {
    void post({ action: "butterflyStatus" }).then(({ ok, data }) => {
      if (ok) { setEarned(Number(data.earnedToday) || 0); setLimit(Number(data.limit) || 1500); }
    });
  }, []);

  const finish = useCallback(async (current: Round) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setBusy(true);
    const { ok, data } = await post({ action: "butterflyFinish", round: current.id, caught: caughtRef.current });
    setBusy(false);
    setRound(null);
    setMessage(data.message || data.error || (ok ? "Round over." : "Something went wrong."));
    if (ok) {
      setEarned(Number(data.earnedToday) || 0);
      if (typeof data.tokens === "number") onBalance(data.tokens);
    }
  }, [onBalance]);

  // Moves the butterflies along every frame and ends the round when time runs out.
  useEffect(() => {
    if (!round) return;
    let frame = 0;
    const tick = () => {
      const now = performance.now() - startRef.current;
      setElapsed(now);
      if (now >= round.roundMs) { void finish(round); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [round, finish]);

  const start = async () => {
    setBusy(true);
    setMessage("");
    const { ok, data } = await post({ action: "butterflyStart" });
    setBusy(false);
    if (!ok) { setMessage(data.error || "Couldn't start a round."); return; }
    caughtRef.current = [];
    finishedRef.current = false;
    setCaught([]);
    setPops([]);
    setEarned(Number(data.earnedToday) || 0);
    startRef.current = performance.now();
    setElapsed(0);
    setRound(data.round);
  };

  const catchOne = (butterfly: Butterfly, x: number, y: number) => {
    if (!round || caughtRef.current.includes(butterfly.id)) return;
    caughtRef.current = [...caughtRef.current, butterfly.id];
    setCaught(caughtRef.current);
    const pop = { id: butterfly.id, x, y, value: VALUES[butterfly.kind] };
    setPops((list) => [...list, pop]);
    window.setTimeout(() => setPops((list) => list.filter((item) => item.id !== pop.id)), 900);
  };

  const roundScore = round ? round.butterflies.filter((b) => caught.includes(b.id)).reduce((sum, b) => sum + VALUES[b.kind], 0) : 0;
  const left = round ? Math.max(0, Math.ceil((round.roundMs - elapsed) / 1000)) : 0;
  const full = earned >= limit;

  return (
    <div className="bf-page">
      <div className="bf-top">
        <div className="bf-top-buttons">
          <button type="button" className="bf-back" onClick={onExit}><ArrowLeft size={18} />Back</button>
          <button type="button" className="bf-back" onClick={onGarden}>Go to Garden</button>
        </div>
        <img src="/assets/butterflies/butterfly-catching-logo.svg" alt="Butterfly Catching" className="bf-logo" />
        <span aria-hidden="true" />
      </div>
      <div className="bf-stats">
        <div className="bf-meter" aria-label={`${earned} of ${limit} Bread Bucks earned today`}>
          <span style={{ width: `${Math.min(100, (earned / limit) * 100)}%` }} />
          <b><img src="/assets/Bread%20bucks.svg" alt="" />{earned.toLocaleString()} / {limit.toLocaleString()} today</b>
        </div>
        {round && <div className="bf-round"><span>⏱ {left}s</span><span>+{roundScore}</span></div>}
      </div>
      <div className={`bf-meadow${round ? " is-playing" : ""}`}>
        <div className="bf-hills" aria-hidden="true" />
        {round && round.butterflies.map((butterfly) => {
          const t = (elapsed - butterfly.at) / round.flightMs;
          if (t < 0 || t > 1 || caught.includes(butterfly.id)) return null;
          const x = butterfly.dir === 1 ? -8 + t * 116 : 108 - t * 116;
          const y = Math.min(88, Math.max(4, butterfly.y * 100 + Math.sin(t * Math.PI * 2 * (1 + butterfly.wave)) * 9));
          const flap = 0.55 + Math.abs(Math.sin(elapsed / 90 + butterfly.at)) * 0.45;
          return (
            <button key={butterfly.id} type="button" aria-label={`${butterfly.kind} butterfly`}
              className={`bf-butterfly is-${butterfly.kind.toLowerCase()}`}
              style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) scaleX(${(butterfly.dir === 1 ? 1 : -1) * flap})` }}
              onPointerDown={() => catchOne(butterfly, x, y)}>
              <img src={ART[butterfly.kind]} alt="" draggable={false} />
            </button>
          );
        })}
        {pops.map((pop) => <span key={pop.id} className="bf-pop" style={{ left: `${pop.x}%`, top: `${pop.y}%` }}>+{pop.value}</span>)}
        {!round && (
          <div className="bf-card">
            <h2>{busy ? "Counting your catch…" : message ? "Round over" : "Catch the butterflies!"}</h2>
            {message ? <p>{message}</p> : <p>Tap butterflies before they fly away. You have 40 seconds.</p>}
            <ul className="bf-key">
              {(Object.keys(VALUES) as Kind[]).map((kind) => (
                <li key={kind}><img src={ART[kind]} alt="" className={`is-${kind.toLowerCase()}`} />{kind}<b>{VALUES[kind]}</b></li>
              ))}
            </ul>
            <button type="button" className="bf-start" disabled={busy || full} onClick={() => void start()}>
              {full ? "Come back tomorrow" : message ? "Play again" : "Start"}
            </button>
            <small>You can earn up to {limit.toLocaleString()} Bread Bucks a day from butterflies.</small>
          </div>
        )}
      </div>
    </div>
  );
}

// The pop-up when you open the Garden: pick the Breadlet Garden or Butterfly Catching.
export function GardenChooser({ onPick, onClose }: { onPick: (mode: "garden" | "butterflies") => void; onClose: () => void }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="garden-chooser-layer" role="dialog" aria-modal="true" aria-label="Choose a game" onClick={onClose}>
      <div className="garden-chooser" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="garden-choice is-garden" onClick={() => onPick("garden")}>
          <img src="/assets/butterflies/breadlet-garden-logo.svg" alt="" />
          <b>Breadlet Garden</b>
          <span>Plant seeds, grow crops and build your garden.</span>
        </button>
        <button type="button" className="garden-choice is-butterflies" onClick={() => onPick("butterflies")}>
          <img src="/assets/butterflies/butterfly-catching-logo.svg" alt="" />
          <b>Butterfly Catching</b>
          <span>Catch butterflies for up to 1,500 Bread Bucks a day.</span>
        </button>
      </div>
    </div>
  );
}
