-- Etiketlenen kullanicinin "Etiketler" sekmesindeki bir gonderiden KENDI
-- etiketini kaldirmasi - gonderinin sahibi degilse 0021'deki
-- "posts_owner_update" (user_id = auth.uid()) RLS politikasi bu satiri
-- gormesine bile izin verse de UPDATE'i reddeder. Bu yuzden SADECE
-- auth.uid()'i tagged_user_ids dizisinden cikarabilen, baska hicbir
-- sutuna ya da baska bir kullanicinin etiketine dokunamayan guvenli bir
-- SECURITY DEFINER fonksiyon.
create or replace function public.remove_my_tag(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts
  set tagged_user_ids = array_remove(tagged_user_ids, auth.uid())
  where id = target_post_id
    and auth.uid() = any(tagged_user_ids);
end;
$$;

grant execute on function public.remove_my_tag(uuid) to authenticated;
