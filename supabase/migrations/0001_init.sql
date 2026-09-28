-- LUNA production schema: profiles, friendships, blocks, DM.
-- Bu dosyayi Supabase Dashboard > SQL Editor'de calistir (tek seferlik).
-- Roadmap AŞAMA 2 (Database) + AŞAMA 4 (Authorization) karsiligi.
--
-- Tasarim prensibi: yetki kontrolu sadece uygulama kodunda degil, veritabani
-- seviyesinde de (RLS + SECURITY DEFINER RPC fonksiyonlari icinde auth.uid()
-- kontrolu) yapiliyor. Boylece bir istemci baska bir kullanicinin id'sini
-- gonderse bile, gercek yetkisi auth.uid() (dogrulanmis JWT) uzerinden
-- belirlenir - client'in soyledigi id'ye guvenilmez.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Kullanici',
  handle text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_all" on public.profiles
  for select using (true);

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

-- Yeni kullanici kayit olunca otomatik profil satiri olustur.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'Kullanici'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- blocks
-- ---------------------------------------------------------------------
create table if not exists public.blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

alter table public.blocks enable row level security;

create policy "blocks_select_own" on public.blocks
  for select using (blocker = auth.uid());

-- Dogrudan insert/delete kapali - sadece asagidaki RPC fonksiyonlari uzerinden.

-- ---------------------------------------------------------------------
-- friend_requests
-- ---------------------------------------------------------------------
create table if not exists public.friend_requests (
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user),
  constraint no_self_request check (from_user <> to_user)
);

alter table public.friend_requests enable row level security;

create policy "friend_requests_select_involved" on public.friend_requests
  for select using (from_user = auth.uid() or to_user = auth.uid());

-- ---------------------------------------------------------------------
-- friendships (user_a < user_b siralamasi zorunlu, tekil satir = tekil iliski)
-- ---------------------------------------------------------------------
create table if not exists public.friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint ordered_pair check (user_a < user_b)
);

alter table public.friendships enable row level security;

create policy "friendships_select_involved" on public.friendships
  for select using (user_a = auth.uid() or user_b = auth.uid());

-- ---------------------------------------------------------------------
-- dm_conversations / dm_messages
-- ---------------------------------------------------------------------
create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  expires_after_ms bigint,
  created_at timestamptz not null default now(),
  constraint ordered_pair check (user_a < user_b),
  unique (user_a, user_b)
);

alter table public.dm_conversations enable row level security;

create policy "dm_conversations_select_involved" on public.dm_conversations
  for select using (user_a = auth.uid() or user_b = auth.uid());

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  from_name text not null default 'Kullanici',
  text text not null check (char_length(text) between 1 and 1000),
  reply_to_text text,
  reply_to_from_name text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists dm_messages_conversation_idx on public.dm_messages (conversation_id, created_at);

alter table public.dm_messages enable row level security;

create policy "dm_messages_select_involved" on public.dm_messages
  for select using (
    exists (
      select 1 from public.dm_conversations c
      where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create table if not exists public.dm_read_state (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.dm_read_state enable row level security;

create policy "dm_read_state_select_own" on public.dm_read_state
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Yardimci: iki kullanici birbirini (herhangi bir yonde) engellemis mi?
-- ---------------------------------------------------------------------
create or replace function public.is_blocked_either(a uuid, b uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

-- ---------------------------------------------------------------------
-- RPC: arkadaslik istegi gonder
-- ---------------------------------------------------------------------
create or replace function public.send_friend_request(target uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
begin
  if me is null or target is null or me = target then return false; end if;
  if public.is_blocked_either(me, target) then return false; end if;

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

-- ---------------------------------------------------------------------
-- RPC: gonderilen istegi iptal et
-- ---------------------------------------------------------------------
create or replace function public.cancel_friend_request(target uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.friend_requests where from_user = auth.uid() and to_user = target;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: gelen istegi kabul/red et
-- ---------------------------------------------------------------------
create or replace function public.respond_friend_request(requester uuid, accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
begin
  if not exists (select 1 from public.friend_requests where from_user = requester and to_user = me) then
    return;
  end if;
  delete from public.friend_requests where from_user = requester and to_user = me;
  if accept then
    a := least(me, requester); b := greatest(me, requester);
    insert into public.friendships (user_a, user_b) values (a, b)
    on conflict do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: arkadaslikan cikar
-- ---------------------------------------------------------------------
create or replace function public.remove_friend(other_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
begin
  a := least(me, other_user); b := greatest(me, other_user);
  delete from public.friendships where user_a = a and user_b = b;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: engelle / engeli kaldir (engellemek arkadasligi ve bekleyen istekleri de temizler)
-- ---------------------------------------------------------------------
create or replace function public.block_user(target uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
begin
  if me is null or target is null or me = target then return; end if;
  insert into public.blocks (blocker, blocked) values (me, target)
  on conflict do nothing;
  a := least(me, target); b := greatest(me, target);
  delete from public.friendships where user_a = a and user_b = b;
  delete from public.friend_requests
  where (from_user = me and to_user = target) or (from_user = target and to_user = me);
end;
$$;

create or replace function public.unblock_user(target uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.blocks where blocker = auth.uid() and blocked = target;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: iki kullanici arasindaki durum (none/outgoing/incoming/friends/blocked)
-- ---------------------------------------------------------------------
create or replace function public.get_friend_status(other_user uuid)
returns text
language plpgsql
security definer set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
begin
  if public.is_blocked_either(me, other_user) then return 'blocked'; end if;
  a := least(me, other_user); b := greatest(me, other_user);
  if exists (select 1 from public.friendships where user_a = a and user_b = b) then
    return 'friends';
  end if;
  if exists (select 1 from public.friend_requests where from_user = me and to_user = other_user) then
    return 'outgoing';
  end if;
  if exists (select 1 from public.friend_requests where from_user = other_user and to_user = me) then
    return 'incoming';
  end if;
  return 'none';
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: DM konusmasini (yoksa olusturarak) getir, gorulmus say
-- ---------------------------------------------------------------------
create or replace function public.open_dm(other_user uuid)
returns uuid
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
  if convo_id is null then
    insert into public.dm_conversations (user_a, user_b) values (a, b) returning id into convo_id;
  end if;
  delete from public.dm_messages where conversation_id = convo_id and expires_at is not null and expires_at < now();
  insert into public.dm_read_state (conversation_id, user_id, last_seen_at)
  values (convo_id, me, now())
  on conflict (conversation_id, user_id) do update set last_seen_at = now();
  return convo_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: DM gonder (engellenmisse reddedilir)
-- ---------------------------------------------------------------------
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
begin
  if me is null or to_user is null or trim(body) = '' then
    raise exception 'invalid_request';
  end if;
  if public.is_blocked_either(me, to_user) then
    raise exception 'blocked';
  end if;

  select name into my_name from public.profiles where id = me;

  a := least(me, to_user); b := greatest(me, to_user);
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

-- ---------------------------------------------------------------------
-- RPC: mesaj suresi ayari
-- ---------------------------------------------------------------------
create or replace function public.set_dm_expiry(other_user uuid, ms bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
begin
  a := least(me, other_user); b := greatest(me, other_user);
  update public.dm_conversations set expires_after_ms = ms where user_a = a and user_b = b;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: gorulmus olarak isaretle
-- ---------------------------------------------------------------------
create or replace function public.mark_dm_seen(other_user uuid)
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
  insert into public.dm_read_state (conversation_id, user_id, last_seen_at)
  values (convo_id, me, now())
  on conflict (conversation_id, user_id) do update set last_seen_at = now();
end;
$$;

-- ---------------------------------------------------------------------
-- reports (moderasyon - roadmap AŞAMA 11)
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users(id) on delete cascade,
  target_user uuid references auth.users(id) on delete set null,
  target_message_id uuid,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

create policy "reports_select_own" on public.reports
  for select using (reporter = auth.uid());

-- Not: admin/moderasyon paneli bu asamanin kapsami disinda - reports
-- tablosu su an sadece kayit altina aliyor, gorunumu/yonetimi ayri bir
-- admin arayuzu gerektirir (roadmap AŞAMA 11'in geri kalani).
create or replace function public.submit_report(
  target_user uuid default null,
  target_message_id uuid default null,
  reason text default ''
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or trim(reason) = '' then
    raise exception 'invalid_request';
  end if;
  insert into public.reports (reporter, target_user, target_message_id, reason)
  values (me, target_user, target_message_id, left(trim(reason), 500));
end;
$$;

-- ---------------------------------------------------------------------
-- room_events (roadmap AŞAMA 6 - oda/izleme gecmisi, analitik icin)
-- ---------------------------------------------------------------------
create table if not exists public.room_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  room_code text not null,
  event_type text not null check (event_type in ('create', 'join', 'leave')),
  media_label text,
  created_at timestamptz not null default now()
);

create index if not exists room_events_user_idx on public.room_events (user_id, created_at);

alter table public.room_events enable row level security;

create policy "room_events_select_own" on public.room_events
  for select using (user_id = auth.uid());

create policy "room_events_insert_own" on public.room_events
  for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- push_tokens (roadmap AŞAMA 9 - bildirim altyapisi)
-- ---------------------------------------------------------------------
create table if not exists public.push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "push_tokens_select_own" on public.push_tokens
  for select using (user_id = auth.uid());

create policy "push_tokens_insert_own" on public.push_tokens
  for insert with check (user_id = auth.uid());

create policy "push_tokens_delete_own" on public.push_tokens
  for delete using (user_id = auth.uid());

-- Bir kullanicinin push token'larini getirir - bildirim gonderirken
-- kullanilir (alici cevrimdisiyse). RLS'i bypass eder (SECURITY DEFINER)
-- ama KEYFI erisime izin vermez: cagiran ile hedef arasinda gercek bir
-- iliski (arkadas / bekleyen istek / DM konusmasi) olmadan hicbir token
-- donmez - aksi halde herhangi bir hesap, sadece baskasinin user id'sini
-- bilerek onun push token'larini toplayabilirdi (IDOR).
create or replace function public.get_push_tokens_for_user(target uuid)
returns setof text
language plpgsql
security definer set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  related boolean;
begin
  if me is null or target is null then return; end if;
  a := least(me, target); b := greatest(me, target);
  related := exists(select 1 from public.friendships where user_a = a and user_b = b)
    or exists(
      select 1 from public.friend_requests
      where (from_user = me and to_user = target) or (from_user = target and to_user = me)
    )
    or exists(select 1 from public.dm_conversations where user_a = a and user_b = b);
  if not related then return; end if;
  return query select token from public.push_tokens where user_id = target;
end;
$$;

-- ---------------------------------------------------------------------
-- avatars storage bucket (roadmap AŞAMA 8 - medya yukleme altyapisi)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Herkes sadece KENDI klasorune (avatars/<user_id>/...) yukleyebilir/silebilir.
create policy "avatar_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
