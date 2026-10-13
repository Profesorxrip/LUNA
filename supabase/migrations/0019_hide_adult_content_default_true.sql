-- "+18 icerik" yeni hesaplarda VARSAYILAN OLARAK KAPALI (gizli) olmali -
-- kullanici kendi istegiyle Profil ayarlarindan (ya da oda icinden, bkz.
-- RoomSettingsSheet.tsx) acana kadar hicbir yetiskin icerigine denk
-- gelmemeli. Mevcut kullanicilarin kendi secimlerine DOKUNULMUYOR, sadece
-- bundan sonra olusturulacak profiller icin varsayilan degisiyor (bkz.
-- 0001_init.sql handle_new_user - orada hide_adult_content acikca
-- yazilmiyor, sutun varsayilanina birakiliyor).
alter table public.profiles
  alter column hide_adult_content set default true;
