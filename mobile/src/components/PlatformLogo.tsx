import React from "react";
import { Image } from "react-native";

export type PlatformKey =
  | "youtube"
  | "netflix"
  | "primevideo"
  | "disneyplus"
  | "hbomax"
  | "twitch"
  | "x"
  | "drive"
  | "web"
  | "icloud"
  | "spotify"
  | "gecmis"
  | "begenilenler";

interface Props {
  platform: PlatformKey;
  size?: number;
}

// Kullanicinin gonderdigi gercek marka logolari (PNG, seffaf arka planli).
// Dosyalar getbbox ile seffaf kenar boslugu birakmayacak sekilde kirpildi
// (bkz. asset hazirlama scripti) - ratio, o kirpilmis gercek piksel
// boyutlarindan (genislik/yukseklik).
const REAL_LOGOS: Record<PlatformKey, { source: any; ratio: number }> = {
  youtube: { source: require("../../assets/logos/youtube.png"), ratio: 2.4025 },
  netflix: { source: require("../../assets/logos/netflix.png"), ratio: 3.6994 },
  disneyplus: { source: require("../../assets/logos/disney-plus.png"), ratio: 1.8422 },
  primevideo: { source: require("../../assets/logos/prime-video.png"), ratio: 3.2481 },
  x: { source: require("../../assets/logos/x.png"), ratio: 0.9786 },
  drive: { source: require("../../assets/logos/drive.png"), ratio: 4.2692 },
  web: { source: require("../../assets/logos/web.png"), ratio: 0.748 },
  twitch: { source: require("../../assets/logos/twitch.png"), ratio: 3.0144 },
  hbomax: { source: require("../../assets/logos/hbomax.png"), ratio: 5.2429 },
  icloud: { source: require("../../assets/logos/icloud.png"), ratio: 5.4164 },
  spotify: { source: require("../../assets/logos/spotify.png"), ratio: 4.782 },
  // Gercek marka logosu olmadigi icin kullanicinin gonderdigi referans
  // tabela goruntusune (kalin Montserrat font + sparkle yildizlar) gore
  // uretilmis dahili yazi-logolar (bkz. scripts/generate asset script).
  gecmis: { source: require("../../assets/logos/gecmis.png"), ratio: 2.4237 },
  begenilenler: { source: require("../../assets/logos/begenilenler.png"), ratio: 1.5537 },
};

/** Platform secim ekraninda kullanilan marka rozetleri - kullanicinin
 * sagladigi GERCEK logo goruntuleri.
 *
 * Sadece yuksekligi sabitlemek (hepsi ayni boy) genis wordmark'lari
 * (orn. NETFLIX, 3.7:1) DEVASA, kare olanlari (orn. X, 1:1) MINICIK
 * gosteriyordu - cunku gorsel "agirlik" aslinda ALANLA (genislik x
 * yukseklik) orantili, sadece yukseklikle degil. Onun yerine hepsinin
 * ALANI esitlenir (width*height sabit) - simdi kare bir ikon da, uzun bir
 * yazi-logo da GOZE AYNI BUYUKLUKTE gorunuyor, sadece sekilleri farkli. */
export default function PlatformLogo({ platform, size = 56 }: Props) {
  const { source, ratio } = REAL_LOGOS[platform];
  const scale = Math.sqrt(ratio);
  const width = size * scale;
  const height = size / scale;
  return <Image source={source} resizeMode="stretch" style={{ height, width }} />;
}
