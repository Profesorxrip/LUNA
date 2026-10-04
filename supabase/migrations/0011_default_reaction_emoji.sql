-- Ayarlar ekranindaki "Hizli Tepki" artik gercek bir tercih - oda sohbetinde
-- veya DM'de bir mesaja CIFT TIKLANDIGINDA gonderilecek emoji budur
-- (bkz. RoomScreen.tsx / DMScreen.tsx cift-tik tepki ozelligi).
alter table public.profiles
  add column if not exists default_reaction_emoji text not null default '❤️';
