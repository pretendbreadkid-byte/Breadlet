"use client";

// Games tab: the Breadlet Casino. A plain page with the slot machine; the Chip Shop and the Cashier
// (where you buy chips) open from buttons in the corner.
import { useEffect, useState } from "react";
import { Coins, ShoppingBag, X } from "lucide-react";
import { CasinoStation, STATION_NAMES, type Station } from "./casino-games";

export function GamesTab({ tokens, onBalance }: { tokens: number; onBalance: (tokens: number) => void }) {
  const [chips, setChips] = useState(0);
  const [chipError, setChipError] = useState("");
  const [open, setOpen] = useState<Station | null>(null);

  useEffect(() => {
    void fetch("/api/casino").then(async (response) => {
      const data = await response.json().catch(() => null);
      if (response.ok && typeof data?.chips === "number") setChips(data.chips);
      else if (data?.error) setChipError(data.error);
    }).catch(() => setChipError("Couldn't load your chips. Try again."));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="casino-page flex flex-col gap-3">
      <div className="casino-floor-top">
        <h1>Breadlet Casino</h1>
        <p className="casino-balance"><img src="/assets/Bread%20bucks.svg" alt="" aria-hidden="true" />{tokens.toLocaleString()}</p>
        <div className="casino-corner-buttons">
          <button type="button" className="casino-play" onClick={() => setOpen("cashier")}><Coins size={18} aria-hidden="true" />Buy chips</button>
          <button type="button" className="casino-play" onClick={() => setOpen("shop")}><ShoppingBag size={18} aria-hidden="true" />Chip Shop</button>
        </div>
      </div>
      {chipError && <p className="casino-error" role="alert">{chipError}</p>}

      <section className="casino-station-card casino-slots-page" aria-label="Slot machine">
        <header><h2>{STATION_NAMES.slots}</h2></header>
        <CasinoStation station="slots" tokens={tokens} chips={chips} setChips={setChips} onBalance={onBalance} />
      </section>

      {open && (
        <div className="modal-layer casino-station-layer fixed inset-0 flex items-center justify-center bg-black/70 px-3" onClick={() => setOpen(null)}>
          <div className="casino-station-card" role="dialog" aria-modal="true" aria-label={STATION_NAMES[open]} onClick={(event) => event.stopPropagation()}>
            <header>
              <h2>{STATION_NAMES[open]}</h2>
              <button type="button" onClick={() => setOpen(null)} aria-label="Close"><X size={24} strokeWidth={3} /></button>
            </header>
            <CasinoStation key={open} station={open} tokens={tokens} chips={chips} setChips={setChips} onBalance={onBalance} />
          </div>
        </div>
      )}
    </div>
  );
}
