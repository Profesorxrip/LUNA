import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";

/** Video onizlemesinde (SendVideoSheet) kirpma cubugunu gercek video
 * karelerinden olusturmak icin - native'de expo-video-thumbnails, web'de
 * (bu kutuphane expo-video-thumbnails'da DESTEKLENMIYOR - "not supported
 * on Expo Web" hatasi veriyor) gizli bir <video>+<canvas> ile AYNI isi
 * kendimiz yapiyoruz. */
export async function getVideoThumbnails(uri: string, count: number, durationSec: number): Promise<string[]> {
  if (Platform.OS === "web") return getWebVideoThumbnails(uri, count, durationSec);
  const VideoThumbnails = await import("expo-video-thumbnails");
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (durationSec * i) / (count - 1);
    try {
      const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.round(t * 1000) });
      out.push(thumbUri);
    } catch {
      out.push("");
    }
  }
  return out;
}

function getWebVideoThumbnails(uri: string, count: number, durationSec: number): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = uri;
    video.muted = true;
    video.playsInline = true;
    const canvas = document.createElement("canvas");
    const out: string[] = [];
    let i = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(out);
    };
    const safety = setTimeout(finish, 8000);
    function seekNext() {
      if (i >= count) {
        clearTimeout(safety);
        finish();
        return;
      }
      const t = count === 1 ? 0 : (durationSec * i) / (count - 1);
      video.currentTime = Math.min(Math.max(t, 0), Math.max(durationSec - 0.05, 0));
    }
    video.addEventListener("loadedmetadata", () => {
      canvas.width = video.videoWidth || 160;
      canvas.height = video.videoHeight || 160;
      seekNext();
    });
    video.addEventListener("seeked", () => {
      try {
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        out.push(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        out.push("");
      }
      i++;
      seekNext();
    });
    video.addEventListener("error", () => {
      clearTimeout(safety);
      finish();
    });
  });
}

/** Videonun gercek (dogal) piksel boyutu - kirpma cercevesini (SendVideoSheet)
 * videonun GERCEK en-boy oranina gore hizalamak icin. Native'de expo-video
 * player'inin kendi "videoTrack.size"i tercih ediliyor (varsa); web'de (ya
 * da o bilgi yoksa) gizli bir <video> elemaniyla ayni bilgi okunuyor. */
export async function getVideoNaturalSize(
  uri: string,
  playerSize?: { width: number; height: number } | null
): Promise<{ width: number; height: number }> {
  if (playerSize && playerSize.width && playerSize.height) return playerSize;
  if (Platform.OS === "web") {
    const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const video = document.createElement("video");
      video.src = uri;
      video.muted = true;
      video.addEventListener("loadedmetadata", () => resolve({ width: video.videoWidth || 16, height: video.videoHeight || 9 }));
      video.addEventListener("error", () => resolve(null));
      setTimeout(() => resolve(null), 5000);
    });
    if (size) return size;
  }
  return { width: 16, height: 9 };
}

/** Video dosyasinin boyutu (byte) - galeriden secilen native file:// URI'ler
 * icin FileSystem, web'deki blob:/data: URI'ler icin (FileSystem bunlari
 * COZEMIYOR) fetch+blob yedegi. */
export async function getFileSizeBytes(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof (info as any).size === "number") return (info as any).size;
  } catch {}
  try {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    return blob.size;
  } catch {}
  return null;
}
