"use client";

// Admin tools on another player's profile: mute, ban / unban, delete, and their history
// (Bread Bucks, trades, Bazaar, bans, chat and alts). Only rendered for admins; the server checks too.
import { useCallback, useEffect, useState } from "react";
import { Ban, History, KeyRound, MicOff, ShieldCheck, Trash2 } from "lucide-react";

type Offer = { tokens: number; blooks: { name: string; quantity: number }[] };
type HistoryData = {
  profile: { id: string; username: string; tokens: number; createdAt: string; isBanned: boolean; banReason: string | null; banExpiresAt: string | null; chatMutedUntil: string | null; recoveryUntil: string | null };
  money: { id: string; type: string; delta: number; reason: string | null; created_at: string }[];
  trades: { id: string; status: string; at: string; with: string; gave: Offer; got: Offer }[];
  listings: { id: string; name: string; quantity: number; price: number; status: string; created_at: string; sold_at: string | null; shiny: boolean }[];
  bans: { id: string; reason: string; is_permanent: boolean; started_at: string; expires_at: string | null }[];
  chat: { id: string; message: string; created_at: string; deleted_at: string | null }[];
  alts: { id: string; username: string; is_banned: boolean }[];
  devices: number;
};
type Section = "money" | "trades" | "bazaar" | "bans" | "chat" | "alts";

const when = (value: string | null) => (value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
const offerText = (offer: Offer) => [
  ...(offer.tokens ? [`${offer.tokens.toLocaleString()} Bread Bucks`] : []),
  ...offer.blooks.map((item) => `${item.quantity > 1 ? `${item.quantity}x ` : ""}${item.name}`),
].join(", ") || "nothing";
const MUTES = [{ label: "30 min", minutes: 30 }, { label: "1 hour", minutes: 60 }, { label: "1 day", minutes: 1440 }, { label: "7 days", minutes: 10080 }];
const BANS = [{ label: "1 day", hours: 24 }, { label: "3 days", hours: 72 }, { label: "7 days", hours: 168 }, { label: "30 days", hours: 720 }, { label: "Forever", hours: 0 }];

export function AdminPlayerPanel({ target, openPlayerProfile }: { target: { id: string; username: string }; openPlayerProfile: (username: string) => void | Promise<void> }) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [section, setSection] = useState<Section | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banHours, setBanHours] = useState(24);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/history?targetId=${encodeURIComponent(target.id)}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => null);
    if (response?.ok && json?.profile) setData(json);
    else setNotice(json?.error || "Could not load this player's history.");
  }, [target.id]);
  useEffect(() => { setData(null); setSection(null); setNotice(""); setDeleted(false); void load(); }, [load]);

  const act = async (init: RequestInit, url = "/api/admin") => {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { setNotice(json.error || "That didn't work."); return null; }
      return json;
    } finally {
      setBusy(false);
    }
  };
  const mute = async (minutes: number, label: string) => {
    if (await act({ method: "POST", body: JSON.stringify({ action: "mute", targetId: target.id, minutes }) })) {
      setNotice(minutes ? `${target.username} is muted for ${label}.` : `${target.username} is unmuted.`);
      void load();
    }
  };
  const ban = async () => {
    if (!banReason.trim()) { setNotice("Give a reason for the ban."); return; }
    const result = await act({ method: "POST", body: JSON.stringify({ action: "ban", targetId: target.id, reason: banReason.trim(), permanent: banHours === 0, durationHours: banHours }) });
    if (result) {
      setNotice(`${target.username} is banned${banHours ? "" : " forever"}. ${result.devices || 0} device(s) and ${result.ips || 0} IP(s) blocked too.`);
      setBanOpen(false);
      setBanReason("");
      void load();
    }
  };
  const unban = async () => {
    if (await act({ method: "POST", body: JSON.stringify({ action: "unban", targetId: target.id }) })) {
      setNotice(`${target.username} is unbanned.`);
      void load();
    }
  };
  const recovery = async (allow: boolean) => {
    const result = await act({ method: "POST", body: JSON.stringify({ action: "recovery", targetId: target.id, allow }) });
    if (!result) return;
    setNotice(allow
      ? `For the next 30 minutes, the device that last logged into ${target.username} (${when(result.lastSeenAt)}) can set a new password. Tell them: on that device, go to the login screen, tap "Forgot password?", then "An admin gave me access".`
      : "Recovery access taken back.");
    void load();
  };
  const setPassword = async () => {
    if (newPassword.length < 4) { setNotice("The new password needs at least 4 characters."); return; }
    if (await act({ method: "POST", body: JSON.stringify({ action: "setPassword", targetId: target.id, password: newPassword }) })) {
      setNotice(`${target.username}'s password is now "${newPassword}". Tell them, and ask them to change it after they log in.`);
      setNewPassword("");
      setPasswordOpen(false);
      void load();
    }
  };
  const remove = async () => {
    if (deleteName !== target.username) { setNotice(`Type ${target.username} exactly to delete the account.`); return; }
    if (await act({ method: "DELETE" }, `/api/admin?targetId=${encodeURIComponent(target.id)}`)) {
      setDeleted(true);
      setDeleteOpen(false);
      setNotice(`${target.username}'s account was deleted.`);
    }
  };

  const profile = data?.profile;
  const mutedUntil = profile?.chatMutedUntil && new Date(profile.chatMutedUntil).getTime() > Date.now() ? profile.chatMutedUntil : null;
  const tabs: { id: Section; label: string; count: number }[] = data ? [
    { id: "money", label: "Bread Bucks", count: data.money.length },
    { id: "trades", label: "Trades", count: data.trades.length },
    { id: "bazaar", label: "Bazaar", count: data.listings.length },
    { id: "bans", label: "Bans", count: data.bans.length },
    { id: "chat", label: "Chat", count: data.chat.length },
    { id: "alts", label: "Alts", count: data.alts.length },
  ] : [];

  return (
    <section className="admin-player-panel" aria-label="Admin tools">
      <div className="admin-player-head">
        <ShieldCheck size={20} />
        <h2>Moderation</h2>
        {profile && (
          <span className="admin-player-status">
            {profile.isBanned ? <b className="is-bad">Banned{profile.banExpiresAt ? ` until ${when(profile.banExpiresAt)}` : " forever"}</b> : <b className="is-good">Not banned</b>}
            {mutedUntil && <b className="is-warn">Muted until {when(mutedUntil)}</b>}
            {profile.recoveryUntil && <b className="is-warn">Recovery open until {when(profile.recoveryUntil)}</b>}
            <span>{data!.devices} device{data!.devices === 1 ? "" : "s"}</span>
          </span>
        )}
      </div>
      {profile?.isBanned && profile.banReason && <p className="admin-player-note">Ban reason: {profile.banReason}</p>}

      {deleted ? null : (
        <div className="admin-player-actions">
          <span className="admin-player-group"><MicOff size={16} />Mute:{MUTES.map((item) => <button key={item.minutes} type="button" disabled={busy} onClick={() => void mute(item.minutes, item.label)}>{item.label}</button>)}{mutedUntil && <button type="button" disabled={busy} onClick={() => void mute(0, "")}>Unmute</button>}</span>
          <span className="admin-player-group">
            {profile?.isBanned
              ? <button type="button" disabled={busy} onClick={() => void unban()}><Ban size={15} />Unban</button>
              : <button type="button" disabled={busy} className="is-danger" onClick={() => { setBanOpen((open) => !open); setDeleteOpen(false); }}><Ban size={15} />Ban</button>}
            {profile?.recoveryUntil
              ? <button type="button" disabled={busy} onClick={() => void recovery(false)}><KeyRound size={15} />Cancel recovery</button>
              : null}
            <button type="button" disabled={busy} onClick={() => { setPasswordOpen((open) => !open); setBanOpen(false); setDeleteOpen(false); }} title="Choose a new password for this player, then tell them it"><KeyRound size={15} />Set new password</button>
            <button type="button" disabled={busy} className="is-danger" onClick={() => { setDeleteOpen((open) => !open); setBanOpen(false); setPasswordOpen(false); }}><Trash2 size={15} />Delete account</button>
          </span>
        </div>
      )}

      {banOpen && (
        <div className="admin-player-form">
          <input value={banReason} onChange={(event) => setBanReason(event.target.value)} maxLength={500} placeholder="Reason (the player sees this)" />
          <div className="admin-player-choices">{BANS.map((item) => <button key={item.hours} type="button" aria-pressed={banHours === item.hours} onClick={() => setBanHours(item.hours)}>{item.label}</button>)}</div>
          <p>Their devices are blocked for the whole ban and their IPs for up to 7 days.</p>
          <button type="button" className="is-danger" disabled={busy} onClick={() => void ban()}>Ban {target.username}</button>
        </div>
      )}
      {passwordOpen && (
        <div className="admin-player-form">
          <p>Type a new password for {target.username}. It works right away; tell them what it is.</p>
          <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} maxLength={72} placeholder="New password" autoComplete="off"
            onKeyDown={(event) => { if (event.key === "Enter") void setPassword(); }} />
          <button type="button" disabled={busy || newPassword.length < 4} onClick={() => void setPassword()}>Save password</button>
        </div>
      )}
      {deleteOpen && (
        <div className="admin-player-form">
          <p>This deletes {target.username}&apos;s account and everything in it. It can&apos;t be undone. Type <b>{target.username}</b> to confirm.</p>
          <input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={target.username} />
          <button type="button" className="is-danger" disabled={busy || deleteName !== target.username} onClick={() => void remove()}>Delete forever</button>
        </div>
      )}
      {notice && <p className="admin-player-notice" role="status">{notice}</p>}

      {data && !deleted && (
        <>
          <div className="admin-player-tabs"><History size={16} />{tabs.map((tab) => <button key={tab.id} type="button" aria-pressed={section === tab.id} onClick={() => setSection((open) => (open === tab.id ? null : tab.id))}>{tab.label} ({tab.count})</button>)}</div>
          {section && (
            <div className="admin-player-log">
              {section === "money" && (data.money.length ? data.money.map((row) => <div key={row.id}><span>{when(row.created_at)}</span><b className={row.delta >= 0 ? "is-good" : "is-bad"}>{row.delta >= 0 ? "+" : ""}{row.delta.toLocaleString()}</b><span>{row.reason || row.type}</span></div>) : <p>No Bread Bucks history.</p>)}
              {section === "trades" && (data.trades.length ? data.trades.map((row) => <div key={row.id}><span>{when(row.at)}</span><b>{row.status}</b><span>with <button type="button" onClick={() => void openPlayerProfile(row.with)}>{row.with}</button>: gave {offerText(row.gave)}; got {offerText(row.got)}</span></div>) : <p>No trades.</p>)}
              {section === "bazaar" && (data.listings.length ? data.listings.map((row) => <div key={row.id}><span>{when(row.sold_at || row.created_at)}</span><b>{row.status}</b><span>{row.quantity > 1 ? `${row.quantity}x ` : ""}{row.shiny ? "Shiny " : ""}{row.name} for {row.price.toLocaleString()}</span></div>) : <p>No Bazaar listings.</p>)}
              {section === "bans" && (data.bans.length ? data.bans.map((row) => <div key={row.id}><span>{when(row.started_at)}</span><b>{row.is_permanent ? "forever" : `until ${when(row.expires_at)}`}</b><span>{row.reason}</span></div>) : <p>Never banned.</p>)}
              {section === "chat" && (data.chat.length ? data.chat.map((row) => <div key={row.id}><span>{when(row.created_at)}</span><b>{row.deleted_at ? "deleted" : ""}</b><span>{row.message.startsWith("[img]") ? "📷 Image" : row.message}</span></div>) : <p>No chat messages.</p>)}
              {section === "alts" && (data.alts.length ? data.alts.map((row) => <div key={row.id}><span>Same device</span><b className={row.is_banned ? "is-bad" : ""}>{row.is_banned ? "banned" : ""}</b><span><button type="button" onClick={() => void openPlayerProfile(row.username)}>{row.username}</button></span></div>) : <p>No other accounts on their devices.</p>)}
            </div>
          )}
        </>
      )}
    </section>
  );
}
