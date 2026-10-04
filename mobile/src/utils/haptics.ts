import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const STORAGE_KEY = "haptics_enabled";

let cached: boolean | null = null;

/** Ayarlar ekranindaki "Dokunsal geri bildirim" acikken (varsayilan kapali)
 * dokunuslarda/islemlerde gercek titresim tetikler - cihaz bazli bir tercih
 * oldugu icin profiles tablosunda degil, AsyncStorage'da tutuluyor. */
export async function isHapticsEnabled(): Promise<boolean> {
  if (cached !== null) return cached;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  cached = stored === "1";
  return cached;
}

export async function setHapticsEnabled(enabled: boolean): Promise<void> {
  cached = enabled;
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

export async function triggerHaptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (await isHapticsEnabled()) Haptics.impactAsync(style).catch(() => {});
}
