-- Cevrimici/cevrimdisi durumu artik Istatistikler listesinde kendi goz
-- ikonuyla ac/kapa edilebilen bir satir - profiles.stat_visibility jsonb'sine
-- "onlineStatus" anahtari ekleniyor (varsayilan: acik).
alter table public.profiles
  alter column stat_visibility set default
    '{"onlineStatus":true,"totalHours":true,"joinDate":true,"activityChart":true,"friends":true,"longestSession":true,"biggestRoom":true}'::jsonb;

-- Mevcut satirlarda bu anahtar hic yoksa (henuz hicbir satirda olamaz, yeni
-- bir anahtar) acik olarak ekleniyor - var olan diger tercihlere dokunmuyor.
update public.profiles
set stat_visibility = jsonb_set(stat_visibility, '{onlineStatus}', 'true')
where not (stat_visibility ? 'onlineStatus');
