-- Ayarlar ekranindaki "Chat mesajlarini otomatik cevir" artik GERCEK bir
-- tercih - yeni actigin HER odanin "Chat Otomatik Cevir" ayari (RoomSettings
-- Sheet'teki ayni ayar) bu varsayilanla basliyor. Host yine de oda icinde
-- bunu degistirebilir, bu sadece BASLANGIC degeri.
alter table public.profiles
  add column if not exists default_auto_translate boolean not null default false;
