import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import tr from "./locales/tr.json";
import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";
import ku from "./locales/ku.json";
import el from "./locales/el.json";

export type LanguageCode = "tr" | "en" | "de" | "fr" | "ar" | "ku" | "el";

// Dil adlari HER ZAMAN kendi dillerinde gosterilir (otonim) - hangi dil
// secili olursa olsun bu liste degismez, uygulamalardaki standart davranis budur.
export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
  { code: "ku", label: "Kurdî" },
  { code: "el", label: "Ελληνικά" },
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
}

export async function setAppLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, code);
  } catch {
    // kalicilik basarisiz olsa bile dil degisikligi bu oturumda gecerli kalir
  }
}

export default i18n;
