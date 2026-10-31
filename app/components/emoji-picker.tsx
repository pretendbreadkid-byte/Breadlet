"use client";

import { ChangeEvent, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Smile, Trash2, Upload } from "lucide-react";
import { shrinkImage } from "../../lib/shrink-image";

export type CustomEmoji = { id: string; name: string; image: string };

const standardEmojis = [
  "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍", "🥰", "😘", "😋",
  "😛", "😜", "🤪", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😢", "😭", "😤", "😠", "😡", "🤬",
  "😱", "😨", "😰", "😥", "🤔", "🤫", "🤭", "🙄", "😬", "😴", "🤤", "🤢", "🤮", "🥵", "🥶", "🤯",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "👀", "👋", "🤝", "✌️", "🤞", "👌", "🔥", "✨", "⭐", "💯",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "🎉", "🎁", "🍞", "🥖", "🥐", "🥯", "🥨", "🧈",
  "🍪", "🎂", "🍩", "💰", "🪙", "💎", "👑", "🏆", "🎮", "🚀", "🌈", "☀️", "🌙", "⚡", "💀", "👻",
];

export function useCustomEmojis(enabled: boolean) {
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [canManage, setCanManage] = useState(false);
  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch("/api/emojis", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setEmojis(Array.isArray(data.emojis) ? data.emojis : []);
      setCanManage(Boolean(data.canManage));
    } catch {
      // Chat still works without custom emojis.
    }
  }, [enabled]);
  useEffect(() => { void reload(); }, [reload]);
  return { emojis, canManage, reload };
}

export function renderEmojiText(text: string, emojis: CustomEmoji[]): ReactNode {
  if (!emojis.length || !text.includes(":")) return text;
  const byName = new Map(emojis.map((emoji) => [emoji.name, emoji]));
  const parts: ReactNode[] = [];
  let last = 0;
  const pattern = /:([a-z0-9_]{2,40}):/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const emoji = byName.get(match[1]);
    if (!emoji) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(<img key={`${match.index}-${emoji.id}`} src={emoji.image} alt={`:${emoji.name}:`} title={`:${emoji.name}:`} className="inline-block h-7 w-7 align-middle object-contain" />);
    last = match.index + match[0].length;
  }
  if (!parts.length) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function EmojiPicker({ emojis, canManage, onPick, onChanged, align = "left" }: {
  emojis: CustomEmoji[];
  canManage: boolean;
  onPick: (text: string) => void;
  onChanged: () => void | Promise<void>;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"custom" | "standard">("custom");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|gif|jpeg|webp)$/.test(file.type)) {
      setError("Upload a PNG, GIF, JPEG, or WebP image.");
      return;
    }
    const suggested = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24);
    const name = window.prompt("Name this emoji (letters, numbers, underscores). Use it as :name:", suggested.length >= 2 ? suggested : "emoji");
    if (!name) return;
    setBusy(true);
    setError("");
    const image = await shrinkImage(file, { maxLength: 400000, maxSide: 256 }).catch((problem: Error) => {
      setError(problem.message);
      return "";
    });
    if (!image) return setBusy(false);
    const response = await fetch("/api/emojis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, image }),
    }).catch(() => null);
    setBusy(false);
    if (!response || !response.ok) {
      const result = await response?.json().catch(() => ({}));
      setError(result?.error || "Could not upload that emoji.");
      return;
    }
    await onChanged();
  };

  const remove = async (emoji: CustomEmoji) => {
    if (!window.confirm(`Remove :${emoji.name}: for everyone?`)) return;
    const response = await fetch(`/api/emojis?id=${encodeURIComponent(emoji.id)}`, { method: "DELETE" }).catch(() => null);
    if (!response || !response.ok) {
      setError("Could not remove that emoji.");
      return;
    }
    await onChanged();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-label="Open emoji picker" aria-expanded={open} title="Emojis" className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#3d91cd] bg-[#103f75] text-[#bde8ff] shadow-inner transition hover:bg-[#18558f]">
        <Smile size={26} />
      </button>
      {open && (
        <div role="dialog" aria-label="Emoji picker" className={`absolute bottom-14 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#3d91cd] bg-[#0c3b70] p-3 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#072a54] p-1">
            {(["custom", "standard"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setTab(value)} aria-pressed={tab === value} className={`rounded-lg px-3 py-2 text-sm font-black ${tab === value ? "bg-[#39a8f5] text-white" : "text-[#9cc8e8] hover:bg-[#103f75]"}`}>
                {value === "custom" ? "Custom" : "Standard"}
              </button>
            ))}
          </div>
          <div className="mt-3 grid max-h-64 grid-cols-6 gap-2 overflow-y-auto pr-1">
            {tab === "custom" ? emojis.map((emoji) => (
              <div key={emoji.id} className="group relative">
                <button type="button" onClick={() => { onPick(`:${emoji.name}:`); setOpen(false); }} title={`:${emoji.name}:`} className="flex h-12 w-full items-center justify-center rounded-xl bg-[#103f75] p-1 hover:bg-[#18558f]">
                  <img src={emoji.image} alt={emoji.name} className="max-h-full max-w-full object-contain" />
                </button>
                {canManage && (
                  <button type="button" onClick={() => void remove(emoji)} aria-label={`Remove ${emoji.name}`} className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"><Trash2 size={11} /></button>
                )}
              </div>
            )) : standardEmojis.map((emoji) => (
              <button key={emoji} type="button" onClick={() => { onPick(emoji); setOpen(false); }} className="flex h-12 items-center justify-center rounded-xl bg-[#103f75] text-2xl hover:bg-[#18558f]">{emoji}</button>
            ))}
            {tab === "custom" && !emojis.length && <p className="col-span-6 py-6 text-center text-sm text-[#9cc8e8]">No custom emojis yet.</p>}
          </div>
          {tab === "custom" && canManage && (
            <div className="mt-3 border-t border-[#3d91cd]/30 pt-3">
              <input ref={fileRef} type="file" accept="image/png,image/gif,image/jpeg,image/webp" onChange={upload} className="hidden" />
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#39a8f5] px-3 py-2 text-sm font-black text-white disabled:opacity-50"><Upload size={16} />{busy ? "Uploading..." : "Upload image or GIF"}</button>
            </div>
          )}
          {error && <p role="alert" className="mt-2 text-xs font-bold text-orange-200">{error}</p>}
        </div>
      )}
    </div>
  );
}
