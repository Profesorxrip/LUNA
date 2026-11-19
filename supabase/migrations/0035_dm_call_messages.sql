-- DM sohbetinde arama GECMISI - arama bitince (kapatildi/reddedildi/cevap
-- verilmedi) sohbete "kayit" niteliginde bir mesaj dusuyor, tipki WhatsApp/
-- Telegram'daki gibi. Sunucu burada arama SINYALLESMESINI (bkz. calls.ts)
-- DEGIL, sadece SONUCUNU (ne kadar surdu, cevapsiz miydi) kaydediyor.
alter table public.dm_messages
  add column if not exists call_is_video boolean,
  add column if not exists call_status text;

alter table public.dm_messages drop constraint if exists dm_messages_kind_check;
alter table public.dm_messages
  add constraint dm_messages_kind_check check (kind in ('text', 'photo', 'voice', 'location', 'file', 'video', 'call'));

alter table public.dm_messages drop constraint if exists dm_messages_call_status_check;
alter table public.dm_messages
  add constraint dm_messages_call_status_check check (call_status is null or call_status in ('completed', 'missed'));

-- send_dm_voice/send_dm_video ile AYNI desen, SADECE bu satir IKI TARAFTAN
-- (arayan ya da arananin kendisi - kim kapattiysa/reddettiyse) HERHANGI
-- biri tarafindan olusturulabilir, duration_ms SADECE 'completed' durumunda
-- anlamli (cevapsizda null kalir). Engelleme kontrolu KASITLI olarak YOK -
-- bu satir zaten GERCEKLESMIS (ya da calinmis) bir aramanin kaydidir,
-- call:invite zaten ayri bir yetki kontrolunden geciyor (bkz. index.ts).
create or replace function public.send_dm_call(
  to_user uuid,
  is_video boolean,
  status text,
  duration_ms integer default null
)
returns public.dm_messages
language plpgsql
security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  a uuid; b uuid;
  convo_id uuid;
  expiry_ms bigint;
  new_expires_at timestamptz;
  my_name text;
  result public.dm_messages;
  message_text text;
begin
  if me is null or to_user is null or status not in ('completed', 'missed') then
    raise exception 'invalid_request';
  end if;

  a := least(me, to_user); b := greatest(me, to_user);
  select name into my_name from public.profiles where id = me;

  select id, expires_after_ms into convo_id, expiry_ms from public.dm_conversations where user_a = a and user_b = b;
  if convo_id is null then
    insert into public.dm_conversations (user_a, user_b) values (a, b) returning id, expires_after_ms into convo_id, expiry_ms;
  end if;

  if expiry_ms is not null then
    new_expires_at := now() + (expiry_ms || ' milliseconds')::interval;
  else
    new_expires_at := null;
  end if;

  message_text := case
    when status = 'missed' then '📞 Cevapsız arama'
    when is_video then '🎥 Görüntülü arama'
    else '📞 Sesli arama'
  end;

  insert into public.dm_messages (conversation_id, from_user, from_name, text, kind, call_is_video, call_status, duration_ms, expires_at)
  values (convo_id, me, coalesce(my_name, 'Kullanici'), message_text, 'call', is_video, status, case when status = 'completed' then duration_ms else null end, new_expires_at)
  returning * into result;

  return result;
end;
$$;
