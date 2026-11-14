-- Profil sekmelerinin (Gonderiler/Etiketlenenler/Gecmis/Begenilenler) her
-- biri icin ayri Genel/Ozel/Arkadaslar gorunurlugu - eskiden bu dort bolumu
-- idare eden basit acik/kapali alanlarin (posts_visible, ve Gecmis/Begenilenler
-- icin PAYLASILAN gallery_visible/videos_visible cifti) yerine geciyor. Eski
-- alanlar veri kaybini onlemek icin SILINMIYOR, sadece artik kullanilmiyor.

alter table public.profiles
  add column if not exists posts_visibility text not null default 'public'
    check (posts_visibility in ('public', 'private', 'friends')),
  add column if not exists tagged_visibility text not null default 'public'
    check (tagged_visibility in ('public', 'private', 'friends')),
  add column if not exists history_visibility text not null default 'public'
    check (history_visibility in ('public', 'private', 'friends')),
  add column if not exists liked_visibility text not null default 'public'
    check (liked_visibility in ('public', 'private', 'friends'));

-- Eski basit acik/kapali tercihlerden veri tasi (true->public, false->private) -
-- Gecmis ve Begenilenler eskiden AYNI cift (gallery_visible OR videos_visible)
-- tarafindan idare ediliyordu, o yuzden ikisi de ayni baslangic degerini alir.
update public.profiles set posts_visibility = case when posts_visible then 'public' else 'private' end;
update public.profiles set history_visibility = case when (gallery_visible or videos_visible) then 'public' else 'private' end;
update public.profiles set liked_visibility = case when (gallery_visible or videos_visible) then 'public' else 'private' end;

-- Iki kullanicinin arkadas olup olmadigini kontrol eden ortak yardimci -
-- friendships tablosu (user_a < user_b) PK'siyla tek satir = arkadaslik.
create or replace function public.is_friend_of(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.user_a = least(a, b) and f.user_b = greatest(a, b)
  );
$$;

-- "owner" kisinin bir bolumu "visibility" tercihiyle, su an giris yapmis
-- kullaniciya (auth.uid()) gosterip gostermeyecegini hesaplayan ortak kural -
-- posts RLS'inden de, get_user_room_history/get_user_liked_history
-- fonksiyonlarindan da cagrilir.
create or replace function public.can_view_section(owner uuid, visibility text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() = owner then true
    when visibility = 'public' then true
    when visibility = 'friends' then public.is_friend_of(auth.uid(), owner)
    else false
  end;
$$;

-- posts RLS (0021) - eskiden sadece "posts_visible" acik mi diye bakiyordu,
-- simdi 3'lu posts_visibility'e gore can_view_section kullaniyor.
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select using (
    user_id = auth.uid()
    or public.can_view_section(user_id, (select posts_visibility from public.profiles where id = posts.user_id))
  );

-- post_poll_votes RLS (0027) AYNI posts_select kuralina atifta bulunuyordu -
-- oradaki posts_visible kontrolu de guncellenir.
drop policy if exists "post_poll_votes_select" on public.post_poll_votes;
create policy "post_poll_votes_select" on public.post_poll_votes
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_poll_votes.post_id
      and (
        p.user_id = auth.uid()
        or public.can_view_section(p.user_id, (select posts_visibility from public.profiles where id = p.user_id))
      )
    )
  );

-- get_user_room_history (Gecmis) / get_user_liked_history (Begenilenler) -
-- artik PAYLASILAN gallery_visible/videos_visible yerine kendi BAGIMSIZ
-- alanlarini (history_visibility / liked_visibility) kullaniyor.
create or replace function public.get_user_room_history(target uuid, max_rows integer default 12)
returns table (
  event_id uuid,
  room_code text,
  media_label text,
  media_cover_url text,
  media_type text,
  media_url text,
  participant_count integer,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  visibility text;
begin
  select history_visibility into visibility from public.profiles where id = target;
  if not public.can_view_section(target, visibility) then
    return;
  end if;
  return query
    select re.id, re.room_code, re.media_label, re.media_cover_url, re.media_type, re.media_url, re.participant_count, re.created_at
    from public.room_events re
    where re.user_id = target and re.event_type in ('create', 'join') and re.media_label is not null
    order by re.created_at desc
    limit max_rows;
end;
$$;

create or replace function public.get_user_liked_history(target uuid, max_rows integer default 12)
returns table (
  event_id uuid,
  room_code text,
  media_label text,
  media_cover_url text,
  media_type text,
  media_url text,
  participant_count integer,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  visibility text;
begin
  select liked_visibility into visibility from public.profiles where id = target;
  if not public.can_view_section(target, visibility) then
    return;
  end if;
  return query
    select re.id, re.room_code, re.media_label, re.media_cover_url, re.media_type, re.media_url, re.participant_count, rel.created_at
    from public.room_event_likes rel
    join public.room_events re on re.id = rel.event_id
    where rel.user_id = target
    order by rel.created_at desc
    limit max_rows;
end;
$$;
