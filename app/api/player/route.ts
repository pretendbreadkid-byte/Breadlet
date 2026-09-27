import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';

const materialNames = ['Gold', 'Cloth', 'Gem', 'Sugar', 'Flower', 'Metal'];

function emptyMaterials() {
  return Object.fromEntries(materialNames.map((name) => [name, 0]));
}

export async function GET() {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured.' },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: 401 },
    );
  }

  const inventoryAdmin = createAdminClient();

  if (!inventoryAdmin) {
    return NextResponse.json(
      { error: 'Server inventory saving is not configured.' },
      { status: 503 },
    );
  }

  const [
    { data: profile, error: profileError },
    { data: inventory },
    { data: mine },
    { data: listings },
    capsuleCount,
    messageCount,
    tradeCount,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single(),

    inventoryAdmin
      .from('inventory')
      .select('quantity, shiny, blooks(name)')
      .eq('profile_id', user.id),

    supabase
      .from('mine_progress')
      .select('*')
      .eq('profile_id', user.id)
      .maybeSingle(),

    supabase
      .from('marketplace_listings')
      .select(
        'id, price, status, blooks(name), profiles(username)',
      )
      .eq('status', 'active')
      .order('created_at', { ascending: false }),

    supabase
      .from('chest_rolls')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id),

    supabase
      .from('global_chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id),

    supabase
      .from('trades')
      .select('id', { count: 'exact', head: true })
      .or(
        `sender_profile_id.eq.${user.id},receiver_profile_id.eq.${user.id}`,
      )
      .eq('status', 'completed'),
  ]);

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 500 },
    );
  }

  const { data: equipped } = profile.equipped_blook_id
    ? await supabase
        .from('blooks')
        .select('name')
        .eq('id', profile.equipped_blook_id)
        .maybeSingle()
    : { data: null };

  const inventoryNames = (inventory || []).flatMap(
    (entry: {
      quantity: number;
      shiny: boolean;
      blooks: { name: string }[] | null;
    }) => {
      const name = entry.blooks?.[0]?.name;

      if (!name) return [];

      return Array.from(
        { length: Math.max(0, Number(entry.quantity) || 0) },
        () => `${entry.shiny ? 'Shiny ' : ''}${name}`,
      );
    },
  );

  return NextResponse.json({
    profile: {
      ...profile,
      equipped_blook_name: equipped?.name || null,
      badges: profile.stats?.badges || [],
      clan_tag: profile.stats?.clanTag || '',
      wheel_spun: Boolean(profile.stats?.wheelSpun),
    },

    inventory: inventoryNames,

    materials: {
      ...emptyMaterials(),
      ...(profile.materials || {}),
    },

    mine,

    activity: {
      capsulesOpened: capsuleCount.count || 0,
      messagesSent: messageCount.count || 0,
      completedTrades: tradeCount.count || 0,
    },

    listings: (listings || []).map((listing: any) => ({
      id: listing.id,
      seller: listing.profiles?.username || 'Player',
      blook: listing.blooks?.name || 'Bread Blook',
      price: listing.price,
    })),
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured.' },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: 401 },
    );
  }

  const inventoryAdmin = createAdminClient();

  if (!inventoryAdmin) {
    return NextResponse.json(
      { error: 'Server inventory saving is not configured.' },
      { status: 503 },
    );
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body.' },
      { status: 400 },
    );
  }

  const player = body.player || {};

  /*
   * Build inventory counts.
   *
   * Example:
   * ["Mars", "Mars", "Earth"]
   *
   * becomes:
   * Mars  = 2
   * Earth = 1
   */
  const inventoryNames = Array.isArray(player.inventory)
    ? player.inventory.map(String)
    : [];

  const inventoryCounts = new Map<string, number>();

  for (const name of inventoryNames) {
    inventoryCounts.set(
      name,
      (inventoryCounts.get(name) || 0) + 1,
    );
  }

  /*
   * Load the Blook catalog from Supabase.
   */
  const { data: blooks, error: blooksError } =
    await inventoryAdmin
      .from('blooks')
      .select('id, name');

  if (blooksError) {
    return NextResponse.json(
      { error: blooksError.message },
      { status: 500 },
    );
  }

  const blookIds = new Map(
    (blooks || []).map(
      (blook: { id: string; name: string }) => [
        blook.name,
        blook.id,
      ],
    ),
  );

  const normalizedBlookName = (displayName: string) => {
    const name = displayName.replace(/^Shiny /, '');

    return name === 'Surgeon' ? 'Doctor' : name;
  };

  /*
   * Make sure every Blook the player owns actually exists
   * in the Supabase Blook catalog.
   */
  const unknownBlooks = Array.from(
    inventoryCounts.keys(),
  ).filter(
    (displayName) =>
      !blookIds.has(
        normalizedBlookName(displayName),
      ),
  );

  if (unknownBlooks.length) {
    return NextResponse.json(
      {
        error:
          `These Blooks are missing from the server catalog ` +
          `and were not saved: ${unknownBlooks.join(', ')}. ` +
          `Apply the latest Blook catalog migration, then retry.`,
      },
      { status: 409 },
    );
  }

  /*
   * Update the player's profile.
   */
  const profileUpdate = {
    username: String(player.username || '')
      .trim()
      .slice(0, 20),

    tokens: Math.max(
      0,
      Math.floor(Number(player.tokens) || 0),
    ),

    luck: 0,

    stats: {
      badges: Array.isArray(player.badges)
        ? player.badges
        : [],

      clanTag: String(player.clanTag || '')
        .slice(0, 5),

      wheelSpun: Boolean(player.wheelSpun),
    },

    materials:
      player.materials || emptyMaterials(),

    friends: Array.isArray(player.friends)
      ? player.friends
      : [],

    equipped_blook_id:
      blookIds.get(
        String(player.equipped || '').replace(
          /^Shiny /,
          '',
        ),
      ) || null,

    account_status: 'active',
  };

  if (profileUpdate.username.length < 3) {
    return NextResponse.json(
      {
        error:
          'Username must be 3-20 characters.',
      },
      { status: 400 },
    );
  }

  const { error: profileError } =
    await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user.id);

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 400 },
    );
  }

  /*
   * IMPORTANT:
   *
   * Delete the player's old inventory first.
   *
   * The old code only used upsert().
   * That could leave the database out of sync with
   * the player's actual inventory.
   *
   * We now completely synchronize the inventory
   * every time the player saves.
   */
  const { error: deleteInventoryError } =
    await inventoryAdmin
      .from('inventory')
      .delete()
      .eq('profile_id', user.id);

  if (deleteInventoryError) {
    return NextResponse.json(
      {
        error:
          `Could not update inventory: ` +
          deleteInventoryError.message,
      },
      { status: 400 },
    );
  }

  /*
   * Turn the player's inventory array into
   * Supabase inventory rows.
   */
  const inventoryRows = Array.from(
    inventoryCounts.entries(),
  ).flatMap(
    ([displayName, quantity]) => {
      const shiny =
        displayName.startsWith('Shiny ');

      const name =
        normalizedBlookName(displayName);

      const blookId =
        blookIds.get(name);

      if (!blookId) return [];

      return [
        {
          profile_id: user.id,
          blook_id: blookId,
          quantity,
          shiny,
        },
      ];
    },
  );

  /*
   * Insert the player's complete inventory.
   *
   * If they have zero Blooks, we leave the table empty.
   */
  if (inventoryRows.length > 0) {
    const { error: inventoryError } =
      await inventoryAdmin
        .from('inventory')
        .insert(inventoryRows);

    if (inventoryError) {
      return NextResponse.json(
        {
          error:
            `Inventory was not saved: ` +
            inventoryError.message,
        },
        { status: 400 },
      );
    }
  }

  /*
   * Rebuild marketplace listings belonging
   * to this player.
   */
  await supabase
    .from('marketplace_listings')
    .delete()
    .eq('profile_id', user.id);

  const listingRows =
    Array.isArray(player.listings)
      ? player.listings
          .filter(
            (listing: any) =>
              listing.seller ===
              profileUpdate.username,
          )
          .flatMap(
            (listing: any) => {
              const blookId =
                blookIds.get(
                  String(listing.blook).replace(
                    /^Shiny /,
                    '',
                  ),
                );

              if (!blookId) return [];

              return [
                {
                  profile_id: user.id,
                  blook_id: blookId,
                  quantity: 1,
                  price: Math.max(
                    0,
                    Math.floor(
                      Number(listing.price) || 0,
                    ),
                  ),
                  status: 'active',
                },
              ];
            },
          )
      : [];

  if (listingRows.length > 0) {
    const { error: listingError } =
      await supabase
        .from('marketplace_listings')
        .insert(listingRows);

    if (listingError) {
      return NextResponse.json(
        { error: listingError.message },
        { status: 400 },
      );
    }
  }

  /*
   * Save mining progress.
   */
  const mine =
    player.mined == null &&
    player.pickaxe == null
      ? null
      : {
          current_earnings_today: Math.max(
            0,
            Math.floor(
              Number(player.mined) || 0,
            ),
          ),

          pickaxe_level: Math.max(
            0,
            Math.min(
              5,
              Math.floor(
                Number(player.pickaxe) || 0,
              ),
            ),
          ),

          updated_at:
            new Date().toISOString(),
        };

  if (mine) {
    const { error: mineError } =
      await supabase
        .from('mine_progress')
        .upsert(
          {
            profile_id: user.id,
            ...mine,
          },
          {
            onConflict: 'profile_id',
          },
        );

    if (mineError) {
      return NextResponse.json(
        { error: mineError.message },
        { status: 400 },
      );
    }
  }

  /*
   * Return the freshly saved player.
   */
  return GET();
}

export async function POST(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured.' },
      { status: 503 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: 401 },
    );
  }

  let body: any;

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const username = String(
    body.username ||
      user.user_metadata?.username ||
      user.email?.split('@')[0] ||
      'BreadletPlayer',
  )
    .trim()
    .slice(0, 20);

  const { error } =
    await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          username,

          /*
           * These are only defaults for a brand-new
           * profile. Existing profiles are NOT reset.
           */
          tokens: Math.max(
            0,
            Math.min(
              2500,
              Number(body.tokens) || 250,
            ),
          ),

          luck: 0,

          stats: {
            wheelSpun: false,
          },

          materials: {
            ...emptyMaterials(),
            ...(body.materials || {}),
          },

          account_status: 'active',
        },
        {
          onConflict: 'id',
          ignoreDuplicates: true,
        },
      );

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }

  return GET();
}
