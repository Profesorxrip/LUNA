import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Supabase Dashboard > Settings > API'de gordugun degerler.
// "publishable"/"anon" anahtar CLIENT TARAFINDA kullanilmak uzere
// tasarlanmistir - mobil uygulamaya gomulu olmasi guvenlik sorunu
// yaratmaz (gizli/service_role anahtari ASLA buraya konmaz).
const SUPABASE_URL = "https://ixihqlonjmxlrilkvdsx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_7nHv9WJDI2fcdXsXDqneUg_BfixBn1p";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
