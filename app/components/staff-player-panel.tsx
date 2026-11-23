"use client";

// Profile tools for ban moderators (mute / unmute, ban with an optional IP ban, kill) and the Kill
// button the admin also gets. The server (app/api/moderation) checks who's allowed.
import { useCallback, useEffect, useState } from "react";
import { Ban, MicOff, ShieldCheck, Skull } from "lucide-react";
import { createClient as createSupabaseClient } from "../../lib/supabase/client";

type Status = { isBanned: boolean; banReason: string | null; banExpiresAt: string | null; mutedUntil: string | null; protected: boolean };
const MUTES = [{ label: "30 min", minutes: 30 }, { label: "1 hour", minutes: 60 }, { label: "1 day", minutes: 1440 }, { label: "7 days", minutes: 10080 }];
const BANS = [{ label: "1 day", hours: 24 }, { label: "3 days", hours: 72 }, { label: "7 days", hours: 168 }, { label: "30 days", hours: 720 }, { label: "Forever", hours: 0 }];
const when = (value: string | null) => (value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

async function moderate(body: Record<string, unknown>) {
  const response = await fetch("/api/moderation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const json = response ? await response.json().catch(() => ({})) : {};
  return { ok: Boolean(response?.ok), message: String(json.message || json.error || "That didn't work.") };
}

// Tells the target's open page to check for the kill right away (it only shows the WASTED screen
// if the server really has a kill for them, so a faked message does nothing).
function pingKill(targetId: string) {
  const client = createSupabaseClient();
  if (!client) return;
  const channel = client.channel("breadlet-kills");
  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void channel.send({ type: "broadcast", event: "kill", payload: { targetId } }).finally(() => window.setTimeout(() => void client.removeChannel(channel), 500));
  });
}

export function KillButton({ target, onDone, disabled }: { target: { id: string; username: string }; onDone: (message: string) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="is-danger staff-kill" disabled={busy || disabled} title={`Show ${target.username} a WASTED screen and mute them for 30 seconds`}
      onClick={async () => {
        setBusy(true);
        const result = await moderate({ action: "kill", targetId: target.id });
        setBusy(false);
        if (result.ok) pingKill(target.id);
        onDone(result.message);
      }}>
      <Skull size={15} />Kill
    </button>
  );
}

export function StaffPlayerPanel({ target }: { target: { id: string; username: string } }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [banOpen, setBanOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);
  const [ipBan, setIpBan] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/moderation?targetId=${encodeURIComponent(target.id)}`, { cache: "no-store" }).catch(() => null);
    const json = await response?.json().catch(() => null);
    if (response?.ok) setStatus(json);
    else setNotice(json?.error || "Couldn't load this player.");
  }, [target.id]);
  useEffect(() => { setStatus(null); setNotice(""); setBanOpen(false); void load(); }, [load]);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    const result = await moderate({ ...body, targetId: target.id });
    setBusy(false);
    setNotice(result.message);
    if (result.ok) { setBanOpen(false); void load(); }
  };

  if (status?.protected) return null;
  return (
    <section className="admin-player-panel" aria-label="Moderation">
      <div className="admin-player-head">
        <ShieldCheck size={20} />
        <h2>Moderation</h2>
        {status && (
          <span className="admin-player-status">
            {status.isBanned ? <b className="is-bad">Banned{status.banExpiresAt ? ` until ${when(status.banExpiresAt)}` : " forever"}</b> : <b className="is-good">Not banned</b>}
            {status.mutedUntil && <b className="is-warn">Muted until {when(status.mutedUntil)}</b>}
          </span>
        )}
      </div>
      <div className="admin-player-actions">
        <span className="admin-player-group"><MicOff size={16} />Mute:{MUTES.map((item) => <button key={item.minutes} type="button" disabled={busy} onClick={() => void run({ action: "mute", minutes: item.minutes })}>{item.label}</button>)}{status?.mutedUntil && <button type="button" disabled={busy} onClick={() => void run({ action: "mute", minutes: 0 })}>Unmute</button>}</span>
        <span className="admin-player-group">
          {!status?.isBanned && <button type="button" disabled={busy} className="is-danger" onClick={() => setBanOpen((open) => !open)}><Ban size={15} />Ban</button>}
          <KillButton target={target} disabled={busy} onDone={(message) => { setNotice(message); void load(); }} />
        </span>
      </div>
      {banOpen && (
        <div className="admin-player-form">
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Reason (the player sees this)" />
          <div className="admin-player-choices">{BANS.map((item) => <button key={item.hours} type="button" aria-pressed={hours === item.hours} onClick={() => setHours(item.hours)}>{item.label}</button>)}</div>
          <label className="staff-ipban"><input type="checkbox" checked={ipBan} onChange={(event) => setIpBan(event.target.checked)} /> Also ban their IPs and devices for the whole ban</label>
          <button type="button" className="is-danger" disabled={busy || !reason.trim()} onClick={() => void run({ action: "ban", reason: reason.trim(), hours, ipBan })}>Ban {target.username}</button>
        </div>
      )}
      {notice && <p className="admin-player-notice" role="status">{notice}</p>}
    </section>
  );
}
