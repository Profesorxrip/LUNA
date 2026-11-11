-- Ayarlar > "Istatistikler" ekranindaki Gunluk Saatler grafigi SADECE son 9
-- gunu gosteriyordu (bkz. 0003_profile_stats_and_history.sql - days default
-- 9). Kullanici: "Girdigim her gun gozukmeli, 2 gunde olsa 2500 gunde olsa" -
-- varsayilani NULL yapip gun filtresini kaldiriyoruz, boylece "daily" artik
-- kullanicinin GERCEK oturumu olan HER gunu (hesabin yasina bakmaksizin)
-- donduruyor; "days" parametresi (gecmis uyumluluk icin) verilirse hala
-- calisir, verilmezse (ya da NULL gecilirse) tum gecmisi kapsar.
create or replace function public.get_user_activity_stats(target uuid, days integer default null)
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
          where days is null or started_at > now() - (days || ' days')::interval
          group by day
        ) d
      ),
      '{}'::jsonb
    );
$$;
