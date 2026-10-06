import type { PlatformKey } from "../components/PlatformLogo";
import type { MediaSource } from "../services/socket";
import { SERVER_URL } from "../services/socket";

/** "+"" menusundeki DRM'li platformlar - otomatik senkron desteklenmez,
 * sadece harici olarak acilir; sohbet/sesli sohbet odada acik kalir. */
export const EXTERNAL_PLATFORMS: { key: string; label: string; url: string; logo: PlatformKey }[] = [
  { key: "netflix", label: "Netflix", url: "https://www.netflix.com", logo: "netflix" },
  { key: "prime", label: "Prime Video", url: "https://www.primevideo.com", logo: "primevideo" },
  { key: "disney", label: "Disney+", url: "https://www.disneyplus.com", logo: "disneyplus" },
  { key: "hbomax", label: "HBO Max", url: "https://www.max.com", logo: "hbomax" },
  { key: "twitch", label: "Twitch", url: "https://www.twitch.tv", logo: "twitch" },
  { key: "drive", label: "Drive", url: "https://drive.google.com", logo: "drive" },
  { key: "icloud", label: "iCloud", url: "https://www.icloud.com", logo: "icloud" },
  { key: "spotify", label: "Spotify", url: "https://open.spotify.com", logo: "spotify" },
  { key: "x", label: "X", url: "https://www.x.com", logo: "x" },
];

// "https://www.netflix.com" -> "netflix.com" - URL polyfiline bagli kalmadan
// basit bir alan adi karsilastirmasi icin.
export function bareDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

export interface SourceBadgeInfo {
  // Bilinen/markali bir platformla eslesmediyse null - bu durumda
  // faviconUrl kullanilir (bkz. asagisi).
  key: PlatformKey | null;
  label: string;
  // "Web" secenegiyle yapistirilip EXTERNAL_PLATFORMS'taki markali
  // platformlardan hicbiriyle eslesmeyen genel siteler icin - sunucunun
  // /favicon-badge ucu sitenin KENDI favicon'unu cekip digerleri gibi
  // beyaz "hayalet" siluete cevirir (bkz. server/src/faviconBadge.ts) -
  // boylece her site (sadece X degil) kendi gercek ikonuyla, ama TUTARLI
  // bir gorsel dille rozetlenir.
  faviconUrl?: string;
}

/** Discover karti / oda onizlemesindeki sag ust rozet icin kaynagin hangi
 * platforma ait oldugunu bulur (bkz. RoomCard.tsx, RoomPreviewScreen.tsx -
 * ikisi de bu TEK fonksiyonu kullanir, kod tekrari yapmazlar). */
export function badgeInfoForSource(source: MediaSource | null): SourceBadgeInfo | null {
  if (!source) return null;
  if (source.type === "youtube") return { key: "youtube", label: "YouTube" };
  if (source.type === "external") {
    const domain = bareDomain(source.url);
    const match = EXTERNAL_PLATFORMS.find((p) => domain.includes(bareDomain(p.url)));
    if (match) return { key: match.logo, label: match.label };
    return { key: null, label: domain, faviconUrl: `${SERVER_URL}/favicon-badge?domain=${encodeURIComponent(domain)}` };
  }
  // .mp4/.m3u8 direkt linkleri de "Web" secenegiyle yapistiriliyor - bunlar
  // bir "site" degil doğrudan video dosyasi, favicon kavrami yok.
  if (source.type === "hls" || source.type === "mp4") return { key: "web", label: "Web" };
  return null;
}
