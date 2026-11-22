-- Grup sesli/fotograf mesajina "tek görünümlük" (view-once) - dm_messages'in
-- view_once/view_once_consumed_at kolonlariyla AYNI desen (bkz.
-- 0038_dm_voice_view_once.sql / 0039_dm_media_view_once.sql).
alter table public.group_messages
  add column if not exists view_once boolean not null default false,
  add column if not exists view_once_consumed_at timestamptz;

create or replace function public.send_group_image(
  gid uuid,
  media_url text,
  is_adult boolean default false,
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
  message_text := coalesce(nullif(trim(caption), ''), '📷 Fotoğraf');

  insert into public.group_messages (group_id, from_user, from_name, text, media_url, is_adult, kind, view_once)
  values (gid, me, coalesce(my_name, 'Kullanici'), message_text, media_url, is_adult, 'photo', coalesce(send_group_image.view_once, false))
  returning * into result;

  return result;
end;
$$;

create or replace function public.send_group_voice(
  gid uuid,
  media_url text,
  duration_ms integer default null,
  view_once boolean default false
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
  if me is null or media_url is null or trim(media_url) = '' then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name into my_name from public.profiles where id = me;

  insert into public.group_messages (group_id, from_user, from_name, text, media_url, kind, duration_ms, view_once)
  values (gid, me, coalesce(my_name, 'Kullanici'), '🎤 Sesli mesaj', media_url, 'voice', duration_ms, coalesce(send_group_voice.view_once, false))
  returning * into result;

  return result;
end;
$$;

-- DM'deki consume_dm_media_once ile AYNI mantik - SADECE grupta "iki taraf"
-- degil "ben haricindeki herhangi biri" oldugu icin kontrol
-- is_group_member'a dayaniyor. ILK kim acarsa (gonderen HARIC) media_url
-- HERKES icin temizlenir - gruptaki paylasimin "bir kere gorulup kaybolmasi"
-- (kullanicinin "birebir kişi mesajının aynısı" istegi).
create or replace function public.consume_group_media_once(message_id uuid)
returns public.group_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  result public.group_messages;
begin
  if me is null then raise exception 'unauthorized'; end if;

  select m.* into result
    from public.group_messages m
    where m.id = message_id
      and public.is_group_member(m.group_id, me)
      and m.kind in ('voice', 'photo')
      and m.view_once = true
      and m.from_user <> me;
  if result.id is null then raise exception 'not_found'; end if;

  if result.view_once_consumed_at is null then
    update public.group_messages
      set view_once_consumed_at = now(), media_url = null
      where id = message_id
      returning * into result;
  end if;

  return result;
end;
$$;
