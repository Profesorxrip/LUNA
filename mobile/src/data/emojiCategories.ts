import emojiGroups from "unicode-emoji-json/data-by-group.json";

export interface EmojiCategory {
  key: string;
  label: string;
  icon: string;
  emojis: string[];
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

export const EMOJI_CATEGORIES: EmojiCategory[] = Object.keys(emojiGroups)
  .sort((a, b) => Number(a) - Number(b))
  .map((key) => {
    const group = (emojiGroups as unknown as Record<string, { name: string; emojis: { emoji: string }[] }>)[key];
    const meta = GROUP_META[key] || { label: group.name, icon: group.emojis[0]?.emoji || "❔" };
    return {
      key,
      label: meta.label,
      icon: meta.icon,
      emojis: group.emojis.map((e) => e.emoji),
    };
  });
