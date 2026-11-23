import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "web_visit_counts";

// MediaPickerSheet.tsx'teki Web mini tarayicisinin "Sık Kullanılanlar"
// kutusu icin - kullanici: "en çok girdiğimiz 15 site olmalı". Her
// gercek site girisinde (adres cubugundan Git / kisayol tiklamasi)
// domain bazinda sayac arttirilir, cihaz bazli tutulur, sunucuya
// YAZILMAZ (pinnedHistory.ts / watchedMedia.ts ile ayni desen).
interface StoredCounts {
  [domain: string]: { url: string; count: number };
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
}

async function readAll(): Promise<StoredCounts> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

export async function recordWebVisit(url: string): Promise<void> {
  const domain = domainOf(url);
  if (!domain) return;
  const all = await readAll();
  const existing = all[domain];
  all[domain] = { url, count: (existing?.count ?? 0) + 1 };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function getWebVisitCounts(): Promise<Record<string, number>> {
  const all = await readAll();
  const counts: Record<string, number> = {};
  for (const domain in all) counts[domain] = all[domain].count;
  return counts;
}
