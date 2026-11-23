"use client";

// The Bazaar's Auctions tab (app/api/marketplace/auctions, migration 0114): put a Breadlet up for
// auction and bid on other players' Breadlets. Bids come out of your balance straight away and
// come back if someone outbids you.
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Gavel, Timer } from "lucide-react";

type Auction = {
  id: string; blook: string; rarity: string; seller: string; mineSelling: boolean;
  startBid: number; topBid: number | null; topBidder: string | null; mineWinning: boolean;
  bids: number; endsAt: string; status: string; minBid: number;
};

const HOURS = [1, 6, 12, 24, 48];

function timeLeft(endsAt: string, now: number) {
  const ms = Date.parse(endsAt) - now;
  if (ms <= 0) return "Ending…";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return `${Math.ceil(ms / 1000)}s`;
  if (minutes < 60) return `${minutes}m ${Math.floor((ms % 60000) / 1000)}s`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function BazaarAuctions({ ownedBlooks, tokens, onChanged, BlookArt, search }: {
  ownedBlooks: string[];
  tokens: number;
  onChanged: () => void;
  BlookArt: ComponentType<{ name: string; className: string }>;
  search: string;
}) {
  const [open, setOpen] = useState<Auction[]>([]);
  const [ended, setEnded] = useState<Auction[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [formOpen, setFormOpen] = useState(false);
  const [blook, setBlook] = useState("");
  const [startBid, setStartBid] = useState("100");
  const [hours, setHours] = useState(24);
  const [bidding, setBidding] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/marketplace/auctions", { cache: "no-store" }).catch(() => null);
    const data = response ? await response.json().catch(() => null) : null;
    if (!response?.ok) { setError(data?.error || "Could not load auctions."); return; }
    setError("");
    setOpen(data.open || []);
    setEnded(data.ended || []);
  }, []);
  useEffect(() => {
    void load();
    const poll = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [load]);
  useEffect(() => { if (!blook && ownedBlooks.length) setBlook(ownedBlooks[0]); }, [blook, ownedBlooks]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/marketplace/auctions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    setNotice(data.message || data.error || (response?.ok ? "Done." : "That didn't work."));
    if (response?.ok) { onChanged(); void load(); }
    return Boolean(response?.ok);
  };

  const query = search.trim().toLowerCase();
  const shown = open.filter((auction) => (!query || auction.blook.toLowerCase().includes(query)) && (!onlyMine || auction.mineSelling || auction.mineWinning));

  return (
    <section className="auction-area" aria-label="Auctions">
      <div className="auction-bar">
        <button type="button" className="bazaar-list-button" onClick={() => setFormOpen((value) => !value)}><Gavel size={16} />Start an auction</button>
        <button type="button" className="auction-filter" aria-pressed={onlyMine} onClick={() => setOnlyMine((value) => !value)}>My auctions & bids</button>
      </div>
      {formOpen && (
        <form className="bazaar-list-form auction-form" onSubmit={(event) => { event.preventDefault(); void post({ action: "create", blook, startBid: Number(startBid), hours }).then((ok) => { if (ok) setFormOpen(false); }); }}>
          <select value={blook} onChange={(event) => setBlook(event.target.value)} aria-label="Breadlet to auction" className="bazaar-filter-control">
            {ownedBlooks.map((name) => <option key={name}>{name}</option>)}
          </select>
          <input value={startBid} onChange={(event) => setStartBid(event.target.value)} type="number" min="1" step="1" className="bazaar-filter-control" placeholder="Starting bid" aria-label="Starting bid" />
          <select value={hours} onChange={(event) => setHours(Number(event.target.value))} aria-label="How long" className="bazaar-filter-control">
            {HOURS.map((value) => <option key={value} value={value}>{value} hour{value === 1 ? "" : "s"}</option>)}
          </select>
          <button className="bazaar-buy-button px-6" disabled={busy || !blook}>Start auction</button>
          <p className="auction-form-note">The Breadlet is held until the auction ends. The winner pays their bid and you get it minus the 10% Bazaar fee. With no bids it comes back to you.</p>
        </form>
      )}
      {notice && <p className="auction-notice" role="status">{notice}</p>}
      {error ? <p className="bazaar-empty mt-6 rounded-2xl border p-8 text-center">{error}</p> : shown.length ? (
        <div className="auction-grid">
          {shown.map((auction) => {
            const soon = Date.parse(auction.endsAt) - now < 5 * 60000;
            return (
              <article key={auction.id} className={`auction-card${auction.mineWinning ? " is-winning" : ""}${auction.mineSelling ? " is-mine" : ""}`}>
                <span className="auction-rarity">{auction.rarity}</span>
                <span className={`auction-time${soon ? " is-soon" : ""}`}><Timer size={14} />{timeLeft(auction.endsAt, now)}</span>
                <div className="auction-art"><BlookArt name={auction.blook} className="h-full w-full" /></div>
                <b className="auction-name">{auction.blook}</b>
                <span className="auction-seller">by {auction.seller}</span>
                <div className="auction-price">
                  <small>{auction.topBid == null ? "Starting bid" : `Top bid · ${auction.bids} bid${auction.bids === 1 ? "" : "s"}`}</small>
                  <span><img src="/assets/Bread%20bucks.svg" alt="" />{(auction.topBid ?? auction.startBid).toLocaleString()}</span>
                  {auction.topBidder && <small>{auction.mineWinning ? "You're winning!" : `by ${auction.topBidder}`}</small>}
                </div>
                {auction.mineSelling ? (
                  auction.topBid == null
                    ? <button type="button" className="auction-button is-quiet" disabled={busy} onClick={() => void post({ action: "cancel", auctionId: auction.id })}>Take down</button>
                    : <span className="auction-own">Your auction</span>
                ) : bidding === auction.id ? (
                  <form className="auction-bid" onSubmit={(event) => { event.preventDefault(); void post({ action: "bid", auctionId: auction.id, amount: Number(bidAmount) }).then((ok) => { if (ok) setBidding(null); }); }}>
                    <input value={bidAmount} onChange={(event) => setBidAmount(event.target.value)} type="number" min={auction.minBid} step="1" aria-label="Your bid" autoFocus />
                    <button className="auction-button" disabled={busy || Number(bidAmount) < auction.minBid}>Bid</button>
                  </form>
                ) : (
                  <button type="button" className="auction-button" disabled={busy || tokens < auction.minBid && !auction.mineWinning} onClick={() => { setBidding(auction.id); setBidAmount(String(auction.minBid)); }}>
                    Bid {auction.minBid.toLocaleString()}+
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="bazaar-empty mt-6 rounded-2xl border p-8 text-center">{onlyMine ? "You have no auctions or bids running." : "No auctions right now. Start one!"}</p>
      )}
      {onlyMine && ended.length > 0 && (
        <div className="auction-ended">
          <h3>Ended</h3>
          {ended.map((auction) => (
            <p key={auction.id}><b>{auction.blook}</b>: {auction.status === "sold" ? `sold to ${auction.topBidder} for ${auction.topBid?.toLocaleString()}` : auction.status === "cancelled" ? "taken down" : "no bids, returned"}</p>
          ))}
        </div>
      )}
    </section>
  );
}
