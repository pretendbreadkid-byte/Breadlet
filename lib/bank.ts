// Bread Bucks spent by players flow into the shared bank (the breadblook account balance).
export async function depositBankSpend(admin: any, userId: string, spent: number) {
  if (!admin || !Number.isFinite(spent) || spent <= 0) return;
  const { error } = await admin.rpc('bank_deposit', { p_profile_id: userId, p_amount: Math.floor(spent) });
  if (error) console.error('[BANK] deposit failed:', error.message);
}

export async function bankBalance(admin: any): Promise<number> {
  const { data } = await admin.from('profiles').select('tokens').ilike('username', 'breadblook').maybeSingle();
  return Number(data?.tokens) || 0;
}
