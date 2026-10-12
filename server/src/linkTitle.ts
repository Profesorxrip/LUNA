// "Web" ile girilip dogrudan bir .mp4/.m3u8 dosyasi OLMAYAN (yani "external"
// turunde kalan) genel sayfa linkleri icin - oda/kart ismi olarak alan adi
// yerine sayfanin KENDI gercek basligini (og:title/<title>) kullanabilmek
// icin sunucu uzerinden ceker. Client'ta dogrudan fetch yapmak CORS'a
// takilabilir (rastgele siteler bizim origin'imize izin vermez) - sunucu
// tarafinda boyle bir kisit yok, bkz. faviconBadge.ts'teki ayni mantik.

const TITLE_FETCH_TIMEOUT_MS = 4000;
// <head>/<title> her zaman sayfanin cok basinda olur - tum sayfayi
// indirmeye gerek yok, ilk birkac yuz KB yeterli ve isi erken kesiyoruz.
const MAX_BYTES = 200_000;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

// Hem <meta property="og:title" content="..."> hem content'in property'den
// ONCE geldigi varyasyonlari yakalamak icin tum <meta> etiketlerini TEK TEK
// tarayip icindeki property/name ve content ozniteliklerini ayri ayri
// okuyoruz - tek bir buyuk regex'in attribute sirasina bagimli kalmasindan
// daha saglam.
function extractTitleFromHtml(html: string): string | null {
  const metaTagRe = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaTagRe.exec(html))) {
    const tag = match[0];
    const propMatch = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (propMatch && contentMatch) {
      const prop = propMatch[1].toLowerCase();
      if (prop === "og:title" || prop === "twitter:title") {
        const value = decodeHtmlEntities(contentMatch[1]).trim();
        if (value) return value;
      }
    }
  }
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) {
    const value = decodeHtmlEntities(titleMatch[1]).trim();
    if (value) return value;
  }
  return null;
}

/** Verilen sayfa linkinin GERCEK basligini (og:title, sonra <title>) dondurur
 * - gecersiz URL, http/https disinda bir protokol, HTML olmayan bir yanit
 * (dogrudan bir .mp4/.m3u8/resim vb.) ya da hicbir baslik etiketi yoksa
 * null doner - cagiran taraf (MediaPickerSheet.tsx) alan adini yedek olarak
 * kullanir. */
export async function fetchLinkTitle(rawUrl: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(TITLE_FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LUNAbot/1.0; +link-preview)" },
    });
    if (!res.ok || !res.body) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytesRead = 0;
    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    return extractTitleFromHtml(html);
  } catch {
    return null;
  }
}
