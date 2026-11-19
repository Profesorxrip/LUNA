// toLocaleTimeString icin dil koduna karsilik gelen BCP-47 etiketi - bazi
// dillerin (ku) resmi bir ICU locale'i olmayabilir, tarayici/JS motoru
// bilmedigi bir etiketi sessizce sistem varsayilanina dusurur (hata vermez).
const TIME_LOCALE: Record<string, string> = {
  tr: "tr-TR",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  ar: "ar",
  ku: "ku",
  el: "el-GR",
  ru: "ru-RU",
  az: "az-AZ",
  es: "es-ES",
};

/** Bir mesaj/fotograf zaman damgasini (ms) HH:MM olarak, o an aktif dilin
 * kendi saat bicimiyle (12/24 saat vb.) gosterir - bkz. DMScreen.tsx
 * metaTime, PhotoViewerModal.tsx gonderen bilgisi. */
export function formatMessageTime(ms: number, language: string): string {
  return new Date(ms).toLocaleTimeString(TIME_LOCALE[language] ?? "en-US", { hour: "2-digit", minute: "2-digit" });
}
