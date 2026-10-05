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

const styles = StyleSheet.create({
  circle: {
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.62,
  },
  text: { color: "#FFFFFF", fontWeight: "800" },
});
