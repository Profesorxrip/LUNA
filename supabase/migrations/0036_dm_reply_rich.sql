-- Cevap (reply) alintisi su ana kadar SADECE duz bir metin+isimdi
-- (reply_to_text/reply_to_from_name) - foto/video/arama/konum/dosya/ses
-- kaydina cevap verildiginde de alinti sadece "📷 Fotoğraf" gibi duz bir
-- yazi gosteriyordu. Artik yanitlanan mesajin TURUNU ve (varsa) medya
-- URL'ini de saklayarak istemcinin alinti kutusunda uygun ikonu/kucuk
-- resim onizlemesini gosterebilmesini sagliyoruz (bkz. DMScreen.tsx
-- ReplyPreview bileseni).
alter table public.dm_messages
  add column if not exists reply_to_kind text,
  add column if not exists reply_to_media_url text;

-- send_dm'in (0013_invite_restriction.sql'deki) AYNI govdesi - sadece iki
-- yeni parametre eklendi ve insert'e eklendi.
create or replace function public.send_dm(
  to_user uuid,
  body text,
  reply_text text default null,
  reply_from_name text default null,
  reply_kind text default null,
  reply_media_url text default null
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
  if me is null or to_user is null or trim(body) = '' then
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

  insert into public.dm_messages (conversation_id, from_user, from_name, text, reply_to_text, reply_to_from_name, reply_to_kind, reply_to_media_url, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), left(trim(body), 1000), reply_text, reply_from_name, reply_kind, reply_media_url, new_expires_at)
  returning * into result;

  return result;
end;
$$;
