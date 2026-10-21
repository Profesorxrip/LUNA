import { Image, StyleSheet, View, ViewStyle, StyleProp } from "react-native";

const ASPECT = 131 / 280;

// LoginScreen.tsx'teki EDGE_SHADOW_OFFSETS ile AYNI teknik: logonun
// etrafini saran, her yone kucuk mesafede kaydirilmis sonuk kopyalar
// gercek blur olmadan yumusak bir kenar golgesi/hale olusturur.
const EDGE_SHADOW_OFFSETS: [number, number][] = [
  [0, -3],
  [0, 3],
  [-3, 0],
  [3, 0],
  [-2, -2],
  [2, -2],
  [-2, 2],
  [2, 2],
];

interface Props {
  width?: number;
  style?: StyleProp<ViewStyle>;
}

/** LUNA logosu (beyaz siluet + yumusak kenar golgesi) - LoginScreen ve
 * SplashScreen arasinda PAYLASILAN tek kaynak, ikisi de birebir ayni
 * gorunsun diye (bkz. LoginScreen.tsx'teki eski logoWrap/logoMark/
 * logoShadow - buraya tasindi). */
export default function LunaLogo({ width = 280, style }: Props) {
  const height = width * ASPECT;
  const wrapWidth = width + 6;
  const wrapHeight = height + 6;
  return (
    <View style={[{ width: wrapWidth, height: wrapHeight }, style]}>
      {EDGE_SHADOW_OFFSETS.map(([dx, dy], i) => (
        <Image
          key={i}
          source={require("../../assets/lavin-icon-mark.png")}
          style={[styles.logoMark, styles.logoShadow, { width, height, top: 3 + dy, left: 3 + dx }]}
          resizeMode="contain"
        />
      ))}
      <Image source={require("../../assets/lavin-icon-mark.png")} style={[styles.logoMark, { width, height }]} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  logoMark: { position: "absolute", top: 3, left: 3, tintColor: "#FFFFFF" },
  logoShadow: { tintColor: "#030508", opacity: 0.14 },
});
