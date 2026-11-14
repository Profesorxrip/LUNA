-- Gonderi anketleri (poll) - 0021_posts.sql'de "ayri bir asamada eklenecek"
-- diye not edilen ozellik. posts tablosuna soru+secenekler eklenir, oylar
-- AYRI bir tabloda (post_poll_votes) tutulur ki bir kullanici bir ankete
-- sadece bir kez (ya da oyunu degistirerek) oy versin - primary key
-- (post_id,user_id) bunu garanti eder.

alter table public.posts
  add column if not exists poll_question text,
  add column if not exists poll_options text[],
  add column if not exists poll_option_images text[];

create table if not exists public.post_poll_votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_poll_votes enable row level security;

-- Oy sayilari, gonderiyi gorebilen HERKESCE gorulebilir olmali (anket
-- sonuclarinin gosterilebilmesi icin) - posts_select ile AYNI gorunurluk
-- kurali uygulanir.
create policy "post_poll_votes_select" on public.post_poll_votes
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_poll_votes.post_id
      and (
        p.user_id = auth.uid()
        or exists (select 1 from public.profiles pr where pr.id = p.user_id and pr.posts_visible)
      )
    )
  );

create policy "post_poll_votes_owner_insert" on public.post_poll_votes
  for insert with check (user_id = auth.uid());

create policy "post_poll_votes_owner_update" on public.post_poll_votes
  for update using (user_id = auth.uid());

create policy "post_poll_votes_owner_delete" on public.post_poll_votes
  for delete using (user_id = auth.uid());
