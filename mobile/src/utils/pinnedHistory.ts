import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "pinned_history_events";

// Gecmis/Begenilenler kartlarindaki "Sabitle" - hiddenRooms.ts'deki gizli
// oda listesiyle AYNI desen: cihaz bazli, sadece bu eventId'yi listenin
// basina tasimak icin kullanilir, sunucuya YAZILMAZ.
export async function getPinnedEventIds(): Promise<Set<string>> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

export async function togglePinnedEvent(eventId: string): Promise<Set<string>> {
  const ids = await getPinnedEventIds();
  if (ids.has(eventId)) ids.delete(eventId);
  else ids.add(eventId);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  return ids;
}
