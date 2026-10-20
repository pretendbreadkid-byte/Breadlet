export const ADMIN_USERNAME = 'adminxd2';

// Admin features are limited to the single account named adminxd2, and it must also hold an admin role.
export async function hasAdminAccess(database: any, userId: string): Promise<boolean> {
  const { data: profile } = await database.from('profiles').select('username').eq('id', userId).maybeSingle();
  if (!profile || String(profile.username || '').toLowerCase() !== ADMIN_USERNAME) return false;
  const { data: role } = await database.from('admin_roles').select('role').eq('profile_id', userId).in('role', ['owner', 'admin']).limit(1).maybeSingle();
  return Boolean(role);
}
