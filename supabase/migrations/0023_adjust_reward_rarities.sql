begin;

update public.blooks
set rarity = case name
  when 'Space Trooper' then 'Uncommon'
  when 'Consolation' then 'Uncommon'
  when 'Avocado' then 'Common'
  when 'Shuriken' then 'Uncommon'
  when 'Blooket Gods' then 'Common'
  when 'Robo Bread' then 'Uncommon'
end
where name in ('Space Trooper', 'Consolation', 'Avocado', 'Shuriken', 'Blooket Gods', 'Robo Bread');

commit;
