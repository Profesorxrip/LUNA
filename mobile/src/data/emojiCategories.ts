import emojiGroups from "unicode-emoji-json/data-by-group.json";

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
// Turkce etiket + sekme ikonu burada eslestiriliyor. Her Hizli Tepki secimi
// bu TAM unicode emoji setinden (1900+ emoji) yapilabiliyor.
const GROUP_META: Record<string, { label: string; icon: string }> = {
  "0": { label: "Yüz İfadeleri", icon: "😀" },
  "1": { label: "İnsanlar", icon: "👋" },
  "2": { label: "Hayvanlar & Doğa", icon: "🐱" },
  "3": { label: "Yiyecek & İçecek", icon: "🍔" },
  "4": { label: "Seyahat & Mekanlar", icon: "✈️" },
  "5": { label: "Aktiviteler", icon: "⚽" },
  "6": { label: "Nesneler", icon: "💡" },
  "7": { label: "Semboller", icon: "❤️" },
  "8": { label: "Bayraklar", icon: "🏁" },
};

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

export const EMOJI_CATEGORIES: EmojiCategory[] = Object.keys(GROUPS)
  .sort((a, b) => Number(a) - Number(b))
  .map((key) => {
    const group = GROUPS[key];
    const meta = GROUP_META[key] || { label: group.name, icon: group.emojis[0]?.emoji || "❔" };
    return {
      key,
      label: meta.label,
      icon: meta.icon,
      emojis: group.emojis.map((e) => e.emoji).filter((e) => !UNSUPPORTED_EMOJI.has(e)),
    };
  });

// Arama (EmojiPickerSheet'teki search cubugu) icin duz liste - her emojinin
// ingilizce resmi adini ve hangi Turkce kategori basligina ait oldugunu tutar.
export const ALL_EMOJIS: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((cat) =>
  GROUPS[cat.key].emojis
    .filter((e) => !UNSUPPORTED_EMOJI.has(e.emoji))
    .map((e) => ({ emoji: e.emoji, name: e.name, categoryLabel: cat.label }))
);
