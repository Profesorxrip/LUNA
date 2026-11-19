-- DM'de foto disinda sesli mesaj / konum / genel dosya gonderebilmek icin -
-- hepsi "chat-media" bucket'ini (foto ile AYNI owner-write/public-read
-- deseni, bkz. 0015_chat_media.sql) kullanir, konum haric (o sadece iki
-- sayi, hic dosya yuklenmez).
alter table public.dm_messages
  add column if not exists kind text not null default 'text',
  add column if not exists duration_ms integer,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text;

alter table public.dm_messages
  add constraint dm_messages_kind_check check (kind in ('text', 'photo', 'voice', 'location', 'file'));

-- Var olan satirlar: media_url dolu olan HER satir (0015'ten beri) zaten
-- bir fotografti - gecmise donuk olarak isaretliyoruz.
update public.dm_messages set kind = 'photo' where media_url is not null;

-- send_dm_image'i de ARTIK kind='photo' yazacak sekilde yeniden tanimliyoruz
-- (0020_dm_image_caption.sql ile AYNI govde, sadece kind eklendi).
create or replace function public.send_dm_image(
  to_user uuid,
  media_url text,
  is_adult boolean default false,
  caption text default null
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

  insert into public.dm_messages (conversation_id, from_user, from_name, text, media_url, is_adult, kind, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), message_text, media_url, is_adult, 'photo', new_expires_at)
  returning * into result;

  return result;
end;
$$;

-- send_dm_image'in sesli mesaj icin kardesi - ayni engelleme/arkadaslik
-- kurallari, sabit bir ozet metni ("🎤 Sesli mesaj").
create or replace function public.send_dm_voice(
  to_user uuid,
  media_url text,
  duration_ms integer default null
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

  insert into public.dm_messages (conversation_id, from_user, from_name, text, media_url, kind, duration_ms, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), '🎤 Sesli mesaj', media_url, 'voice', duration_ms, new_expires_at)
  returning * into result;

  return result;
end;
$$;

-- Konum paylasimi - dosya yok, sadece iki koordinat. "Gercek canli oda
-- haritasi" (room:location, bkz. rooms.ts) ile KARISTIRILMASIN: bu TEK
-- SEFERLIK, kalici bir mesaj (anlik konumun bir "fotografi" gibi).
create or replace function public.send_dm_location(
  to_user uuid,
  latitude double precision,
  longitude double precision
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
  if me is null or to_user is null or latitude is null or longitude is null then
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

  insert into public.dm_messages (conversation_id, from_user, from_name, text, kind, latitude, longitude, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), '📍 Konum', 'location', latitude, longitude, new_expires_at)
  returning * into result;

  return result;
end;
$$;

-- Genel dosya (pdf/zip/vb.) - client "chat-media" bucket'ina kendisi yukler
-- (foto ile ayni), buraya sadece ortaya cikan public URL + dosya bilgisi gelir.
create or replace function public.send_dm_file(
  to_user uuid,
  media_url text,
  file_name text,
  file_size bigint default null,
  mime_type text default null
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
  if me is null or to_user is null or media_url is null or trim(media_url) = '' or file_name is null or trim(file_name) = '' then
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

  insert into public.dm_messages (conversation_id, from_user, from_name, text, media_url, kind, file_name, file_size, mime_type, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), '📎 ' || file_name, media_url, 'file', file_name, file_size, mime_type, new_expires_at)
  returning * into result;

  return result;
end;
$$;
