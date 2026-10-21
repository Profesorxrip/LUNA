import emojiGroups from "unicode-emoji-json/data-by-group.json";
import i18n from "../i18n";

export interface EmojiCategory {
  key: string;
  label: string;
  icon: string;
  emojis: string[];
}

export interface EmojiEntry {
  emoji: string;
  name: string; // unicode-emoji-json'daki ingilizce resmi isim - arama icin
  categoryLabel: string;
}

// unicode-emoji-json'un grup sirasi (0-8) Unicode'un resmi kategori sirasi -
// aktif dile gore etiket + sekme ikonu burada eslestiriliyor. Her Hizli
// Tepki secimi bu TAM unicode emoji setinden (1900+ emoji) yapilabiliyor.
// Fonksiyon olarak tanimli - dil degisiminde yeniden cagrilip guncel
// cevirileri okuyor (bkz. getEmojiCategories/getAllEmojis asagida).
function getGroupMeta(): Record<string, { label: string; icon: string }> {
  return {
    "0": { label: i18n.t("emoji.faces"), icon: "😀" },
    "1": { label: i18n.t("emoji.people"), icon: "👋" },
    "2": { label: i18n.t("emoji.animalsNature"), icon: "🐱" },
    "3": { label: i18n.t("emoji.foodDrink"), icon: "🍔" },
    "4": { label: i18n.t("emoji.travelPlaces"), icon: "✈️" },
    "5": { label: i18n.t("emoji.activities"), icon: "⚽" },
    "6": { label: i18n.t("emoji.objects"), icon: "💡" },
    "7": { label: i18n.t("emoji.symbols"), icon: "❤️" },
    "8": { label: i18n.t("emoji.flags"), icon: "🏁" },
  };
}

const GROUPS = emojiGroups as unknown as Record<string, { name: string; emojis: { emoji: string; name: string }[] }>;

// Unicode 16.0/17.0 ile eklenen, henuz hicbir yaygin cihaz/fontta renkli
// karsiligi olmayan (bos/gri bir kutu olarak gorunen) emojiler - canvas
// piksel analiziyle tek tek dogrulandi. Bu liste disindaki ayni surum
// numarasina sahip birkac emoji (orn. bayrak/balet emojisi) gercekten
// renkli ciktigi icin elenmedi.
const UNSUPPORTED_EMOJI = new Set([
  "🫪", // distorted face
  "🪾", // leafless tree
  "🫩", // face with bags under eyes
  "🫯", // fight cloud
  "🫟", // splatter
  "🫜", // root vegetable
  "🪊", // trombone
  "🫍", // orca
  "🪎", // treasure chest
  "🫆", // fingerprint
  "🫈", // hairy creature
  "🪉", // harp
  "🪏", // shovel
  "🛘", // landslide
]);

export function getEmojiCategories(): EmojiCategory[] {
  const groupMeta = getGroupMeta();
  return Object.keys(GROUPS)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => {
      const group = GROUPS[key];
      const meta = groupMeta[key] || { label: group.name, icon: group.emojis[0]?.emoji || "❔" };
      return {
        key,
        label: meta.label,
        icon: meta.icon,
        emojis: group.emojis.map((e) => e.emoji).filter((e) => !UNSUPPORTED_EMOJI.has(e)),
      };
    });
}

// Arama (EmojiPickerSheet'teki search cubugu) icin duz liste - her emojinin
// ingilizce resmi adini ve hangi (aktif dildeki) kategori basligina ait
// oldugunu tutar.
export function getAllEmojis(): EmojiEntry[] {
  const categories = getEmojiCategories();
  return categories.flatMap((cat) =>
    GROUPS[cat.key].emojis
      .filter((e) => !UNSUPPORTED_EMOJI.has(e.emoji))
      .map((e) => ({ emoji: e.emoji, name: e.name, categoryLabel: cat.label }))
  );
}
