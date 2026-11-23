import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "web_visit_counts";

// MediaPickerSheet.tsx'teki Web mini tarayicisinin "Sık Kullanılanlar"
// kutusu icin - kullanici: "en çok girdiğimiz 15 site olmalı", "yalnızca
// gerçek site isimleri ve gerçek logolar kullanılmalı". Her gercek site
// girisinde (adres cubugundan Git / kisayol tiklamasi) domain bazinda bir
// sayac AsyncStorage'da arttirilir, cihaz bazli tutulur, sunucuya
// YAZILMAZ (pinnedHistory.ts / watchedMedia.ts ile ayni desen). Sabit/
// varsayilan bir liste YOK - hic ziyaret yoksa bos doner.
export interface WebVisitEntry {
  url: string;
  title: string | null;
  count: number;
}
interface StoredVisits {
  [domain: string]: WebVisitEntry;
}

function domainOf(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
}

async function readAll(): Promise<StoredVisits> {
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
  all[domain] = { url, title: existing?.title ?? null, count: (existing?.count ?? 0) + 1 };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

// WebView navState'inden GERCEK sayfa basligi gelince (bkz.
// handleWebNavChange) - sayaci ARTTIRMADAN, sadece o domain'in gosterilecek
// gercek adini gunceller (orn. "tiktok.com" -> "TikTok").
export async function updateWebVisitTitle(url: string, title: string): Promise<void> {
  const domain = domainOf(url);
  if (!domain || !title.trim()) return;
  const all = await readAll();
  const existing = all[domain];
  if (!existing) return;
  if (existing.title === title) return;
  all[domain] = { ...existing, title };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export async function getTopWebVisits(limit: number): Promise<Array<WebVisitEntry & { domain: string }>> {
  const all = await readAll();
  return Object.entries(all)
    .map(([domain, entry]) => ({ domain, ...entry }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
