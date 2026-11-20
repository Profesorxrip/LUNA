-- "Tek gorunumluk" (view-once) artik fotograf ve videoda da GERCEKTEN
-- calisiyor - 0038_dm_voice_view_once.sql'deki view_once/view_once_consumed_at
-- kolonlari zaten TUM dm_messages satirlarinda (kind'dan bagimsiz) mevcuttu,
-- burada sadece send_dm_image/send_dm_video RPC'lerine view_once parametresi
-- ekleniyor ve voice'a ozel consume_dm_voice_once'in YERINE (voice'u da
-- kapsayan) genel bir consume_dm_media_once ekleniyor.

-- send_dm_image'i view_once parametresi alacak sekilde yeniden tanimliyoruz
-- (0033_dm_message_kinds.sql'deki ile AYNI govde, sadece view_once eklendi).
create or replace function public.send_dm_image(
  to_user uuid,
  media_url text,
  is_adult boolean default false,
  caption text default null,
  view_once boolean default false
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
  message_text text;
begin
  if me is null or to_user is null or media_url is null or trim(media_url) = '' then
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

  message_text := coalesce(nullif(trim(caption), ''), '📷 Fotoğraf');

  insert into public.dm_messages (conversation_id, from_user, from_name, text, media_url, is_adult, kind, expires_at, view_once)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), message_text, media_url, is_adult, 'photo', new_expires_at, coalesce(send_dm_image.view_once, false))
  returning * into result;

  return result;
end;
$$;

-- send_dm_video'yu view_once parametresi alacak sekilde yeniden tanimliyoruz
-- (0034_dm_video_messages.sql'deki ile AYNI govde, sadece view_once eklendi).
create or replace function public.send_dm_video(
  to_user uuid,
  media_url text,
  duration_ms integer default null,
  caption text default null,
  view_once boolean default false
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
  message_text text;
begin
  if me is null or to_user is null or media_url is null or trim(media_url) = '' then
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

  message_text := coalesce(nullif(trim(caption), ''), '🎥 Video');

  insert into public.dm_messages (conversation_id, from_user, from_name, text, media_url, kind, duration_ms, expires_at, view_once)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), message_text, media_url, 'video', duration_ms, new_expires_at, coalesce(send_dm_video.view_once, false))
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: tek-gorunumluk bir mesaji (sesli/foto/video - HANGISI OLURSA) "tuket" -
-- consume_dm_voice_once (0038) ile AYNI mantik, sadece "kind = 'voice'"
-- kisitlamasi kaldirilip ucune de acildi. consume_dm_voice_once eski
-- istemciler icin dokunulmadan DURUYOR, yeni istemci (foto/video icin)
-- bunun yerine BUNU cagiriyor.
-- ---------------------------------------------------------------------
create or replace function public.consume_dm_media_once(message_id uuid)
returns public.dm_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  result public.dm_messages;
begin
  if me is null then raise exception 'unauthorized'; end if;

  select m.* into result
    from public.dm_messages m
    join public.dm_conversations c on c.id = m.conversation_id
    where m.id = message_id
      and (c.user_a = me or c.user_b = me)
      and m.kind in ('voice', 'photo', 'video')
      and m.view_once = true
      and m.from_user <> me;
  if result.id is null then raise exception 'not_found'; end if;

  if result.view_once_consumed_at is null then
    update public.dm_messages
      set view_once_consumed_at = now(), media_url = null
      where id = message_id
      returning * into result;
  end if;

  return result;
end;
$$;
