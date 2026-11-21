import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";
import { findSticker } from "../data/stickerPacks";

interface Props {
  stickerId?: string | null;
  mediaUrl?: string | null;
  size?: number;
  borderRadius?: number;
}

/** Kullanici: "Gif çıkartma gibi duruyor ama gif video gibi durmalı" ->
 * sonra: "O fotoğraf gibi video gibi mesaj balonunun içinde değil o
 * büyüklüklerde değil" - GIF, StickerMessageBubble'in (serbest/saydam,
 * cercevesiz, mesaj balonu DISINDA) AKSINE, ChatImageBubble/
 * VideoMessageBubble ile TAMAMEN AYNI kurali izler: normal mesaj balonunun
 * (renk/dolgu/kuyruk - bkz. DMScreen.tsx isGifSticker) ICINDE, AYNI SABIT
 * KARE boyut (varsayilan 280, borderRadius 8) ve "cover" kirpma. Tek fark:
 * kosede kucuk bir "GIF" rozeti - aksi halde video mesajindan ayirt
 * edilemezdi.
 */
export default function GifMessageBubble({ stickerId, mediaUrl, size = 280, borderRadius = 8 }: Props) {
  const bundled = findSticker(stickerId);
  const source = bundled ? bundled.source : mediaUrl ? { uri: mediaUrl } : null;
  if (!source) return null;
  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius }]}>
      <Image source={source} style={styles.image} resizeMode="cover" />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>GIF</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: "#000000" },
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
