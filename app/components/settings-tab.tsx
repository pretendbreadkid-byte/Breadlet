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

export function SettingsTab({ username, onLogout, isGuest }: { username: string; onLogout: () => void; isGuest: boolean }) {
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
      <nav className="rounded-2xl bg-[#13120F] p-3" aria-label="Settings sections">
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
      <section className="rounded-2xl bg-[#13120F] p-6 text-white">
        <h2 className="mb-5 text-4xl font-black">{section}</h2>
        {section === "Account" && (
          <>
            <p className="mb-5 text-[#c9c7c0]">Who you are in Breadlet.</p>
            <p className="text-xs text-[#c9c7c0]">Username</p>
            <p className="mb-4 text-xl font-black">{username}</p>
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
