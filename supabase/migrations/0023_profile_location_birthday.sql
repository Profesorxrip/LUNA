-- Profil basligi altindaki "konum" (serbest metin, GPS DEGIL - kullanicinin
-- kendi yazdigi bir yer adi, orn. "MERYEMİN KALBİ") ve "dogum tarihi" -
-- kullanicinin referans tasarimindaki pin/hediye ikonlu satirlar.

alter table public.profiles
  add column if not exists profile_location text,
  add column if not exists birthday text;
