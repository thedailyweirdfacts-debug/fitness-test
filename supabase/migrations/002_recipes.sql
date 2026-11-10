-- Paste this whole file into the Supabase SQL Editor and press Run.
-- Do this after 001_accounts.sql. It adds each person's saved recipes and
-- locks every row so a signed-in person can only see their own.
-- Logged meals keep their own copy of the numbers, so editing a recipe later
-- does not change meals you already saved.

create table if not exists public.recipes (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  servings numeric not null check (servings >= 1 and servings <= 40),
  cooked_grams numeric check (cooked_grams is null or (cooked_grams > 0 and cooked_grams <= 20000)),
  photo_path text,
  items jsonb not null,
  confidence text not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipes enable row level security;

drop policy if exists recipes_select on public.recipes;
drop policy if exists recipes_insert on public.recipes;
drop policy if exists recipes_update on public.recipes;
drop policy if exists recipes_delete on public.recipes;
create policy recipes_select on public.recipes for select to authenticated using (auth.uid() = user_id);
create policy recipes_insert on public.recipes for insert to authenticated with check (auth.uid() = user_id);
create policy recipes_update on public.recipes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy recipes_delete on public.recipes for delete to authenticated using (auth.uid() = user_id);
