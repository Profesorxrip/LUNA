-- Profil ekraninin en ustundeki capraz cizgili "bayrak" bandi uzerindeki
-- buyuk kalin baslik - kullanicinin referans tasarimindaki ("BEŞİKTAŞ"
-- yazan serit) ozellik, serbest metin olarak saklaniyor (tutulan takim,
-- slogan, vs. ne yazmak isterse).

alter table public.profiles
  add column if not exists banner_text text;
