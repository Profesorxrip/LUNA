-- Oda sohbeti ve DM'de GERCEK fotograf gonderme + "+18 isaretle" secenegi.
-- Oda sohbeti mesajlari (0001'den beri) hic kalici olmadigi icin burada
-- sadece DM tarafinda sutun eklemek gerekiyor - oda tarafinda ChatMessage
-- sadece bellekte (socket.ts/rooms.ts) tasinir, DB'ye dokunmaz.
alter table public.dm_messages
  add column if not exists media_url text,
  add column if not exists is_adult boolean not null default false;

-- send_dm'in ayni engelleme/arkadaslik kurallarini tasiyan, metin yerine
-- fotograf gonderen kardes fonksiyonu - send_dm'in kendisine dokunmuyoruz
-- (orada "text" sutunu bos olamaz, bkz. 0001_init.sql check kisiti).
create or replace function public.send_dm_image(
  to_user uuid,
  media_url text,
  is_adult boolean default false
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

  -- "text" sutunu bos olamaz (check kisiti) - gorsel mesajlarda da ChatMessage
  -- ile ayni "her zaman duz bir yedek ozet" kuralini takip eden sabit bir
  -- baslik kullaniyoruz.
  insert into public.dm_messages (conversation_id, from_user, from_name, text, media_url, is_adult, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), '📷 Fotoğraf', media_url, is_adult, new_expires_at)
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- chat-media storage bucket - avatars/gallery ile AYNI "sadece kendi
-- klasorune (chat-media/<user_id>/...) yaz" deseni (bkz. 0001/0004).
-- Oda sohbeti VE DM gorselleri burada tutulur.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

create policy "chat_media_public_read" on storage.objects
  for select using (bucket_id = 'chat-media');

create policy "chat_media_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text
  );
