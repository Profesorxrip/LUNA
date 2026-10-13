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
// boyutlarindan (genislik/yukseklik). heightScale, SADECE MAX_H'e takilan
// (kare oranli) logolarin son yuksekligini birbirinden BAGIMSIZ ince ayar
// yapmak icin - 1'den buyukse biraz daha uzun, kucukse biraz daha kisa.
const REAL_LOGOS: Record<PlatformKey, { source: any; ratio: number; heightScale?: number }> = {
  youtube: { source: require("../../assets/logos/youtube.png"), ratio: 3.0506 },
  netflix: { source: require("../../assets/logos/netflix.png"), ratio: 3.6994 },
  // Disney+'in ust kavisi, Prime Video'nun alt oku sadece SUS - yazinin
  // KENDISI her ikisinde de GERCEK gorsel merkezden kaydirilmis (biri
  // yukarida, biri asagida). Ikisi ayni satirda yan yana durunca yazilari
  // ayni hizada gorunsun diye resimlere ASIMETRIK seffaf dolgu eklendi
  // (bkz. asset hazirlama scripti) - artik bbox merkezi = yazi merkezi.
  disneyplus: { source: require("../../assets/logos/disney-plus.png"), ratio: 1.3469, heightScale: 1.15 },
  primevideo: { source: require("../../assets/logos/prime-video.png"), ratio: 2.3051 },
  x: { source: require("../../assets/logos/x.png"), ratio: 0.9786 },
  drive: { source: require("../../assets/logos/drive.png"), ratio: 4.2692 },
  // Web: Drive'daki gibi ikon solda + yaninda buyuk harfli "WWW" yazisi -
  // kure ikonu eskiden kullanilan web.png'den, WWW yazisi Montserrat Black'ten.
  web: { source: require("../../assets/logos/web.png"), ratio: 5.737 },
  twitch: { source: require("../../assets/logos/twitch.png"), ratio: 3.0144 },
  hbomax: { source: require("../../assets/logos/hbomax.png"), ratio: 5.2429 },
  icloud: { source: require("../../assets/logos/icloud.png"), ratio: 5.4164 },
  spotify: { source: require("../../assets/logos/spotify.png"), ratio: 4.782 },
  // Gercek marka logosu olmadigi icin dahili yazi-logolar - kullanicinin
  // gonderdigi referans tabela fotolarindan ("HISTORY"/"LIKES" yazisi +
  // sparkle yildizlar) dogrudan cikarilip beyaza cevrilmis.
  gecmis: { source: require("../../assets/logos/gecmis.png"), ratio: 3.0286 },
  begenilenler: { source: require("../../assets/logos/begenilenler.png"), ratio: 1.8525, heightScale: 0.85 },
};

/** Platform secim ekraninda kullanilan marka rozetleri - kullanicinin
 * sagladigi GERCEK logo goruntuleri.
 *
 * Genislik HER LOGO icin AYNI (size * 2.3) - eskiden logonun kendi oranina
 * ve "murekkep yogunlugu" agirligina gore degisiyordu (bkz. eski weight
 * alani), bu da ayni satirdaki logolari farkli genislikte gosteriyordu.
 * Yukseklik, oran (ratio) bozulmadan genislikten hesaplanir, sadece asiri
 * kare logolarda (orn. Disney+, Likes) satiri tasirmamak icin MAX_H ile
 * sinirlanir - resizeMode "contain" DEGIL "stretch" kullaniliyor, cunku
 * "contain" kirpilan yukseklige gore GENISLIGI de kucultup (letterbox)
 * tam bu sinirlanan logolari digerlerinden DAR gosteriyordu; "stretch"
 * genisligi HER ZAMAN tam kutu kadar tutar, sinira takilan logolar sadece
 * hafifce dikeyde sikisir. */
export default function PlatformLogo({ platform, size = 56 }: Props) {
  const { source, ratio, heightScale = 1 } = REAL_LOGOS[platform];
  const width = size * 2.3;
  const maxH = size * 1.0;
  const height = Math.min(width / ratio, maxH) * heightScale;
  return <Image source={source} resizeMode="stretch" style={{ height, width }} />;
}
