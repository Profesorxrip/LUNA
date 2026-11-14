-- "Etiketler" sekmesindeki bir gonderi SENIN degil, SENI etiketleyen
-- baskasinin gonderisi - bu yuzden gonderinin KENDI gorunurlugunu (posts.
-- visibility, yazarin sectigi) DEGISTIREMEZSIN. Burada ayri bir kavram:
-- "bu etiketlenmemin BENIM profilimde kimlere gorunecegi" - her etiketlenen
-- kullanicinin KENDI gonderi-etiket cifti icin sectigi, yazarin
-- gorunurlugunden BAGIMSIZ bir ayar.
create table if not exists public.post_tag_visibility (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  visibility text not null default 'public' check (visibility in ('public', 'private', 'friends')),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_tag_visibility enable row level security;

-- Profilindeki "Etiketler" sekmesini kim gorebiliyorsa (can_view_section
-- zaten client tarafinda bu satirlari 0028'deki profiles.tagged_visibility
-- ile birlikte filtreler) bu ayari da OKUYABILIR - sadece kendi etiketini
-- YAZABILIR/GUNCELLEYEBILIR.
create policy "post_tag_visibility_select" on public.post_tag_visibility
  for select using (true);

create policy "post_tag_visibility_upsert" on public.post_tag_visibility
  for insert with check (user_id = auth.uid());

create policy "post_tag_visibility_update" on public.post_tag_visibility
  for update using (user_id = auth.uid());
