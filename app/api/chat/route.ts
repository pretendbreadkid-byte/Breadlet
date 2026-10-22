import { NextResponse } from 'next/server';
import { isChatModerator, isProtectedFromMute } from '../../../lib/admin-access';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { filterProfanity } from '../../../lib/chat-filter';

export const dynamic = 'force-dynamic';

async function isChatAdmin(database: any, userId: string) {
  return isChatModerator(database, userId);
}

export async function GET() {
  const supabase = await createClient();

  if (!supabase) {
    console.log('[CHAT_GET] Supabase not configured');
    return NextResponse.json(
      { error: 'Supabase is not configured on the server.' },
      { status: 503 },
    );
  }
  const database = createAdminClient() || supabase;
  const messageSelect = 'id, message, created_at, profile_id, reply_to_message_id, is_breadlet_bot';
  // Auth and the message query are independent, so run them together.
  const [{ data: { user: viewer } }, firstTry] = await Promise.all([
    supabase.auth.getUser(),
    database.from('global_chat_messages').select(messageSelect).is('deleted_at', null).order('created_at', { ascending: false }).limit(35),
  ]);
  let { data, error } = firstTry;

  // If deleted_at is causing the query to fail, try without that filter.
  if (error) {
    const plain = await database.from('global_chat_messages').select(messageSelect).order('created_at', { ascending: false }).limit(35);
    if (plain.error) {
      console.error('[CHAT_GET] Plain SELECT error:', plain.error);
      return NextResponse.json({ error: plain.error.message }, { status: 500 });
    }
    data = plain.data;
  }

  const messages = [...(data || [])].reverse();
  const profileIds = Array.from(new Set(messages.map((row: any) => row.profile_id).filter(Boolean)));
  const replyIds = Array.from(new Set(messages.map((row: any) => row.reply_to_message_id).filter(Boolean)));

  // Profiles (with equipped blook), replies and the admin check are independent: fetch them together.
  const [profileResult, replyResult, viewerIsAdmin] = await Promise.all([
    profileIds.length > 0
      ? database.from('profiles').select('id, username, tokens, stats, equipped_blook_id, blooks:equipped_blook_id(name)').in('id', profileIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    replyIds.length > 0
      ? database.from('global_chat_messages').select('id, message, profile_id, is_breadlet_bot').in('id', replyIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    viewer ? isChatAdmin(database, viewer.id) : Promise.resolve(false),
  ]);

  const profiles: any[] = !profileResult.error && profileResult.data ? profileResult.data : [];
  const replyRows: any[] = !replyResult.error && replyResult.data ? replyResult.data : [];
  const profileMap = new Map(profiles.map((profile: any) => [profile.id, profile]));
  const blookMap = new Map(profiles.map((profile: any) => [profile.equipped_blook_id, profile.blooks?.name || '']));

  // Only look up reply authors that were not already loaded above.
  const missingReplyProfileIds = Array.from(new Set(replyRows.map((row: any) => row.profile_id).filter((id: string) => id && !profileMap.has(id))));
  let extraProfiles: any[] = [];
  if (missingReplyProfileIds.length > 0) {
    const extra = await database.from('profiles').select('id, username').in('id', missingReplyProfileIds);
    if (!extra.error && extra.data) extraProfiles = extra.data;
  }
  const replyUsernameMap = new Map([...profiles, ...extraProfiles].map((profile: any) => [profile.id, profile.username]));
  const replies = new Map(
    replyRows.map((row: any) => [
      row.id,
      {
        id: row.id,
        message: row.message,
        user:
          row.is_breadlet_bot
            ? 'Breadlet'
            : replyUsernameMap.get(row.profile_id) || 'Player'
      }
    ])
  );

  // Format the messages for the game.
  const normalized = messages.map((row: any) => {
    const profile = profileMap.get(row.profile_id);

    const isBreadletBot = row.is_breadlet_bot === true;
    const username = isBreadletBot
      ? 'Breadlet'
      : profile?.username || 'Player';

    const tokens = Number(
      profile?.tokens || 0
    );

    const badges = Array.from(
      new Set([
      ...(profile?.stats?.badges || []),

        ...(tokens >= 10000
          ? ['10K Tokens']
          : []),

        ...(tokens >= 100000
          ? ['100K Tokens']
          : []),

        ...(tokens >= 1000000
          ? ['1M Tokens']
          : [])
      ])
    );

    let equippedBlook = '';

    if (!isBreadletBot && profile?.equipped_blook_id) {
      const blookName =
        blookMap.get(
          profile.equipped_blook_id
        ) || '';

      equippedBlook =
        blookName === 'Surgeon'
          ? 'Doctor'
          : blookName;
    }

    return {
      id: row.id,
      message: row.message,
      created_at: row.created_at,
      profile_id: row.profile_id,

      replyTo:
        row.reply_to_message_id
          ? replies.get(
              row.reply_to_message_id
            ) || null
          : null,

      user: username,
      equippedBlook,
      badges: isBreadletBot ? [] : badges,
      isBreadletBot,
      canMute: viewerIsAdmin && !isBreadletBot && Boolean(profile) && row.profile_id !== viewer?.id && !isProtectedFromMute(profile?.username),
      canDelete: Boolean(viewer) && (viewerIsAdmin || row.profile_id === viewer?.id || (!isBreadletBot && !profile)),

      profiles: {
        username
      }
    };
  });

  return NextResponse.json(normalized);
}

export async function POST(request: Request) {
  console.log('[CHAT_POST] Starting POST /api/chat');

  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json(
      {
        error:
          'Supabase is not configured.'
      },
      { status: 503 }
    );
  }
  const database = createAdminClient() || supabase;

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  console.log(
    '[CHAT_POST] User:',
    user?.id,
    'Auth error:',
    authError
  );

  if (!user) {
    return NextResponse.json(
      {
        error: 'Unauthenticated'
      },
      { status: 401 }
    );
  }

  const { data: sender } = await database.from('profiles').select('is_banned, account_status, stats').eq('id', user.id).maybeSingle();
  if (sender && (sender.is_banned || (sender.account_status && sender.account_status !== 'active'))) {
    return NextResponse.json({ error: 'Banned accounts cannot chat.' }, { status: 403 });
  }
  const mutedUntil = Date.parse(String(sender?.stats?.chatMutedUntil || ''));
  if (Number.isFinite(mutedUntil) && mutedUntil > Date.now()) {
    return NextResponse.json({ error: `You are timed out from chat for  more minute(s).` }, { status: 403 });
  }

  const body = await request.json();

  const rawMessage = String(body.message || '').trim();
  // Image messages carry a base64 data URL (png, jpeg, gif, webp or svg) and need a larger limit.
  const isImageMessage = /^\[img\]data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+\/=]+\[\/img\]$/.test(rawMessage) && rawMessage.length <= 600000;
  const message = isImageMessage ? rawMessage : filterProfanity(rawMessage.slice(0, 500));

  if (!message) {
    return NextResponse.json(
      {
        error: 'Message is required.'
      },
      { status: 400 }
    );
  }

  const replyToMessageId =
    String(
      body.replyToMessageId || ''
    ).trim() || null;

  let replyTo: {
    id: string;
    message: string;
    user: string;
  } | null = null;

  if (replyToMessageId) {
    const { data: target } =
      await database
        .from('global_chat_messages')
        .select(
          'id, message, profile_id, is_breadlet_bot'
        )
        .eq(
          'id',
          replyToMessageId
        )
        .maybeSingle();

    if (!target) {
      return NextResponse.json(
        {
          error:
            'The message you are replying to is no longer available.'
        },
        { status: 404 }
      );
    }

    const { data: targetProfile } = target.is_breadlet_bot
      ? { data: null }
      : await database
          .from('profiles')
          .select('username')
          .eq('id', target.profile_id)
          .maybeSingle();

    replyTo = {
      id: target.id,
      message: target.message,
      user: target.is_breadlet_bot
        ? 'Breadlet'
        : targetProfile?.username || 'Player'
    };
  }

  console.log(
    '[CHAT_POST] Inserting message:',
    message
  );

  const { data, error } =
    await database
      .from('global_chat_messages')
      .insert({
        profile_id: user.id,
        message,
        reply_to_message_id:
          replyToMessageId
      })
      .select(
        'id, message, created_at, profile_id, reply_to_message_id, is_breadlet_bot'
      )
      .maybeSingle();

  if (error) {
    console.error(
      '[CHAT_POST] Insert error:',
      error
    );

    return NextResponse.json(
      {
        error: error.message
      },
      { status: 400 }
    );
  }

  // Keep only the newest 35 messages; older ones are deleted.
  if (Math.random() < 0.2) {
  const { data: stale } = await database.from('global_chat_messages').select('id').order('created_at', { ascending: false }).range(35, 300);
  if (stale?.length) await database.from('global_chat_messages').delete().in('id', stale.map((row: { id: string }) => row.id));
  }

  // Let word games (word race / unscramble) react to the message.
  if (!isImageMessage) {
    const { error: gameError } = await database.rpc('chat_game_action', { p_profile_id: user.id, p_action: 'check_answer', p_message: message });
    if (gameError) console.error('[CHAT_POST] Game check failed:', gameError.message);
  }

  const { data: profile } =
    await database
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();

  const username =
    profile?.username ||
    user.user_metadata?.username ||
    'Player';

  const responsePayload = {
    id: data?.id,
    message:
      data?.message || message,
    created_at:
      data?.created_at ||
      new Date().toISOString(),
    profile_id:
      data?.profile_id ||
      user.id,
    replyTo,
    user: username,
    profiles: {
      username
    },
    isBreadletBot: data?.is_breadlet_bot === true,
  };

  console.log(
    '[CHAT_POST] Returning:',
    responsePayload
  );

  return NextResponse.json(
    responsePayload,
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured.' },
      { status: 503 }
    );
  }
  const database = createAdminClient() || supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: 401 }
    );
  }

  let body: { id?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 }
    );
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const message = typeof body.message === 'string'
    ? body.message.trim().slice(0, 500)
    : '';

  if (!id || !message) {
    return NextResponse.json(
      { error: 'A message ID and non-empty message are required.' },
      { status: 400 }
    );
  }

  const { data, error } = await database
    .from('global_chat_messages')
    .update({ message })
    .eq('id', id)
    .eq('profile_id', user.id)
    .eq('is_breadlet_bot', false)
    .is('deleted_at', null)
    .select('id, message')
    .maybeSingle();

  if (error) {
    console.error('[CHAT_PATCH] Update error:', error);
    return NextResponse.json(
      { error: 'Could not edit this message.' },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Message not found or you do not have permission to edit it.' },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }
  const database = createAdminClient() || supabase;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  let id = url.searchParams.get('id')?.trim() || '';
  if (!id) {
    const body = await request.json().catch(() => ({}));
    id = typeof body.id === 'string' ? body.id.trim() : '';
  }
  if (!id) {
    return NextResponse.json({ error: 'A message ID is required.' }, { status: 400 });
  }

  const { data: target, error: readError } = await database
    .from('global_chat_messages')
    .select('id, profile_id, is_breadlet_bot')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: 'Could not delete this message.' }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  }

  let allowed = target.profile_id === user.id || (await isChatAdmin(database, user.id));
  if (!allowed && !target.is_breadlet_bot) {
    // Anyone may clear messages left behind by deleted accounts.
    const { data: author } = await database.from('profiles').select('id').eq('id', target.profile_id).maybeSingle();
    allowed = !author;
  }
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have permission to delete this message.' }, { status: 403 });
  }

  const { error } = await database
    .from('global_chat_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    console.error('[CHAT_DELETE] Delete error:', error);
    return NextResponse.json({ error: 'Could not delete this message.' }, { status: 500 });
  }

  return NextResponse.json({ id });
}