"use client";

import { useEffect, useState } from "react";

// Full-screen "Breadlet is loading" screen, used on first load and when the game is lagging.
export function BreadletLoadingScreen({ overlay = false }: { overlay?: boolean }) {
  return (
    <div className={`breadlet-loading${overlay ? " breadlet-loading-overlay" : ""}`} role="status" aria-live="polite">
      <img src="/assets/breadlet-logo.svg" alt="" className="breadlet-loading-logo" />
      <p className="breadlet-loading-title">Breadlet is loading</p>
      <span className="breadlet-loading-dots" aria-hidden="true"><span /><span /><span /></span>
    </div>
  );
}

// Darkens the screen with the loading screen when a non-background request is slow (over 1.2s).
const BACKGROUND = ["/api/chat", "/api/games", "/api/online", "/api/notifications", "/api/trades"];

export function NetworkIndicator() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const original = window.fetch;
    let pending = 0;
    let timer: number | undefined;
    const done = () => {
      pending = Math.max(0, pending - 1);
      if (pending === 0) {
        if (timer) window.clearTimeout(timer);
        timer = undefined;
        setSlow(false);
      }
    };
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (BACKGROUND.some((path) => url.includes(path)) || !url.includes("/api/")) return original(input, init);
      pending += 1;
      if (!timer) timer = window.setTimeout(() => setSlow(true), 1200);
      return original(input, init).finally(done);
    };
    return () => {
      window.fetch = original;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (!slow) return null;
  return <BreadletLoadingScreen overlay />;
}
