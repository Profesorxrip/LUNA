-- Profil "GALERİ" artık izlenen oda geçmişini göstermiyor (bu "GEÇMİŞ"
-- bölümünde kalıyor) - bunun yerine kullanıcının yüklediği GERÇEK fotoğrafları
-- gösteriyor. Storage'da dosya tutmak tek başına yeterli değil, çünkü
-- "sadece benim fotoğraflarım" / "sadece görünür olanlar" diye RLS ile
-- filtrelenebilir bir LİSTE için ayrı bir tablo gerekiyor (avatarda olduğu
-- gibi tek dosya değil, kullanıcı başına birden çok fotoğraf).

create table if not exists public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists gallery_photos_user_id_idx on public.gallery_photos (user_id, created_at desc);

alter table public.gallery_photos enable row level security;

-- Herkes kendi fotoğraflarını her zaman görür; başkasının fotoğrafları
-- SADECE o kişinin profilindeki "Galeri" gözü açıksa (profiles.gallery_visible)
-- görünür - aynı goz ikonunun GEÇMİŞ'teki anlamıyla birebir aynı kural.
create policy "gallery_photos_select" on public.gallery_photos
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = gallery_photos.user_id and p.gallery_visible)
  );

create policy "gallery_photos_owner_insert" on public.gallery_photos
  for insert with check (user_id = auth.uid());

create policy "gallery_photos_owner_delete" on public.gallery_photos
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- gallery storage bucket - avatars bucket'ındaki ("0001_init.sql") AYNI
-- "sadece kendi klasörüne (gallery/<user_id>/...) yaz" deseni.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

create policy "gallery_public_read" on storage.objects
  for select using (bucket_id = 'gallery');

create policy "gallery_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gallery_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text
  );
