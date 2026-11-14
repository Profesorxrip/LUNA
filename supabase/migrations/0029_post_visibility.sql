-- Her GONDERININ KENDI Genel/Ozel/Arkadaslar secimi - 0028_section_
-- visibility.sql'deki posts_visibility ile KARISTIRILMAMALI: o profildeki
-- TUM "Gonderiler" sekmesinin gorunurlugu, bu ise composer'daki "GENEL"
-- rozetinden secilen, HER gonderiye ozel gorunurluk.

alter table public.posts
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'private', 'friends'));

-- posts_select (0021, 0028'de guncellenmisti) artik HEM profilin genel
-- Gonderiler sekni izni (posts_visibility) HEM de gonderinin kendi
-- gorunurlugunu (visibility) birlikte kontrol eder.
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select using (
    user_id = auth.uid()
    or (
      public.can_view_section(user_id, (select posts_visibility from public.profiles where id = posts.user_id))
      and public.can_view_section(user_id, visibility)
    )
  );
