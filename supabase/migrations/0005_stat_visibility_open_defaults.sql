-- Katilim Tarihi ve Gunluk Saatler varsayilan olarak GIZLI geliyordu -
-- kullanicinin tercihi "acik baslasin, isteyen kapatsin" oldugu icin
-- varsayilani degistiriyoruz.
alter table public.profiles
  alter column stat_visibility set default
    '{"totalHours":true,"joinDate":true,"activityChart":true,"friends":true,"longestSession":true,"biggestRoom":true}'::jsonb;

-- Zaten var olan satirlardan, kullanicinin KENDISI hic dokunmamis (hala eski
-- varsayilanla ayni) olanlari yeni varsayilana gecir - bir kullanici bu iki
-- ayari BILEREK kapattiysa (satiri eski varsayilandan farkliysa) dokunmuyoruz.
update public.profiles
set stat_visibility = jsonb_set(jsonb_set(stat_visibility, '{joinDate}', 'true'), '{activityChart}', 'true')
where stat_visibility = '{"totalHours":true,"joinDate":false,"activityChart":false,"friends":true,"longestSession":true,"biggestRoom":true}'::jsonb;
