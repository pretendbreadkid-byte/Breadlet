"use client";

import { useEffect, useState } from "react";

const RELOADS_KEY = "breadlet-update-reloads";

// Shown when the app crashes: a friendly card that reloads by itself instead of a blank screen.
// It doesn't claim maintenance; update downtime is detected by the script in layout.tsx. Shares the reload
// log with the recovery script in layout.tsx, and stops auto-reloading after a few tries so a
// real bug can't trap players in a reload loop.
export function UpdateScreen() {
  const [autoReload, setAutoReload] = useState(true);
  useEffect(() => {
    const now = Date.now();
    let log: number[] = [];
    try { log = (JSON.parse(window.sessionStorage.getItem(RELOADS_KEY) || "[]") as number[]).filter((time) => now - time < 120000); } catch {}
    if (log.length >= 4) return setAutoReload(false);
    try { window.sessionStorage.setItem(RELOADS_KEY, JSON.stringify([...log, now])); } catch {}
    const timer = window.setTimeout(() => window.location.reload(), 5000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div role="status" style={{ position: "fixed", inset: 0, zIndex: 2147483646, display: "flex", alignItems: "center", justifyContent: "center", background: "#E77D22", padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 360, width: "100%", border: "4px solid #13120F", borderRadius: 22, background: "#27251F", padding: 28, textAlign: "center", color: "#fff", boxShadow: "0 8px 0 #13120F" }}>
        <div style={{ fontSize: 52, lineHeight: 1 }}>🍞</div>
        <h1 style={{ margin: "12px 0 6px", fontSize: 24, fontWeight: 900 }}>Oops, Breadlet hit a snag</h1>
        <p style={{ margin: 0, fontSize: 15, opacity: 0.85 }}>{autoReload ? "Something went wrong on this page. Reloading in a few seconds." : "It keeps happening. Give it a minute, then reload."}</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 18, width: "100%", border: 0, borderRadius: 14, background: "#ED7117", padding: 12, fontSize: 16, fontWeight: 900, color: "#fff", cursor: "pointer" }}>Reload now</button>
      </div>
    </div>
  );
}
