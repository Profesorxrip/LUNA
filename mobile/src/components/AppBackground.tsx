import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/** Uygulamanin PAYLASILAN arka plani - koyu lacivertten neredeyse siyaha
 * gecen bir degrade (arkaplan denemesindeki "Mavi A" secenegi). App.tsx'te
 * tum navigasyonun ARKASINA sabit, tek bir katman olarak konur - gecis
 * sirasinda beyaz/bos bir an gorunmesin diye (eskiden her ekran KENDI opak
 * arka planini ciziyordu, simdi ekranlarin kok kapsayicilari seffaf ve bu
 * TEK katman her yerden gorunuyor, bkz. RootNavigator.tsx contentStyle). */
export default function AppBackground() {
  return (
    <LinearGradient
      colors={["#122238", "#070d16", "#04070c"]}
      locations={[0, 0.65, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}
