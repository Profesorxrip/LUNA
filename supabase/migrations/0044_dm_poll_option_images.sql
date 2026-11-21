-- DM anketine secenek fotografi ekleme - gonderi anketindeki (bkz.
-- UserProfileScreen.tsx composerPollOptionImages / 0027_post_polls.sql
-- poll_option_images) AYNI ozellik: her secenegin KENDI (opsiyonel)
-- fotografi olabilir, dizi poll_options ile AYNI uzunlukta (resmi
-- olmayan secenekte o indexte null).
alter table public.dm_messages
  add column if not exists poll_option_images text[];

create or replace function public.send_dm_poll(
  to_user uuid,
  question text,
  options text[],
  option_images text[] default null
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
  if option_images is not null and array_length(option_images, 1) is distinct from array_length(options, 1) then
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

  insert into public.dm_messages (conversation_id, from_user, from_name, text, kind, poll_question, poll_options, poll_option_images, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), '📊 ' || question, 'poll', question, options, option_images, new_expires_at)
  returning * into result;

  return result;
end;
$$;

-- forward_dm_message'i poll_option_images'i da tasiyacak sekilde genislet.
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
  poll_options text[] default null,
  poll_option_images text[] default null
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
    poll_question, poll_options, poll_option_images,
    is_forwarded, expires_at
  )
  values (
    convo_id, me, coalesce(my_name, 'Kullanici'), body, media_url, is_adult, kind,
    duration_ms, latitude, longitude, file_name, file_size, mime_type,
    shared_user_id, shared_user_name, shared_user_handle, shared_user_avatar_url,
    poll_question, poll_options, poll_option_images,
    true, new_expires_at
  )
  returning * into result;

  return result;
end;
$$;
