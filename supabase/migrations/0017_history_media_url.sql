-- Platform secme ekranindaki "Gecmis"/"Begenilenler" izgarasindan bir
-- videoya dokununca AYNI videoyla yeni oda acabilmek icin gercek medya
-- linkine (media_url) ihtiyac var - su ana kadar get_user_room_history/
-- get_user_liked_history bunu DONDURMUYORDU (sadece kapak/baslik/tur).
-- Donus tipi degisikligi oldugu icin once eski fonksiyonlari kaldiriyoruz.
drop function if exists public.get_user_room_history(uuid, integer);
drop function if exists public.get_user_liked_history(uuid, integer);

create or replace function public.get_user_room_history(target uuid, max_rows integer default 12)
returns table (
  event_id uuid,
  room_code text,
  media_label text,
  media_cover_url text,
  media_type text,
  media_url text,
  participant_count integer,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
  can_see_gallery boolean;
  can_see_videos boolean;
begin
  if me = target then
    can_see_gallery := true;
    can_see_videos := true;
  else
    select gallery_visible, videos_visible into can_see_gallery, can_see_videos
    from public.profiles where id = target;
  end if;
  if not (coalesce(can_see_gallery, false) or coalesce(can_see_videos, false)) then
    return;
  end if;
  return query
    select re.id, re.room_code, re.media_label, re.media_cover_url, re.media_type, re.media_url, re.participant_count, re.created_at
    from public.room_events re
    where re.user_id = target and re.event_type in ('create', 'join') and re.media_label is not null
    order by re.created_at desc
    limit max_rows;
end;
$$;

create or replace function public.get_user_liked_history(target uuid, max_rows integer default 12)
returns table (
  event_id uuid,
  room_code text,
  media_label text,
  media_cover_url text,
  media_type text,
  media_url text,
  participant_count integer,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
  can_see_gallery boolean;
  can_see_videos boolean;
begin
  if me = target then
    can_see_gallery := true;
    can_see_videos := true;
  else
    select gallery_visible, videos_visible into can_see_gallery, can_see_videos
    from public.profiles where id = target;
  end if;
  if not (coalesce(can_see_gallery, false) or coalesce(can_see_videos, false)) then
    return;
  end if;
  return query
    select re.id, re.room_code, re.media_label, re.media_cover_url, re.media_type, re.media_url, re.participant_count, rel.created_at
    from public.room_event_likes rel
    join public.room_events re on re.id = rel.event_id
    where rel.user_id = target
    order by rel.created_at desc
    limit max_rows;
end;
$$;
