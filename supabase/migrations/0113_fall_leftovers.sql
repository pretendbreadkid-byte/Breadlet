-- Fall Fiesta leftovers (after the event ends at midnight Central on Nov 23): spend leftover leaves
-- on a Fall clan theme (1,000 leaves, clan owners), a BlookBerry Fall theme code (100 leaves, one
-- per player, 100 codes) or turn every leftover leaf into 5 Bread Bucks. Fall Breadlets you
-- haven't bought still go through buy_fall_reward.

alter table public.clans add column if not exists fall_theme boolean not null default false;
alter table public.clans drop constraint if exists clans_theme_check;
alter table public.clans add constraint clans_theme_check check (theme in ('breadlet', 'ocean', 'sunset', 'forest', 'royal', 'ember', 'fall'));

create table if not exists public.blookberry_codes (
  code text primary key,
  profile_id uuid unique references public.profiles(id) on delete set null,
  claimed_at timestamptz
);
alter table public.blookberry_codes enable row level security;
revoke all on public.blookberry_codes from anon, authenticated;
insert into public.blookberry_codes (code) values
  ('FALL-ANR8-RPTT-D4LW'), ('FALL-9KKY-J4FA-GAK3'), ('FALL-TJ4J-2S4G-67E5'), ('FALL-Y9JB-YGQ7-DXE5'), ('FALL-XLVD-KL5W-ZAAK'),
  ('FALL-FA7E-W256-MP7P'), ('FALL-UBU3-XG4S-7JAG'), ('FALL-7X3R-U35D-JBB6'), ('FALL-RQ7C-W83R-ZE59'), ('FALL-KXM8-WDRP-M97E'),
  ('FALL-MMDF-K5HX-8CGR'), ('FALL-JX2D-B6KZ-4D2P'), ('FALL-FR58-SUDD-GFDW'), ('FALL-P3T4-ZDXJ-XRW9'), ('FALL-J5UA-RQTQ-827F'),
  ('FALL-HB54-4JT7-UMCE'), ('FALL-6SNS-ZLEJ-8J3S'), ('FALL-YAP8-GWZV-3AYQ'), ('FALL-72LP-7B97-938Z'), ('FALL-NQ7D-WLDS-FGVH'),
  ('FALL-K2F3-EE9L-MU9N'), ('FALL-7BHH-MVGW-SKR8'), ('FALL-SFBG-PKXF-W3MW'), ('FALL-PK4B-EQBE-B6PU'), ('FALL-ZETE-ZR39-JAGT'),
  ('FALL-NGFH-KD9T-JN6C'), ('FALL-5GM5-DJG2-CJB9'), ('FALL-X6XF-DYPA-HAPU'), ('FALL-EALU-KBAF-GEDB'), ('FALL-FHJU-82TH-4MBH'),
  ('FALL-69HN-QRZ4-FSS2'), ('FALL-U3FZ-GP4M-A4BY'), ('FALL-TEEU-SF5L-HGE2'), ('FALL-SE2L-8HE6-AZ5L'), ('FALL-AFGT-CPES-CNZ8'),
  ('FALL-338W-9MFY-95ME'), ('FALL-TN7D-DFSF-JJPT'), ('FALL-DKHN-M8G5-SN3X'), ('FALL-XCNC-B73F-KPFK'), ('FALL-JL3G-XYWU-5KSA'),
  ('FALL-GGYG-2NN7-VXLF'), ('FALL-K4BN-SDMW-YHYM'), ('FALL-3VKG-A8Y3-7GW6'), ('FALL-JPPL-66XX-KH8R'), ('FALL-AAUL-TWQW-GPPH'),
  ('FALL-7DYA-3PPF-94ET'), ('FALL-CYT7-WXL6-RKYH'), ('FALL-QKD4-DA4V-RZJ8'), ('FALL-ZP7D-YPU3-WEHU'), ('FALL-VC7U-TRGR-UDFP'),
  ('FALL-V3AG-TPDJ-FBKB'), ('FALL-T4LK-E97T-UM4E'), ('FALL-VK7A-FMWR-QXZ9'), ('FALL-LJZZ-STP3-U7XP'), ('FALL-FEMQ-PUVY-4RL2'),
  ('FALL-4JK2-Z6X3-CGE8'), ('FALL-2F78-CMSV-U94W'), ('FALL-YE9R-YC6D-JJ4L'), ('FALL-JF7J-GG79-UJCA'), ('FALL-KDZS-T9W4-AZDC'),
  ('FALL-J3NL-2F8V-ZJDV'), ('FALL-CXD5-3JQP-SCYD'), ('FALL-HPKR-ZT2B-V672'), ('FALL-MQ7J-N8LN-3K5P'), ('FALL-U2MH-WRVS-RBZL'),
  ('FALL-529A-PN3M-U3WC'), ('FALL-2N87-6MEA-58DE'), ('FALL-66YQ-7VQM-PJKC'), ('FALL-44R6-KBS5-9PRL'), ('FALL-P69U-CD9V-NMUX'),
  ('FALL-BF4Z-HLYY-64Z4'), ('FALL-S2AG-XFKZ-PUT4'), ('FALL-2FYK-YF3R-NC6X'), ('FALL-V9Y3-89GA-89TD'), ('FALL-LUM3-AFLK-DVLF'),
  ('FALL-GHXA-HHU3-63QL'), ('FALL-HP3M-HA97-HXXW'), ('FALL-9TQ9-YJKV-AXDX'), ('FALL-XRBU-XZCV-M7YR'), ('FALL-FWDM-8L3Y-PQ5J'),
  ('FALL-A26L-DJD3-99SW'), ('FALL-YNWQ-H9VV-S5FT'), ('FALL-ETUM-WEKC-HH4H'), ('FALL-GSBH-3E7X-A5N9'), ('FALL-RM5M-MG3J-7F48'),
  ('FALL-9WRR-QSWN-66CK'), ('FALL-CHHQ-3GAP-ZP7P'), ('FALL-3UTH-KHZF-6DRD'), ('FALL-X2ER-VFX2-F3XA'), ('FALL-7JKP-2CY3-RVDS'),
  ('FALL-GXQD-SQGN-5497'), ('FALL-LWXQ-4HAN-CDGA'), ('FALL-RGMJ-XY6Q-FDN3'), ('FALL-8ACY-7K4C-LE36'), ('FALL-TU58-EWAA-REQN'),
  ('FALL-WEUY-WZVG-VDMF'), ('FALL-HN9B-V8D3-TYPN'), ('FALL-8CUY-NFR5-YK5G'), ('FALL-3WAQ-VAXW-9P9X'), ('FALL-JR3F-8ZB2-XME6')
on conflict (code) do nothing;

-- The clan theme picker also accepts 'fall' once the clan has it (no need for Clan colors).
create or replace function public.secure_clan_upgrade(p_profile_id uuid, p_clan_id uuid, p_feature text, p_value text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  target public.clans%rowtype;
  price integer;
  next_capacity integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server clan access is required.'; end if;
  select * into target from public.clans where id = p_clan_id for update;
  if not found then raise exception 'Clan not found.'; end if;
  if target.owner_profile_id <> p_profile_id then raise exception 'Only the clan owner can manage upgrades.'; end if;

  if p_feature = 'rename_unlock' then
    if target.name_change_unlocked then raise exception 'Clan renaming is already unlocked.'; end if;
    price := 5000;
    if target.treasury < price then raise exception 'The clan treasury needs 5,000 tokens.'; end if;
    update public.clans set treasury = treasury - price, name_change_unlocked = true where id = p_clan_id returning * into target;
  elsif p_feature = 'banner_unlock' then
    if target.banner_unlocked then raise exception 'The clan banner is already unlocked.'; end if;
    price := 10000;
    if target.treasury < price then raise exception 'The clan treasury needs 10,000 tokens.'; end if;
    update public.clans set treasury = treasury - price, banner_unlocked = true where id = p_clan_id returning * into target;
  elsif p_feature = 'colors_unlock' then
    if target.colors_unlocked then raise exception 'Clan colors are already unlocked.'; end if;
    price := 15000;
    if target.treasury < price then raise exception 'The clan treasury needs 15,000 tokens.'; end if;
    update public.clans set treasury = treasury - price, colors_unlocked = true where id = p_clan_id returning * into target;
  elsif p_feature = 'member_capacity' then
    if target.member_capacity >= 100 then raise exception 'The clan has reached the 100-member limit.'; end if;
    price := 20000;
    if target.treasury < price then raise exception 'The clan treasury needs 20,000 tokens.'; end if;
    next_capacity := least(100, target.member_capacity + 5);
    update public.clans set treasury = treasury - price, member_capacity = next_capacity where id = p_clan_id returning * into target;
  elsif p_feature = 'animated_profiles' then
    if target.animated_profiles then raise exception 'Animated clan profiles are already unlocked.'; end if;
    price := 30000;
    if target.treasury < price then raise exception 'The clan treasury needs 30,000 tokens.'; end if;
    update public.clans set treasury = treasury - price, animated_profiles = true where id = p_clan_id returning * into target;
  elsif p_feature = 'rename' then
    if not target.name_change_unlocked then raise exception 'Unlock clan renaming first.'; end if;
    if length(trim(coalesce(p_value, ''))) < 2 or length(trim(p_value)) > 30 then raise exception 'Clan names must be 2 to 30 characters.'; end if;
    update public.clans set name = trim(p_value) where id = p_clan_id returning * into target;
  elsif p_feature = 'theme' then
    if p_value = 'fall' then
      if not target.fall_theme then raise exception 'Your clan has not unlocked the Fall theme.'; end if;
    else
      if not target.colors_unlocked then raise exception 'Unlock clan colors first.'; end if;
      if p_value is null or p_value not in ('breadlet', 'ocean', 'sunset', 'forest', 'royal', 'ember') then raise exception 'Choose a valid clan color theme.'; end if;
    end if;
    update public.clans set theme = p_value where id = p_clan_id returning * into target;
  else
    raise exception 'Unknown clan upgrade.';
  end if;

  return jsonb_build_object('ok', true, 'clan', to_jsonb(target), 'price', coalesce(price, 0));
end;
$$;

create or replace function public.redeem_fall_leftover(p_profile_id uuid, p_item text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  player public.profiles%rowtype;
  wallet public.fall_fiesta_wallets%rowtype;
  my_clan public.clans%rowtype;
  got_code text;
  bucks integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Server access is required.'; end if;
  select * into player from public.profiles where id = p_profile_id;
  if not found then raise exception 'Player not found.'; end if;
  if player.is_banned or player.account_status <> 'active' then raise exception 'This account cannot play.'; end if;

  -- Already got a BlookBerry code: show it again, free.
  if p_item = 'blookberry' then
    select code into got_code from public.blookberry_codes where profile_id = p_profile_id;
    if got_code is not null then
      select * into wallet from public.fall_fiesta_wallets where profile_id = p_profile_id;
      return jsonb_build_object('leaves', coalesce(wallet.leaves, 0), 'code', got_code);
    end if;
  end if;

  select * into wallet from public.fall_fiesta_wallets where profile_id = p_profile_id for update;
  if not found then raise exception 'You have no leaves left.'; end if;

  if p_item = 'clan_theme' then
    if wallet.leaves < 1000 then raise exception 'The Fall clan theme costs 1,000 leaves.'; end if;
    select * into my_clan from public.clans where owner_profile_id = p_profile_id limit 1 for update;
    if not found then raise exception 'Only a clan owner can get the Fall clan theme.'; end if;
    if my_clan.fall_theme then raise exception 'Your clan already has the Fall theme.'; end if;
    update public.clans set fall_theme = true, theme = 'fall' where id = my_clan.id;
    update public.fall_fiesta_wallets set leaves = leaves - 1000 where profile_id = p_profile_id returning * into wallet;
    return jsonb_build_object('leaves', wallet.leaves, 'message', my_clan.name || ' now has the Fall theme!');
  elsif p_item = 'blookberry' then
    if wallet.leaves < 100 then raise exception 'A BlookBerry Fall theme code costs 100 leaves.'; end if;
    update public.blookberry_codes set profile_id = p_profile_id, claimed_at = now()
    where code = (select code from public.blookberry_codes where profile_id is null order by code limit 1 for update skip locked)
    returning code into got_code;
    if got_code is null then raise exception 'All the BlookBerry codes have been claimed.'; end if;
    update public.fall_fiesta_wallets set leaves = leaves - 100 where profile_id = p_profile_id returning * into wallet;
    return jsonb_build_object('leaves', wallet.leaves, 'code', got_code);
  elsif p_item = 'bucks' then
    if wallet.leaves < 1 then raise exception 'You have no leaves left.'; end if;
    bucks := wallet.leaves * 5;
    update public.fall_fiesta_wallets set leaves = 0 where profile_id = p_profile_id returning * into wallet;
    update public.profiles set tokens = tokens + bucks where id = p_profile_id;
    return jsonb_build_object('leaves', 0, 'bucks', bucks, 'message', 'You got ' || bucks || ' Bread Bucks for your leaves!');
  end if;
  raise exception 'Unknown reward.';
end;
$$;
revoke all on function public.redeem_fall_leftover(uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
