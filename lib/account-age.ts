// Brand-new accounts can't trade or use the Bazaar for their first day. Alts are mostly made to
// farm free Bread Bucks and pass them to a main account, so this makes that pointless without
// blocking anyone who just shares a school network.
export const NEW_ACCOUNT_HOURS = 24;

export async function tooNewAccount(admin: any, profileIds: string[]): Promise<{ id: string; username: string } | null> {
  const { data } = await admin.from('profiles').select('id, username, created_at').in('id', profileIds);
  const cutoff = Date.now() - NEW_ACCOUNT_HOURS * 60 * 60 * 1000;
  const young = (data || []).find((profile: any) => new Date(profile.created_at).getTime() > cutoff);
  return young ? { id: young.id, username: young.username } : null;
}

export const NEW_ACCOUNT_MESSAGE = `New accounts can trade and use the Bazaar ${NEW_ACCOUNT_HOURS} hours after signing up.`;
