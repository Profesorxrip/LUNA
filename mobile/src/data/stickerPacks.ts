// Kullanicinin istegi: "etiket" degil GERCEK gorsel "çıkartma" (WhatsApp/
// Telegram'daki gibi). Kendi cizim/foto tabanli bir paket kaynagimiz
// olmadigi icin acik lisansli (CC BY-SA 4.0) OpenMoji setinden secilmis
// ~25 ifade/reaksiyon PNG'si tek bir varsayilan paket olarak bundle edildi
// (bkz. assets/stickers/openmoji/CREDITS.md). "packs" dizisi SONRADAN yeni
// paketler eklenebilsin diye coklu-paket yapisinda tutuluyor.
import type { ImageSourcePropType } from "react-native";
import { GIF_PACKS } from "./gifPacks";

// Bundle edilmis hazir paketlerde require() sonucu (number), kullanicinin
// "Çıkartma oluştur" ile ekledigi kisisel pakette ise uzak bir URL
// ({uri: string}) olur (bkz. EmojiKeyboardPanel.tsx "custom" paketi) -
// ikisi de gecerli bir ImageSourcePropType.
export interface StickerDef {
  id: string;
  source: ImageSourcePropType;
}

export interface StickerPack {
  id: string;
  name: string;
  icon: ImageSourcePropType;
  stickers: StickerDef[];
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: "openmoji-default",
    name: "Günlük",
    icon: require("../../assets/stickers/openmoji/smile.png"),
    stickers: [
      { id: "smile", source: require("../../assets/stickers/openmoji/smile.png") },
      { id: "laugh", source: require("../../assets/stickers/openmoji/laugh.png") },
      { id: "rofl", source: require("../../assets/stickers/openmoji/rofl.png") },
      { id: "heart_eyes", source: require("../../assets/stickers/openmoji/heart_eyes.png") },
      { id: "cry", source: require("../../assets/stickers/openmoji/cry.png") },
      { id: "angry", source: require("../../assets/stickers/openmoji/angry.png") },
      { id: "thumbs_up", source: require("../../assets/stickers/openmoji/thumbs_up.png") },
      { id: "thumbs_down", source: require("../../assets/stickers/openmoji/thumbs_down.png") },
      { id: "fire", source: require("../../assets/stickers/openmoji/fire.png") },
      { id: "party", source: require("../../assets/stickers/openmoji/party.png") },
      { id: "sleep", source: require("../../assets/stickers/openmoji/sleep.png") },
      { id: "think", source: require("../../assets/stickers/openmoji/think.png") },
      { id: "cool", source: require("../../assets/stickers/openmoji/cool.png") },
      { id: "pray", source: require("../../assets/stickers/openmoji/pray.png") },
      { id: "clap", source: require("../../assets/stickers/openmoji/clap.png") },
      { id: "scream", source: require("../../assets/stickers/openmoji/scream.png") },
      { id: "celebrate", source: require("../../assets/stickers/openmoji/celebrate.png") },
      { id: "smirk", source: require("../../assets/stickers/openmoji/smirk.png") },
      { id: "hug", source: require("../../assets/stickers/openmoji/hug.png") },
      { id: "hundred", source: require("../../assets/stickers/openmoji/hundred.png") },
      { id: "cat", source: require("../../assets/stickers/openmoji/cat.png") },
      { id: "dog", source: require("../../assets/stickers/openmoji/dog.png") },
      { id: "love", source: require("../../assets/stickers/openmoji/love.png") },
      { id: "sweat", source: require("../../assets/stickers/openmoji/sweat.png") },
      { id: "heart", source: require("../../assets/stickers/openmoji/heart.png") },
    ],
  },
];

// Cikartma VE gif gonderme ayni pipeline'i (sendSticker/StickerMessageBubble)
// paylastigi icin burada ikisi birden aranir (bkz. gifPacks.ts).
export function findSticker(stickerId: string | null | undefined): StickerDef | null {
  if (!stickerId) return null;
  for (const pack of [...STICKER_PACKS, ...GIF_PACKS]) {
    const found = pack.stickers.find((s) => s.id === stickerId);
    if (found) return found;
  }
  return null;
}
