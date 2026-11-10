-- Paste this whole file into the Supabase SQL Editor and press Run.
-- Do this after 001_accounts.sql and 002_recipes.sql.
-- It stores XP, badges, weekly challenges, streak freezes, and friends.
-- A person can read their own rows. They cannot edit XP.
-- Friends can see a display name, level, weekly XP, and streak. Meals and calories stay private.
-- The app server, using the service role, is what writes XP after it reads that person's meals.

alter table public.meals add column if not exists log_kind text;
alter table public.meals drop constraint if exists meals_log_kind_check;
alter table public.meals
  add constraint meals_log_kind_check
  check (log_kind is null or log_kind in ('photo', 'typed', 'barcode', 'recipe', 'sample'));

create table if not exists public.reward_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  friend_code text not null unique,
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  freezes integer not null default 0 check (freezes >= 0 and freezes <= 2),
  weekly_xp integer not null default 0 check (weekly_xp >= 0),
  week_key text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.xp_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null,
  kind text not null,
  xp integer not null check (xp >= 0 and xp <= 2000),
  week_key text,
  created_at timestamptz not null default now(),
  primary key (user_id, event_key)
);

create table if not exists public.earned_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table if not exists public.challenge_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_key text not null,
  challenge_id text not null,
  progress integer not null default 0 check (progress >= 0),
  target integer not null check (target >= 1),
  completed boolean not null default false,
  primary key (user_id, week_key, challenge_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

alter table public.reward_profiles enable row level security;
alter table public.xp_events enable row level security;
alter table public.earned_badges enable row level security;
alter table public.challenge_progress enable row level security;
alter table public.friendships enable row level security;

drop policy if exists reward_profiles_select on public.reward_profiles;
drop policy if exists xp_events_select on public.xp_events;
drop policy if exists earned_badges_select on public.earned_badges;
drop policy if exists challenge_progress_select on public.challenge_progress;
drop policy if exists friendships_select on public.friendships;
create policy reward_profiles_select on public.reward_profiles for select to authenticated using (auth.uid() = user_id);
create policy xp_events_select on public.xp_events for select to authenticated using (auth.uid() = user_id);
create policy earned_badges_select on public.earned_badges for select to authenticated using (auth.uid() = user_id);
create policy challenge_progress_select on public.challenge_progress for select to authenticated using (auth.uid() = user_id);
create policy friendships_select on public.friendships for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create or replace function public.pacific_week_key(p_at timestamptz default now())
returns text
language sql
stable
set search_path = public
as $$
  select to_char(
    (timezone('America/Los_Angeles', p_at))::date
      - (extract(isodow from (timezone('America/Los_Angeles', p_at))::date)::int - 1),
    'YYYY-MM-DD'
  );
$$;

create or replace function public.clean_display_name(p_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  cleaned text;
begin
  cleaned := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  cleaned := regexp_replace(cleaned, '[^a-zA-Z0-9 ]', '', 'g');
  if char_length(cleaned) < 2 then
    return null;
  end if;
  return left(cleaned, 24);
end;
$$;

create or replace function public.make_friend_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  tries int := 0;
  index int;
begin
  loop
    code := '';
    for index in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.reward_profiles where friend_code = code);
    tries := tries + 1;
    if tries > 20 then
      raise exception 'friend_code';
    end if;
  end loop;
  return code;
end;
$$;

create or replace function public.ensure_reward_profile(p_user uuid)
returns public.reward_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.reward_profiles;
  email text;
  name text;
begin
  if p_user is null then
    raise exception 'missing_user';
  end if;
  select * into profile from public.reward_profiles where user_id = p_user;
  if found then
    return profile;
  end if;
  select u.email into email from auth.users u where u.id = p_user;
  name := public.clean_display_name(split_part(coalesce(email, ''), '@', 1));
  if name is null then
    name := 'Friend';
  end if;
  insert into public.reward_profiles (user_id, display_name, friend_code)
  values (p_user, name, public.make_friend_code())
  returning * into profile;
  return profile;
end;
$$;

create or replace function public.replace_reward_state(p_user uuid, p_state jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  event jsonb;
  badge text;
  challenge jsonb;
  total integer;
  week_xp integer;
  week_key text;
begin
  if p_user is null then
    raise exception 'missing_user';
  end if;
  perform public.ensure_reward_profile(p_user);
  week_key := left(coalesce(p_state->>'weekKey', ''), 10);

  delete from public.xp_events where user_id = p_user;
  for event in select value from jsonb_array_elements(coalesce(p_state->'events', '[]'::jsonb))
  loop
    if coalesce(event->>'key', '') = '' then
      continue;
    end if;
    insert into public.xp_events (user_id, event_key, kind, xp, week_key)
    values (
      p_user,
      left(event->>'key', 160),
      left(coalesce(event->>'kind', 'xp'), 40),
      least(greatest(coalesce((event->>'xp')::int, 0), 0), 2000),
      nullif(left(coalesce(event->>'week', ''), 10), '')
    )
    on conflict (user_id, event_key) do nothing;
  end loop;

  select coalesce(sum(xp), 0) into total from public.xp_events where user_id = p_user;
  select coalesce(sum(xp), 0) into week_xp from public.xp_events where user_id = p_user and week_key = week_key;

  update public.reward_profiles
  set
    xp = total,
    level = greatest(coalesce((p_state->>'level')::int, 1), 1),
    current_streak = greatest(coalesce((p_state->>'currentStreak')::int, 0), 0),
    best_streak = greatest(coalesce((p_state->>'bestStreak')::int, 0), 0),
    freezes = least(greatest(coalesce((p_state->>'freezes')::int, 0), 0), 2),
    weekly_xp = week_xp,
    week_key = week_key,
    updated_at = now()
  where user_id = p_user;

  delete from public.earned_badges where user_id = p_user;
  for badge in select value from jsonb_array_elements_text(coalesce(p_state->'badges', '[]'::jsonb))
  loop
    insert into public.earned_badges (user_id, badge_id)
    values (p_user, left(badge, 40))
    on conflict (user_id, badge_id) do nothing;
  end loop;

  delete from public.challenge_progress where user_id = p_user and challenge_progress.week_key = week_key;
  for challenge in select value from jsonb_array_elements(coalesce(p_state->'challenges', '[]'::jsonb))
  loop
    insert into public.challenge_progress (user_id, week_key, challenge_id, progress, target, completed)
    values (
      p_user,
      week_key,
      left(coalesce(challenge->>'id', ''), 40),
      greatest(coalesce((challenge->>'progress')::int, 0), 0),
      greatest(coalesce((challenge->>'target')::int, 1), 1),
      coalesce((challenge->>'completed')::boolean, false)
    )
    on conflict (user_id, week_key, challenge_id) do update
    set progress = excluded.progress, target = excluded.target, completed = excluded.completed;
  end loop;
end;
$$;

create or replace function public.set_display_name_for(p_user uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text;
begin
  if p_user is null then
    raise exception 'missing_user';
  end if;
  cleaned := public.clean_display_name(p_name);
  if cleaned is null then
    return jsonb_build_object('ok', false, 'message', 'Use 2 to 24 letters, numbers, or spaces.');
  end if;
  perform public.ensure_reward_profile(p_user);
  update public.reward_profiles set display_name = cleaned, updated_at = now() where user_id = p_user;
  return jsonb_build_object('ok', true, 'displayName', cleaned);
end;
$$;

create or replace function public.request_friend_for(p_user uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
  target uuid;
  existing public.friendships;
begin
  if p_user is null then
    raise exception 'missing_user';
  end if;
  perform public.ensure_reward_profile(p_user);
  normalized := upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  if char_length(normalized) < 4 then
    return jsonb_build_object('ok', false, 'message', 'Enter the friend code.');
  end if;
  select user_id into target from public.reward_profiles where friend_code = normalized;
  if target is null then
    return jsonb_build_object('ok', false, 'message', 'No one has that friend code.');
  end if;
  if target = p_user then
    return jsonb_build_object('ok', false, 'message', 'That is your own code.');
  end if;

  select * into existing from public.friendships
  where (requester_id = p_user and addressee_id = target)
     or (requester_id = target and addressee_id = p_user);
  if found and existing.status = 'accepted' then
    return jsonb_build_object('ok', true, 'status', 'accepted');
  end if;
  if found and existing.requester_id = target and existing.status = 'pending' then
    update public.friendships set status = 'accepted' where id = existing.id;
    return jsonb_build_object('ok', true, 'status', 'accepted');
  end if;
  if found then
    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;
  insert into public.friendships (requester_id, addressee_id, status)
  values (p_user, target, 'pending');
  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;

create or replace function public.respond_friend_for(p_user uuid, p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.friendships;
begin
  if p_user is null then
    raise exception 'missing_user';
  end if;
  select * into existing from public.friendships where id = p_id;
  if not found or existing.addressee_id <> p_user or existing.status <> 'pending' then
    return jsonb_build_object('ok', false, 'message', 'That request is not waiting on you.');
  end if;
  if p_accept then
    update public.friendships set status = 'accepted' where id = p_id;
  else
    delete from public.friendships where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.reward_social_for(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.reward_profiles;
  board jsonb;
  requests jsonb;
  current_week text;
begin
  if p_user is null then
    raise exception 'missing_user';
  end if;
  profile := public.ensure_reward_profile(p_user);
  current_week := public.pacific_week_key(now());

  select coalesce(jsonb_agg(entry order by weekly_xp desc, streak desc, display_name), '[]'::jsonb)
  into board
  from (
    select jsonb_build_object(
      'displayName', friend.display_name,
      'level', friend.level,
      'weeklyXp', case when friend.week_key = current_week then friend.weekly_xp else 0 end,
      'streak', friend.current_streak,
      'you', friend.user_id = p_user
    ) as entry,
    case when friend.week_key = current_week then friend.weekly_xp else 0 end as weekly_xp,
    friend.current_streak as streak,
    friend.display_name
    from public.reward_profiles friend
    where friend.user_id = p_user
      or friend.user_id in (
        select case when requester_id = p_user then addressee_id else requester_id end
        from public.friendships
        where status = 'accepted' and (requester_id = p_user or addressee_id = p_user)
      )
  ) ranked;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', friendship.id,
    'displayName', other.display_name,
    'direction', case when friendship.addressee_id = p_user then 'in' else 'out' end
  ) order by friendship.created_at), '[]'::jsonb)
  into requests
  from public.friendships friendship
  join public.reward_profiles other
    on other.user_id = case when friendship.requester_id = p_user then friendship.addressee_id else friendship.requester_id end
  where friendship.status = 'pending'
    and (friendship.requester_id = p_user or friendship.addressee_id = p_user);

  return jsonb_build_object(
    'friendCode', profile.friend_code,
    'displayName', profile.display_name,
    'board', board,
    'requests', requests
  );
end;
$$;

create or replace function public.request_friend(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return public.request_friend_for(auth.uid(), p_code);
end;
$$;

create or replace function public.respond_friend(p_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return public.respond_friend_for(auth.uid(), p_id, p_accept);
end;
$$;

create or replace function public.reward_social()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return public.reward_social_for(auth.uid());
end;
$$;

create or replace function public.set_display_name(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  return public.set_display_name_for(auth.uid(), p_name);
end;
$$;

revoke all on function public.ensure_reward_profile(uuid) from public, anon, authenticated;
revoke all on function public.replace_reward_state(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_display_name_for(uuid, text) from public, anon, authenticated;
revoke all on function public.request_friend_for(uuid, text) from public, anon, authenticated;
revoke all on function public.respond_friend_for(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.reward_social_for(uuid) from public, anon, authenticated;
revoke all on function public.make_friend_code() from public, anon, authenticated;
revoke all on function public.clean_display_name(text) from public, anon, authenticated;
revoke all on function public.pacific_week_key(timestamptz) from public, anon, authenticated;

grant execute on function public.replace_reward_state(uuid, jsonb) to service_role;
grant execute on function public.ensure_reward_profile(uuid) to service_role;
grant execute on function public.set_display_name_for(uuid, text) to service_role;
grant execute on function public.request_friend_for(uuid, text) to service_role;
grant execute on function public.respond_friend_for(uuid, uuid, boolean) to service_role;
grant execute on function public.reward_social_for(uuid) to service_role;

grant execute on function public.request_friend(text) to authenticated;
grant execute on function public.respond_friend(uuid, boolean) to authenticated;
grant execute on function public.reward_social() to authenticated;
grant execute on function public.set_display_name(text) to authenticated;
