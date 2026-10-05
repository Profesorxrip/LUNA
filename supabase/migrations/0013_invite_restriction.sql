-- Ayarlar ekranindaki "Davetleri Kisitla" artik GERCEK bir tercih:
-- herkes / sadece arkadaslar / hickimse kimlerin seninle iletisime
-- gecebilecegini (arkadaslik istegi + DM) belirler.
alter table public.profiles
  add column if not exists invite_restriction text not null default 'everyone'
  check (invite_restriction in ('everyone', 'friends', 'none'));

-- Yeni bir arkadaslik istegi, zaten arkadas OLMAYAN birinden gelir - bu
-- yuzden hedefin tercihi "friends" ya da "none" ise (ikisi de "yeni
-- yabancilardan istek kabul etme" anlamina gelir) yeni istekler reddedilir.
-- "friends" modunda VAROLAN arkadaslar yine DM gonderebilir (asagidaki
-- send_dm'e bakin) - sadece YENI baglanti kurulamiyor.
create or replace function public.send_friend_request(target uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  target_restriction text;
begin
  if me is null or target is null or me = target then return false; end if;
  if public.is_blocked_either(me, target) then return false; end if;

  select invite_restriction into target_restriction from public.profiles where id = target;
  if target_restriction in ('friends', 'none') then return false; end if;

  a := least(me, target); b := greatest(me, target);
  if exists (select 1 from public.friendships where user_a = a and user_b = b) then
    return false;
  end if;
  if exists (
    select 1 from public.friend_requests
    where (from_user = me and to_user = target) or (from_user = target and to_user = me)
  ) then
    return false;
  end if;

  insert into public.friend_requests (from_user, to_user) values (me, target);
  return true;
end;
$$;

-- send_dm'e ayni kontrolu ekliyoruz: "none" hic kimseden DM kabul etmez,
-- "friends" sadece zaten arkadas olanlardan kabul eder.
create or replace function public.send_dm(
  to_user uuid,
  body text,
  reply_text text default null,
  reply_from_name text default null
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

  insert into public.dm_messages (conversation_id, from_user, from_name, text, reply_to_text, reply_to_from_name, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), left(trim(body), 1000), reply_text, reply_from_name, new_expires_at)
  returning * into result;

  return result;
end;
$$;
