-- Grup sohbetine DM'deki geri kalan mesaj turleri: konum, genel dosya,
-- muzik, kisi karti, anket (+secenek fotograflari), cikartma (bundle
-- edilmis VEYA kullanicinin kendi yuklediği) ve video. Hepsi DM'in
-- 0033/0034/0041/0042/0043/0044/0045/0046 migration'lariyla AYNI desen -
-- sadece to_user/friendship/engelleme kontrolleri yerine is_group_member
-- kullanilir, N kisi oldugu icin "kisi" paylasimi/anket oylari da N kisiye
-- gore calisir.
alter table public.group_messages
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists shared_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists shared_user_name text,
  add column if not exists shared_user_handle text,
  add column if not exists shared_user_avatar_url text,
  add column if not exists poll_question text,
  add column if not exists poll_options text[],
  add column if not exists poll_option_images text[],
  add column if not exists sticker_id text;

alter table public.group_messages drop constraint if exists group_messages_kind_check;
alter table public.group_messages
  add constraint group_messages_kind_check
  check (kind in ('text', 'photo', 'voice', 'location', 'file', 'video', 'contact', 'poll', 'music', 'sticker'));

create table if not exists public.group_poll_votes (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.group_poll_votes enable row level security;

create policy "group_poll_votes_select_member" on public.group_poll_votes
  for select using (
    exists (
      select 1 from public.group_messages m
      where m.id = group_poll_votes.message_id and public.is_group_member(m.group_id, auth.uid())
    )
  );

create or replace function public.send_group_location(gid uuid, latitude double precision, longitude double precision)
returns public.group_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  result public.group_messages;
begin
  if me is null or latitude is null or longitude is null then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name into my_name from public.profiles where id = me;

  insert into public.group_messages (group_id, from_user, from_name, text, kind, latitude, longitude)
  values (gid, me, coalesce(my_name, 'Kullanici'), '📍 Konum', 'location', latitude, longitude)
  returning * into result;

  return result;
end;
$$;

create or replace function public.send_group_file(
  gid uuid,
  media_url text,
  file_name text,
  file_size bigint default null,
  mime_type text default null,
  caption text default null
)
returns public.group_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  message_text text;
  result public.group_messages;
begin
  if me is null or media_url is null or trim(media_url) = '' or file_name is null or trim(file_name) = '' then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name into my_name from public.profiles where id = me;
  message_text := coalesce(nullif(trim(caption), ''), '📎 ' || file_name);

  insert into public.group_messages (group_id, from_user, from_name, text, media_url, kind, file_name, file_size, mime_type)
  values (gid, me, coalesce(my_name, 'Kullanici'), message_text, media_url, 'file', file_name, file_size, mime_type)
  returning * into result;

  return result;
end;
$$;

create or replace function public.send_group_music(
  gid uuid,
  media_url text,
  file_name text,
  file_size bigint default null,
  mime_type text default null,
  caption text default null
)
returns public.group_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  message_text text;
  result public.group_messages;
begin
  if me is null or media_url is null or trim(media_url) = '' or file_name is null or trim(file_name) = '' then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name into my_name from public.profiles where id = me;
  message_text := coalesce(nullif(trim(caption), ''), '🎵 ' || file_name);

  insert into public.group_messages (group_id, from_user, from_name, text, media_url, kind, file_name, file_size, mime_type)
  values (gid, me, coalesce(my_name, 'Kullanici'), message_text, media_url, 'music', file_name, file_size, mime_type)
  returning * into result;

  return result;
end;
$$;

create or replace function public.send_group_contact(gid uuid, shared_user_id uuid)
returns public.group_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  shared_name text;
  shared_handle text;
  shared_avatar_url text;
  result public.group_messages;
begin
  if me is null or shared_user_id is null then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name, handle, avatar_url into shared_name, shared_handle, shared_avatar_url
  from public.profiles where id = shared_user_id;
  if shared_name is null then
    raise exception 'invalid_request';
  end if;

  select name into my_name from public.profiles where id = me;

  insert into public.group_messages (
    group_id, from_user, from_name, text, kind,
    shared_user_id, shared_user_name, shared_user_handle, shared_user_avatar_url
  )
  values (
    gid, me, coalesce(my_name, 'Kullanici'), '👤 ' || shared_name, 'contact',
    shared_user_id, shared_name, shared_handle, shared_avatar_url
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.send_group_poll(
  gid uuid,
  question text,
  options text[],
  option_images text[] default null
)
returns public.group_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  result public.group_messages;
begin
  if me is null or question is null or trim(question) = '' then
    raise exception 'invalid_request';
  end if;
  if options is null or array_length(options, 1) is null or array_length(options, 1) < 2 or array_length(options, 1) > 10 then
    raise exception 'invalid_request';
  end if;
  if option_images is not null and array_length(option_images, 1) is distinct from array_length(options, 1) then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name into my_name from public.profiles where id = me;

  insert into public.group_messages (group_id, from_user, from_name, text, kind, poll_question, poll_options, poll_option_images)
  values (gid, me, coalesce(my_name, 'Kullanici'), '📊 ' || question, 'poll', question, options, option_images)
  returning * into result;

  return result;
end;
$$;

-- Oy ver/degistir - DM'den FARKLI olarak grupta N kisi oldugu icin guncel
-- sayilari HER SEFERINDE group_poll_votes'tan yeniden hesapliyoruz (bkz.
-- group.ts attachPollExtras - DM'deki "sadece 2 oy olabilir" varsayimi
-- gecerli degil).
create or replace function public.vote_group_poll(message_id uuid, option_index int)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  options text[];
  n int;
  tally jsonb;
begin
  if me is null then raise exception 'unauthorized'; end if;

  select m.poll_options into options
    from public.group_messages m
    where m.id = vote_group_poll.message_id and m.kind = 'poll' and public.is_group_member(m.group_id, me);
  if options is null then raise exception 'not_found'; end if;

  n := coalesce(array_length(options, 1), 0);
  if option_index < 0 or option_index >= n then raise exception 'invalid_request'; end if;

  insert into public.group_poll_votes (message_id, user_id, option_index)
  values (vote_group_poll.message_id, me, option_index)
  on conflict (message_id, user_id) do update set option_index = excluded.option_index, created_at = now();

  select jsonb_agg(cnt order by idx) into tally
  from (
    select gs.idx, count(v.user_id) as cnt
    from generate_series(0, n - 1) as gs(idx)
    left join public.group_poll_votes v on v.message_id = vote_group_poll.message_id and v.option_index = gs.idx
    group by gs.idx
  ) t;

  return jsonb_build_object('votes', coalesce(tally, '[]'::jsonb));
end;
$$;

create or replace function public.send_group_sticker(
  gid uuid,
  sticker_id text default null,
  media_url text default null
)
returns public.group_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  result public.group_messages;
begin
  if me is null then
    raise exception 'invalid_request';
  end if;
  if (sticker_id is null or trim(sticker_id) = '') and (media_url is null or trim(media_url) = '') then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name into my_name from public.profiles where id = me;

  insert into public.group_messages (group_id, from_user, from_name, text, kind, sticker_id, media_url)
  values (gid, me, coalesce(my_name, 'Kullanici'), '🏷️ Çıkartma', 'sticker', sticker_id, media_url)
  returning * into result;

  return result;
end;
$$;

create or replace function public.send_group_video(
  gid uuid,
  media_url text,
  duration_ms integer default null,
  caption text default null,
  view_once boolean default false
)
returns public.group_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  message_text text;
  result public.group_messages;
begin
  if me is null or media_url is null or trim(media_url) = '' then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name into my_name from public.profiles where id = me;
  message_text := coalesce(nullif(trim(caption), ''), '🎥 Video');

  insert into public.group_messages (group_id, from_user, from_name, text, media_url, kind, duration_ms, view_once)
  values (gid, me, coalesce(my_name, 'Kullanici'), message_text, media_url, 'video', duration_ms, view_once)
  returning * into result;

  return result;
end;
$$;
