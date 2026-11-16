-- The Candy Bag paid back ~1.91 Bread Bucks more than it cost per bag (fixed in 154eedf). This
-- takes back the most each heavy opener could have gained (1.91 x their 25-cost bag buys since the
-- Candy Bag came out), never going below 0, and sends each a pop-up saying how much and why.
with revoke(username, amount) as (
  values
    ('Tebonjrjr', 16850), ('autumn_llama', 14105), ('bodk75055', 10075), ('Redkit', 7816),
    ('Oh_Man', 4290), ('LexiBin2016', 3278), ('NoahR', 2907), ('Russell25578', 2791),
    ('lucarCR7', 2430), ('PointXD2272', 1727)
), before as (
  select p.id, p.tokens, least(r.amount, greatest(p.tokens, 0)) as taken
  from public.profiles p join revoke r on r.username = p.username
), updated as (
  update public.profiles p set tokens = p.tokens - b.taken
  from before b where p.id = b.id
  returning p.id, p.username, b.taken, p.tokens as balance_now
), notified as (
  insert into public.notifications (profile_id, type, payload)
  select id, 'admin_gift', jsonb_build_object(
    'title', 'Candy Bag fix',
    'message', 'The Candy Bag paid out more than it cost by mistake, so opening and selling made Bread Bucks. That''s fixed now, and ' || taken || ' Bread Bucks you gained from it were taken back. Thanks for understanding!'
  ) from updated
  returning profile_id
)
select username, taken, balance_now from updated order by taken desc;
