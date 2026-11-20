-- "Tek gorunumluk" (view-once) sesli mesaj - DMScreen.tsx'teki kilitli kayit
-- cubugundaki "1" anahtari artik SADECE arayuzde degil, GERCEKTEN calisiyor:
-- alici mesaji BIR KERE dinleyince media_url temizlenir (kalici olarak
-- kaybolur), her iki tarafta da "dinlendi" placeholder'i gosterilir.
alter table public.dm_messages
  add column if not exists view_once boolean not null default false,
  add column if not exists view_once_consumed_at timestamptz;

-- send_dm_voice'u view_once parametresi alacak sekilde yeniden tanimliyoruz
-- (0033_dm_message_kinds.sql'deki ile AYNI govde, sadece view_once eklendi).
create or replace function public.send_dm_voice(
  to_user uuid,
  media_url text,
  duration_ms integer default null,
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

  insert into public.dm_messages (conversation_id, from_user, from_name, text, media_url, kind, duration_ms, expires_at, view_once)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), '🎤 Sesli mesaj', media_url, 'voice', duration_ms, new_expires_at, coalesce(send_dm_voice.view_once, false))
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: tek-gorunumluk sesli mesaji "tuket" - sadece ALICI (gonderenin
-- KENDISI degil) cagirabilir; ilk cagrida media_url temizlenir ve
-- view_once_consumed_at damgalanir. Tekrar cagrilirsa (ag gecikmesi/
-- cift tiklama) idempotent - zaten tuketilmisse hata vermedenayni
-- (media_url'u zaten null) satiri dondurur.
-- ---------------------------------------------------------------------
create or replace function public.consume_dm_voice_once(message_id uuid)
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
      and m.kind = 'voice'
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
