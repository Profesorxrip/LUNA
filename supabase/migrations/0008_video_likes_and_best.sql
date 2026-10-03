-- GECMIS bolumune "En Iyiler / Gecmis / Begenilenler" sekmelerini GERCEK
-- veriyle geri getiriyoruz:
-- - "Gecmis": zaten vardi, degismedi (kronolojik).
-- - "En Iyiler": ayni gecmis veriden, en kalabalik izlenen odalara gore
--   (room_events.participant_count) siralanir - istemci tarafinda, yeni
--   veri gerekmiyor, sadece RPC'nin event_id/participant_count DONDURMESI
--   gerekiyor (su ana kadar donmuyordu).
-- - "Begenilenler": kullanicinin KENDI gecmisindeki kayitlardan begendigi
--   (kalp ikonuyla isaretledigi) altkume - yeni room_event_likes tablosu.

create table if not exists public.room_event_likes (
  event_id uuid not null references public.room_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.room_event_likes enable row level security;

-- Begeniler sadece sahibi tarafindan dogrudan okunabilir/yazilabilir -
-- baskasinin "Begenilenler" sekmesi SECURITY DEFINER RPC'den (asagida)
-- gelir, bu tablo dogrudan disaridan okunmaz.
create policy "room_event_likes_select_own" on public.room_event_likes
  for select using (user_id = auth.uid());

create policy "room_event_likes_owner_insert" on public.room_event_likes
  for insert with check (user_id = auth.uid());

create policy "room_event_likes_owner_delete" on public.room_event_likes
  for delete using (user_id = auth.uid());

-- get_user_room_history'nin donus tipi degisiyor (event_id + participant_count
-- eklendi) - CREATE OR REPLACE donus tipi degisikliginde calismiyor, once
-- eski fonksiyonu kaldiriyoruz.
drop function if exists public.get_user_room_history(uuid, integer);

create or replace function public.get_user_room_history(target uuid, max_rows integer default 12)
returns table (
  event_id uuid,
  room_code text,
  media_label text,
  media_cover_url text,
  media_type text,
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
    select re.id, re.room_code, re.media_label, re.media_cover_url, re.media_type, re.participant_count, re.created_at
    from public.room_events re
    where re.user_id = target and re.event_type in ('create', 'join') and re.media_label is not null
    order by re.created_at desc
    limit max_rows;
end;
$$;

-- "Begenilenler" sekmesi - ayni gorunurluk kurali, ama sadece kullanicinin
-- KENDI isaretledigi kayitlar, begeni tarihine gore en yeniden eskiye.
create or replace function public.get_user_liked_history(target uuid, max_rows integer default 12)
returns table (
  event_id uuid,
  room_code text,
  media_label text,
  media_cover_url text,
  media_type text,
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
    select re.id, re.room_code, re.media_label, re.media_cover_url, re.media_type, re.participant_count, rel.created_at
    from public.room_event_likes rel
    join public.room_events re on re.id = rel.event_id
    where rel.user_id = target
    order by rel.created_at desc
    limit max_rows;
end;
$$;
