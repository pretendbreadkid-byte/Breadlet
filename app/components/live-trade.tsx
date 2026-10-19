"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleUserRound } from "lucide-react";
import { createClient as createSupabaseClient, fetchTradeApi } from "../../lib/supabase/client";
import { CustomEmoji, EmojiPicker, renderEmojiText } from "./emoji-picker";

type Offer = { tokens: number; blooks: { name: string; quantity: number }[] };
type LocalOffer = { tokens: number; blooks: Record<string, number> };

type LiveTradeProps = {
  player: { id?: string; username: string; equipped: string; tokens: number; inventory: string[] };
  isGuest: boolean;
  onlineProfileIds: string[];
  presenceReady: boolean;
  onlinePlayers: { id: string; username: string; equippedBlook: string }[];
  artFor: (name: string) => string;
  emojis: CustomEmoji[];
  canManageEmojis: boolean;
  reloadEmojis: () => void | Promise<void>;
  onPlayerRefresh: () => void | Promise<void>;
  notify: (message: string) => void;
};

const toLocal = (offer: Offer | undefined): LocalOffer => ({
  tokens: Math.max(0, Number(offer?.tokens) || 0),
  blooks: Object.fromEntries((offer?.blooks || []).map((item) => [item.name, item.quantity])),
});
const toOffer = (offer: LocalOffer): Offer => ({
  tokens: Math.max(0, Math.floor(offer.tokens) || 0),
  blooks: Object.entries(offer.blooks).filter(([, quantity]) => quantity > 0).map(([name, quantity]) => ({ name, quantity })),
});

export function LiveTrade(props: LiveTradeProps) {
  const { player, isGuest, onPlayerRefresh, notify } = props;
  const [trades, setTrades] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const knownRoom = useRef<string | null>(null);
  const roomActive = useRef(false);
  const supabase = useMemo(() => (isGuest ? null : createSupabaseClient()), [isGuest]);

  const load = useCallback(async () => {
    if (isGuest || !player.id) return;
    const response = await fetchTradeApi({ cache: "no-store" }).catch(() => null);
    if (!response || !response.ok) return;
    const list = await response.json().catch(() => null);
    if (!Array.isArray(list)) return;
    setTrades(list);
    const room = list.find((trade: any) => trade.status === "pending" && trade.room_open);
    roomActive.current = Boolean(room);
    if (room) {
      knownRoom.current = room.id;
    } else if (knownRoom.current) {
      const ended = list.find((trade: any) => trade.id === knownRoom.current);
      knownRoom.current = null;
      if (ended?.status === "completed") {
        notify("Trade complete! Your collection was updated.");
        void onPlayerRefresh();
      } else if (ended) {
        notify(`The trade was ${ended.status}.`);
      }
    }
  }, [isGuest, notify, onPlayerRefresh, player.id]);

  useEffect(() => {
    if (isGuest || !player.id) return;
    let stopped = false;
    let timer: number | undefined;
    const tick = async () => {
      await load();
      if (!stopped) timer = window.setTimeout(tick, roomActive.current ? 2000 : 6000);
    };
    void tick();
    const refresh = () => void load();
    window.addEventListener("breadlet:trades-refresh", refresh);
    const channel = supabase?.channel(`live-trades-${player.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trades", filter: `receiver_profile_id=eq.${player.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "trades", filter: `sender_profile_id=eq.${player.id}` }, refresh)
      .subscribe();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("breadlet:trades-refresh", refresh);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [isGuest, load, player.id, supabase]);

  const act = async (tradeId: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    const response = await fetchTradeApi({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeId, action, ...extra }),
    }).catch(() => null);
    setBusy(false);
    if (!response) {
      notify("Could not reach the trade server.");
      return null;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      notify(result.error || "Trade action failed.");
      await load();
      return null;
    }
    await load();
    return result;
  };

  if (isGuest || !player.id) return null;
  const pending = trades.filter((trade) => trade.status === "pending");
  const room = pending.find((trade) => trade.room_open);
  const incoming = room ? null : pending.find((trade) => !trade.room_open && trade.receiver_profile_id === player.id);
  const outgoing = room ? null : pending.find((trade) => !trade.room_open && trade.sender_profile_id === player.id);

  if (room) {
    return <TradeRoom key={room.id} trade={room} {...props} playerId={player.id} act={act} busy={busy} />;
  }
  if (incoming) {
    return (
      <div className="modal-layer fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
        <section role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-[#73c8ff] bg-[#18558f] p-6 text-center shadow-2xl">
          <p className="text-lg font-black text-[#bde8ff]">Trade request</p>
          <p className="mt-3 text-sm text-[#d9f3ff]"><b>{incoming.sender_username || "A player"}</b> wants to trade with you right now.</p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button disabled={busy} onClick={() => void act(incoming.id, "decline")} className="rounded-xl bg-red-600 px-4 py-3 font-black text-white disabled:opacity-50">Decline</button>
            <button disabled={busy} onClick={() => void act(incoming.id, "accept")} className="rounded-xl bg-green-600 px-4 py-3 font-black text-white disabled:opacity-50">Accept</button>
          </div>
        </section>
      </div>
    );
  }
  if (outgoing) {
    return (
      <div className="fixed bottom-5 right-5 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-[#73c8ff] bg-[#18558f] p-4 text-white shadow-2xl" role="status">
        <p className="text-sm font-bold">Waiting for <b>{outgoing.receiver_username || "the player"}</b> to accept your trade request...</p>
        <button disabled={busy} onClick={() => void act(outgoing.id, "cancel")} className="mt-3 w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50">Cancel request</button>
      </div>
    );
  }
  return null;
}

function TradeRoom({ trade, playerId, player, onlineProfileIds, presenceReady, onlinePlayers, artFor, emojis, canManageEmojis, reloadEmojis, act, busy }: LiveTradeProps & {
  trade: any;
  playerId: string;
  act: (tradeId: string, action: string, extra?: Record<string, unknown>) => Promise<any>;
  busy: boolean;
}) {
  const isSender = trade.sender_profile_id === playerId;
  const otherId: string = isSender ? trade.receiver_profile_id : trade.sender_profile_id;
  const otherName: string = (isSender ? trade.receiver_username : trade.sender_username) || "Player";
  const serverMine: Offer = isSender ? trade.sender_offer_json : trade.receiver_offer_json;
  const serverTheirs: Offer = isSender ? trade.receiver_offer_json : trade.sender_offer_json;
  const myConfirmed = Boolean(isSender ? trade.sender_confirmed : trade.receiver_confirmed);
  const theirConfirmed = Boolean(isSender ? trade.receiver_confirmed : trade.sender_confirmed);
  const otherOffline = presenceReady && !onlineProfileIds.includes(otherId);
  const otherEquipped = onlinePlayers.find((entry) => entry.id === otherId)?.equippedBlook || "";

  const [offer, setOffer] = useState<LocalOffer>(() => toLocal(serverMine));
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [draft, setDraft] = useState("");
  const [chatError, setChatError] = useState("");
  const offerRef = useRef(offer);
  const dirtyRef = useRef(false);
  const serverMineRef = useRef(serverMine);
  serverMineRef.current = serverMine;
  const versionRef = useRef(0);
  const saveTimer = useRef<number | undefined>(undefined);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const serverMineKey = JSON.stringify(toLocal(serverMine));

  useEffect(() => {
    if (!dirtyRef.current) {
      const next = toLocal(serverMine);
      offerRef.current = next;
      setOffer(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMineKey]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const save = useCallback(async () => {
    const version = versionRef.current;
    const response = await fetchTradeApi({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "offer", tradeId: trade.id, offer: toOffer(offerRef.current) }),
    }).catch(() => null);
    if (!response || !response.ok) {
      const result = await response?.json().catch(() => ({}));
      setChatError(result?.error || "Could not update your offer.");
      dirtyRef.current = false;
      setDirty(false);
      const restored = toLocal(serverMineRef.current);
      offerRef.current = restored;
      setOffer(restored);
      window.dispatchEvent(new Event("breadlet:trades-refresh"));
      return;
    }
    setChatError("");
    if (versionRef.current === version) {
      dirtyRef.current = false;
      setDirty(false);
    }
    window.dispatchEvent(new Event("breadlet:trades-refresh"));
  }, [trade.id]);

  const change = (next: LocalOffer) => {
    offerRef.current = next;
    setOffer(next);
    dirtyRef.current = true;
    setDirty(true);
    versionRef.current += 1;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), 350);
  };

  const owned = useMemo(() => {
    const counts = new Map<string, number>();
    player.inventory.forEach((name) => counts.set(name, (counts.get(name) || 0) + 1));
    return counts;
  }, [player.inventory]);

  const addBlook = (name: string) => {
    const used = offer.blooks[name] || 0;
    if (used >= (owned.get(name) || 0) || used >= 100) return;
    if (Object.keys(offer.blooks).length >= 20 && !used) return;
    change({ ...offer, blooks: { ...offer.blooks, [name]: used + 1 } });
  };
  const removeBlook = (name: string) => {
    const used = (offer.blooks[name] || 1) - 1;
    const blooks = { ...offer.blooks };
    if (used > 0) blooks[name] = used;
    else delete blooks[name];
    change({ ...offer, blooks });
  };

  useEffect(() => {
    let stopped = false;
    const loadMessages = async () => {
      const response = await fetch(`/api/trades/messages?tradeId=${encodeURIComponent(trade.id)}`, { cache: "no-store" }).catch(() => null);
      if (!response || !response.ok || stopped) return;
      const rows = await response.json().catch(() => null);
      if (Array.isArray(rows)) setMessages(rows);
    };
    void loadMessages();
    const timer = window.setInterval(loadMessages, 2000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [trade.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setDraft("");
    const response = await fetch("/api/trades/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeId: trade.id, message }),
    }).catch(() => null);
    const body = await response?.json().catch(() => ({}));
    if (!response || !response.ok) {
      setChatError(body?.error || "Could not send your message.");
      return;
    }
    setChatError("");
    setMessages((current) => (current.some((item) => item.id === body.id) ? current : [...current, body]));
  };

  const accept = async () => {
    window.clearTimeout(saveTimer.current);
    await act(trade.id, "confirm", { seen: { sender: trade.sender_offer_json, receiver: trade.receiver_offer_json } });
  };
  const decline = () => void act(trade.id, isSender ? "cancel" : "decline");

  const emptyTrade = !serverMine?.tokens && !(serverMine?.blooks || []).length && !serverTheirs?.tokens && !(serverTheirs?.blooks || []).length;
  const visibleInventory = Array.from(owned.entries())
    .filter(([name]) => name.toLowerCase().includes(search.trim().toLowerCase()))
    .map(([name, count]) => ({ name, left: count - (offer.blooks[name] || 0) }))
    .filter((entry) => entry.left > 0);

  const avatar = (name: string, large = true) => (
    <div className={`${large ? "h-28 w-28 sm:h-36 sm:w-36" : "h-12 w-12"} shrink-0 overflow-hidden rounded-2xl border-2 border-[#3d91cd] bg-[#103f75]`}>
      {name ? <img src={artFor(name)} alt={name} className="h-full w-full object-contain" /> : <CircleUserRound className="h-full w-full p-4 text-[#9cc8e8]" />}
    </div>
  );
  const slots = (items: { name: string; quantity: number }[], editable: boolean) => (
    <div className="grid grid-cols-4 gap-2 rounded-2xl bg-[#072a54] p-2">
      {Array.from({ length: Math.max(8, items.length + (items.length % 4 ? 4 - (items.length % 4) : 0)) }).map((_, index) => {
        const item = items[index];
        return item ? (
          <button key={item.name} type="button" disabled={!editable} onClick={() => removeBlook(item.name)} title={editable ? `Remove one ${item.name}` : item.name} className="relative flex aspect-square items-center justify-center rounded-xl bg-[#103f75] p-1 enabled:hover:bg-[#18558f]">
            <img src={artFor(item.name)} alt={item.name} className="max-h-full max-w-full object-contain" />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-[#39a8f5] px-1.5 text-[10px] font-black text-white">{item.quantity}</span>
          </button>
        ) : <div key={`empty-${index}`} className="aspect-square rounded-xl bg-[#0c3b70]/60" />;
      })}
    </div>
  );

  return (
    <div className="modal-layer fixed inset-0 z-[9998] flex flex-col overflow-y-auto bg-[#061f3d] text-white">
      <header className="flex items-center justify-between border-b border-[#3d91cd]/30 bg-[#072a54] px-4 py-3">
        <h2 className="text-xl font-black">Trading with {otherName}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${otherOffline ? "bg-red-600" : "bg-green-600"}`}>{otherOffline ? "Offline" : "Online"}</span>
      </header>
      {otherOffline && <p role="alert" className="bg-red-700 px-4 py-2 text-center text-sm font-bold">{otherName} left. Both players must be online to trade, so you can only decline for now.</p>}
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="space-y-3">
          <div className="flex items-center gap-3">{avatar(player.equipped)}<div><p className="text-xl font-black">{player.username}</p><p className="text-xs text-[#9cc8e8]">You</p></div></div>
          <label className="flex items-center gap-2 rounded-xl bg-[#072a54] px-3 py-2 text-sm font-bold"><img src="/assets/coin.svg" alt="" className="h-6 w-6" />
            <input type="number" min={0} max={player.tokens} value={offer.tokens || ""} placeholder="0" aria-label="Tokens to offer" onChange={(event) => change({ ...offer, tokens: Math.max(0, Math.min(player.tokens, Math.floor(Number(event.target.value) || 0))) })} className="w-full bg-transparent text-white outline-none" />
            <span className="whitespace-nowrap text-xs text-[#9cc8e8]">of {player.tokens.toLocaleString()}</span></label>
          {slots(toOffer(offer).blooks, true)}
          <p className={`text-xs font-bold ${myConfirmed ? "text-green-300" : "text-[#9cc8e8]"}`}>{myConfirmed ? "You accepted" : "Not accepted yet"}</p>
        </section>
        <section className="flex min-h-[18rem] flex-col rounded-2xl bg-[#0c3b70] p-3">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your Breadlets" className="w-full rounded-lg bg-[#072a54] px-3 py-2 text-center text-sm font-bold text-white outline-none placeholder:text-[#9cc8e8]" />
          <div className="mt-3 grid flex-1 grid-cols-4 content-start gap-2 overflow-y-auto sm:grid-cols-5 lg:max-h-[22rem]">
            {visibleInventory.map(({ name, left }) => (
              <button key={name} type="button" onClick={() => addBlook(name)} title={`${name} (${left} left)`} className="relative flex aspect-square items-center justify-center rounded-xl bg-[#103f75] p-1 hover:bg-[#18558f]">
                <img src={artFor(name)} alt={name} className="max-h-full max-w-full object-contain" />
                {left > 1 && <span className="absolute -bottom-1 -right-1 rounded-full bg-[#39a8f5] px-1.5 text-[10px] font-black text-white">{left}</span>}
              </button>
            ))}
            {!visibleInventory.length && <p className="col-span-full py-6 text-center text-sm text-[#9cc8e8]">Nothing left to add.</p>}
          </div>
        </section>
        <section className="space-y-3">
          <div className="flex flex-row-reverse items-center gap-3 text-right">{avatar(otherEquipped)}<div><p className="text-xl font-black">{otherName}</p><p className="text-xs text-[#9cc8e8]">Their offer</p></div></div>
          <div className="flex items-center justify-end gap-2 rounded-xl bg-[#072a54] px-3 py-2 text-sm font-bold"><span>{Number(serverTheirs?.tokens || 0).toLocaleString()}</span><img src="/assets/coin.svg" alt="" className="h-6 w-6" /></div>
          {slots(serverTheirs?.blooks || [], false)}
          <p className={`text-right text-xs font-bold ${theirConfirmed ? "text-green-300" : "text-[#9cc8e8]"}`}>{theirConfirmed ? `${otherName} accepted` : "Not accepted yet"}</p>
        </section>
      </div>
      <div className="px-4">
        <div className="max-h-44 min-h-24 space-y-2 overflow-y-auto rounded-t-xl bg-[#072a54] p-3">
          {messages.map((item) => (
            <div key={item.id} className="text-sm"><b className={item.profile_id === playerId ? "text-[#73c8ff]" : "text-[#ffd166]"}>{item.username || (item.profile_id === playerId ? player.username : otherName)}</b><p className="whitespace-pre-wrap break-words text-[#d9f3ff]">{renderEmojiText(item.message, emojis)}</p></div>
          ))}
          {!messages.length && <p className="text-sm text-[#9cc8e8]">Say hello and agree on a fair trade.</p>}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={sendMessage} className="flex items-center gap-2 rounded-b-xl bg-[#103f75] p-2">
          <input value={draft} maxLength={1000} onChange={(event) => setDraft(event.target.value)} placeholder="Message" className="min-w-0 flex-1 rounded-lg bg-[#072a54] px-3 py-3 text-white outline-none placeholder:text-[#9cc8e8]" />
          <EmojiPicker emojis={emojis} canManage={canManageEmojis} onPick={(text) => setDraft((current) => `${current}${text}`.slice(0, 1000))} onChanged={reloadEmojis} align="right" />
        </form>
        {chatError && <p role="alert" className="mt-2 text-sm font-bold text-orange-200">{chatError}</p>}
      </div>
      <div className="space-y-2 p-4">
        <button type="button" disabled={busy || dirty || myConfirmed || otherOffline || emptyTrade} onClick={() => void accept()} className="w-full rounded-lg bg-green-600 px-4 py-3 text-lg font-black text-white shadow disabled:opacity-50">{myConfirmed ? `Waiting for ${otherName}...` : dirty ? "Saving offer..." : emptyTrade ? "Add something to trade" : "Accept"}</button>
        <button type="button" disabled={busy} onClick={decline} className="w-full rounded-lg bg-red-600 px-4 py-3 text-lg font-black text-white shadow disabled:opacity-50">Decline</button>
      </div>
    </div>
  );
}
