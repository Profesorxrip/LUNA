-- Gercek profil istatistikleri + gecmis/galeri icin (roadmap AŞAMA 6 devami).
-- Onceki durum: UserProfileScreen'deki "LUNA Suresi / En Uzun Oturum /
-- En Buyuk Odaniz / Gunluk Saatler" ve "Galeri/Videolar" tamamen SABIT,
-- UYDURMA degerlerdi (STAT_DEFS/ACTIVITY/VIDEOS/GALLERY_COLORS sabitleri) -
-- hem kendi profilinde hem baskasinin profilinde ayni sahte sayilar
-- gorunuyordu. Bu migration bunlari GERCEK verilerle degistirmek icin
-- gereken altyapiyi kuruyor.

-- room_events: katilim anindaki oda buyuklugunu ve medya kapak/tur/url
-- bilgisini de kaydediyoruz - "en buyuk odaniz" ve gercek "gecmis/galeri"
-- icin lazim (bkz. server/src/index.ts "create"/"join" cagrilari).
alter table public.room_events add column if not exists participant_count integer;
alter table public.room_events add column if not exists media_cover_url text;
alter table public.room_events add column if not exists media_type text;
alter table public.room_events add column if not exists media_url text;

-- profiles: "goz" ikonuyla acilip kapatilan gorunurluk tercihleri artik
-- KALICI - eskiden sadece yerel React state'ti, uygulamadan cikinca
-- sifirlaniyor, baskasinin HER SEYI gormesine izin veriyordu.
alter table public.profiles add column if not exists stat_visibility jsonb not null default
  '{"totalHours":true,"joinDate":false,"friends":true,"longestSession":true,"biggestRoom":true,"activityChart":false}'::jsonb;
alter table public.profiles add column if not exists gallery_visible boolean not null default true;
alter table public.profiles add column if not exists videos_visible boolean not null default true;

-- ---------------------------------------------------------------------
-- RPC: gercek aktivite istatistikleri (toplam sure, en uzun oturum,
-- en buyuk oda, son N gunun gunluk saat dagilimi).
-- Her "create"/"join" olayini, kronolojik olarak hemen SONRAKI olayla
-- (LEAD penceresi) esleyip o sonraki olay "leave" ise aradaki sureyi bir
-- "oturum" sayiyor - "leave" HEM elle cikista HEM baglanti kopmasinda
-- (socket disconnect) loglandigi icin (bkz. index.ts handleLeave) bu
-- eslesme guvenilir.
-- ---------------------------------------------------------------------
create or replace function public.get_user_activity_stats(target uuid, days integer default 9)
returns table (
  total_hours numeric,
  longest_session_hours numeric,
  biggest_room integer,
  daily jsonb
)
language sql
security definer set search_path = public
stable
as $$
  with sessions as (
    select
      event_type,
      created_at,
      participant_count,
      lead(event_type) over (order by created_at) as next_type,
      lead(created_at) over (order by created_at) as next_at
    from public.room_events
    where user_id = target
  ),
  durations as (
    select
      created_at as started_at,
      extract(epoch from (next_at - created_at)) / 3600.0 as hours,
      participant_count
    from sessions
    where event_type in ('create', 'join') and next_type = 'leave'
  )
  select
    coalesce((select sum(hours) from durations), 0),
    coalesce((select max(hours) from durations), 0),
    coalesce((select max(participant_count) from durations), 0),
    coalesce(
      (
        select jsonb_object_agg(day, total)
        from (
          select to_char(started_at, 'YYYY-MM-DD') as day, round(sum(hours)::numeric, 1) as total
          from durations
          where started_at > now() - (days || ' days')::interval
          group by day
        ) d
      ),
      '{}'::jsonb
    );
$$;

-- ---------------------------------------------------------------------
-- RPC: herkese acik basit bir SAYAC - gercek arkadas listesini degil
-- sadece sayisini dondurur (RLS'i bypass eder ama ozel veri sizdirmaz -
-- takipci sayisi gibi herkese acik kabul edilebilir).
-- ---------------------------------------------------------------------
create or replace function public.get_friend_count(target uuid)
returns integer
language sql
security definer set search_path = public
stable
as $$
  select count(*)::integer from public.friendships where user_a = target or user_b = target;
$$;

-- ---------------------------------------------------------------------
-- RPC: bir kullanicinin gercek "gecmis" oda listesi (Galeri + Videolar
-- sekmeleri ayni veriyi kullaniyor). target KENDISI degilse, SADECE
-- profilinde galeri/video gorunurlugu ACIKSA doner - boylece "goz" ikonu
-- gercekten bir gizlilik kontrolu haline geliyor.
-- ---------------------------------------------------------------------
create or replace function public.get_user_room_history(target uuid, max_rows integer default 12)
returns table (
  room_code text,
  media_label text,
  media_cover_url text,
  media_type text,
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
    select re.room_code, re.media_label, re.media_cover_url, re.media_type, re.created_at
    from public.room_events re
    where re.user_id = target and re.event_type in ('create', 'join') and re.media_label is not null
    order by re.created_at desc
    limit max_rows;
end;
$$;
