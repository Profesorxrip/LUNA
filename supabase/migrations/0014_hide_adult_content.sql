-- Ayarlar ekranindaki "Yetiskin Icerigini Gizle" artik GERCEK: sunucu bu
-- degere gore 18+ isaretli odalari (bkz. odanin isAdult alani, sadece
-- bellekte yasiyor) kullanicinin Discover listesinden tamamen cikarir.
alter table public.profiles
  add column if not exists hide_adult_content boolean not null default false;
