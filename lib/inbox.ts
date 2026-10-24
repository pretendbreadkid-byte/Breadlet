// Inbox notifications (the notifications table). These types show as a toast with a chime and
// are listed in the Inbox on the profile; other types (admin gifts, Breadlet swaps) still open
// as a pop-up.
export const INBOX_TYPES = ['mention', 'bazaar_sale', 'trade_completed'] as const;
export type InboxType = (typeof INBOX_TYPES)[number];

export async function notify(admin: any, profileIds: string | string[], type: InboxType, payload: { title: string; message: string; from?: string }) {
  const ids = Array.from(new Set(Array.isArray(profileIds) ? profileIds : [profileIds])).filter(Boolean);
  if (!ids.length) return;
  const { error } = await admin.from('notifications').insert(ids.map((profileId) => ({ profile_id: profileId, type, payload })));
  if (error) console.error('[INBOX] notify failed:', error.message);
}

// "@name" mentions in a chat message: up to 5 distinct usernames, 3-20 letters/numbers/underscores.
export const mentionedNames = (message: string) =>
  Array.from(new Set(Array.from(message.matchAll(/(?:^|[^\w@])@([a-zA-Z0-9_]{3,20})\b/g), (match) => match[1].toLowerCase()))).slice(0, 5);

export const isInboxType = (type: string) => (INBOX_TYPES as readonly string[]).includes(type);
