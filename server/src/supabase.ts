import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

// Tek, paylasilan bir client - sadece access token DOGRULAMAK icin kullanilir
// (bu islem anon key ile calisir, gizli bir sey gerektirmez).
const authClient: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

/** Client'tan gelen Supabase access token'ini dogrular ve gercek kullanici
 * id'sini dondurur. Client'in "ben buyum" dedigi id'ye ASLA guvenilmez -
 * kimlik burada, sunucu tarafinda, imzali JWT uzerinden belirlenir. */
export async function verifyAccessToken(accessToken: string): Promise<{ id: string; email?: string } | null> {
  if (!authClient || !accessToken) return null;
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

/** Belirli bir kullanicinin JWT'siyle calisan bir Postgres client'i uretir -
 * butun sorgular bu kullanici olarak (RLS + RPC icindeki auth.uid() ile)
 * yetkilendirilir. Boylece yetki kontrolu veritabani seviyesinde yapilir. */
export function clientForUser(accessToken: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY tanimli degil (server/.env).");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Girisi olmayan/dogrulanmamis istekler icin de calisan, sadece herkese
 * acik (RLS: "using (true)") satirlari okuyabilen paylasilan client - orn.
 * oda onizlemesinde katilimcilarin herkese acik profil bilgilerini (isim,
 * handle, avatar, ulke) okumak icin. Yazma/DM/arkadaslik gibi ozel islemler
 * icin KULLANILMAZ - onlar hala clientForUser (kullanicinin kendi JWT'si) ile. */
export function publicReadClient(): SupabaseClient | null {
  return authClient;
}
