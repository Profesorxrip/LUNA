import React from "react";
import { Image } from "react-native";
import type { PlatformKey } from "./PlatformLogo";

// Discover kartinin sag ust kosesindeki rozet icin - platform secme
// ekranindaki (PlatformLogo.tsx) renkli logolardan FARKLI, ayri bir set:
// arkaplan/ic renkler temizlenip tek renkli (beyaz) siluete cevrildi,
// yari-seffaf bir "hayalet" rozet olarak gosterilecek (bkz. DiscoverScreen).
// "gecmis"/"begenilenler" burada YOK - bunlar gercek bir oynatma kaynagi
// DEGIL, sadece platform secme ekranindaki birer giris noktasi, bir odanin
// rozeti hicbir zaman bu ikisi olamaz.
const BADGES: Partial<Record<PlatformKey, { source: any; ratio: number }>> = {
  youtube: { source: require("../../assets/badges/youtube.png"), ratio: 1.4478 },
  netflix: { source: require("../../assets/badges/netflix.png"), ratio: 0.5512 },
  primevideo: { source: require("../../assets/badges/primevideo.png"), ratio: 1.1739 },
  // Tam "Disney+" yazi-logosu rozette (kucuk boyutta) okunakli degildi -
  // kullanicinin gonderdigi "proposed" tasarima gore sadece ikon-isareti
  // (D + ust kavis + ic artı) kullanılıyor.
  disneyplus: { source: require("../../assets/badges/disneyplus.png"), ratio: 1.2918 },
  hbomax: { source: require("../../assets/badges/hbomax.png"), ratio: 1.3831 },
  twitch: { source: require("../../assets/badges/twitch.png"), ratio: 0.8579 },
  drive: { source: require("../../assets/badges/drive.png"), ratio: 1.1346 },
  icloud: { source: require("../../assets/badges/icloud.png"), ratio: 1.5515 },
  x: { source: require("../../assets/badges/x.png"), ratio: 0.9786 },
  web: { source: require("../../assets/logos/web.png"), ratio: 5.737 },
  spotify: { source: require("../../assets/badges/spotify.png"), ratio: 1.0 },
};

interface Props {
  // Bilinen/markali bir platform yoksa (genel bir site) null/undefined -
  // bu durumda faviconUrl kullanilir (bkz. utils/media.ts badgeInfoForSource).
  platform?: PlatformKey | null;
  // "Web" ile girilip markali platformlardan biriyle eslesmeyen siteler
  // icin - sunucunun /favicon-badge ucu sitenin favicon'unu CEKIP digerleri
  // gibi beyaz siluete cevirmis halde dondurur (bkz. server/src/faviconBadge.ts),
  // o yuzden burada ozel bir renk/cerceve islemi GEREKMEZ.
  faviconUrl?: string;
  size?: number;
}

/** PlatformLogo'daki gibi ALAN bazli olceklendirme - kare bir ikon da,
 * genis bir wordmark da goze ayni buyuklukte gorunur. */
export default function PlatformBadge({ platform, faviconUrl, size = 16 }: Props) {
  const badge = platform ? BADGES[platform] : undefined;
  if (badge) {
    const { source, ratio } = badge;
    const scale = Math.sqrt(ratio);
    const width = size * scale;
    const height = size / scale;
    return <Image source={source} resizeMode="stretch" style={{ width, height, opacity: 0.62 }} />;
  }
  if (faviconUrl) {
    return <Image source={{ uri: faviconUrl }} resizeMode="contain" style={{ width: size, height: size, opacity: 0.62 }} />;
  }
  return null;
}
