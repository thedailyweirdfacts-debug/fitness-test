-- Paste this whole file into the Supabase SQL Editor and press Run.
-- It creates each person's meals, goals, and scan count, and locks every row
-- so a signed-in person can only see their own. Photos live in a private bucket.

create table if not exists public.meals (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_at timestamptz not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  photo_path text,
  items jsonb not null,
  confidence text not null,
  notes text not null default '',
  excluded jsonb not null default '[]'::jsonb,
  source text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  calorie_goal integer,
  protein_goal integer,
  goal_window_percent integer not null default 10,
  seen_badges text[] not null default '{}',
  seen_goal_days text[] not null default '{}'
);

create table if not exists public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.meals enable row level security;
alter table public.preferences enable row level security;
alter table public.scan_usage enable row level security;

drop policy if exists meals_select on public.meals;
drop policy if exists meals_insert on public.meals;
drop policy if exists meals_update on public.meals;
drop policy if exists meals_delete on public.meals;
create policy meals_select on public.meals for select to authenticated using (auth.uid() = user_id);
create policy meals_insert on public.meals for insert to authenticated with check (auth.uid() = user_id);
create policy meals_update on public.meals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy meals_delete on public.meals for delete to authenticated using (auth.uid() = user_id);

drop policy if exists preferences_select on public.preferences;
drop policy if exists preferences_insert on public.preferences;
drop policy if exists preferences_update on public.preferences;
create policy preferences_select on public.preferences for select to authenticated using (auth.uid() = user_id);
create policy preferences_insert on public.preferences for insert to authenticated with check (auth.uid() = user_id);
create policy preferences_update on public.preferences for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists scan_usage_select on public.scan_usage;
create policy scan_usage_select on public.scan_usage for select to authenticated using (auth.uid() = user_id);

-- The phone cannot change its own scan count. Only the server, with the secret key, can.
create or replace function public.consume_scan(p_user uuid, p_day date, p_cap integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if p_cap < 1 then
    return -1;
  end if;

  insert into public.scan_usage as usage (user_id, day, count)
  values (p_user, p_day, 1)
  on conflict (user_id, day)
  do update set count = usage.count + 1
  where usage.count < p_cap
  returning count into next_count;

  if next_count is null then
    return -1;
  end if;
  return p_cap - next_count;
end;
$$;

create or replace function public.release_scan(p_user uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scan_usage
  set count = greatest(count - 1, 0)
  where user_id = p_user and day = p_day;
end;
$$;

revoke all on function public.consume_scan(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.release_scan(uuid, date) from public, anon, authenticated;
grant execute on function public.consume_scan(uuid, date, integer) to service_role;
grant execute on function public.release_scan(uuid, date) to service_role;

insert into storage.buckets (id, name, public, file_size_limit)
values ('meal-photos', 'meal-photos', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

drop policy if exists meal_photos_select on storage.objects;
drop policy if exists meal_photos_insert on storage.objects;
drop policy if exists meal_photos_update on storage.objects;
drop policy if exists meal_photos_delete on storage.objects;

create policy meal_photos_select on storage.objects
for select to authenticated
using (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy meal_photos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy meal_photos_update on storage.objects
for update to authenticated
using (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy meal_photos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'meal-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
