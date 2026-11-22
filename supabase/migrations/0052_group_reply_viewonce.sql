-- Grupta bir mesaja yanit verirken, yanitlanan mesaj tek-gorunumluk
-- (view-once) ise cevap alintisinda (hem balon ici hem yazarken alttaki
-- cubukta) gercek icerigin SIZMAMASI icin - mobile tarafi artik gercek
-- mediaUrl'i reply olusturulurken HIC gondermiyor (bkz. GroupChatScreen.tsx
-- startReply), bunun yerine sadece "bu bir view-once'du" bilgisini (+ GIF
-- etiketlemesi icin stickerId) tasiyoruz ki cevap bloğu da foto/video/gif/
-- ses balonlarindaki AYNI rozet+etiket gorunumunu kullanabilsin.
alter table public.group_messages
  add column if not exists reply_to_view_once boolean not null default false,
  add column if not exists reply_to_sticker_id text;

create or replace function public.send_group_message(
  gid uuid,
  body text,
  reply_text text default null,
  reply_from_name text default null,
  reply_kind text default null,
  reply_media_url text default null,
  reply_view_once boolean default false,
  reply_sticker_id text default null
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

  insert into public.group_messages (group_id, from_user, from_name, text, reply_to_text, reply_to_from_name, reply_to_kind, reply_to_media_url, reply_to_view_once, reply_to_sticker_id)
  values (gid, me, coalesce(my_name, 'Kullanici'), left(trim(body), 1000), reply_text, reply_from_name, reply_kind, reply_media_url, coalesce(reply_view_once, false), reply_sticker_id)
  returning * into result;

  return result;
end;
$$;
