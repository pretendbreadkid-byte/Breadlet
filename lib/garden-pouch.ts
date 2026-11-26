// Adds seeds to a player's garden seed pouch (their breadlet_fields row, see app/api/fields).
// Used for the bonus seeds from Goodybags. Only touches state.seeds and saves only if nobody else
// saved in between (rev), trying again a few times. Returns false if it couldn't save.
export async function addSeedsToPouch(database: any, profileId: string, seeds: Record<string, number>) {
  const entries = Object.entries(seeds).filter(([, amount]) => amount > 0);
  if (!entries.length) return true;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await database.from('breadlet_fields').select('state, rev').eq('profile_id', profileId).maybeSingle();
    if (error) return false;
    const state = data?.state && typeof data.state === 'object' ? { ...data.state } : {};
    const pouch: Record<string, number> = { ...(state.seeds && typeof state.seeds === 'object' ? state.seeds : {}) };
    for (const [name, amount] of entries) pouch[name] = Math.max(0, Math.floor(Number(pouch[name]) || 0)) + amount;
    state.seeds = pouch;
    if (!data) {
      const { error: insertError } = await database.from('breadlet_fields').insert({ profile_id: profileId, state, rev: 1 });
      if (!insertError) return true;
      continue;
    }
    const rev = Number(data.rev);
    const { data: saved, error: saveError } = await database.from('breadlet_fields')
      .update({ state, rev: rev + 1, updated_at: new Date().toISOString() })
      .eq('profile_id', profileId).eq('rev', rev).select('profile_id');
    if (!saveError && saved?.length) return true;
  }
  return false;
}
