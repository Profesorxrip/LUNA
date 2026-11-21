import React from "react";
import { Image, StyleSheet } from "react-native";
import { findSticker } from "../data/stickerPacks";

interface Props {
  stickerId?: string | null;
  mediaUrl?: string | null;
}

/** Gercek WhatsApp/Telegram cikartmalari gibi - mesaj balonunun rengi/
 * kenarligi OLMADAN (bkz. DMScreen - "sticker" kind'i icin bubble arka
 * plani/tail/pad TAMAMEN kaldiriliyor), sadece serbest/saydam bir gorsel.
 * Iki kaynaktan biri: bundle edilmis hazir paket (stickerId -> yerel dosya,
 * bkz. stickerPacks.ts) YA DA kullanicinin "Çıkartma oluştur" ile kendi
 * yukledigi (mediaUrl -> gercek bir URL, bkz. 0046_dm_custom_stickers.sql). */
export default function StickerMessageBubble({ stickerId, mediaUrl }: Props) {
  const bundled = findSticker(stickerId);
  const source = bundled ? bundled.source : mediaUrl ? { uri: mediaUrl } : null;
  if (!source) return null;
  return <Image source={source} style={styles.image} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  image: { width: 132, height: 132 },
});
