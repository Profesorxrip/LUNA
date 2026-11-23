-- ---------------------------------------------------------------------
-- RPC: grup ismini degistir - set_group_avatar (0047_groups.sql) ile AYNI
-- kisitlama: SADECE olusturan kisi (created_by). GroupInfoScreen.tsx'teki
-- "ismi/ppyi degistirince kaydet" ozelligi icin.
-- ---------------------------------------------------------------------
create or replace function public.rename_group(gid uuid, new_name text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if trim(new_name) = '' then
    raise exception 'invalid_request';
  end if;
  update public.group_conversations set name = left(trim(new_name), 60)
  where id = gid and created_by = auth.uid();
end;
$$;
