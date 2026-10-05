-- Ayarlar ekranindaki "Konumu Gizle" artik GERCEK ve sunucu tarafinda da
-- biliniyor: acikken (varsayilan) "Yakindakiler" gizlilik modu icin IP'den
-- il tespiti HIC yapilmaz (bkz. server/src/index.ts ensureCity cagrisi) -
-- yani konumu gizleyen biri ne Yakindakiler'e yakalanir ne de kendi odasi
-- Yakindakiler ile bulunabilir.
alter table public.profiles
  add column if not exists hide_location boolean not null default true;

-- "Yakindakiler" artik ulke degil il bazli - bir kere tespit edilen il
-- (ensureCountry ile ayni "bir kere ogren, kalici sakla" mantigi) burada
-- tutulur.
alter table public.profiles
  add column if not exists city text;
