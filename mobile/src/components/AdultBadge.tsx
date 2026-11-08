import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  size?: number;
  // Varsayilan yari-seffaf "hayalet" rengi - ProfileScreen.tsx gibi duz
  // beyaz satir ikonlarinin yaninda kullanilinca tam opak beyaz verilebilir.
  color?: string;
}

// PlatformBadge'deki gibi yari-seffaf beyaz "hayalet" rozet - dolu renk/arka
// plan yok, sadece ince bir cember + "18+" yazisi (bkz. PlatformBadge.tsx).
export default function AdultBadge({ size = 26, color = "rgba(255,255,255,0.65)" }: Props) {
  // Kesirli piksel degerleri (orn. 2.08px kenarlik) baz cihazlarda/
  // tarayicilarda pruzlu/bulanik kenara yol aciyor - tam sayiya yuvarliyoruz.
  const borderWidth = Math.round(size * 0.08);
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, borderWidth, borderColor: color }]}>
      <Text
        style={[
          styles.text,
          {
            fontSize: Math.round(size * 0.36),
            lineHeight: Math.round(size * 0.36) + 1,
            color,
          },
        ]}
      >
        18+
      </Text>
    </View>
  );
}

// NOT: View'a opacity vermek yerine renklerin kendisine alfa (rgba) veriyoruz -
// container opacity'si ustteki video/kapak resmiyle birlikte her seyi (metni
// de) soluklastirip "kirli beyaz" bir gorunum yaratiyordu; dogrudan rgba ise
// gercekten seffaf, net kenarli bir "hayalet" rozet verir.
const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: "Inter_700Bold",
    includeFontPadding: false,
    textAlign: "center",
    textAlignVertical: "center",
  },
});
