import React from "react";
import { Image, StyleSheet } from "react-native";
import { findSticker } from "../data/stickerPacks";

interface Props {
  stickerId: string | null;
}

/** Gercek WhatsApp/Telegram cikartmalari gibi - mesaj balonunun rengi/
 * kenarligi OLMADAN (bkz. DMScreen - "sticker" kind'i icin bubble arka
 * plani/tail/pad TAMAMEN kaldiriliyor), sadece serbest/saydam bir gorsel. */
export default function StickerMessageBubble({ stickerId }: Props) {
  const sticker = findSticker(stickerId);
  if (!sticker) return null;
  return <Image source={sticker.source} style={styles.image} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  image: { width: 132, height: 132 },
});
