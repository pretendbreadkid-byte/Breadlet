const fs = require('node:fs');
const assert = require('node:assert/strict');
const test = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

test('Vespa death Crow rewards follow membership and owners can kick members', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create function auth.role() returns text language sql
        as $$ select current_setting('request.jwt.claim.role', true) $$;
      create table public.blooks (
        id uuid primary key default gen_random_uuid(),
        name text unique not null,
        rarity text not null,
        retired boolean not null default false
      );
      create table public.profiles (
        id uuid primary key,
        stats jsonb not null default '{}',
        equipped_blook_id uuid
      );
      create table public.clans (
        id uuid primary key,
        name text not null,
        owner_profile_id uuid not null,
        member_count integer not null
      );
      create table public.clan_members (
        id uuid primary key default gen_random_uuid(),
        clan_id uuid not null references public.clans(id),
        profile_id uuid not null,
        role text not null,
        unique (clan_id, profile_id)
      );
      create table public.clan_join_requests (
        id uuid primary key default gen_random_uuid(),
        profile_id uuid not null,
        status text not null,
        reviewed_at timestamptz
      );
      create table public.inventory (
        id uuid primary key default gen_random_uuid(),
        profile_id uuid not null,
        blook_id uuid not null,
        quantity integer not null,
        shiny boolean not null default false,
        unique (profile_id, blook_id, shiny)
      );
      insert into public.profiles (id, stats) values
        ('00000000-0000-0000-0000-000000000001', '{"clanTag":"VESPA"}'),
        ('00000000-0000-0000-0000-000000000002', '{"clanTag":"VESPA"}'),
        ('00000000-0000-0000-0000-000000000003', '{"clanTag":"OTHER"}'),
        ('00000000-0000-0000-0000-000000000004', '{}');
      insert into public.clans (id, name, owner_profile_id, member_count) values
        ('10000000-0000-0000-0000-000000000001', 'Vespa death', '00000000-0000-0000-0000-000000000001', 2),
        ('10000000-0000-0000-0000-000000000002', 'Other clan', '00000000-0000-0000-0000-000000000003', 1);
      insert into public.clan_members (clan_id, profile_id, role) values
        ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'leader'),
        ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'member'),
        ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'leader');
    `);
    await db.exec(fs.readFileSync('supabase/migrations/0080_clan_crow_reward_and_kicking.sql', 'utf8'));

    const rewardFor = async (profileId) => db.query(`
      select inventory.quantity from public.inventory
      join public.blooks on blooks.id = inventory.blook_id
      where blooks.name = 'Crow' and inventory.profile_id = $1 and inventory.shiny = false
    `, [profileId]);
    assert.equal((await rewardFor('00000000-0000-0000-0000-000000000002')).rows[0].quantity, 1);
    assert.equal((await rewardFor('00000000-0000-0000-0000-000000000003')).rows.length, 0);

    await db.exec(`
      insert into public.clan_members (clan_id, profile_id, role)
      values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'member');
    `);
    assert.equal((await rewardFor('00000000-0000-0000-0000-000000000004')).rows[0].quantity, 1);
    await db.exec(`
      delete from public.clan_members
      where clan_id = '10000000-0000-0000-0000-000000000001'
        and profile_id = '00000000-0000-0000-0000-000000000004';
      insert into public.clan_members (clan_id, profile_id, role)
      values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'member');
    `);
    assert.equal((await rewardFor('00000000-0000-0000-0000-000000000004')).rows.length, 0);

    await db.exec(`
      set request.jwt.claim.role = 'service_role';
      select public.secure_clan_kick_member(
        '00000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002'
      );
    `);
    assert.equal((await rewardFor('00000000-0000-0000-0000-000000000002')).rows.length, 0);
    const kickedMember = await db.query(`
      select clan.member_count, profile.stats->>'clanTag' as clan_tag,
        exists(select 1 from public.clan_members where profile_id = profile.id) as is_member
      from public.clans as clan
      cross join public.profiles as profile
      where clan.id = '10000000-0000-0000-0000-000000000001'
        and profile.id = '00000000-0000-0000-0000-000000000002'
    `);
    assert.equal(kickedMember.rows[0].member_count, 1);
    assert.equal(kickedMember.rows[0].clan_tag, '');
    assert.equal(kickedMember.rows[0].is_member, false);

    await assert.rejects(() => db.query(`
      select public.secure_clan_kick_member(
        '00000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001'
      )
    `), /Only the clan owner/);
  } finally {
    await db.close();
  }
});
