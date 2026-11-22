-- Grup sohbetine fotograf/kamera ve sesli mesaj - dm_messages'in kind/
-- media_url/is_adult/duration_ms kolonlariyla AYNI desen (bkz.
-- 0033_dm_message_kinds.sql), ilk surumde sadece "text" oldugu icin
-- group_messages'ta bu kolonlar hic yoktu.
alter table public.group_messages
  add column if not exists kind text not null default 'text',
  add column if not exists media_url text,
  add column if not exists is_adult boolean not null default false,
  add column if not exists duration_ms integer;

-- "text" alanindaki uzunluk kisitlamasi fotograf/ses icin kullanilan sabit
-- yer tutucu metinlerle (orn. "📷 Fotoğraf") hala uyumlu, degistirmeye
-- gerek yok.

create or replace function public.send_group_image(
  gid uuid,
  media_url text,
  is_adult boolean default false,
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
  if me is null or media_url is null or trim(media_url) = '' then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name into my_name from public.profiles where id = me;
  message_text := coalesce(nullif(trim(caption), ''), '📷 Fotoğraf');

  insert into public.group_messages (group_id, from_user, from_name, text, media_url, is_adult, kind)
  values (gid, me, coalesce(my_name, 'Kullanici'), message_text, media_url, is_adult, 'photo')
  returning * into result;

  return result;
end;
$$;

create or replace function public.send_group_voice(
  gid uuid,
  media_url text,
  duration_ms integer default null
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

  insert into public.group_messages (group_id, from_user, from_name, text, media_url, kind, duration_ms)
  values (gid, me, coalesce(my_name, 'Kullanici'), '🎤 Sesli mesaj', media_url, 'voice', duration_ms)
  returning * into result;

  return result;
end;
$$;
