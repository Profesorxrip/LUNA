import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/** Uygulamanin PAYLASILAN arka plani - koyu lacivertten neredeyse siyaha
 * gecen bir degrade (arkaplan denemesindeki "Mavi A" secenegi). App.tsx'te
 * tum navigasyonun ARKASINA sabit, tek bir katman olarak konur - gecis
 * sirasinda beyaz/bos bir an gorunmesin diye (eskiden her ekran KENDI opak
 * arka planini ciziyordu, simdi ekranlarin kok kapsayicilari seffaf ve bu
 * TEK katman her yerden gorunuyor, bkz. RootNavigator.tsx contentStyle). */
// 9 durakli, pürüzsüz bir egriden (quadratic Bezier - orta renk #070d16
// bir KONTROL noktasi, sart tam ortadan GECMESI gereken bir durak degil)
// ornekleniyor - 3 duraklı ilk halinde segmentler arasi egim farki goze
// hafif bir kirilma gibi carpiyordu.
const GRADIENT_COLORS = [
  "#122238",
  "#0f1d30",
  "#0d1828",
  "#0b1422",
  "#09111c",
  "#070e17",
  "#060b12",
  "#05090f",
  "#04070c",
] as const;
const GRADIENT_LOCATIONS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] as const;

export default function AppBackground() {
  return (
    <LinearGradient
      colors={GRADIENT_COLORS}
      locations={GRADIENT_LOCATIONS}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}
