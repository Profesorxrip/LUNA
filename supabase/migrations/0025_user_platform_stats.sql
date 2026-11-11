-- Ayarlar > "İstatistikler" ekranina "Platformlar" halka (donut) grafigi
-- icin - kullanicinin odalarda GERCEKTEN ne izledigini (YouTube/Netflix/
-- Disney+/... ya da taninmayan bir site icin "Diğer") saat bazinda
-- dondurur. get_user_activity_stats'teki (bkz. 0003_profile_stats_and_
-- history.sql) AYNI create/join + lead("leave") oturum esleme mantigini
-- kullanir, sadece gunlere degil media_type/media_url'e gore gruplar.
-- Platform-domain eslemesi mobile/src/utils/media.ts'teki EXTERNAL_PLATFORMS
-- listesiyle AYNI (kasitli olarak - kullanici arayuzunde gorduklerinin
-- aynisi burada da saniliyor).
create or replace function public.get_user_platform_stats(target uuid)
returns table (platform text, hours numeric)
language sql
security definer set search_path = public
stable
as $$
  with sessions as (
    select
      event_type,
      created_at,
      media_type,
      media_url,
      lead(event_type) over (order by created_at) as next_type,
      lead(created_at) over (order by created_at) as next_at
    from public.room_events
    where user_id = target
  ),
  durations as (
    select
      extract(epoch from (next_at - created_at)) / 3600.0 as hours,
      case
        when media_type = 'youtube' then 'youtube'
        when media_url ilike '%netflix.com%' then 'netflix'
        when media_url ilike '%primevideo.com%' then 'prime'
        when media_url ilike '%disneyplus.com%' then 'disney'
        when media_url ilike '%max.com%' then 'hbomax'
        when media_url ilike '%twitch.tv%' then 'twitch'
        when media_url ilike '%spotify.com%' then 'spotify'
        when media_url ilike '%x.com%' then 'x'
        when media_url ilike '%drive.google.com%' then 'drive'
        when media_url ilike '%icloud.com%' then 'icloud'
        else 'other'
      end as platform
    from sessions
    where event_type in ('create', 'join') and next_type = 'leave'
  )
  select platform, round(sum(hours)::numeric, 1) as hours
  from durations
  group by platform
  having sum(hours) > 0
  order by hours desc;
$$;
