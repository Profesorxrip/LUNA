import { Linking } from "react-native";
import type { PlatformKey } from "../components/PlatformLogo";
import type { MediaSource } from "../services/socket";
import { SERVER_URL } from "../services/socket";

/** "+"" menusundeki DRM'li platformlar - otomatik senkron desteklenmez,
 * sadece harici olarak acilir; sohbet/sesli sohbet odada acik kalir.
 * drmLocked: true olanlar (Netflix/Prime/Disney+/HBO Max) GERCEK cihazda
 * denendi - WebView icinde ASLA oynamiyorlar: masaustu kimligiyle DRM
 * (Widevine) saglamlik seviyesi uyusmazligindan sonsuza kadar "yukleniyor"
 * kaliyor, Android Chrome kimligiyle ise bu platformlar "mobil tarayicida
 * izlenemez, uygulamayi ac" diye BILEREK engelliyor (Netflix'in native
 * uygulamasi AYNI cihazda sorunsuz oynuyor - yani cihazin DRM sertifikasi
 * degil, platformun kendi mobil-web politikasi engel). Sektordeki TUM
 * "watch party" urunleri (Netflix Party/Teleparty, JustParty, Watch Party)
 * de bunu SADECE masaustu tarayici EKLENTISIYLE (gercek, sahte olmayan bir
 * Chrome sekmesinin DOM'una enjekte ederek) basariyor - mobilde eklenti
 * kavrami YOK, bu yuzden bu platformlar mobilde SADECE kendi native
 * uygulamalarinda acilabiliyor (bkz. MediaPickerSheet.tsx selectItem,
 * DrmWebViewPlayer.tsx isDrmLocked). */
export const EXTERNAL_PLATFORMS: {
  key: string;
  label: string;
  url: string;
  logo: PlatformKey;
  drmLocked?: boolean;
  // Uygulamanin KENDI ozel baglanti semasi (orn. "nflx://") - bir https://
  // linki Android'de "varsayilan tarayici" ayarina gore UYGULAMA yerine
  // TARAYICIYA dusebiliyor (App Links dogrulamasi/kullanici tercihi
  // garanti degil). Bu sema SADECE o uygulama kuruluysa calisir, OS'a
  // "bunu acabilecek baska hicbir sey yok" diye net bir sinyal verir -
  // belirsizlik birakmaz (bkz. openPlatformApp: Linking.canOpenURL ile
  // once bunu dener, olmazsa normal https:// linkine duser).
  deepLink?: string;
}[] = [
  { key: "netflix", label: "Netflix", url: "https://www.netflix.com", logo: "netflix", drmLocked: true, deepLink: "nflx://www.netflix.com" },
  { key: "prime", label: "Prime Video", url: "https://www.primevideo.com", logo: "primevideo", drmLocked: true, deepLink: "aiv://aiv/home" },
  { key: "disney", label: "Disney+", url: "https://www.disneyplus.com", logo: "disneyplus", drmLocked: true, deepLink: "disneyplus://" },
  { key: "hbomax", label: "HBO Max", url: "https://www.max.com", logo: "hbomax", drmLocked: true, deepLink: "hbomax://" },
  { key: "twitch", label: "Twitch", url: "https://www.twitch.tv", logo: "twitch" },
  { key: "drive", label: "Drive", url: "https://drive.google.com", logo: "drive" },
  { key: "icloud", label: "iCloud", url: "https://www.icloud.com", logo: "icloud" },
  { key: "spotify", label: "Spotify", url: "https://open.spotify.com", logo: "spotify" },
  { key: "x", label: "X", url: "https://www.x.com", logo: "x" },
];

/** Bir platformu (varsa ozel baglanti semasiyla, bkz. yukarisi) GERCEKTEN
 * kendi NATIVE uygulamasinda acmaya calisir - duz https:// linki Android'de
 * tarayiciya dusebildigi icin (kullanicinin "varsayilan uygulama" tercihine
 * bagli, garanti degil) once uygulamanin kendi semasini dener, SADECE o
 * uygulama kurulu DEGILSE (canOpenURL false) normal https:// linkine
 * (tarayici/Play Store/App Store yonlendirmesi) duser. */
export async function openPlatformApp(platform: { url: string; deepLink?: string }): Promise<void> {
  if (platform.deepLink) {
    try {
      const canOpen = await Linking.canOpenURL(platform.deepLink);
      if (canOpen) {
        await Linking.openURL(platform.deepLink);
        return;
      }
    } catch {
      // yoksay - sema gecersiz/desteklenmiyor, asagida https:// ile devam
    }
  }
  await Linking.openURL(platform.url).catch(() => {});
}

/** Bir "external" kaynagin URL'i hangi bilinen platforma ait - bulunursa
 * openPlatformApp'e deepLink'iyle birlikte gecirilebilir (bkz.
 * DrmWebViewPlayer.tsx kacis kapisi butonlari). */
export function platformForUrl(url: string): (typeof EXTERNAL_PLATFORMS)[number] | undefined {
  const domain = bareDomain(url);
  return EXTERNAL_PLATFORMS.find((p) => domain.includes(bareDomain(p.url)));
}

// "https://www.netflix.com" -> "netflix.com" - URL polyfiline bagli kalmadan
// basit bir alan adi karsilastirmasi icin.
export function bareDomain(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

/** Bir "external" kaynagin URL'i drmLocked bir platforma mi ait - bkz.
 * EXTERNAL_PLATFORMS yorumu. DrmWebViewPlayer.tsx bunu WebView denemeden
 * ONCE kontrol eder (zaten calismayacagini biliyoruz). */
export function isDrmLockedUrl(url: string): boolean {
  const domain = bareDomain(url);
  return EXTERNAL_PLATFORMS.some((p) => p.drmLocked && domain.includes(bareDomain(p.url)));
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
