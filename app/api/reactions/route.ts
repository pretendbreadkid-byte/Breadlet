import { NextResponse } from 'next/server';
import { kidModeBlock } from '../../../lib/kid-mode';
import { REACTION_EMOJIS, isReactionTarget, isReactionType } from '../../../lib/reactions';
import type { ReactionCounts, ReactionType } from '../../../lib/reactions';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

const TARGETS = {
  chat: { table: 'chat_reactions', column: 'message_id', parent: 'global_chat_messages' },
  news: { table: 'news_reactions', column: 'post_id', parent: 'news_posts' },
} as const;
const MISSING_TABLE = 'Apply migration 0078_reactions.sql to turn on reactions.';
const isMissingTable = (error: any) => error?.code === '42P01' || error?.code === 'PGRST205';

// At most 20 reaction changes per player every 10 seconds (per server instance).
const recentToggles = new Map<string, number[]>();
const tooFast = (userId: string) => {
  const now = Date.now();
  const times = (recentToggles.get(userId) || []).filter((time) => now - time < 10000);
  times.push(now);
  recentToggles.set(userId, times);
  return times.length > 20;
};

async function countsFor(admin: any, type: ReactionType, ids: string[], viewerId: string | null) {
  const { table, column } = TARGETS[type];
  const { data, error } = await admin.from(table).select(`${column}, profile_id, emoji`).in(column, ids).limit(5000);
  if (error) return { error };
  const reactions: Record<string, ReactionCounts> = {};
  for (const row of (data || []) as any[]) {
    const entry = ((reactions[row[column]] ||= {})[row.emoji] ||= { count: 0, mine: false });
    entry.count += 1;
    if (row.profile_id === viewerId) entry.mine = true;
  }
  return { reactions };
}

// GET ?type=chat|news&ids=a,b,c: the reactions on up to 100 messages or posts.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get('type');
  if (!isReactionType(type)) return NextResponse.json({ error: 'Unknown reaction type.' }, { status: 400 });
  const ids = (params.get('ids') || '').split(',').filter(isReactionTarget).slice(0, 100);
  const admin = createAdminClient();
  if (!admin || !ids.length) return NextResponse.json({ reactions: {} });
  const supabase = await createClient();
  const viewer = supabase ? (await supabase.auth.getUser()).data.user : null;
  const result = await countsFor(admin, type, ids, viewer?.id || null);
  // Migration not applied yet: no reactions instead of an error.
  return NextResponse.json({ reactions: result.reactions || {} });
}

// POST { type, id, emoji }: adds your reaction, or takes it back if you already reacted with it.
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Log in to react.' }, { status: 401 });
  { const kid = await kidModeBlock(user.id); if (kid) return kid; }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Reactions are not configured.' }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const type = body.type;
  const id = String(body.id || '');
  const emoji = String(body.emoji || '');
  if (!isReactionType(type) || !isReactionTarget(id)) return NextResponse.json({ error: 'That message is gone.' }, { status: 400 });
  if (!REACTION_EMOJIS.includes(emoji)) return NextResponse.json({ error: 'Pick one of the reaction emojis.' }, { status: 400 });
  if (tooFast(user.id)) return NextResponse.json({ error: 'Slow down a little.' }, { status: 429 });

  const { table, column, parent } = TARGETS[type];
  const [{ data: profile }, { data: target }] = await Promise.all([
    admin.from('profiles').select('is_banned, account_status').eq('id', user.id).maybeSingle(),
    type === 'chat'
      ? admin.from(parent).select('id').eq('id', id).is('deleted_at', null).maybeSingle()
      : admin.from(parent).select('id').eq('id', id).maybeSingle(),
  ]);
  if (!profile || profile.is_banned || (profile.account_status && profile.account_status !== 'active')) return NextResponse.json({ error: 'Your account can\'t react right now.' }, { status: 403 });
  if (!target) return NextResponse.json({ error: 'That message is gone.' }, { status: 404 });

  const mine = { [column]: id, profile_id: user.id, emoji };
  const { data: existing, error: findError } = await admin.from(table).select('emoji').match(mine).maybeSingle();
  if (findError) return NextResponse.json({ error: isMissingTable(findError) ? MISSING_TABLE : findError.message }, { status: 400 });
  const { error } = existing ? await admin.from(table).delete().match(mine) : await admin.from(table).insert(mine);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const result = await countsFor(admin, type, [id], user.id);
  return NextResponse.json({ id, counts: result.reactions?.[id] || {} });
}
