-- ---------------------------------------------------------------------
-- Grup uye yonetimi: yonetici (admin) rolu + uye cikarma. Kullanici: "Uc
-- noktaya basinca kurucu [...] Yonetici Yap / Gruptan Cikar [...] Hepsini
-- yapalim". Kurucu (group_conversations.created_by) HER ZAMAN ustun -
-- baska bir yonetici tarafindan asla yonetici konumundan alinamaz/
-- cikarilamaz. Sade/duz bir yonetici modeli: HERHANGI bir yonetici sade bir
-- uyeyi yonetici yapabilir/cikarabilir, ama baska bir yoneticiyi
-- yoneticilikten almak/cikarmak icin SADECE kurucu yetkili (yoneticiler
-- birbirine dokunamaz - rooms.ts'teki moderator/lider ayrimiyla AYNI ruh).
-- ---------------------------------------------------------------------
alter table public.group_members add column if not exists is_admin boolean not null default false;

create or replace function public.is_group_admin(gid uuid, uid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_conversations gc where gc.id = gid and gc.created_by = uid
  ) or exists (
    select 1 from public.group_members gm where gm.group_id = gid and gm.user_id = uid and gm.is_admin
  );
$$;

create or replace function public.set_group_member_admin(gid uuid, target_user uuid, admin boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  creator uuid;
begin
  select created_by into creator from public.group_conversations where id = gid;
  if creator is null then
    raise exception 'not_found';
  end if;
  if target_user = creator then
    raise exception 'cannot_modify_creator';
  end if;
  if admin then
    if not public.is_group_admin(gid, me) then
      raise exception 'not_authorized';
    end if;
  else
    -- Yoneticilikten ALMAK (demote) - yoneticiler birbirine dokunamaz,
    -- SADECE kurucu.
    if me <> creator then
      raise exception 'not_authorized';
    end if;
  end if;
  update public.group_members set is_admin = admin where group_id = gid and user_id = target_user;
end;
$$;

create or replace function public.remove_group_member(gid uuid, target_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  creator uuid;
  target_is_admin boolean;
begin
  select created_by into creator from public.group_conversations where id = gid;
  if creator is null then
    raise exception 'not_found';
  end if;
  if target_user = creator then
    raise exception 'cannot_remove_creator';
  end if;
  if not public.is_group_admin(gid, me) then
    raise exception 'not_authorized';
  end if;
  select is_admin into target_is_admin from public.group_members where group_id = gid and user_id = target_user;
  if target_is_admin and me <> creator then
    raise exception 'not_authorized';
  end if;
  delete from public.group_members where group_id = gid and user_id = target_user;
end;
$$;
