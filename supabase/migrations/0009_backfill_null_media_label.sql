-- Hata: ozel bir URL (otomatik baslik tespit edilemeyen) ile acilan/katilinan
-- odalarda media_label BOS kaydediliyordu (bkz. server/src/index.ts - artik
-- source.label yerine HER ZAMAN dolu olan room.title kullaniliyor). Bu
-- durum get_user_room_history/get_user_liked_history RPC'lerinin
-- "media_label is not null" filtresine takilip o kaydin GECMIS'te hic
-- gorunmemesine yol aciyordu - "6 video izledim ama 5 tanesi gorunuyor"
-- sikayetinin sebebi buydu. Yeni kayitlar artik bu hataya dusmeyecek; bu
-- migration eldeki ESKI bos kayitlari gorunur hale getiriyor.
update public.room_events
set media_label = 'İzlenen video'
where media_label is null and event_type in ('create', 'join');
