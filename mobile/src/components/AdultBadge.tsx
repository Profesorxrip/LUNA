import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  size?: number;
}

// PlatformBadge'deki gibi yari-seffaf beyaz "hayalet" rozet - dolu renk/arka
// plan yok, sadece ince bir cember + "18+" yazisi (bkz. PlatformBadge.tsx).
export default function AdultBadge({ size = 26 }: Props) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, borderWidth: size * 0.08 }]}>
      <Text style={[styles.text, { fontSize: size * 0.36 }]}>18+</Text>
    </View>
  );
}

// NOT: View'a opacity vermek yerine renklerin kendisine alfa (rgba) veriyoruz -
// container opacity'si ustteki video/kapak resmiyle birlikte her seyi (metni
// de) soluklastirip "kirli beyaz" bir gorunum yaratiyordu; dogrudan rgba ise
// gercekten seffaf, net kenarli bir "hayalet" rozet verir.
const styles = StyleSheet.create({
  circle: {
    borderColor: "rgba(255,255,255,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  text: { color: "rgba(255,255,255,0.65)", fontWeight: "800" },
});
