"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CoinGame = {
  id: string;
  status: "active" | "done";
  bet: number;
  isHost: boolean;
  hostName: string;
  opponentName: string;
  result?: { pick: string; flip: "heads" | "tails"; winnerId: string; winnerName: string } | null;
};

const seenKey = "breadlet-coinflip-seen";
// Fired when this player starts, joins or acts in a game, so the coin flip popup starts watching.
export const GAMES_CHANGED_EVENT = "breadlet:games-changed";
const WATCH_MS = 150000;

export async function postGameAction(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) window.dispatchEvent(new Event(GAMES_CHANGED_EVENT));
    return response.ok ? { ok: true } : { ok: false, error: data.error || "That game action failed." };
  } catch {
    return { ok: false, error: "Could not reach the games server." };
  }
}

export function GamesMenu({ onError, onAsk }: { onError: (message: string) => void; onAsk: (question: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [bet, setBet] = useState("100");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  // Posts "/ai <question>" in chat; Breadlet answers there for everyone to see.
  const ask = async () => {
    const text = question.trim();
    if (!text) return;
    setBusy(true);
    await onAsk(text);
    setBusy(false);
    setQuestion("");
    setOpen(false);
  };

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    const result = await postGameAction(body);
    setBusy(false);
    if (!result.ok) onError(result.error || "That game action failed.");
    else {
      onError("");
      setOpen(false);
    }
  };

  const option = "w-full rounded-xl bg-[#27251F] px-3 py-2 text-left text-sm font-black text-white hover:bg-[#3c3a34] disabled:opacity-50";
  return (
    <div className="mb-2 flex flex-col items-end">
      {open && (
        <div className="mb-2 w-[min(18rem,calc(100vw-1.5rem))] space-y-2 rounded-2xl border border-[#3c3a34] bg-[#13120F] p-3 text-white shadow-2xl">
          <h2 className="font-black text-[#e9bd67]">Chat games</h2>
          <form onSubmit={(event) => { event.preventDefault(); void ask(); }} className="rounded-xl bg-[#27251F] p-2">
            <p className="px-1 text-sm font-black">Ask the AI</p>
            <p className="px-1 pb-2 text-xs font-bold text-white/60">Breadlet answers your question in chat</p>
            <div className="flex gap-2">
              <input value={question} onChange={(event) => setQuestion(event.target.value.slice(0, 300))} placeholder="How do I trade?" aria-label="Question for the AI" className="min-w-0 flex-1 rounded-lg bg-[#13120F] px-3 py-2 text-sm font-bold text-white outline-none" />
              <button type="submit" disabled={busy || !question.trim()} className="rounded-lg bg-[#e9bd67] px-3 py-2 text-sm font-black text-[#13120F] disabled:opacity-50">Ask</button>
            </div>
          </form>
          <button disabled={busy} className={option} onClick={() => void run({ action: "wordrace_start" })}>Word Race<span className="block text-xs font-bold text-white/60">First to type the word wins 5 Bread Bucks</span></button>
          <button disabled={busy} className={option} onClick={() => void run({ action: "unscramble_start" })}>Unscramble<span className="block text-xs font-bold text-white/60">Unscramble the word for 5 Bread Bucks</span></button>
          <div className="rounded-xl bg-[#27251F] p-2">
            <p className="px-1 text-sm font-black">Coin Flip</p>
            <p className="px-1 pb-2 text-xs font-bold text-white/60">Both players put in the bet. Winner takes the pot.</p>
            <div className="flex gap-2">
              <input value={bet} onChange={(event) => setBet(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" aria-label="Bet in Bread Bucks" className="min-w-0 flex-1 rounded-lg bg-[#13120F] px-3 py-2 text-sm font-bold text-white outline-none" />
              <button disabled={busy} onClick={() => void run({ action: "coinflip_start", bet: Number(bet) })} className="rounded-lg bg-[#e9bd67] px-3 py-2 text-sm font-black text-[#13120F] disabled:opacity-50">Start</button>
            </div>
          </div>
        </div>
      )}
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="rounded-2xl border border-[#3c3a34] bg-[#13120F] px-5 py-3 text-xl font-black text-[#e9bd67] shadow-xl hover:bg-[#27251F]">Games</button>
    </div>
  );
}

export function CoinFlipPopup({ onFinished }: { onFinished: () => void }) {
  const [game, setGame] = useState<CoinGame | null>(null);
  const [error, setError] = useState("");
  const [animating, setAnimating] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const handled = useRef<string | null>(null);
  const watchUntil = useRef(0);
  const activeGame = useRef(false);
  useEffect(() => { activeGame.current = game?.status === "active"; }, [game]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/games", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const next: CoinGame | null = data.game;
      if (!next) {
        setGame((current) => (current?.status === "done" ? current : null));
        return;
      }
      if (next.status === "done") {
        if (window.localStorage.getItem(seenKey) === next.id || handled.current === next.id) return;
        handled.current = next.id;
        setGame(next);
        setRevealed(false);
        setAnimating(true);
        window.setTimeout(() => {
          setAnimating(false);
          setRevealed(true);
          onFinished();
        }, 2400);
        return;
      }
      setGame((current) => (current?.status === "done" ? current : next));
    } catch {
      // Polling is best effort.
    }
  }, [onFinished]);

  // Polling every 3s for every online player was the biggest source of requests. Now it only
  // polls quickly while this player is in a coin flip or just started/joined one, with a slow
  // safety check otherwise.
  useEffect(() => {
    void load();
    const wake = () => { watchUntil.current = Date.now() + WATCH_MS; void load(); };
    window.addEventListener(GAMES_CHANGED_EVENT, wake);
    const fast = window.setInterval(() => {
      if (!document.hidden && (activeGame.current || Date.now() < watchUntil.current)) void load();
    }, 3000);
    const slow = window.setInterval(() => { if (!document.hidden) void load(); }, 90000);
    return () => {
      window.removeEventListener(GAMES_CHANGED_EVENT, wake);
      window.clearInterval(fast);
      window.clearInterval(slow);
    };
  }, [load]);

  const pick = async (choice: "heads" | "tails") => {
    setError("");
    const result = await postGameAction({ action: "coinflip_pick", choice });
    if (!result.ok) setError(result.error || "Could not pick.");
    else void load();
  };

  const close = () => {
    if (game) window.localStorage.setItem(seenKey, game.id);
    setGame(null);
    setRevealed(false);
  };

  if (!game) return null;
  const pot = (game.bet * 2).toLocaleString();
  return (
    <div className="modal-layer fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl border border-[#3c3a34] bg-[#13120F] p-6 text-center text-white shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e9bd67]">Coin flip · {pot} token pot</p>
        <h2 className="mt-2 text-2xl font-black">{game.hostName} vs {game.opponentName}</h2>
        {game.status === "active" && (
          game.isHost ? (
            <>
              <p className="mt-3 text-sm text-white/70">Pick heads or tails. {game.opponentName} gets the other side.</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button onClick={() => void pick("heads")} className="rounded-xl bg-[#e9bd67] px-4 py-4 font-black text-[#13120F]">Heads</button>
                <button onClick={() => void pick("tails")} className="rounded-xl bg-[#27251F] px-4 py-4 font-black text-[#e9bd67]">Tails</button>
              </div>
            </>
          ) : <p className="mt-5 text-sm font-bold text-white/70">{game.hostName} is choosing heads or tails...</p>
        )}
        {game.status === "done" && (
          <>
            <div className="mx-auto mt-5 grid h-28 w-28 place-items-center" style={{ perspective: "600px" }}>
              <div className={`coin-flip-disc grid h-24 w-24 place-items-center rounded-full border-4 border-[#e9bd67] bg-[#27251F] text-xl font-black text-[#e9bd67] ${animating ? "coin-flip-spinning" : ""}`}>
                {animating ? "?" : game.result?.flip === "heads" ? "H" : "T"}
              </div>
            </div>
            {revealed && game.result && (
              <>
                <p className="mt-4 text-lg font-black">The coin landed on {game.result.flip}!</p>
                <p className="mt-1 text-sm font-bold text-[#e9bd67]">{game.result.winnerName} won {pot} tokens.</p>
                <button onClick={close} className="mt-5 w-full rounded-xl bg-[#e9bd67] px-4 py-3 font-black text-[#13120F]">Close</button>
              </>
            )}
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm font-bold text-red-300">{error}</p>}
      </section>
    </div>
  );
}
