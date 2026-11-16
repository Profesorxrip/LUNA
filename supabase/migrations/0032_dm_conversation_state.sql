-- ---------------------------------------------------------------------
-- DM listesi uzun-basma menusu (Sabitle/Sessize Al/Arsivle/Sil) icin
-- kisiye OZEL (sadece BANA ait, karsi tarafi etkilemeyen) durum alanlari.
-- dm_read_state zaten (conversation_id, user_id) bazinda kisiye ozel bir
-- tablo oldugu icin oraya eklendi.
-- ---------------------------------------------------------------------
alter table public.dm_read_state add column if not exists pinned boolean not null default false;
alter table public.dm_read_state add column if not exists muted boolean not null default false;
alter table public.dm_read_state add column if not exists archived boolean not null default false;
alter table public.dm_read_state add column if not exists manual_unread boolean not null default false;
-- "Sohbeti sil" - karsi tarafi etkilemeyen, SADECE benim listemden gizleyen
-- yumusak silme. hidden_at'tan SONRA gelen yeni bir mesaj sohbeti otomatik
-- geri getirir (bkz. dm.ts listConversations filtresi).
alter table public.dm_read_state add column if not exists hidden_at timestamptz;

create or replace function public.set_dm_pinned(other_user uuid, p_pinned boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  convo_id uuid;
begin
  a := least(me, other_user); b := greatest(me, other_user);
  select id into convo_id from public.dm_conversations where user_a = a and user_b = b;
  if convo_id is null then return; end if;
  insert into public.dm_read_state (conversation_id, user_id, last_seen_at, pinned)
  values (convo_id, me, to_timestamp(0), p_pinned)
  on conflict (conversation_id, user_id) do update set pinned = p_pinned;
end;
$$;

create or replace function public.set_dm_muted(other_user uuid, p_muted boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  convo_id uuid;
begin
  a := least(me, other_user); b := greatest(me, other_user);
  select id into convo_id from public.dm_conversations where user_a = a and user_b = b;
  if convo_id is null then return; end if;
  insert into public.dm_read_state (conversation_id, user_id, last_seen_at, muted)
  values (convo_id, me, to_timestamp(0), p_muted)
  on conflict (conversation_id, user_id) do update set muted = p_muted;
end;
$$;

create or replace function public.set_dm_archived(other_user uuid, p_archived boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  convo_id uuid;
begin
  a := least(me, other_user); b := greatest(me, other_user);
  select id into convo_id from public.dm_conversations where user_a = a and user_b = b;
  if convo_id is null then return; end if;
  insert into public.dm_read_state (conversation_id, user_id, last_seen_at, archived)
  values (convo_id, me, to_timestamp(0), p_archived)
  on conflict (conversation_id, user_id) do update set archived = p_archived;
end;
$$;

-- p_unread true -> "Okunmadi olarak isaretle" (gercek last_seen_at'e
-- DOKUNMAZ, zaten okunmus eski mesajlarin ustune manuel bir "okunmadi"
-- rozeti bindirir). p_unread false -> "Okundu olarak isaretle", mark_dm_seen
-- ile AYNI sekilde last_seen_at'i simdiye ceker.
create or replace function public.set_dm_manual_unread(other_user uuid, p_unread boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  convo_id uuid;
begin
  a := least(me, other_user); b := greatest(me, other_user);
  select id into convo_id from public.dm_conversations where user_a = a and user_b = b;
  if convo_id is null then return; end if;
  if p_unread then
    insert into public.dm_read_state (conversation_id, user_id, last_seen_at, manual_unread)
    values (convo_id, me, to_timestamp(0), true)
    on conflict (conversation_id, user_id) do update set manual_unread = true;
  else
    insert into public.dm_read_state (conversation_id, user_id, last_seen_at, manual_unread)
    values (convo_id, me, now(), false)
    on conflict (conversation_id, user_id) do update set manual_unread = false, last_seen_at = now();
  end if;
end;
$$;

create or replace function public.hide_dm_conversation(other_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  convo_id uuid;
begin
  a := least(me, other_user); b := greatest(me, other_user);
  select id into convo_id from public.dm_conversations where user_a = a and user_b = b;
  if convo_id is null then return; end if;
  insert into public.dm_read_state (conversation_id, user_id, last_seen_at, hidden_at)
  values (convo_id, me, to_timestamp(0), now())
  on conflict (conversation_id, user_id) do update set hidden_at = now();
end;
$$;
