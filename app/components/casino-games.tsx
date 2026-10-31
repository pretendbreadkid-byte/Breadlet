"use client";

// Games tab: the Breadlet Casino. Buy chips at the Cashier, bet them on roulette, slots or dice, and
// spend them in the Chip Shop. The server (/api/casino) rolls the result and moves the balances;
// this only animates it.
import { useEffect, useRef, useState } from "react";
import { CASINO_MAX_BET, RED_NUMBERS, SLOT_SYMBOLS, type CasinoGame, type CasinoResult } from "../../lib/casino";

const GAMES: { id: CasinoGame; name: string; blurb: string; art: string; suit: string; suitColor: string }[] = [
  { id: "roulette", name: "Roulette", blurb: "Red, black, odd, even, or one lucky number for 36x.", art: "🎡", suit: "♥", suitColor: "red" },
  { id: "slots", name: "Slots", blurb: "Line up three Breadlets. Three Bread Bucks pays 150x.", art: "🎰", suit: "♠", suitColor: "black" },
  { id: "dice", name: "Dice", blurb: "Roll two dice: low, high, or a seven for 5x.", art: "🎲", suit: "♦", suitColor: "red" },
];

const VIEWS = [
  { id: "tables", label: "Tables" },
  { id: "cashier", label: "Cashier" },
  { id: "shop", label: "Chip Shop" },
] as const;
type View = (typeof VIEWS)[number]["id"];

// Placeholders until the real prizes are picked.
const SHOP_ITEMS = [
  { name: "Mystery Breadlet", kind: "Breadlet", art: "🥖" },
  { name: "Mystery Badge", kind: "Badge", art: "🏅" },
  { name: "New Currency", kind: "Currency", art: "💎" },
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
const BULBS = Array.from({ length: 22 });
const numberColor = (n: number) => (n === 0 ? "green" : RED_NUMBERS.includes(n) ? "red" : "black");
const slotArt = (id: string) => SLOT_SYMBOLS.find((symbol) => symbol.id === id)?.art || "";
const randomOf = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

export function GamesTab({ tokens, onBalance }: { tokens: number; onBalance: (tokens: number) => void }) {
  const [view, setView] = useState<View>("tables");
  const [chips, setChips] = useState(0);
  const [game, setGame] = useState<CasinoGame | null>(null);
  const [bet, setBet] = useState(100);
  const [pick, setPick] = useState("red");
  const [number, setNumber] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<{ result: CasinoResult; bet: number; payout: number } | null>(null);
  const [exchangeAmount, setExchangeAmount] = useState(1000);
  const [exchanged, setExchanged] = useState(0);
  // What the animation is showing right now.
  const [rouletteShown, setRouletteShown] = useState(0);
  const [reelsShown, setReelsShown] = useState<string[]>(["bread", "acorn", "leaf"]);
  const [diceShown, setDiceShown] = useState<[number, number]>([1, 6]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((timer) => window.clearInterval(timer)), []);
  useEffect(() => {
    void fetch("/api/casino").then(async (response) => {
      const data = await response.json().catch(() => null);
      if (response.ok && typeof data?.chips === "number") setChips(data.chips);
      else if (data?.error) setError(data.error);
    }).catch(() => setError("Couldn't load your chips. Try again."));
  }, []);

  const openView = (next: View) => {
    setView(next);
    setError("");
    setExchanged(0);
  };

  const choose = (next: CasinoGame) => {
    setGame(next);
    setOutcome(null);
    setError("");
    setPick(next === "dice" ? "low" : next === "roulette" ? "red" : "");
  };

  const exchange = async () => {
    if (busy) return;
    const amount = Math.floor(exchangeAmount);
    if (!(amount >= 1)) return setError("Enter at least 1 Bread Buck.");
    if (amount > tokens) return setError("You don't have enough Bread Bucks for that.");
    setBusy(true);
    setError("");
    setExchanged(0);
    const response = await fetch("/api/casino", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "exchange", amount }) }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) return setError(data?.error || "That didn't go through. Try again.");
    setChips(data.chips);
    setExchanged(amount);
    onBalance(data.tokens);
  };

  const play = async () => {
    if (!game || busy) return;
    const wager = Math.floor(bet);
    if (!(wager >= 1)) return setError("Enter a bet of at least 1 chip.");
    if (wager > chips) return setError("You don't have enough chips for that bet. Visit the Cashier.");
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
    setChips(data.chips);
    setBusy(false);
  };

  const quickBets = [10, 100, 1000, 10000];
  const quickExchanges = [1000, 10000, 100000];
  const won = outcome && outcome.payout > outcome.bet;
  const pushed = outcome && outcome.payout === outcome.bet;

  return (
    <div className="casino-page mx-auto w-full max-w-4xl">
      <header className="casino-sign">
        <div className="casino-bulbs" aria-hidden="true">{BULBS.map((_, index) => <span key={index} />)}</div>
        <p className="casino-suits" aria-hidden="true">♠ ♥ ♦ ♣</p>
        <h1>Breadlet Casino</h1>
        <p className="casino-tagline">Only you can see this tab while it&apos;s being tested.</p>
        <div className="casino-bulbs" aria-hidden="true">{BULBS.map((_, index) => <span key={index} />)}</div>
      </header>

      <div className="casino-wallet">
        <p className="casino-balance"><img src="/assets/Bread%20bucks.svg" alt="" aria-hidden="true" />{tokens.toLocaleString()} Bread Bucks</p>
        <p className="casino-balance casino-balance-chips"><img src="/assets/casino-chip.svg" alt="" aria-hidden="true" />{chips.toLocaleString()} Chips</p>
      </div>

      <nav className="casino-tabs" aria-label="Casino">
        {VIEWS.map((entry) => <button key={entry.id} type="button" aria-pressed={view === entry.id} onClick={() => openView(entry.id)} disabled={busy}>{entry.label}</button>)}
      </nav>

      {view === "tables" && (
        <>
          {chips < 1 && (
            <div className="casino-notice">
              <span>You need chips to play.</span>
              <button type="button" onClick={() => openView("cashier")}>Go to the Cashier</button>
            </div>
          )}
          <div className="casino-picker">
            {GAMES.map((entry) => (
              <button key={entry.id} type="button" onClick={() => choose(entry.id)} aria-pressed={game === entry.id} className="casino-game-card" disabled={busy}>
                <i className="casino-card-suit" data-color={entry.suitColor} aria-hidden="true">{entry.suit}</i>
                <span className="casino-game-art" aria-hidden="true">{entry.art}</span>
                <b>{entry.name}</b>
                <span>{entry.blurb}</span>
                <i className="casino-card-suit casino-card-suit-end" data-color={entry.suitColor} aria-hidden="true">{entry.suit}</i>
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
                  {won ? `You won ${(outcome.payout - outcome.bet).toLocaleString()} chips!` : pushed ? "You got your bet back." : outcome.payout > 0 ? `You got ${outcome.payout.toLocaleString()} back.` : `You lost ${outcome.bet.toLocaleString()} chips.`}
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
                  <button type="button" onClick={() => setBet(Math.max(1, Math.min(CASINO_MAX_BET, chips)))} disabled={busy}>Max</button>
                </div>
                <button type="button" className="casino-play" onClick={() => void play()} disabled={busy || (game === "roulette" && !pick)}>{busy ? "Rolling..." : game === "slots" ? "Spin" : game === "dice" ? "Roll" : "Spin the wheel"}</button>
              </div>
            </section>
          )}
        </>
      )}

      {view === "cashier" && (
        <section className="casino-table casino-cashier" aria-label="Cashier">
          <h2>Cashier</h2>
          <p>1 Bread Buck buys 1 chip. Chips stay in the casino: bet them at the tables or spend them in the Chip Shop. They can&apos;t be turned back into Bread Bucks.</p>
          <div className="casino-bet">
            <label>Bread Bucks
              <input type="number" min={1} max={tokens} value={exchangeAmount} onChange={(event) => setExchangeAmount(Math.max(0, Math.floor(Number(event.target.value) || 0)))} disabled={busy} />
            </label>
            <div className="casino-quick">
              {quickExchanges.map((amount) => <button key={amount} type="button" onClick={() => setExchangeAmount(amount)} disabled={busy}>{amount.toLocaleString()}</button>)}
              <button type="button" onClick={() => setExchangeAmount(tokens)} disabled={busy}>All</button>
            </div>
            <button type="button" className="casino-play" onClick={() => void exchange()} disabled={busy}>{busy ? "Counting..." : `Buy ${Math.floor(exchangeAmount).toLocaleString()} chips`}</button>
          </div>
          {exchanged > 0 && <p className="casino-outcome casino-win" role="status">Here are your {exchanged.toLocaleString()} chips. Good luck!</p>}
        </section>
      )}

      {view === "shop" && (
        <section className="casino-table casino-shop" aria-label="Chip Shop">
          <h2>Chip Shop</h2>
          <p>Trade your chips for prizes. The real prizes are coming soon.</p>
          <ul className="casino-shop-grid">
            {SHOP_ITEMS.map((item) => (
              <li key={item.name} className="casino-shop-item">
                <span className="casino-shop-kind">{item.kind}</span>
                <span className="casino-game-art" aria-hidden="true">{item.art}</span>
                <b>{item.name}</b>
                <span className="casino-shop-price"><img src="/assets/casino-chip.svg" alt="" aria-hidden="true" />??? Chips</span>
                <button type="button" disabled>Coming soon</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="casino-error" role="alert">{error}</p>}
    </div>
  );
}
