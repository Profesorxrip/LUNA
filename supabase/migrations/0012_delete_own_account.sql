-- Ayarlar ekranindaki "Hesabi Sil" artik GERCEK bir hesap silme islemi.
-- auth.users(id) referans eden butun tablolar zaten "on delete cascade" ile
-- kuruldugu icin (bkz. 0001_init.sql) auth.users satirini silmek profili,
-- arkadasliklari, DM'leri, galeri fotograflarini, begenileri vb. HEPSINI
-- otomatik siler - burada ayrica tek tek silmemize gerek yok.
--
-- SECURITY DEFINER sayesinde fonksiyon, SAHIBININ (bu migration'i calistiran
-- rolun - Supabase SQL Editor'de normalde "postgres") yetkisiyle calisir,
-- boylece anon/authenticated rolunun auth.users uzerinde dogrudan yetkisi
-- olmasa bile kullanici SADECE KENDI auth.uid()'sini silebilir.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
