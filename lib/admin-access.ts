export const ADMIN_USERNAME = 'breadblook';

// Admin access belongs only to the account named breadblook (case-insensitive); no other account qualifies.
export async function hasAdminAccess(database: any, userId: string): Promise<boolean> {
  const { data: profile } = await database.from('profiles').select('username').eq('id', userId).maybeSingle();
  return String(profile?.username || '').trim().toLowerCase() === ADMIN_USERNAME;
}