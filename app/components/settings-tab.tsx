"use client";

import { useEffect, useState } from "react";

export type Settings = {
  incomingTrades: boolean;
  tradeOffers: boolean;
  friendRequests: boolean;
  chatMentions: boolean;
  chatNotifications: boolean;
  popups: boolean;
  sounds: boolean;
};

export const defaultSettings: Settings = {
  incomingTrades: true,
  tradeOffers: true,
  friendRequests: true,
  chatMentions: true,
  chatNotifications: true,
  popups: true,
  sounds: true,
};

const storageKey = "breadlet-settings";
const changeEvent = "breadlet-settings-changed";

export function readSettings(): Settings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    return { ...defaultSettings, ...JSON.parse(window.localStorage.getItem(storageKey) || "{}") };
  } catch {
    return defaultSettings;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  useEffect(() => {
    const sync = () => setSettings(readSettings());
    sync();
    window.addEventListener(changeEvent, sync);
    return () => window.removeEventListener(changeEvent, sync);
  }, []);
  const update = (patch: Partial<Settings>) => {
    window.localStorage.setItem(storageKey, JSON.stringify({ ...readSettings(), ...patch }));
    window.dispatchEvent(new Event(changeEvent));
  };
  return { settings, update };
}

const sections = ["Account", "Chat", "Trading & Social", "Account Management"] as const;

type Row = { key: keyof Settings; title: string; description: string };

const chatRows: Row[] = [
  { key: "chatNotifications", title: "Chat notifications", description: "Get notified about new messages in chat." },
  { key: "chatMentions", title: "Chat mentions", description: "You'll get a notification when someone @mentions you in chat." },
];

const socialRows: Row[] = [
  { key: "incomingTrades", title: "Incoming trades", description: "Other players can send you trade requests and live trade invites." },
  { key: "tradeOffers", title: "Trade offer notifications", description: "Get notified when a trade offer is updated or completed." },
  { key: "friendRequests", title: "Friend requests", description: "Other players can send you friend requests." },
  { key: "popups", title: "Pop-up notifications", description: "Breadlet shows a pop-up in the corner when something happens." },
  { key: "sounds", title: "Notification sounds", description: "A short chime plays with each pop-up notification." },
];

const inputClass = "w-full max-w-sm rounded-xl border border-[#3c3a34] bg-[#27251F] px-4 py-2 text-white outline-none focus:border-[#e9bd67]";
const saveClass = "rounded-xl border border-[#e9bd67] bg-[#27251F] px-4 py-2 text-sm font-black text-[#e9bd67] disabled:opacity-50";

async function changeAccount(body: Record<string, string>) {
  try {
    const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, message: "" } : { ok: false, message: result.error || "That change didn't save." };
  } catch {
    return { ok: false, message: "Could not reach the server." };
  }
}

function AccountForms({ username, onRenamed }: { username: string; onRenamed: () => void }) {
  const [newName, setNewName] = useState("");
  const [nameNote, setNameNote] = useState({ ok: false, message: "" });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [passwordNote, setPasswordNote] = useState({ ok: false, message: "" });
  const [busy, setBusy] = useState(false);

  const rename = async () => {
    setBusy(true);
    const result = await changeAccount({ action: "username", username: newName.trim() });
    setBusy(false);
    setNameNote(result.ok ? { ok: true, message: "Username changed! You can change it again in 7 days." } : result);
    if (result.ok) { setNewName(""); onRenamed(); }
  };
  const changePassword = async () => {
    if (passwords.next !== passwords.confirm) return setPasswordNote({ ok: false, message: "The new passwords don't match." });
    setBusy(true);
    const result = await changeAccount({ action: "password", currentPassword: passwords.current, newPassword: passwords.next });
    setBusy(false);
    setPasswordNote(result.ok ? { ok: true, message: "Password changed! Use it next time you log in." } : result);
    if (result.ok) setPasswords({ current: "", next: "", confirm: "" });
  };
  const note = (value: { ok: boolean; message: string }) => value.message && <p role="status" className={`mt-2 text-sm font-bold ${value.ok ? "text-[#9be38f]" : "text-red-300"}`}>{value.message}</p>;

  return (
    <>
      <div className="mb-8">
        <h3 className="text-2xl font-black text-white">Change username</h3>
        <p className="mb-2 text-sm text-[#c9c7c0]">3-20 letters, numbers or underscores. You can change it once every 7 days, and you'll log in with the new name.</p>
        <div className="flex flex-wrap gap-2">
          <input value={newName} maxLength={20} onChange={(event) => setNewName(event.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} placeholder={username} aria-label="New username" className={inputClass} />
          <button type="button" disabled={busy || newName.trim().length < 3} onClick={() => void rename()} className={saveClass}>Save</button>
        </div>
        {note(nameNote)}
      </div>
      <div>
        <h3 className="text-2xl font-black text-white">Change password</h3>
        <p className="mb-2 text-sm text-[#c9c7c0]">At least 4 characters.</p>
        <div className="grid gap-2">
          <input type="password" autoComplete="current-password" value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} placeholder="Current password" aria-label="Current password" className={inputClass} />
          <input type="password" autoComplete="new-password" value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} placeholder="New password" aria-label="New password" className={inputClass} />
          <input type="password" autoComplete="new-password" value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} placeholder="Confirm new password" aria-label="Confirm new password" className={inputClass} />
          <div><button type="button" disabled={busy || !passwords.current || passwords.next.length < 4} onClick={() => void changePassword()} className={saveClass}>Change password</button></div>
        </div>
        {note(passwordNote)}
      </div>
    </>
  );
}

export function SettingsTab({ username, onLogout, isGuest, onRenamed }: { username: string; onLogout: () => void; isGuest: boolean; onRenamed: () => void }) {
  const { settings, update } = useSettings();
  const [section, setSection] = useState<(typeof sections)[number]>("Account");

  const renderRows = (rows: Row[]) => rows.map((row) => (
    <div key={row.key} className="mb-6">
      <h3 className="text-2xl font-black text-white">{row.title}</h3>
      <p className="mb-2 text-sm text-[#c9c7c0]">{row.description}</p>
      <button
        type="button"
        onClick={() => update({ [row.key]: !settings[row.key] } as Partial<Settings>)}
        className={`rounded-xl border px-4 py-2 text-sm font-black ${settings[row.key] ? "border-[#e9bd67] bg-[#27251F] text-[#e9bd67]" : "border-[#3c3a34] bg-[#13120F] text-white/70"}`}
      >
        {settings[row.key] ? "On — click to turn off" : "Off — click to turn on"}
      </button>
    </div>
  ));

  return (
    <div className="settings-workspace mx-auto grid w-full max-w-5xl gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
      <nav className="ui-panel rounded-2xl bg-[#13120F] p-3" aria-label="Settings sections">
        {sections.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setSection(name)}
            className={`mb-1 block w-full rounded-xl px-4 py-3 text-left font-black ${section === name ? "bg-[#27251F] text-[#e9bd67]" : "text-white/80 hover:bg-[#1b1a17]"}`}
          >
            {name}
          </button>
        ))}
      </nav>
      <section className="ui-panel rounded-2xl bg-[#13120F] p-6 text-white">
        <h2 className="page-sign mb-5 text-4xl font-black">{section}</h2>
        {section === "Account" && (
          <>
            <p className="mb-5 text-[#c9c7c0]">Who you are in Breadlet.</p>
            <p className="text-xs text-[#c9c7c0]">Username</p>
            <p className="mb-6 text-xl font-black">{username}</p>
            {!isGuest && <AccountForms username={username} onRenamed={onRenamed} />}
          </>
        )}
        {section === "Chat" && renderRows(chatRows)}
        {section === "Trading & Social" && renderRows(socialRows)}
        {section === "Account Management" && (
          <>
            <p className="mb-5 text-[#c9c7c0]">Manage your session on this device.</p>
            <button type="button" onClick={onLogout} className="rounded-xl border border-red-400/50 bg-[#27251F] px-4 py-2 font-black text-red-200">{isGuest ? "End guest session" : "Log out"}</button>
          </>
        )}
      </section>
    </div>
  );
}
