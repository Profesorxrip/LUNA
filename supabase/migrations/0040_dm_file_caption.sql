-- Kullanici: "Altta mesaj yazma ekranı olsun" - dosya gonderirken fotograf
-- gonderimindeki (send_dm_image, bkz. 0020_dm_image_caption.sql) ile AYNI
-- sekilde istege bagli bir mesaj/altyazi eklenebilsin. "caption" verilmisse
-- mesajin "text"i o olur, verilmemisse eski sabit "📎 dosya_adi" ozetine
-- geri duser - boylece eski istemciler/kayitlar bozulmaz.
create or replace function public.send_dm_file(
  to_user uuid,
  media_url text,
  file_name text,
  file_size bigint default null,
  mime_type text default null,
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

  message_text := coalesce(nullif(trim(caption), ''), '📎 ' || file_name);

  insert into public.dm_messages (conversation_id, from_user, from_name, text, media_url, kind, file_name, file_size, mime_type, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), message_text, media_url, 'file', file_name, file_size, mime_type, new_expires_at)
  returning * into result;

  return result;
end;
$$;
