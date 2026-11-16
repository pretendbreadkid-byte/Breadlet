-- Gives back the Candy Bag Breadlets taken in 0107 (the Bread Bucks taken in 0106 stay taken).
-- Quantities are what each player had right before 0107 ran; they're added on top of anything
-- they've opened since. Each player gets a pop-up.
with give_back(username, item, qty) as (
  values
    ('autumn_llama', 'Blue Sour Gummy', 1), ('autumn_llama', 'Chocolate Coin', 1), ('autumn_llama', 'Chocolate Kiss', 1), ('autumn_llama', 'Golden Ticket', 4),
    ('autumn_llama', 'Green Sour Gummy', 1), ('autumn_llama', 'Gumdrop', 1), ('autumn_llama', 'Gummy Bear', 1), ('autumn_llama', 'King Candy', 1),
    ('autumn_llama', 'Lollipop', 1), ('autumn_llama', 'Marshmallow Bunny', 1), ('autumn_llama', 'Rainbow Sour Gummy', 1), ('autumn_llama', 'Red Sour Gummy', 1),

    ('bodk75055', 'Blue Sour Gummy', 1), ('bodk75055', 'Chocolate Coin', 1), ('bodk75055', 'Chocolate Kiss', 1), ('bodk75055', 'Golden Ticket', 1),
    ('bodk75055', 'Green Sour Gummy', 1), ('bodk75055', 'Gumdrop', 1), ('bodk75055', 'Gummy Bear', 1), ('bodk75055', 'King Candy', 7),
    ('bodk75055', 'Lollipop', 1), ('bodk75055', 'Marshmallow Bunny', 1), ('bodk75055', 'Rainbow Sour Gummy', 1), ('bodk75055', 'Red Sour Gummy', 1),

    ('LexiBin2016', 'Blue Sour Gummy', 1), ('LexiBin2016', 'Chocolate Coin', 1), ('LexiBin2016', 'Chocolate Kiss', 1), ('LexiBin2016', 'Green Sour Gummy', 1),
    ('LexiBin2016', 'Gumdrop', 1), ('LexiBin2016', 'Gummy Bear', 1), ('LexiBin2016', 'King Candy', 1), ('LexiBin2016', 'Lollipop', 1),
    ('LexiBin2016', 'Marshmallow Bunny', 1), ('LexiBin2016', 'Red Sour Gummy', 1),

    ('lucarCR7', 'Blue Sour Gummy', 1), ('lucarCR7', 'Chocolate Coin', 1), ('lucarCR7', 'Chocolate Kiss', 1), ('lucarCR7', 'Golden Ticket', 1),
    ('lucarCR7', 'Green Sour Gummy', 1), ('lucarCR7', 'Gumdrop', 1), ('lucarCR7', 'Gummy Bear', 1), ('lucarCR7', 'King Candy', 1),
    ('lucarCR7', 'Lollipop', 1), ('lucarCR7', 'Marshmallow Bunny', 1), ('lucarCR7', 'Rainbow Sour Gummy', 1), ('lucarCR7', 'Red Sour Gummy', 1),

    ('NoahR', 'Blue Sour Gummy', 1), ('NoahR', 'Chocolate Kiss', 1), ('NoahR', 'Green Sour Gummy', 1), ('NoahR', 'Gumdrop', 1),
    ('NoahR', 'Gummy Bear', 1), ('NoahR', 'Lollipop', 1), ('NoahR', 'Rainbow Sour Gummy', 1), ('NoahR', 'Red Sour Gummy', 1),

    ('Oh_Man', 'Blue Sour Gummy', 1), ('Oh_Man', 'Chocolate Coin', 1), ('Oh_Man', 'Chocolate Kiss', 1), ('Oh_Man', 'Golden Ticket', 3),
    ('Oh_Man', 'Green Sour Gummy', 1), ('Oh_Man', 'Gumdrop', 1), ('Oh_Man', 'Gummy Bear', 1), ('Oh_Man', 'King Candy', 1),
    ('Oh_Man', 'Lollipop', 1), ('Oh_Man', 'Marshmallow Bunny', 1), ('Oh_Man', 'Rainbow Sour Gummy', 1), ('Oh_Man', 'Red Sour Gummy', 1),

    ('PointXD2272', 'Blue Sour Gummy', 1), ('PointXD2272', 'Chocolate Coin', 1), ('PointXD2272', 'Chocolate Kiss', 1), ('PointXD2272', 'Golden Ticket', 1),
    ('PointXD2272', 'Green Sour Gummy', 12), ('PointXD2272', 'Gumdrop', 6), ('PointXD2272', 'Gummy Bear', 1), ('PointXD2272', 'King Candy', 3),
    ('PointXD2272', 'Lollipop', 1), ('PointXD2272', 'Marshmallow Bunny', 4), ('PointXD2272', 'Red Sour Gummy', 10),

    ('Redkit', 'Blue Sour Gummy', 1), ('Redkit', 'Chocolate Coin', 1), ('Redkit', 'Chocolate Kiss', 1),
    ('Redkit', 'Green Sour Gummy', 1), ('Redkit', 'Gumdrop', 1), ('Redkit', 'Gummy Bear', 1), ('Redkit', 'King Candy', 1),
    ('Redkit', 'Lollipop', 1), ('Redkit', 'Marshmallow Bunny', 1), ('Redkit', 'Red Sour Gummy', 1),

    ('Russell25578', 'Blue Sour Gummy', 1), ('Russell25578', 'Chocolate Coin', 1), ('Russell25578', 'Chocolate Kiss', 1), ('Russell25578', 'Golden Ticket', 1),
    ('Russell25578', 'Green Sour Gummy', 1), ('Russell25578', 'Gumdrop', 1), ('Russell25578', 'Gummy Bear', 1), ('Russell25578', 'King Candy', 1),
    ('Russell25578', 'Lollipop', 1), ('Russell25578', 'Marshmallow Bunny', 1), ('Russell25578', 'Red Sour Gummy', 1),

    ('Tebonjrjr', 'Blue Sour Gummy', 1), ('Tebonjrjr', 'Chocolate Coin', 1), ('Tebonjrjr', 'Chocolate Kiss', 1), ('Tebonjrjr', 'Golden Ticket', 1),
    ('Tebonjrjr', 'Green Sour Gummy', 1), ('Tebonjrjr', 'Gumdrop', 1), ('Tebonjrjr', 'Gummy Bear', 1), ('Tebonjrjr', 'King Candy', 1),
    ('Tebonjrjr', 'Lollipop', 1), ('Tebonjrjr', 'Marshmallow Bunny', 1), ('Tebonjrjr', 'Rainbow Sour Gummy', 1), ('Tebonjrjr', 'Red Sour Gummy', 1)
), rows as (
  select p.id as profile_id, b.id as blook_id, g.qty
  from give_back g
  join public.profiles p on p.username = g.username
  join public.blooks b on b.name = g.item
), added as (
  insert into public.inventory (profile_id, blook_id, quantity, shiny)
  select profile_id, blook_id, qty, false from rows
  on conflict (profile_id, blook_id, shiny) do update set quantity = public.inventory.quantity + excluded.quantity
  returning profile_id
), notified as (
  insert into public.notifications (profile_id, type, payload)
  select distinct profile_id, 'admin_gift', jsonb_build_object(
    'title', 'Candy Breadlets returned',
    'message', 'Your Candy Bag Breadlets have been given back. The Bread Bucks part of the Candy Bag fix stays the same. Thanks for your patience!'
  ) from added
  returning profile_id
)
select p.username, count(*) as rows_given_back
from added a join public.profiles p on p.id = a.profile_id
group by p.username order by p.username;
