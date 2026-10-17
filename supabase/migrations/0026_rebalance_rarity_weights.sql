begin;

update public.blooks
set rarity = case name
  when 'Toaster' then 'Rare'
  when 'Robo Bread' then 'Epic'
end
where name in ('Toaster', 'Robo Bread');

commit;
