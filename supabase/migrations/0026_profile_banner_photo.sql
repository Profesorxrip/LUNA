-- Kapak alani aslinda bir FOTOGRAF olarak tasarlanmisti (0022_profile_
-- banner.sql'deki referans - "BEŞİKTAŞ yazan şerit" - bir fotograf
-- uzerine yazilmis metindi, sadece metin saklanmisti). Gercek bir kapak
-- fotografi yuklenebilsin diye banner_url ekleniyor - banner_text ile
-- birlikte var olabilir (foto varsa onun UZERINE, yoksa cizgili desenin
-- uzerine yazilir).

alter table public.profiles
  add column if not exists banner_url text;

-- avatars bucket'iyla AYNI desen (0001_init.sql) - herkes okuyabilir,
-- sadece sahibi "banners/<user_id>/..." klasorune yazabilir.
insert into storage.buckets (id, name, public)
values ('banners', 'banners', true)
on conflict (id) do nothing;

create policy "banner_public_read" on storage.objects
  for select using (bucket_id = 'banners');

create policy "banner_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "banner_owner_update" on storage.objects
  for update using (
    bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "banner_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text
  );
