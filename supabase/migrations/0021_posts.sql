-- Profil ekranindaki "paylasim akisi" - kullanicinin profilinde gorunen
-- kendi gonderileri (metin + en fazla 2 fotograf + konum adi + etiketlenen
-- kisiler). gallery_photos ile AYNI kalip: ayri tablo + RLS + storage bucket,
-- dogrudan Supabase client'tan (sunucu/socket katmanindan GECMEDEN) okunup
-- yaziliyor - UserProfileScreen.tsx'teki galeri sorgusuyla birebir ayni yontem.
--
-- NOT: Anket (poll) ozelligi bu migration'a DAHIL DEGIL, ayri bir asamada
-- eklenecek.

alter table public.profiles
  add column if not exists posts_visible boolean not null default true;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text,
  image_urls text[] not null default '{}',
  location_name text,
  tagged_user_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists posts_user_id_idx on public.posts (user_id, created_at desc);

alter table public.posts enable row level security;

-- Herkes kendi gonderilerini her zaman gorur; baskasinin gonderileri
-- SADECE o kisinin profilindeki "Paylasimlar" gozu acikca (profiles.posts_visible)
-- gorunur - gallery_visible/videos_visible ile ayni kural.
create policy "posts_select" on public.posts
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = posts.user_id and p.posts_visible)
  );

create policy "posts_owner_insert" on public.posts
  for insert with check (user_id = auth.uid());

create policy "posts_owner_update" on public.posts
  for update using (user_id = auth.uid());

create policy "posts_owner_delete" on public.posts
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- post-images storage bucket - gallery bucket'indaki ("0004_gallery_photos.sql")
-- AYNI "sadece kendi klasorune (post-images/<user_id>/...) yaz" deseni.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

create policy "post_images_public_read" on storage.objects
  for select using (bucket_id = 'post-images');

create policy "post_images_owner_write" on storage.objects
  for insert with check (
    bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post_images_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
