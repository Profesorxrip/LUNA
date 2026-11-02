import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSocket } from "../services/socket";
import tr from "./locales/tr.json";
import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import ku from "./locales/ku.json";
import el from "./locales/el.json";
import ru from "./locales/ru.json";
import az from "./locales/az.json";
import es from "./locales/es.json";

export type LanguageCode = "tr" | "en" | "de" | "fr" | "ar" | "ku" | "el" | "ru" | "az" | "es";

// Dil adlari HER ZAMAN kendi dillerinde gosterilir (otonim) - hangi dil
// secili olursa olsun bu liste degismez, uygulamalardaki standart davranis budur.
// "country" - uygulamada zaten var olan CountryFlag bilesenine (bkz.
// components/CountryFlag.tsx, country-flag-icons'tan gomulu gercek PNG
// bayraklar - emoji bayraklarin Android'de pikselli gorunmesini onluyor)
// verilen ISO 3166-1 alpha-2 kodu. Kurtce'nin karsilik geldigi bagimsiz bir
// ulke olmadigindan (ve herhangi bir ulkenin bayragini atamak siyasi olarak
// yaniltici olacagindan) country burada null - CountryFlag hicbir sey
// gostermiyor, yerine notr bir bayrak emojisi kullaniliyor.
export const LANGUAGES: { code: LanguageCode; label: string; country: string | null }[] = [
  { code: "tr", label: "Türkçe", country: "tr" },
  { code: "en", label: "English", country: "gb" },
  { code: "de", label: "Deutsch", country: "de" },
  { code: "fr", label: "Français", country: "fr" },
  { code: "ar", label: "العربية", country: "sa" },
  { code: "ku", label: "Kurdî", country: null },
  { code: "el", label: "Ελληνικά", country: "gr" },
  { code: "ru", label: "Русский", country: "ru" },
  { code: "az", label: "Azərbaycan dili", country: "az" },
  { code: "es", label: "Español", country: "es" },
];

const STORAGE_KEY = "app_language";

i18n.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
    de: { translation: de },
    fr: { translation: fr },
    ar: { translation: ar },
    ku: { translation: ku },
    el: { translation: el },
    ru: { translation: ru },
    az: { translation: az },
    es: { translation: es },
  },
  lng: "tr",
  fallbackLng: "tr",
  interpolation: { escapeValue: false },
});

/** Uygulama acilisinda daha once secilmis bir dil varsa (AsyncStorage) onu
 * yukler - yoksa varsayilan "tr" ile kalir. App.tsx'te en basta cagrilir. */
export async function loadStoredLanguage(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) {
      await i18n.changeLanguage(stored);
    }
  } catch {
    // depolama okunamazsa sessizce varsayilanda (tr) kal
  }
  // Sunucu "Chat Mesajlarini Otomatik Cevir" icin bu baglantinin dilini
  // bilmeli - giris yapmamis MISAFIRLER de chat kullandigi icin uygulama
  // acilisinda HERKES bildirir (bkz. server/src/index.ts profile:language).
  getSocket().emit("profile:language", { lang: i18n.language });
}

export async function setAppLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  getSocket().emit("profile:language", { lang: code });
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    // kalicilik basarisiz olsa bile dil degisikligi bu oturumda gecerli kalir
  }
}

export default i18n;
