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
// boyutlarindan (genislik/yukseklik). weight, asagidaki aciklamadaki
// "murekkep yogunlugu" dengelemesi icin - 1'den buyukse ince/bosluklu
// logo (daha fazla buyutulur), 1'den kucukse kalin/dolu logo (biraz kisilir).
const REAL_LOGOS: Record<PlatformKey, { source: any; ratio: number; weight?: number }> = {
  // Sadece "YouTube" yazisi - play ikonu kaldirildi, ayni satirdaki
  // NETFLIX ile metin yuksekligi piksel piksel esit olacak sekilde agirlik
  // ayarlandi (bkz. asset hazirlama scripti).
  youtube: { source: require("../../assets/logos/youtube.png"), ratio: 3.0506, weight: 0.85 },
  netflix: { source: require("../../assets/logos/netflix.png"), ratio: 3.6994, weight: 0.905 },
  // Disney+'in ust kavisi, Prime Video'nun alt oku sadece SUS - yazinin
  // KENDISI her ikisinde de GERCEK gorsel merkezden kaydirilmis (biri
  // yukarida, biri asagida). Ikisi ayni satirda yan yana durunca yazilari
  // ayni hizada gorunsun diye resimlere ASIMETRIK seffaf dolgu eklendi
  // (bkz. asset hazirlama scripti) - artik bbox merkezi = yazi merkezi.
  disneyplus: { source: require("../../assets/logos/disney-plus.png"), ratio: 1.3469, weight: 1.805 },
  primevideo: { source: require("../../assets/logos/prime-video.png"), ratio: 2.3051, weight: 1.447 },
  x: { source: require("../../assets/logos/x.png"), ratio: 0.9786, weight: 1.208 },
  drive: { source: require("../../assets/logos/drive.png"), ratio: 4.2692, weight: 1.008 },
  // Web: Drive'daki gibi ikon solda + yaninda buyuk harfli "WWW" yazisi -
  // kure ikonu eskiden kullanilan web.png'den, WWW yazisi Montserrat Black'ten.
  web: { source: require("../../assets/logos/web.png"), ratio: 5.737, weight: 0.861 },
  twitch: { source: require("../../assets/logos/twitch.png"), ratio: 3.0144, weight: 0.897 },
  hbomax: { source: require("../../assets/logos/hbomax.png"), ratio: 5.2429, weight: 0.833 },
  icloud: { source: require("../../assets/logos/icloud.png"), ratio: 5.4164, weight: 0.904 },
  spotify: { source: require("../../assets/logos/spotify.png"), ratio: 4.782, weight: 0.96 },
  // Gercek marka logosu olmadigi icin dahili yazi-logolar - kullanicinin
  // gonderdigi referans tabela fotolarindan ("HISTORY"/"LIKES" yazisi +
  // sparkle yildizlar) dogrudan cikarilip beyaza cevrilmis.
  gecmis: { source: require("../../assets/logos/gecmis.png"), ratio: 3.0286, weight: 1.264 },
  // LIKES'in oran (ratio) olarak HISTORY'den daha "kare" olmasi, ESIT alanda
  // bile daha UZUN (yuksek) gorunmesine yol aciyordu - agirlik, HISTORY ile
  // AYNI metin yuksekligine gelecek sekilde yeniden hesaplandi.
  begenilenler: { source: require("../../assets/logos/begenilenler.png"), ratio: 1.8525, weight: 0.99 },
};

/** Platform secim ekraninda kullanilan marka rozetleri - kullanicinin
 * sagladigi GERCEK logo goruntuleri.
 *
 * Sadece yuksekligi sabitlemek (hepsi ayni boy) genis wordmark'lari
 * (orn. NETFLIX, 3.7:1) DEVASA, kare olanlari (orn. X, 1:1) MINICIK
 * gosteriyordu - cunku gorsel "agirlik" aslinda ALANLA (genislik x
 * yukseklik) orantili, sadece yukseklikle degil. ALANI esitlemek (width*height
 * sabit) bunu kismen cozuyordu, ama YETERLI degildi: ince/script fontlu
 * (Disney+) ya da ic bosluklu (Web'in cember ikonu) logolar, ayni ALANDA
 * bile, kalin/dolu logolara (HBO Max, YouTube) gore GOZE hala kucuk/soluk
 * duruyordu - cunku gercek gorsel agirlik, bbox alani degil GERCEKTEN
 * BOYALI (opak) piksel miktari. `weight`, her logonun gercek murekkep
 * yogunluguna gore olculmus bir duzeltme katsayisi (bkz. asset hazirlama
 * scripti) - ince logolari buyutup kalinlari hafifce kisarak hepsinin
 * GOZE gercekten ayni agirlikta gorunmesini sagliyor. Satir/sutun tasmasin
 * diye sonucta MAX_W/MAX_H ile sinirlaniyor (en/boy orani bozulmadan). */
export default function PlatformLogo({ platform, size = 56 }: Props) {
  const { source, ratio, weight = 1 } = REAL_LOGOS[platform];
  const scale = Math.sqrt(ratio);
  const effectiveSize = size * weight;
  let width = effectiveSize * scale;
  let height = effectiveSize / scale;
  const maxW = size * 2.3;
  const maxH = size * 1.15;
  if (height > maxH) {
    height = maxH;
    width = height * ratio;
  }
  if (width > maxW) {
    width = maxW;
    height = width / ratio;
  }
  return <Image source={source} resizeMode="stretch" style={{ height, width }} />;
}
