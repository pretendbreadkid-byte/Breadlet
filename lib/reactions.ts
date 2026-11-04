// Emoji reactions on chat messages and news posts (migration 0078).

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🍞", "🎉"];

export type ReactionType = "chat" | "news";
// Per emoji: how many players reacted with it, and whether you did.
export type ReactionCounts = Record<string, { count: number; mine: boolean }>;

export const isReactionType = (value: unknown): value is ReactionType => value === "chat" || value === "news";
export const isReactionTarget = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
