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

/** Bir kaynagin kapak gorseli - varsa host'un yapistirdigi coverUrl (orn.
 * Netflix/harici icerik), yoksa YouTube icin video ID'sinden turetilen
 * resmi thumbnail, digerlerinde (mp4/hls/external) kapak kavrami yok -
 * null doner. RoomCard.tsx, RoomPreviewScreen.tsx ve RoomScreen.tsx'teki
 * +18 bulaniklastirma overlay'i AYNI TEK fonksiyonu kullanir. */
export function coverUrlForSource(source: MediaSource | null): string | null {
  if (!source) return null;
  if (source.coverUrl) return source.coverUrl;
  if (source.type === "youtube") return `https://img.youtube.com/vi/${source.url}/hqdefault.jpg`;
  return null;
}

/** Discover karti / oda onizlemesindeki sag ust rozet icin kaynagin hangi
 * platforma ait oldugunu bulur (bkz. RoomCard.tsx, RoomPreviewScreen.tsx -
 * ikisi de bu TEK fonksiyonu kullanir, kod tekrari yapmazlar). */
export function badgeInfoForSource(source: MediaSource | null): SourceBadgeInfo | null {
  if (!source) return null;
  if (source.type === "youtube") return { key: "youtube", label: "YouTube" };
  if (source.type === "external" || source.type === "hls" || source.type === "mp4") {
    // .mp4/.m3u8 direkt linkleri de "external" gibi GERCEK alan adi
    // eslestirmesinden geciyor artik (onceden hep sabit "Web" yaziyordu) -
    // bir CDN/alt alan adi bilinen bir platforma aitse (orn. bir yayinci
    // kendi mp4'unu kendi alan adindan sunuyorsa) o platform gosterilir,
    // degilse sitenin KENDI gercek favicon'u/alan adi gosterilir.
    const domain = bareDomain(source.url);
    const match = EXTERNAL_PLATFORMS.find((p) => domain.includes(bareDomain(p.url)));
    if (match) return { key: match.logo, label: match.label };
    return { key: null, label: domain, faviconUrl: `${SERVER_URL}/favicon-badge?domain=${encodeURIComponent(domain)}` };
  }
  return null;
}

/** "Web" ile yapistirilan GENEL bir sayfa linkinin (external tur) GERCEK
 * basligini (og:title/<title>) sunucu uzerinden ceker - dogrudan client'tan
 * fetch etmek rastgele sitelerin CORS kisitina takilabilir, sunucuda boyle
 * bir sinirlama yok (bkz. server/src/linkTitle.ts). Basarisiz olursa (sayfa
 * yok, HTML degil - orn. dogrudan bir .mp4 - ya da hicbir baslik etiketi
 * yoksa) null doner, cagiran taraf (MediaPickerSheet.tsx) alan adini yedek
 * olarak kullanir. */
export async function fetchWebPageTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${SERVER_URL}/link-title?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.title === "string" ? data.title : null;
  } catch {
    return null;
  }
}
