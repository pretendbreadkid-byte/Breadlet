"use client";

// Admin panel: device and network (IP) bans left by banned players. Lifting one lets others on
// that device or Wi-Fi play again without unbanning the player (see /api/admin/network-bans).
import { useCallback, useEffect, useState } from "react";

type NetworkBan = { profileId: string; username: string; stillBanned: boolean; devices: number; networks: number; expiresAt: string | null; createdAt: string };

export function NetworkBansPanel() {
  const [bans, setBans] = useState<NetworkBan[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/network-bans", { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    setBans(Array.isArray(data) ? data : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const lift = async (ban: NetworkBan | null) => {
    if (!window.confirm(ban ? `Lift the device and network bans from ${ban.username}? ${ban.stillBanned ? "Their account stays banned." : ""}` : "Lift every device and network ban? Banned accounts stay banned.")) return;
    setBusy(true);
    const response = await fetch("/api/admin/network-bans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ban ? { profileId: ban.profileId } : { all: true }) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setStatus("Could not lift those network bans.");
    setStatus(ban ? `Lifted ${ban.username}'s device and network bans.` : "Lifted every device and network ban.");
    void load();
  };

  const ends = (ban: NetworkBan) => (ban.expiresAt ? `until ${new Date(ban.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "permanent");

  return (
    <div className="mt-6 border-t border-[#ef8b9d]/30 pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-black text-[#ffd6df]">Banned networks ({bans?.length ?? 0})</h3>
        {Boolean(bans?.length) && <button type="button" disabled={busy} onClick={() => void lift(null)} className="rounded-lg bg-emerald-300 px-3 py-1.5 text-xs font-black text-emerald-950 disabled:opacity-50">Lift all</button>}
      </div>
      <p className="mt-1 text-xs text-[#f2b9c7]">A ban also blocks the devices and Wi-Fi the player used. Lift them so other people there can play again. The player stays banned.</p>
      {status && <p className="mt-2 text-xs font-bold text-emerald-200" role="status">{status}</p>}
      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
        {bans === null && <p className="text-sm text-[#f2b9c7]">Loading...</p>}
        {bans?.map((ban) => (
          <div key={ban.profileId} className="flex items-center gap-3 rounded-xl bg-[#351c3a] p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-black">{ban.username}{!ban.stillBanned && <span className="ml-2 text-xs text-emerald-300">(unbanned)</span>}</p>
              <p className="truncate text-xs text-[#f2b9c7]">{ban.devices} device{ban.devices === 1 ? "" : "s"} · {ban.networks} network{ban.networks === 1 ? "" : "s"} · {ends(ban)}</p>
            </div>
            <button type="button" disabled={busy} onClick={() => void lift(ban)} className="rounded-lg bg-emerald-300 px-3 py-2 text-xs font-black text-emerald-950 disabled:opacity-50">Lift</button>
          </div>
        ))}
        {bans?.length === 0 && <p className="text-sm text-[#f2b9c7]">No networks are banned.</p>}
      </div>
    </div>
  );
}
