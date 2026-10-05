import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AudioMixingMode } from "expo-video";

const STORAGE_KEY = "mute_on_other_audio";

let cached: boolean | null = null;

/** Ayarlar ekranindaki "Baska Ses Calarken Sessize Al" - cihaz bazli bir
 * tercih oldugu icin AsyncStorage'da tutuluyor. Acikken video oynatici
 * "mixWithOthers" moduna geciyor (LUNA baska uygulamalarin sesiyle AYNI
 * ANDA calabiliyor, tek sesi disari itmiyor) - kapaliyken "auto" (sistem
 * varsayilani, genelde digerlerini durduran ozel/exclusive davranis). */
export async function isMuteOnOtherAudioEnabled(): Promise<boolean> {
  if (cached !== null) return cached;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  cached = stored === "1";
  return cached;
}

export async function setMuteOnOtherAudioEnabled(enabled: boolean): Promise<void> {
  cached = enabled;
  await AsyncStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

export function audioMixingModeFor(enabled: boolean): AudioMixingMode {
  return enabled ? "mixWithOthers" : "auto";
}
