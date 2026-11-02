-- DM gorsel mesajlarina ISTEGE BAGLI bir metin (caption) eklenebilmesi icin
-- send_dm_image'i yeniden tanimliyoruz. Caption bos/yoksa eskisi gibi sabit
-- "📷 Fotoğraf" ozetini kullanmaya devam ediyoruz (bkz. 0015_chat_media.sql).
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

  insert into public.dm_messages (conversation_id, from_user, from_name, text, media_url, is_adult, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), message_text, media_url, is_adult, new_expires_at)
  returning * into result;

  return result;
end;
$$;
