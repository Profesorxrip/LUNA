// Kullanici: "Gif eklemesek hiç" dedikten sonra, Tenor/GIPHY gibi harici bir
// API'ye BAGLANMADAN ("kendi gıf kütüphanemiz olsun") kendi ozgun GIF'lerimizi
// uretip bir varsayilan paket olarak bundle etmeye karar verdik (bkz.
// assets/gifs/CREDITS.md - Python/Pillow ile cizilmis, ucuncu taraf icerik
// YOK). Yapisi stickerPacks.ts ile AYNI (StickerPack/StickerDef) - bir GIF'e
// basmak da cikartma gibi ANINDA kendi basina mesaj olarak gonderilir (bkz.
// DMScreen sendSticker - aynı gonderme/bulma pipeline'ini paylasirlar).
import type { StickerPack } from "./stickerPacks";

export const GIF_PACKS: StickerPack[] = [
  {
    id: "luna-gifs-default",
    name: "GIF",
    icon: require("../../assets/gifs/confetti.gif"),
    stickers: [
      { id: "gif-confetti", source: require("../../assets/gifs/confetti.gif") },
      { id: "gif-fire", source: require("../../assets/gifs/fire.gif") },
      { id: "gif-heart_burst", source: require("../../assets/gifs/heart_burst.gif") },
      { id: "gif-clap", source: require("../../assets/gifs/clap.gif") },
      { id: "gif-thumbs_up", source: require("../../assets/gifs/thumbs_up.gif") },
      { id: "gif-star_sparkle", source: require("../../assets/gifs/star_sparkle.gif") },
    ],
  },
];
