import React, { useState } from "react";
import { View, Image, TouchableOpacity, Text, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import Icon from "./Icon";
import { theme } from "../theme";

interface Props {
  uri: string;
  isAdult?: boolean;
  size?: number;
}

/** Chat/DM'de gonderilen fotograf - "+18 icerik" isaretliyse varsayilan
 * olarak bulanik gelir, dokununca o mesaj icin acilir (ekran/bilesen
 * yeniden monte olunca tekrar bulanik baslar - kalici bir "goruldu" hali
 * yok, her acilista yeniden karar verilir). */
export default function ChatImageBubble({ uri, isAdult, size = 200 }: Props) {
  const [revealed, setRevealed] = useState(false);
  const blurred = isAdult && !revealed;
  const small = size < 150;

  return (
    <TouchableOpacity
      activeOpacity={blurred ? 0.85 : 1}
      onPress={() => blurred && setRevealed(true)}
      style={[styles.wrap, { width: size, height: size }]}
    >
      <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      {blurred && (
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill}>
          <View style={styles.revealHint}>
            <Icon name="eyeOff" size={small ? 16 : 22} color="#FFFFFF" />
            {!small && <Text style={styles.revealText}>+18 içerik{"\n"}göstermek için dokun</Text>}
          </View>
        </BlurView>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: "hidden", backgroundColor: theme.surfaceAlt },
  image: { width: "100%", height: "100%" },
  revealHint: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  revealText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", textAlign: "center" },
});
