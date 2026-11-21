-- DM'de anket ("Anket" ek menusu) - posts tablosundaki anket (bkz.
-- 0027_post_polls.sql) ile AYNI ayrim: soru+secenekler mesajin KENDISINDE,
-- oylar AYRI bir tabloda (dm_poll_votes) - bir kullanici bir ankete SADECE
-- bir kez (ya da oyunu degistirerek) oy versin diye primary key
-- (message_id,user_id). DM'ye ozgu fark: konusma SADECE iki kisi oldugu
-- icin oylar GERCEK ZAMANLI olarak karsi tarafa da anlik yansitiliyor
-- (bkz. server/src/index.ts "dm:votePoll"/"dm:pollVote").
alter table public.dm_messages
  add column if not exists poll_question text,
  add column if not exists poll_options text[];

alter table public.dm_messages drop constraint if exists dm_messages_kind_check;
alter table public.dm_messages
  add constraint dm_messages_kind_check check (kind in ('text', 'photo', 'voice', 'location', 'file', 'video', 'call', 'contact', 'poll'));

create table if not exists public.dm_poll_votes (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.dm_poll_votes enable row level security;

create policy "dm_poll_votes_select_involved" on public.dm_poll_votes
  for select using (
    exists (
      select 1 from public.dm_messages m
      join public.dm_conversations c on c.id = m.conversation_id
      where m.id = dm_poll_votes.message_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- forward_dm_message (0037/0041) kind='poll' mesajlarini da iletebilsin diye
-- poll_question/poll_options parametreleriyle genisletildi - iletilen anket
-- KENDI oylarini TASIMAZ (yeni bir mesaj, 0 oyla baslar), SADECE soru/
-- secenekler kopyalanir.
create or replace function public.forward_dm_message(
  to_user uuid,
  kind text,
  body text,
  media_url text default null,
  duration_ms integer default null,
  latitude double precision default null,
  longitude double precision default null,
  file_name text default null,
  file_size bigint default null,
  mime_type text default null,
  is_adult boolean default false,
  shared_user_id uuid default null,
  shared_user_name text default null,
  shared_user_handle text default null,
  shared_user_avatar_url text default null,
  poll_question text default null,
  poll_options text[] default null
)
returns public.dm_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  convo_id uuid;
  expiry_ms bigint;
  new_expires_at timestamptz;
  my_name text;
  result public.dm_messages;
  target_restriction text;
  are_friends boolean;
begin
  if me is null or to_user is null or body is null or trim(body) = '' then
    raise exception 'invalid_request';
  end if;
  if public.is_blocked_either(me, to_user) then
    raise exception 'blocked';
  end if;

  a := least(me, to_user); b := greatest(me, to_user);
  are_friends := exists (select 1 from public.friendships where user_a = a and user_b = b);

  select invite_restriction into target_restriction from public.profiles where id = to_user;
  if target_restriction = 'none' then
    raise exception 'blocked';
  end if;
  if target_restriction = 'friends' and not are_friends then
    raise exception 'blocked';
  end if;

  select name into my_name from public.profiles where id = me;

  select id, expires_after_ms into convo_id, expiry_ms from public.dm_conversations where user_a = a and user_b = b;
  if convo_id is null then
    insert into public.dm_conversations (user_a, user_b) values (a, b) returning id, expires_after_ms into convo_id, expiry_ms;
  end if;

  if expiry_ms is not null then
    new_expires_at := now() + (expiry_ms || ' milliseconds')::interval;
  else
    new_expires_at := null;
  end if;

  insert into public.dm_messages (
    conversation_id, from_user, from_name, text, media_url, is_adult, kind,
    duration_ms, latitude, longitude, file_name, file_size, mime_type,
    shared_user_id, shared_user_name, shared_user_handle, shared_user_avatar_url,
    poll_question, poll_options,
    is_forwarded, expires_at
  )
  values (
    convo_id, me, coalesce(my_name, 'Kullanici'), body, media_url, is_adult, kind,
    duration_ms, latitude, longitude, file_name, file_size, mime_type,
    shared_user_id, shared_user_name, shared_user_handle, shared_user_avatar_url,
    poll_question, poll_options,
    true, new_expires_at
  )
  returning * into result;

  return result;
end;
$$;

-- Anketi gonder - send_dm_location ile AYNI engelleme/arkadaslik kurallari.
-- En az 2, en fazla 10 secenek; bos/tek secenekli anket reddedilir.
create or replace function public.send_dm_poll(
  to_user uuid,
  question text,
  options text[]
)
returns public.dm_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  convo_id uuid;
  expiry_ms bigint;
  new_expires_at timestamptz;
  my_name text;
  result public.dm_messages;
  target_restriction text;
  are_friends boolean;
begin
  if me is null or to_user is null or question is null or trim(question) = '' then
    raise exception 'invalid_request';
  end if;
  if options is null or array_length(options, 1) is null or array_length(options, 1) < 2 or array_length(options, 1) > 10 then
    raise exception 'invalid_request';
  end if;
  if public.is_blocked_either(me, to_user) then
    raise exception 'blocked';
  end if;

  a := least(me, to_user); b := greatest(me, to_user);
  are_friends := exists (select 1 from public.friendships where user_a = a and user_b = b);

  select invite_restriction into target_restriction from public.profiles where id = to_user;
  if target_restriction = 'none' then
    raise exception 'blocked';
  end if;
  if target_restriction = 'friends' and not are_friends then
    raise exception 'blocked';
  end if;

  select name into my_name from public.profiles where id = me;

  select id, expires_after_ms into convo_id, expiry_ms from public.dm_conversations where user_a = a and user_b = b;
  if convo_id is null then
    insert into public.dm_conversations (user_a, user_b) values (a, b) returning id, expires_after_ms into convo_id, expiry_ms;
  end if;

  if expiry_ms is not null then
    new_expires_at := now() + (expiry_ms || ' milliseconds')::interval;
  else
    new_expires_at := null;
  end if;

  insert into public.dm_messages (conversation_id, from_user, from_name, text, kind, poll_question, poll_options, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), '📊 ' || question, 'poll', question, options, new_expires_at)
  returning * into result;

  return result;
end;
$$;

-- Oy ver/degistir - mesajin GERCEKTEN bu konusmaya ait bir anket olup
-- olmadigini VE cagiranin bu konusmanin tarafi olup olmadigini dogrular.
-- Guncel oy sayilarini (her secenek icin) jsonb olarak dondurur ki istemci
-- hem kendi hem (socket event'iyle) karsi tarafin ekranini GUNCEL tutabilsin.
create or replace function public.vote_dm_poll(
  message_id uuid,
  option_index int
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  options text[];
  n int;
  tally jsonb;
begin
  if me is null then raise exception 'unauthorized'; end if;

  select m.poll_options into options
    from public.dm_messages m
    join public.dm_conversations c on c.id = m.conversation_id
    where m.id = vote_dm_poll.message_id and m.kind = 'poll' and (c.user_a = me or c.user_b = me);
  if options is null then raise exception 'not_found'; end if;

  n := coalesce(array_length(options, 1), 0);
  if option_index < 0 or option_index >= n then raise exception 'invalid_request'; end if;

  insert into public.dm_poll_votes (message_id, user_id, option_index)
  values (vote_dm_poll.message_id, me, option_index)
  on conflict (message_id, user_id) do update set option_index = excluded.option_index, created_at = now();

  select jsonb_agg(cnt order by idx) into tally
  from (
    select gs.idx, count(v.user_id) as cnt
    from generate_series(0, n - 1) as gs(idx)
    left join public.dm_poll_votes v on v.message_id = vote_dm_poll.message_id and v.option_index = gs.idx
    group by gs.idx
  ) t;

  return jsonb_build_object('votes', coalesce(tally, '[]'::jsonb));
end;
$$;
