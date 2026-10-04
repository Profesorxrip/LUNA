import { ALL_EMOJIS } from "./emojiCategories";

// unicode-emoji-json sadece INGILIZCE resmi isim veriyor (Turkce lokalizasyonlu
// bir emoji veri seti yok) - bu yuzden en sik kullanilan ~100 tepki emojisi
// icin elle Turkce anahtar kelime ekledik. Arama bunlarin yaninda ingilizce
// isme ve Turkce kategori basligina da bakiyor, yani "pizza" veya "yuz
// ifadeleri" yazmak da sonuc veriyor - sadece bu liste Turkce'yi kapsiyor.
const TR_KEYWORDS: Record<string, string[]> = {
  "❤️": ["kalp", "ask", "sevgi"],
  "🧡": ["kalp", "turuncu"],
  "💛": ["kalp", "sari"],
  "💚": ["kalp", "yesil"],
  "💙": ["kalp", "mavi"],
  "💜": ["kalp", "mor"],
  "🖤": ["kalp", "siyah"],
  "🤍": ["kalp", "beyaz"],
  "🤎": ["kalp", "kahverengi"],
  "💔": ["kalp kirigi", "uzgun", "ayrilik"],
  "💕": ["ask", "sevgi", "iki kalp"],
  "💖": ["ask", "parlayan kalp"],
  "💗": ["ask", "buyuyen kalp"],
  "😍": ["asik", "bayildim", "harika"],
  "🥰": ["ask", "sevgi", "mutlu"],
  "😘": ["opucuk", "opuyorum"],
  "😂": ["gulme", "kahkaha", "komik"],
  "🤣": ["kahkaha", "gulme", "komik"],
  "😭": ["aglama", "agliyorum", "uzgun"],
  "😢": ["aglama", "uzgun"],
  "😡": ["kizgin", "sinirli", "ofke"],
  "😠": ["kizgin", "sinirli"],
  "😮": ["saskin", "sok"],
  "😱": ["korku", "ciglik", "sok"],
  "😴": ["uyku", "uyuyor"],
  "🙄": ["goz devirme", "saka"],
  "🤔": ["dusunuyorum", "dusunce", "hmm"],
  "😎": ["havali", "gunes gozlugu"],
  "🥳": ["parti", "kutlama", "dogum gunu"],
  "😇": ["melek", "masum"],
  "🤗": ["sarilma", "sariliyorum"],
  "😅": ["ter", "gulumseme", "tuhaf"],
  "😬": ["gerilmis", "tuhaf"],
  "🤯": ["saskin", "patladi", "sok"],
  "🥺": ["yalvariyorum", "uzgun", "minnoş"],
  "😏": ["sirin", "kurnaz"],
  "😳": ["utandim", "saskin"],
  "🤤": ["agiz suyu", "istiyorum"],
  "😤": ["ofke", "kizgin", "sinirli"],
  "🤮": ["kusma", "igrenc"],
  "🤢": ["mide bulantisi", "igrenc"],
  "😷": ["maske", "hasta"],
  "🥶": ["usumus", "soguk"],
  "🥵": ["sicak", "terlemis"],
  "👍": ["begendim", "tamam", "olur", "evet"],
  "👎": ["begenmedim", "hayir"],
  "👏": ["alkis", "aferin", "bravo"],
  "🙌": ["kutlama", "yasasin"],
  "🙏": ["dua", "lutfen", "tesekkur"],
  "💪": ["guc", "kuvvetli", "kas"],
  "👀": ["bakis", "ilginc", "goz"],
  "👋": ["merhaba", "el sallama", "bay bay"],
  "🤝": ["anlasma", "el sikisma"],
  "✌️": ["baris", "zafer"],
  "🤞": ["sans", "umarim"],
  "🔥": ["ates", "harika", "mukemmel"],
  "💯": ["yuz", "mukemmel", "kesinlikle"],
  "🎉": ["parti", "kutlama", "tebrikler"],
  "🎊": ["kutlama", "konfeti"],
  "⭐": ["yildiz"],
  "🌟": ["yildiz", "parlak"],
  "✨": ["parilti", "guzel", "buyulu"],
  "☀️": ["gunes"],
  "🌙": ["ay"],
  "🌈": ["gokkusagi"],
  "☁️": ["bulut"],
  "⚡": ["simsek", "yildirim"],
  "❄️": ["kar"],
  "💧": ["su", "damla", "gozyasi"],
  "🍕": ["pizza"],
  "🍔": ["hamburger", "burger"],
  "🍟": ["patates"],
  "🍗": ["tavuk"],
  "🍰": ["pasta", "kek"],
  "🎂": ["dogum gunu", "pasta"],
  "🍩": ["donut"],
  "🍦": ["dondurma"],
  "☕": ["kahve"],
  "🍺": ["bira"],
  "🍻": ["kadeh", "serefe"],
  "🍷": ["sarap"],
  "🐶": ["kopek"],
  "🐱": ["kedi"],
  "🐸": ["kurbaga"],
  "🦋": ["kelebek"],
  "🌹": ["gul", "cicek"],
  "💐": ["cicek", "buket"],
  "🎁": ["hediye"],
  "🏆": ["kupa", "sampiyon"],
  "🥇": ["madalya", "birinci", "altin"],
  "✅": ["tamam", "dogru", "onay"],
  "❌": ["yanlis", "iptal", "hayir"],
  "⚠️": ["uyari", "dikkat"],
  "❓": ["soru"],
  "❗": ["unlem", "dikkat"],
  "🎵": ["muzik", "nota"],
  "⚽": ["futbol", "top"],
  "🏀": ["basketbol"],
  "🚗": ["araba"],
  "✈️": ["ucak"],
  "📱": ["telefon"],
  "💰": ["para"],
  "⏰": ["saat", "alarm"],
  "🔔": ["zil"],
  "🔒": ["kilit"],
  "🔑": ["anahtar"],
  "📷": ["kamera", "fotograf"],
  "💡": ["ampul", "fikir"],
  "💣": ["bomba"],
  "☂️": ["semsiye"],
  "💀": ["kafatasi", "olum"],
  "👻": ["hayalet"],
  "🤡": ["palyaco"],
  "🌸": ["cicek"],
  "🍀": ["sans", "yonca"],
  "🦄": ["unicorn", "tekboynuzlu at"],
  "🐷": ["domuz"],
  "🐵": ["maymun"],
  "🙈": ["utandim", "maymun"],
  "🦁": ["aslan"],
  "🐻": ["ayi"],
  "🇹🇷": ["turkiye", "turk bayragi"],
};

function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

const SEARCH_INDEX = ALL_EMOJIS.map((item) => ({
  emoji: item.emoji,
  haystack: normalizeTr([item.name, item.categoryLabel, ...(TR_KEYWORDS[item.emoji] || [])].join(" ")),
}));

/** Bosluklarla ayrilmis her kelimenin haystack'te gecmesini arar (sirali
 * eslesme sartlamadan) - "kirmizi kalp" gibi birden fazla kelimeli aramalarda
 * da calisir. Her emoji sadece bir kere donuyor, sira EMOJI_CATEGORIES'teki
 * (yani Unicode'un resmi) sirayla ayni. */
export function searchEmojis(query: string): string[] {
  const words = normalizeTr(query.trim())
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return [];
  const results: string[] = [];
  for (const item of SEARCH_INDEX) {
    if (words.every((w) => item.haystack.includes(w))) results.push(item.emoji);
  }
  return results;
}
