// Bread Bucks milestone badges stack (10K, 100K, 1M), but only the highest one is shown.
const TOKEN_BADGES = ['1M Tokens', '100K Tokens', '10K Tokens'];

export function onlyTopTokenBadge(badges: string[]): string[] {
  const top = TOKEN_BADGES.find((badge) => badges.includes(badge));
  return badges.filter((badge) => !TOKEN_BADGES.includes(badge) || badge === top);
}

// What other players see: nothing if the player hid their badges (stats.hideBadges).
export function publicBadges(badges: string[], stats: any): string[] {
  return stats?.hideBadges === true ? [] : onlyTopTokenBadge(badges);
}
