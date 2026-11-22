-- ---------------------------------------------------------------------
-- Grup sohbeti - ilk surum (SADECE metin mesaji). DM'in dm_conversations/
-- dm_messages ciftiyle AYNI desen, ama iki yerine N kullanici: uyelik ayri
-- bir tabloda (group_members) tutulur.
-- ---------------------------------------------------------------------
create table if not exists public.group_conversations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  avatar_url text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.group_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_conversations(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  from_name text not null default 'Kullanici',
  text text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists group_messages_group_idx on public.group_messages (group_id, created_at);
create index if not exists group_members_user_idx on public.group_members (user_id);

alter table public.group_conversations enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;

-- group_members KENDI ICINDE "uye miyim" diye sorgulanirsa RLS kendi
-- kendine referans verip sonsuz donguye girer - bu yuzden SECURITY DEFINER
-- bir fonksiyonla (RLS'i atlayarak) kontrol ediyoruz, tipki
-- is_blocked_either'in dm tarafinda yaptigi gibi.
create or replace function public.is_group_member(gid uuid, uid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members where group_id = gid and user_id = uid
  );
$$;

create policy "group_conversations_select_member" on public.group_conversations
  for select using (public.is_group_member(id, auth.uid()));

create policy "group_members_select_member" on public.group_members
  for select using (public.is_group_member(group_id, auth.uid()));

create policy "group_messages_select_member" on public.group_messages
  for select using (public.is_group_member(group_id, auth.uid()));

-- ---------------------------------------------------------------------
-- RPC: grup olustur (beni + secilen uyeleri ekler)
-- ---------------------------------------------------------------------
create or replace function public.create_group(group_name text, member_ids uuid[])
returns public.group_conversations
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  gid uuid;
  result public.group_conversations;
  mid uuid;
begin
  if me is null or trim(group_name) = '' then
    raise exception 'invalid_request';
  end if;
  if member_ids is null or array_length(member_ids, 1) is null or array_length(member_ids, 1) = 0 then
    raise exception 'invalid_request';
  end if;
  if array_length(member_ids, 1) > 200 then
    raise exception 'too_many_members';
  end if;

  insert into public.group_conversations (name, created_by) values (left(trim(group_name), 60), me)
  returning * into result;
  gid := result.id;

  insert into public.group_members (group_id, user_id) values (gid, me);
  foreach mid in array member_ids loop
    if mid is not null and mid <> me then
      insert into public.group_members (group_id, user_id) values (gid, mid)
      on conflict do nothing;
    end if;
  end loop;

  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: grup fotografini ayarla - SADECE olusturan kisi.
-- ---------------------------------------------------------------------
create or replace function public.set_group_avatar(gid uuid, url text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.group_conversations set avatar_url = url
  where id = gid and created_by = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: grup mesaji gonder (SADECE uyeler)
-- ---------------------------------------------------------------------
create or replace function public.send_group_message(gid uuid, body text)
returns public.group_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  my_name text;
  result public.group_messages;
begin
  if me is null or trim(body) = '' then
    raise exception 'invalid_request';
  end if;
  if not public.is_group_member(gid, me) then
    raise exception 'not_member';
  end if;

  select name into my_name from public.profiles where id = me;

  insert into public.group_messages (group_id, from_user, from_name, text)
  values (gid, me, coalesce(my_name, 'Kullanici'), left(trim(body), 1000))
  returning * into result;

  return result;
end;
$$;
