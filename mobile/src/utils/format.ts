import { FileText, Image as ImageIcon, FileArchive, File as FileIcon, Music } from "lucide-react-native";

const AUDIO_EXTS = ["mp3", "wav", "m4a", "aac", "flac", "ogg", "wma"];

/** Dosya mesaji ikonu (mimeType/uzantiya gore) - FileMessageBubble ve
 * DmInfoScreen'deki "Dosyalar" satiri AYNI secimi kullanir. */
export function fileIconFor(mimeType?: string | null, fileName?: string) {
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (mimeType?.startsWith("image/")) return ImageIcon;
  if (mimeType?.startsWith("audio/") || (ext && AUDIO_EXTS.includes(ext))) return Music;
  if (ext === "zip" || ext === "rar" || ext === "7z") return FileArchive;
  if (mimeType === "application/pdf" || ext === "pdf" || ext === "doc" || ext === "docx" || ext === "txt") return FileText;
  return FileIcon;
}

/** Sesli mesaj suresi (saniye -> "m:ss") - VoiceMessageBubble (sohbet
 * balonu) ve DmInfoScreen'deki "Dosyalar" satiri AYNI bicimi kullanir. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${rest.toString().padStart(2, "0")}`;
}

/** Dosya boyutu (byte -> "N KB"/"N.N MB") - FileMessageBubble ve
 * DmInfoScreen'deki "Dosyalar" satiri AYNI bicimi kullanir. */
export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
