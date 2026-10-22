-- New accounts start with 1,000 Bread Bucks. Profiles are created by the auth trigger
-- using the column default, which was still 5,000 from the original schema.
alter table public.profiles alter column tokens set default 1000;
