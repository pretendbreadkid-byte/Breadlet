"use client";

// Games tab: pick roulette, slots or dice and bet Bread Bucks. The server (/api/casino) rolls the
// result and moves the Bread Bucks; this only animates it.
import { useEffect, useRef, useState } from "react";
import { CASINO_MAX_BET, RED_NUMBERS, SLOT_SYMBOLS, type CasinoGame, type CasinoResult } from "../../lib/casino";

const GAMES: { id: CasinoGame; name: string; blurb: string; art: string }[] = [
  { id: "roulette", name: "Roulette", blurb: "Red, black, odd, even, or one lucky number for 36x.", art: "🎡" },
  { id: "slots", name: "Slots", blurb: "Line up three Breadlets. Three Bread Bucks pays 150x.", art: "🎰" },
  { id: "dice", name: "Dice", blurb: "Roll two dice: low, high, or a seven for 5x.", art: "🎲" },
];

const ROULETTE_PICKS = [
  { id: "red", label: "Red", note: "2x" },
  { id: "black", label: "Black", note: "2x" },
  { id: "odd", label: "Odd", note: "2x" },
  { id: "even", label: "Even", note: "2x" },
  { id: "low", label: "1-18", note: "2x" },
  { id: "high", label: "19-36", note: "2x" },
];
const DICE_PICKS = [
  { id: "low", label: "Low (2-6)", note: "2x" },
  { id: "seven", label: "Seven", note: "5x" },
  { id: "high", label: "High (8-12)", note: "2x" },
];
const DIE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
const numberColor = (n: number) => (n === 0 ? "green" : RED_NUMBERS.includes(n) ? "red" : "black");
const slotArt = (id: string) => SLOT_SYMBOLS.find((symbol) => symbol.id === id)?.art || "";
const randomOf = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export function GamesTab({ tokens, onBalance }: { tokens: number; onBalance: (tokens: number) => void }) {
  const [game, setGame] = useState<CasinoGame | null>(null);
  const [bet, setBet] = useState(100);
  const [pick, setPick] = useState("red");
  const [number, setNumber] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<{ result: CasinoResult; bet: number; payout: number } | null>(null);
  // What the animation is showing right now.
  const [rouletteShown, setRouletteShown] = useState(0);
  const [reelsShown, setReelsShown] = useState<string[]>(["bread", "acorn", "leaf"]);
  const [diceShown, setDiceShown] = useState<[number, number]>([1, 6]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearInterval(timer)), []);

  const choose = (next: CasinoGame) => {
    setGame(next);
    setOutcome(null);
    setError("");
    setPick(next === "dice" ? "low" : next === "roulette" ? "red" : "");
  };

  const play = async () => {
    if (!game || busy) return;
    const wager = Math.floor(bet);
    if (!(wager >= 1)) return setError("Enter a bet of at least 1 Bread Buck.");
    if (wager > tokens) return setError("You don't have enough Bread Bucks for that bet.");
    setBusy(true);
    setError("");
    setOutcome(null);
    // Spin the display while the server answers.
    const spin = window.setInterval(() => {
      if (game === "roulette") setRouletteShown(Math.floor(Math.random() * 37));
      if (game === "slots") setReelsShown([0, 1, 2].map(() => randomOf(SLOT_SYMBOLS).id));
      if (game === "dice") setDiceShown([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 80);
    timers.current.push(spin);
    const sentPick = game === "roulette" && pick === "number" ? `number:${number}` : pick;
    const started = Date.now();
    const response = await fetch("/api/casino", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, bet: wager, pick: sentPick }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    // Let it spin for at least a second and a half so it feels like a roll.
    await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 1500 - (Date.now() - started))));
    window.clearInterval(spin);
    if (!response?.ok || !data?.result) {
      setBusy(false);
      setError(data?.error || "That didn't go through. Try again.");
      return;
    }
    const result = data.result as CasinoResult;
    if (result.game === "roulette") setRouletteShown(result.number);
    if (result.game === "dice") setDiceShown(result.dice);
    if (result.game === "slots") {
      // Stop the reels one at a time.
      for (let reel = 0; reel < 3; reel += 1) {
        const rolling = window.setInterval(() => setReelsShown((current) => current.map((symbol, index) => (index > reel ? randomOf(SLOT_SYMBOLS).id : index === reel ? result.reels[reel] : symbol))), 80);
        timers.current.push(rolling);
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        window.clearInterval(rolling);
        setReelsShown((current) => current.map((symbol, index) => (index <= reel ? result.reels[index] : symbol)));
      }
    }
    setOutcome({ result, bet: data.bet, payout: data.payout });
    onBalance(data.tokens);
    setBusy(false);
  };

  const quickBets = [10, 100, 1000, 10000];
  const won = outcome && outcome.payout > outcome.bet;
  const pushed = outcome && outcome.payout === outcome.bet;

  return (
    <div className="casino-page mx-auto w-full max-w-4xl">
      <header className="mb-6 text-center">
        <h1 className="page-sign text-4xl font-black">Games</h1>
        <p className="mt-2 opacity-85">Bet Bread Bucks on roulette, slots or dice. Only you can see this tab while it&apos;s being tested.</p>
        <p className="casino-balance mt-3"><img src="/assets/Bread%20bucks.svg" alt="" aria-hidden="true" />{tokens.toLocaleString()} Bread Bucks</p>
      </header>

      <div className="casino-picker">
        {GAMES.map((entry) => (
          <button key={entry.id} type="button" onClick={() => choose(entry.id)} aria-pressed={game === entry.id} className="casino-game-card" disabled={busy}>
            <span className="casino-game-art" aria-hidden="true">{entry.art}</span>
            <b>{entry.name}</b>
            <span>{entry.blurb}</span>
          </button>
        ))}
      </div>

      {game && (
        <section className="casino-table" aria-label={GAMES.find((entry) => entry.id === game)?.name}>
          <div className="casino-stage" aria-live="polite">
            {game === "roulette" && <div className={`casino-roulette casino-${numberColor(rouletteShown)}`}><b>{rouletteShown}</b></div>}
            {game === "slots" && (
              <div className="casino-reels">
                {reelsShown.map((symbol, index) => <span key={index} className="casino-reel"><img src={slotArt(symbol)} alt={symbol} /></span>)}
              </div>
            )}
            {game === "dice" && <div className="casino-dice">{diceShown.map((face, index) => <span key={index} className={busy ? "casino-die casino-die-rolling" : "casino-die"}>{DIE_FACES[face - 1]}</span>)}</div>}
          </div>

          {outcome && (
            <p className={`casino-outcome ${won ? "casino-win" : pushed ? "" : "casino-lose"}`} role="status">
              {outcome.result.game === "roulette" && `Landed on ${outcome.result.number} ${outcome.result.color}. `}
              {outcome.result.game === "dice" && `Rolled ${outcome.result.total}. `}
              {won ? `You won ${(outcome.payout - outcome.bet).toLocaleString()} Bread Bucks!` : pushed ? "You got your bet back." : outcome.payout > 0 ? `You got ${outcome.payout.toLocaleString()} back.` : `You lost ${outcome.bet.toLocaleString()} Bread Bucks.`}
            </p>
          )}

          {game === "roulette" && (
            <div className="casino-picks">
              {ROULETTE_PICKS.map((option) => <button key={option.id} type="button" aria-pressed={pick === option.id} onClick={() => setPick(option.id)} className={`casino-pick casino-pick-${option.id}`} disabled={busy}>{option.label}<small>{option.note}</small></button>)}
              <label className={`casino-pick ${pick === "number" ? "casino-pick-on" : ""}`}>
                <button type="button" onClick={() => setPick("number")} disabled={busy} className="casino-number-button">Number<small>36x</small></button>
                <input type="number" min={0} max={36} value={number} onChange={(event) => { setNumber(Math.max(0, Math.min(36, Math.floor(Number(event.target.value) || 0)))); setPick("number"); }} aria-label="Number to bet on" disabled={busy} />
              </label>
            </div>
          )}
          {game === "dice" && (
            <div className="casino-picks">
              {DICE_PICKS.map((option) => <button key={option.id} type="button" aria-pressed={pick === option.id} onClick={() => setPick(option.id)} className="casino-pick" disabled={busy}>{option.label}<small>{option.note}</small></button>)}
            </div>
          )}
          {game === "slots" && (
            <ul className="casino-paytable">
              {SLOT_SYMBOLS.map((symbol) => <li key={symbol.id}><img src={symbol.art} alt="" aria-hidden="true" />{symbol.label}: three pays {symbol.three}x, first two pays {symbol.two}x</li>)}
            </ul>
          )}

          <div className="casino-bet">
            <label>Bet
              <input type="number" min={1} max={CASINO_MAX_BET} value={bet} onChange={(event) => setBet(Math.max(0, Math.min(CASINO_MAX_BET, Math.floor(Number(event.target.value) || 0))))} disabled={busy} />
            </label>
            <div className="casino-quick">
              {quickBets.map((amount) => <button key={amount} type="button" onClick={() => setBet(amount)} disabled={busy}>{amount.toLocaleString()}</button>)}
              <button type="button" onClick={() => setBet(Math.max(1, Math.floor(bet / 2)))} disabled={busy}>½</button>
              <button type="button" onClick={() => setBet(Math.min(CASINO_MAX_BET, bet * 2))} disabled={busy}>2x</button>
              <button type="button" onClick={() => setBet(Math.max(1, Math.min(CASINO_MAX_BET, tokens)))} disabled={busy}>Max</button>
            </div>
            <button type="button" className="casino-play" onClick={() => void play()} disabled={busy || (game === "roulette" && !pick)}>{busy ? "Rolling..." : game === "slots" ? "Spin" : game === "dice" ? "Roll" : "Spin the wheel"}</button>
          </div>
          {error && <p className="casino-error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}
