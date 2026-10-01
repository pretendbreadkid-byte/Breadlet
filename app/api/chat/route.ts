import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  console.log('[CHAT_GET] Starting GET /api/chat');

  const supabase = await createClient();

  if (!supabase) {
    console.log('[CHAT_GET] Supabase not configured');
    return NextResponse.json([]);
  }

  // Get the chat messages first.
  let { data, error } = await supabase
    .from('global_chat_messages')
    .select('id, message, created_at, profile_id, reply_to_message_id')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  console.log(
    '[CHAT_GET] Message query:',
    data?.length ?? 0,
    'Error:',
    error
  );

  // If deleted_at is causing the query to fail, try without that filter.
  if (error) {
    console.warn(
      '[CHAT_GET] Filtered query failed, trying plain table read:',
      error.message
    );

    const plain = await supabase
      .from('global_chat_messages')
      .select('id, message, created_at, profile_id, reply_to_message_id')
      .order('created_at', { ascending: true })
      .limit(100);

    if (plain.error) {
      console.error('[CHAT_GET] Plain SELECT error:', plain.error);
      return NextResponse.json(
        { error: plain.error.message },
        { status: 500 }
      );
    }

    data = plain.data;
  }

  const messages = data || [];

  // Get profile information for the people who sent messages.
  const profileIds = Array.from(
    new Set(
      messages
        .map((row: any) => row.profile_id)
        .filter(Boolean)
    )
  );

  let profiles: any[] = [];

  if (profileIds.length > 0) {
    const profileResult = await supabase
      .from('profiles')
      .select('id, username, tokens, stats, equipped_blook_id')
      .in('id', profileIds);

    if (!profileResult.error && profileResult.data) {
      profiles = profileResult.data;
    }
  }

  const profileMap = new Map(
    profiles.map((profile: any) => [
      profile.id,
      profile
    ])
  );

  // Get equipped blook names.
  const blookIds = Array.from(
    new Set(
      profiles
        .map((profile: any) => profile.equipped_blook_id)
        .filter(Boolean)
    )
  );

  let blooks: any[] = [];

  if (blookIds.length > 0) {
    const blookResult = await supabase
      .from('blooks')
      .select('id, name')
      .in('id', blookIds);

    if (!blookResult.error && blookResult.data) {
      blooks = blookResult.data;
    }
  }

  const blookMap = new Map(
    blooks.map((blook: any) => [
      blook.id,
      blook.name
    ])
  );

  // Get reply information.
  const replyIds = Array.from(
    new Set(
      messages
        .map((row: any) => row.reply_to_message_id)
        .filter(Boolean)
    )
  );

  let replyRows: any[] = [];

  if (replyIds.length > 0) {
    const replyResult = await supabase
      .from('global_chat_messages')
      .select('id, message, profile_id')
      .in('id', replyIds);

    if (!replyResult.error && replyResult.data) {
      replyRows = replyResult.data;
    }
  }

  const replyProfileIds = Array.from(
    new Set(
      replyRows
        .map((row: any) => row.profile_id)
        .filter(Boolean)
    )
  );

  let replyProfiles: any[] = [];

  if (replyProfileIds.length > 0) {
    const replyProfileResult = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', replyProfileIds);

    if (!replyProfileResult.error && replyProfileResult.data) {
      replyProfiles = replyProfileResult.data;
    }
  }

  const replyUsernameMap = new Map(
    replyProfiles.map((profile: any) => [
      profile.id,
      profile.username
    ])
  );

  const replies = new Map(
    replyRows.map((row: any) => [
      row.id,
      {
        id: row.id,
        message: row.message,
        user:
          replyUsernameMap.get(row.profile_id) ||
          'Player'
      }
    ])
  );

  // Format the messages for the game.
  const normalized = messages.map((row: any) => {
    const profile = profileMap.get(row.profile_id);

    const username =
      profile?.username ||
      'Player';

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

    if (profile?.equipped_blook_id) {
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
      badges,

      profiles: {
        username
      }
    };
  });

  console.log(
    '[CHAT_GET] Returning messages:',
    normalized.length
  );

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

  const body = await request.json();

  const message = String(
    body.message || ''
  )
    .trim()
    .slice(0, 500);

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
      await supabase
        .from('global_chat_messages')
        .select(
          'id, message, profile_id'
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

    const { data: targetProfile } =
      await supabase
        .from('profiles')
        .select('username')
        .eq(
          'id',
          target.profile_id
        )
        .maybeSingle();

    replyTo = {
      id: target.id,
      message: target.message,
      user:
        targetProfile?.username ||
        'Player'
    };
  }

  console.log(
    '[CHAT_POST] Inserting message:',
    message
  );

  const { data, error } =
    await supabase
      .from('global_chat_messages')
      .insert({
        profile_id: user.id,
        message,
        reply_to_message_id:
          replyToMessageId
      })
      .select(
        'id, message, created_at, profile_id, reply_to_message_id'
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

  const { data: profile } =
    await supabase
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
    }
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
