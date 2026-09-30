-- LUNA: kullanicilarin ulke bilgisi (Discover'da oda onizlemesinde katilimci
-- bayragi gostermek icin). Ilk girisde IP adresinden en iyi caba (best-effort)
-- ile otomatik doldurulur (bkz. server/src/geoip.ts), kullanici tarafindan
-- degistirilmez.
alter table public.profiles add column if not exists country text;
