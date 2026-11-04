"use client";

// Emoji reactions on chat messages and news posts: a button that opens the emoji choices, and the
// counts under the message. Other players' reactions show up live through a Realtime broadcast ping.
import { useCallback, useEffect, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { REACTION_EMOJIS, isReactionTarget } from "../../lib/reactions";
import type { ReactionCounts, ReactionType } from "../../lib/reactions";
import { createClient } from "../../lib/supabase/client";

export function useReactions(type: ReactionType, ids: string[]) {
  const [reactions, setReactions] = useState<Record<string, ReactionCounts>>({});
  const key = ids.filter(isReactionTarget).slice(-100).join(",");

  const load = useCallback(async () => {
    if (!key) return;
    const response = await fetch(`/api/reactions?type=${type}&ids=${key}`, { cache: "no-store" }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (data?.reactions) setReactions(data.reactions);
  }, [type, key]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { void load(); }, [load]);

  // Only listens while something is showing (the news panel is closed most of the time).
  const active = Boolean(key);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof createClient>>["channel"]> | null>(null);
  useEffect(() => {
    const client = active ? createClient() : null;
    if (!client) return;
    let timer: number | undefined;
    const channel = client.channel(`reactions-${type}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "changed" }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void loadRef.current(), 400);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      window.clearTimeout(timer);
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [type, active]);

  // Returns an error message, or "" when it worked.
  const toggle = useCallback(async (id: string, emoji: string) => {
    setReactions((current) => {
      const old = current[id]?.[emoji] || { count: 0, mine: false };
      const next = { count: old.count + (old.mine ? -1 : 1), mine: !old.mine };
      return { ...current, [id]: { ...current[id], [emoji]: next } };
    });
    const response = await fetch("/api/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, emoji }),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response?.ok) {
      void loadRef.current();
      return data?.error || "Could not react to that.";
    }
    setReactions((current) => ({ ...current, [id]: data.counts || {} }));
    void channelRef.current?.send({ type: "broadcast", event: "changed", payload: { id } });
    return "";
  }, [type]);

  return { reactions, toggle };
}

export function ReactionButton({ onPick, className, size = 16 }: { onPick: (emoji: string) => void; className?: string; size?: number }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [anchor]);

  // Fixed to the screen so a scrolling chat list can't cut it off. Above the button, or below it
  // near the top of the screen.
  const width = REACTION_EMOJIS.length * 38 + 12;
  const style = anchor && {
    top: anchor.top > 64 ? anchor.top - 52 : anchor.bottom + 6,
    left: Math.max(8, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - 8)),
  };
  return (
    <>
      <button type="button" aria-label="Add reaction" title="Add reaction" aria-expanded={Boolean(anchor)} className={className} onClick={(event) => setAnchor(anchor ? null : event.currentTarget.getBoundingClientRect())}>
        <SmilePlus size={size} />
      </button>
      {style && <div className="reaction-backdrop" onClick={() => setAnchor(null)} />}
      {style && (
        <div className="reaction-picker" role="menu" aria-label="Reactions" style={style}>
          {REACTION_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" role="menuitem" onClick={() => { onPick(emoji); setAnchor(null); }}>{emoji}</button>
          ))}
        </div>
      )}
    </>
  );
}

export function ReactionChips({ counts, onToggle, disabled }: { counts?: ReactionCounts; onToggle: (emoji: string) => void; disabled?: boolean }) {
  const used = REACTION_EMOJIS.filter((emoji) => (counts?.[emoji]?.count || 0) > 0);
  if (!used.length) return null;
  return (
    <div className="reaction-chips">
      {used.map((emoji) => {
        const { count, mine } = counts![emoji];
        return (
          <button key={emoji} type="button" disabled={disabled} aria-pressed={mine} onClick={() => onToggle(emoji)}
            title={mine ? "Take back your reaction" : "React with this too"} className={`reaction-chip${mine ? " reaction-chip-mine" : ""}`}>
            <span>{emoji}</span><b>{count}</b>
          </button>
        );
      })}
    </div>
  );
}
