// Oda sohbetinde "Chat Mesajlarini Otomatik Cevir" acikken GERCEK ceviri -
// ulke/il tespitiyle AYNI best-effort mantik: API key gerektirmeyen ucretsiz
// MyMemory servisini kullanir, basarisiz olursa (rate limit, desteklenmeyen
// dil ciftivb.) sessizce null doner - cagiran taraf bu durumda orijinal
// metni gostermeye devam eder.
const MAX_INPUT_LENGTH = 500; // MyMemory'nin ucretsiz katmani da bu civarda sinirli

export async function translateText(text: string, from: string, to: string): Promise<string | null> {
  if (from === to) return null;
  const clipped = text.slice(0, MAX_INPUT_LENGTH);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clipped)}&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data: any = await res.json();
    const translated = data?.responseData?.translatedText;
    // MyMemory basarisiz ceviride de 200 donup metnin icine hata mesaji
    // koyabiliyor ("INVALID LANGPAIR" gibi) - boyle gorunen sonuclari eleyelim.
    if (typeof translated !== "string" || /^[A-Z ]+$/.test(translated)) return null;
    return translated;
  } catch {
    return null;
  }
}

/** Oda icindeki TUM katilimcilarin dillerine (gonderenin kendi dili HARIC,
 * cunku kendi dilinde zaten okuyor) tek bir mesaji cevirir - ayni dile
 * birden fazla katilimci varsa bile o dil icin TEK istek atilir. */
export async function translateToLanguages(
  text: string,
  fromLang: string,
  targetLangs: Set<string>
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  await Promise.all(
    Array.from(targetLangs)
      .filter((lang) => lang !== fromLang)
      .map(async (lang) => {
        const translated = await translateText(text, fromLang, lang);
        if (translated) results[lang] = translated;
      })
  );
  return results;
}
