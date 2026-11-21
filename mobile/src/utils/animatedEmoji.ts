// Kullanici: "Süper tamamı bu olsun eski emojileri tamamen kaldırabiliriz" -
// Google'in ucretsiz/acik lisansli (OFL) Noto Animasyonlu Emoji seti
// (fonts.gstatic.com/s/e/notoemoji) KAPSAMI TAM BILINMIYOR (butun ~1900
// emoji icin degil, sadece bir KISMI icin hazir animasyon var - ozellikle
// bayraklar/aile-ZWJ dizileri/ten tonu varyantlari COGUNLUKLA YOK). Bu
// yuzden burada bir "desteklenenler listesi" TUTULMUYOR - her emoji icin
// olasi URL(ler) hesaplanir, GERCEKTEN YUKLENEMEZSE (bkz. AnimatedEmoji.tsx
// onError zinciri) eski duz emoji karakterine ZARİFCE geri donulur.
export function getAnimatedEmojiUrls(emoji: string): string[] {
  const codepoints = Array.from(emoji).map((c) => c.codePointAt(0)!.toString(16));
  const full = codepoints.join("-");
  const withoutVariationSelector = codepoints.filter((cp) => cp !== "fe0f").join("-");
  const urls = [full];
  if (withoutVariationSelector && withoutVariationSelector !== full) urls.push(withoutVariationSelector);
  return urls.map((cp) => `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/512.gif`);
}
