import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";
import { findSticker } from "../data/stickerPacks";

interface Props {
  stickerId?: string | null;
  mediaUrl?: string | null;
}

const FRAME_WIDTH = 220;
// Kullanicinin kendi yukledigi (custom) GIF'lerin GERCEK en-boy orani
// bilinmiyor (bkz. gifPacks.ts'teki bundled width/height - customGifs.ts'te
// yok) - makul bir yatay varsayilan kullanilir.
const DEFAULT_RATIO = 4 / 3;

/** Kullanici: "Gif çıkartma gibi duruyor ama gif video gibi durmalı" -
 * StickerMessageBubble'in (serbest/saydam, cercevesiz) AKSINE, GIF mesajlari
 * VideoMessageBubble ile AYNI "cerceveli kutu" dilini (koyu arka plan,
 * yuvarlak kose) kullanir - FARK: video balonunun aksine SABIT KARE DEGIL,
 * GIF'in kendi (bundled ise GERCEK, custom ise varsayilan) en-boy oraniyla
 * (bkz. "GIF'i gerçekten farklı hissettirecek şekilde yeniden tasarlayalım"
 * - yatay/video gibi oran kararindan BOZULMASIN diye kirpilmiyor/karelestirilmiyor),
 * kosede kucuk bir "GIF" rozeti ile.
 */
export default function GifMessageBubble({ stickerId, mediaUrl }: Props) {
  const bundled = findSticker(stickerId);
  const source = bundled ? bundled.source : mediaUrl ? { uri: mediaUrl } : null;
  if (!source) return null;
  const ratio = bundled?.width && bundled?.height ? bundled.width / bundled.height : DEFAULT_RATIO;
  const height = FRAME_WIDTH / ratio;
  return (
    <View style={[styles.frame, { width: FRAME_WIDTH, height }]}>
      <Image source={source} style={styles.image} resizeMode="cover" />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>GIF</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: 8, backgroundColor: "#000000" },
  image: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
});
