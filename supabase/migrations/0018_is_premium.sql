-- Profillerde "Premium" rozeti (bkz. PremiumScreen.tsx, ProfileScreen.tsx,
-- UserProfileScreen.tsx) - su an gercek bir odeme/satin alma akisi YOK, bu
-- sutun ileride o akis baglaninca GERCEKTEN true olacak sekilde hazirlaniyor;
-- simdilik herkeste false.
alter table public.profiles
  add column if not exists is_premium boolean not null default false;
