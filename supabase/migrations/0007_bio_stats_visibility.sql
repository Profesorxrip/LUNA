-- BIYOGRAFI ve ISTATISTIKLER bolumlerine de GALERI/GECMIS'teki gibi tek bir
-- "goz" ile tum bolumu ac/kapa edebilme ozelligi ekliyoruz - mevcut
-- stat_visibility (tek tek istatistik satirlari) ile cakismiyor, o ayri
-- kaliyor; bu ikisi SADECE bolumun tamaminin gorunup gorunmeyecegini
-- kontrol ediyor (tipki gallery_visible/videos_visible gibi).
alter table public.profiles
  add column if not exists bio_visible boolean not null default true,
  add column if not exists stats_visible boolean not null default true;
