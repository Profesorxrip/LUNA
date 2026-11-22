-- Grupta basili tutma menusu (Yanitla/Sabitle/Ilet/Sil) - DM'in 0036/0037
-- migration'lariyla AYNI desen. "Ilet" icin ayri bir RPC YOK: grup mesaji
-- kisiye (DM'e) iletilirken var olan forward_dm_message RPC'si (0037)
-- dogrudan kullanilir (bkz. mobile GroupChatScreen.tsx forwardToUsers) -
-- iletilen icerik zaten KENDI basina yeni bir DM mesaji, grup tarafinda
-- ekstra bir kayit gerekmiyor.
alter table public.group_messages
  add column if not exists reply_to_text text,
  add column if not exists reply_to_from_name text,
  add column if not exists reply_to_kind text,
  add column if not exists reply_to_media_url text,
  add column if not exists deleted_for_everyone boolean not null default false,
  add column if not exists deleted_for uuid[] not null default '{}';

create table if not exists public.group_pinned_messages (
  group_id uuid not null references public.group_conversations(id) on delete cascade,
  message_id uuid not null references public.group_messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (group_id, message_id)
);

alter table public.group_pinned_messages enable row level security;

create policy "group_pinned_messages_select_member" on public.group_pinned_messages
  for select using (public.is_group_member(group_id, auth.uid()));

-- send_group_message'i (0047) yanitlama parametreleriyle genisletiyoruz -
-- DM'deki send_dm (0036) ile AYNI govde.
create or replace function public.send_group_message(
  gid uuid,
  body text,
  reply_text text default null,
  reply_from_name text default null,
  reply_kind text default null,
  reply_media_url text default null
)
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

  insert into public.group_messages (group_id, from_user, from_name, text, reply_to_text, reply_to_from_name, reply_to_kind, reply_to_media_url)
  values (gid, me, coalesce(my_name, 'Kullanici'), left(trim(body), 1000), reply_text, reply_from_name, reply_kind, reply_media_url)
  returning * into result;

  return result;
end;
$$;

create or replace function public.delete_group_message_for_everyone(message_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  owner uuid;
begin
  if me is null then raise exception 'unauthorized'; end if;
  select from_user into owner from public.group_messages where id = message_id;
  if owner is null then raise exception 'not_found'; end if;
  if owner <> me then raise exception 'forbidden'; end if;
  update public.group_messages set deleted_for_everyone = true where id = message_id;
end;
$$;

create or replace function public.delete_group_message_for_me(message_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  gid uuid;
begin
  if me is null then raise exception 'unauthorized'; end if;
  select m.group_id into gid
    from public.group_messages m
    where m.id = message_id and public.is_group_member(m.group_id, me);
  if gid is null then raise exception 'not_found'; end if;
  update public.group_messages
    set deleted_for = array_append(deleted_for, me)
    where id = message_id and not (me = any(deleted_for));
end;
$$;

create or replace function public.pin_group_message(message_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  gid uuid;
begin
  if me is null then raise exception 'unauthorized'; end if;
  select m.group_id into gid
    from public.group_messages m
    where m.id = message_id and public.is_group_member(m.group_id, me);
  if gid is null then raise exception 'not_found'; end if;
  insert into public.group_pinned_messages (group_id, message_id, pinned_by)
    values (gid, message_id, me)
    on conflict (group_id, message_id) do nothing;
end;
$$;

create or replace function public.unpin_group_message(message_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthorized'; end if;
  delete from public.group_pinned_messages pm
    where pm.message_id = unpin_group_message.message_id
      and public.is_group_member(pm.group_id, me);
end;
$$;

-- consume_group_media_once (0049) sadece 'voice'/'photo' kabul ediyordu -
-- video icin de (bkz. 0050_group_message_kinds2.sql send_group_video)
-- tek-gorunumluk destegi eklenince genisletiliyor.
create or replace function public.consume_group_media_once(message_id uuid)
returns public.group_messages
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); result public.group_messages;
begin
  if me is null then raise exception 'unauthorized'; end if;
  select m.* into result from public.group_messages m
    where m.id = message_id and public.is_group_member(m.group_id, me)
      and m.kind in ('voice', 'photo', 'video') and m.view_once = true and m.from_user <> me;
  if result.id is null then raise exception 'not_found'; end if;
  if result.view_once_consumed_at is null then
    update public.group_messages set view_once_consumed_at = now(), media_url = null
      where id = message_id returning * into result;
  end if;
  return result;
end;
$$;
