-- DM'de bir mesaja basili tutunca cikan menu icin: Sil (herkesten/benden),
-- Sabitle (ayni sohbette BIRDEN FAZLA mesaj ayni anda sabit olabilir - bkz.
-- asagidaki dm_pinned_messages) ve Ilet. DIKKAT: buradaki "sabitleme"
-- dm_read_state.pinned'dan (0032_dm_conversation_state.sql - SOHBETI gelen
-- kutusunda ustte tutar) TAMAMEN FARKLI - bu bir sohbetin ICINDEKI tek bir
-- MESAJI sabitler.
alter table public.dm_messages
  add column if not exists deleted_for_everyone boolean not null default false,
  add column if not exists deleted_for uuid[] not null default '{}',
  add column if not exists is_forwarded boolean not null default false;

create table if not exists public.dm_pinned_messages (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

alter table public.dm_pinned_messages enable row level security;

create policy "dm_pinned_messages_select_involved" on public.dm_pinned_messages
  for select using (
    exists (
      select 1 from public.dm_conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- RPC: mesaji HERKESTEN sil - sadece GONDEREN yapabilir, metin/medya
-- gosterilmez (istemci deleted_for_everyone=true'yu "Bu mesaj silindi"
-- seklinde render eder - bkz. DMScreen.tsx).
-- ---------------------------------------------------------------------
create or replace function public.delete_dm_message_for_everyone(message_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  if me is null then raise exception 'unauthorized'; end if;
  select from_user into owner from public.dm_messages where id = message_id;
  if owner is null then raise exception 'not_found'; end if;
  if owner <> me then raise exception 'forbidden'; end if;
  update public.dm_messages set deleted_for_everyone = true where id = message_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: mesaji SADECE BENDEN sil - kendi mesajim ya da karsi tarafinki
-- olabilir, sadece benim gorunumumden kaybolur (deleted_for dizisine
-- eklenir, bkz. dm.ts openConversation'daki filtre).
-- ---------------------------------------------------------------------
create or replace function public.delete_dm_message_for_me(message_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  convo uuid;
begin
  if me is null then raise exception 'unauthorized'; end if;
  select m.conversation_id into convo
    from public.dm_messages m
    join public.dm_conversations c on c.id = m.conversation_id
    where m.id = message_id and (c.user_a = me or c.user_b = me);
  if convo is null then raise exception 'not_found'; end if;
  update public.dm_messages
    set deleted_for = array_append(deleted_for, me)
    where id = message_id and not (me = any(deleted_for));
end;
$$;

create or replace function public.pin_dm_message(message_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  convo uuid;
begin
  if me is null then raise exception 'unauthorized'; end if;
  select m.conversation_id into convo
    from public.dm_messages m
    join public.dm_conversations c on c.id = m.conversation_id
    where m.id = message_id and (c.user_a = me or c.user_b = me);
  if convo is null then raise exception 'not_found'; end if;
  insert into public.dm_pinned_messages (conversation_id, message_id, pinned_by)
    values (convo, message_id, me)
    on conflict (conversation_id, message_id) do nothing;
end;
$$;

create or replace function public.unpin_dm_message(message_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthorized'; end if;
  delete from public.dm_pinned_messages pm
    using public.dm_conversations c
    where pm.message_id = unpin_dm_message.message_id
      and pm.conversation_id = c.id
      and (c.user_a = me or c.user_b = me);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: ILET - var olan bir mesaji BASKA bir sohbete, kendi mesajimmis
-- gibi (send_dm_image/send_dm_voice/... ile AYNI engelleme/arkadaslik
-- kontrolleriyle) yeniden gonderir, is_forwarded=true isaretler. "kind"
-- disinda ilgisiz alanlar null gecilebilir - cagrisi dm.ts forwardMessage
-- icinde kind'e gore hazirlanir. Aramalar (kind='call') ILETILEMEZ, bu
-- istemci tarafinda engellenir (RPC burada kind'i kisitlamiyor).
-- ---------------------------------------------------------------------
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
    is_forwarded, expires_at
  )
  values (
    convo_id, me, coalesce(my_name, 'Kullanici'), body, media_url, is_adult, kind,
    duration_ms, latitude, longitude, file_name, file_size, mime_type,
    true, new_expires_at
  )
  returning * into result;

  return result;
end;
$$;
