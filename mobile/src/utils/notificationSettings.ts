import AsyncStorage from "@react-native-async-storage/async-storage";

export type NotificationCategory = "friendRequests" | "messages" | "roomInvites" | "postActivity" | "announcements";

const STORAGE_PREFIX = "notif_pref_";

const cache: Partial<Record<NotificationCategory, boolean>> = {};

/** Bildirim kategorisi bazli tercihler - cihaz bazli oldugu icin
 * AsyncStorage'da tutuluyor (audioSettings.ts/locationSettings.ts ile AYNI
 * desen). Sunucu tarafinda henuz kategori bazli bir ayrim yok (bkz.
 * notifications.ts registerForPushNotifications) - bu tercihler SIMDILIK
 * sadece NotificationSettingsScreen'deki anahtarlarin durumunu tutuyor. */
export async function isNotificationCategoryEnabled(category: NotificationCategory): Promise<boolean> {
  if (cache[category] !== undefined) return cache[category]!;
  const stored = await AsyncStorage.getItem(STORAGE_PREFIX + category);
  const enabled = stored !== "0";
  cache[category] = enabled;
  return enabled;
}

export async function setNotificationCategoryEnabled(category: NotificationCategory, enabled: boolean): Promise<void> {
  cache[category] = enabled;
  await AsyncStorage.setItem(STORAGE_PREFIX + category, enabled ? "1" : "0");
}
