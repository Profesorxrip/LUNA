import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "kubra_local_user_id";
let cachedUserId: string | null = null;

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Gercek hesap sistemi tam devreye girene kadar (PREVIEW_SKIP_AUTH), DM
 * gibi kullanici-kimligi gereken ozellikler icin cihaza kalici, rastgele
 * bir kimlik atar - AsyncStorage'da saklanir, uygulama yeniden acilinca
 * ayni kimlik kullanilir. */
export async function getLocalUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored) {
    cachedUserId = stored;
    return stored;
  }
  const id = randomId();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  cachedUserId = id;
  return id;
}
