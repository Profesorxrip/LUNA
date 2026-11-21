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
    // Kullanici: "GIF'i gerçekten farklı hissettirecek şekilde yeniden
    // tasarlayalım" -> yatay/video gibi oran secildi (cikartmanin kare/ikon
    // hissinden tamamen ayrilsin diye). width/height, uretilen GERCEK GIF
    // piksel boyutlari (bkz. masonry grid - EmojiKeyboardPanel.tsx).
    stickers: [
      { id: "gif-confetti", source: require("../../assets/gifs/confetti.gif"), width: 200, height: 124 },
      { id: "gif-fire", source: require("../../assets/gifs/fire.gif"), width: 190, height: 120 },
      { id: "gif-heart_burst", source: require("../../assets/gifs/heart_burst.gif"), width: 180, height: 130 },
      { id: "gif-clap", source: require("../../assets/gifs/clap.gif"), width: 210, height: 120 },
      { id: "gif-thumbs_up", source: require("../../assets/gifs/thumbs_up.gif"), width: 170, height: 130 },
      { id: "gif-star_sparkle", source: require("../../assets/gifs/star_sparkle.gif"), width: 200, height: 120 },
      // Kullanici: "34 tane daha gif oluştur gifleri kırka tamamlayalım"
      { id: "gif-rain_cloud", source: require("../../assets/gifs/rain_cloud.gif"), width: 180, height: 118 },
      { id: "gif-snow", source: require("../../assets/gifs/snow.gif"), width: 170, height: 124 },
      { id: "gif-money_rain", source: require("../../assets/gifs/money_rain.gif"), width: 190, height: 118 },
      { id: "gif-balloon", source: require("../../assets/gifs/balloon.gif"), width: 190, height: 128 },
      { id: "gif-trophy", source: require("../../assets/gifs/trophy.gif"), width: 170, height: 130 },
      { id: "gif-crown", source: require("../../assets/gifs/crown.gif"), width: 180, height: 120 },
      { id: "gif-checkmark", source: require("../../assets/gifs/checkmark.gif"), width: 160, height: 120 },
      { id: "gif-cross_mark", source: require("../../assets/gifs/cross_mark.gif"), width: 160, height: 120 },
      { id: "gif-question_mark", source: require("../../assets/gifs/question_mark.gif"), width: 150, height: 130 },
      { id: "gif-exclamation", source: require("../../assets/gifs/exclamation.gif"), width: 140, height: 130 },
      { id: "gif-ghost", source: require("../../assets/gifs/ghost.gif"), width: 150, height: 130 },
      { id: "gif-mind_blown", source: require("../../assets/gifs/mind_blown.gif"), width: 180, height: 128 },
      { id: "gif-bomb", source: require("../../assets/gifs/bomb.gif"), width: 170, height: 120 },
      { id: "gif-rocket", source: require("../../assets/gifs/rocket.gif"), width: 150, height: 135 },
      { id: "gif-birthday_cake", source: require("../../assets/gifs/birthday_cake.gif"), width: 190, height: 122 },
      { id: "gif-wave_hand", source: require("../../assets/gifs/wave_hand.gif"), width: 160, height: 120 },
      { id: "gif-ok_hand", source: require("../../assets/gifs/ok_hand.gif"), width: 150, height: 130 },
      { id: "gif-peace_sign", source: require("../../assets/gifs/peace_sign.gif"), width: 150, height: 130 },
      { id: "gif-thumbs_down", source: require("../../assets/gifs/thumbs_down.gif"), width: 150, height: 130 },
      { id: "gif-kiss_heart", source: require("../../assets/gifs/kiss_heart.gif"), width: 170, height: 122 },
      { id: "gif-sunrise", source: require("../../assets/gifs/sunrise.gif"), width: 190, height: 116 },
      { id: "gif-moon_stars", source: require("../../assets/gifs/moon_stars.gif"), width: 190, height: 118 },
      { id: "gif-ocean_wave", source: require("../../assets/gifs/ocean_wave.gif"), width: 200, height: 112 },
      { id: "gif-rainbow", source: require("../../assets/gifs/rainbow.gif"), width: 200, height: 120 },
      { id: "gif-lightning", source: require("../../assets/gifs/lightning.gif"), width: 170, height: 124 },
      { id: "gif-coffee_steam", source: require("../../assets/gifs/coffee_steam.gif"), width: 160, height: 130 },
      { id: "gif-eyes_roll", source: require("../../assets/gifs/eyes_roll.gif"), width: 160, height: 118 },
      { id: "gif-sweat_drop", source: require("../../assets/gifs/sweat_drop.gif"), width: 150, height: 130 },
      { id: "gif-sleepy_zzz", source: require("../../assets/gifs/sleepy_zzz.gif"), width: 170, height: 120 },
      { id: "gif-skull_x", source: require("../../assets/gifs/skull_x.gif"), width: 150, height: 130 },
      { id: "gif-haha_bounce", source: require("../../assets/gifs/haha_bounce.gif"), width: 170, height: 116 },
      { id: "gif-loading_dots", source: require("../../assets/gifs/loading_dots.gif"), width: 150, height: 110 },
      { id: "gif-music_notes", source: require("../../assets/gifs/music_notes.gif"), width: 180, height: 120 },
      { id: "gif-party_popper", source: require("../../assets/gifs/party_popper.gif"), width: 190, height: 120 },
    ],
  },
];
