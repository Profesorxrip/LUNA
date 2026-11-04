import { Image } from "react-native";

interface Props {
  size?: number;
}

// crown.png'nin GERCEK en/boy orani (376x292) - kare olmayan bir siluet
// oldugu icin, verilen "size" (genislik) ile dogru oranli bir yukseklik
// hesaplamak icin.
const ASPECT = 292 / 376;

/** Katilimcilar listesindeki lider rozeti - kullanicinin gonderdigi bir
 * referans taç sayfasindan (4 secenekten 3.sü - ALT SOL) piksel piksel
 * cikarilmis GERCEK siluet (eskiden lucide'nin hazir "crown" glyph'inden
 * elle uyarlanmisti, kullanicinin artik gercek bir referans gorseli
 * oldugu icin o yaklasim terk edildi).
 *
 * assets/icons/crown.png artik TEK RENKLI bir siluet DEGIL - kullanici
 * kendi yayinladigimiz "Taç Boyama" sayfasinda (bir HTML + canvas araci,
 * fircasi SADECE ikonun kendi opak piksellerine yapisacak sekilde
 * source-atop ile sinirlandirilmisti) dis anahatti BEYAZ, ust mücevheri
 * ve 3 elmasi MAVI (#0EA5E9) boyadi - bu yuzden BURADA ARTIK tintColor
 * UYGULANMIYOR (uygulansa butun ikonu TEK renge boyar, iki renkliligi
 * yok ederdi) - PNG'nin kendi renkleri DOGRUDAN kullaniliyor. */
export default function CrownBadge({ size = 20 }: Props) {
  return (
    <Image
      source={require("../../assets/icons/crown.png")}
      style={{ width: size, height: size * ASPECT }}
      resizeMode="contain"
    />
  );
}
