update public.blooks
set artwork_key = 'space goo 2.0.svg'
where name = 'Space Goo'
  and artwork_key is distinct from 'space goo 2.0.svg';
