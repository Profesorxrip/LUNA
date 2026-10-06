// "Otomatik Oynat" modu icin GERCEK "ilgili videoya gec" ozelligi - YouTube
// Data API v3'un relatedToVideoId parametresi 2020'de kaldirildigi icin
// (artik resmi bir "ilgili video" API'si yok), videonun kendi izleme
// sayfasina gomulu olan ytInitialData JSON'undaki "ilgili videolar"
// listesini okuyoruz. Resmi degil ama yt-dlp gibi araclarin da kullandigi,
// YouTube sayfa yapisini degistirmedigi surece calisan bir teknik.
const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

export interface RelatedVideo {
  videoId: string;
  title: string;
}

interface CacheEntry {
  videos: RelatedVideo[];
  expiresAtMs: number;
}
const cache = new Map<string, CacheEntry>();

/** "marker" gectikten sonraki ilk "{" karakterinden baslayip, string
 * icindekileri (tirnak/escape farkinda) sayarak dengeli ("{"/"}" sayisi esit
 * olana kadar) JSON metnini keser - sayfa biciminin (degisken adi, araya
 * giren bosluk vb.) tam olarak nasil oldugundan bagimsiz calisir. */
function extractBalancedJson(html: string, marker: string): string | null {
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) return null;
  const start = html.indexOf("{", markerIdx);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

function extractTitle(titleField: unknown): string {
  if (!titleField || typeof titleField !== "object") return "";
  const t = titleField as Record<string, unknown>;
  if (typeof t.simpleText === "string") return t.simpleText;
  if (Array.isArray(t.runs)) {
    return t.runs
      .map((run) => (run && typeof run === "object" && typeof (run as Record<string, unknown>).text === "string" ? (run as Record<string, unknown>).text : ""))
      .join("");
  }
  return "";
}

/** ytInitialData agacinin TAMAMINI dolasip, nerede/nasil sarilmis olursa
 * olsun (sayfa surumden suruma farkli ic katmanlarla sarabiliyor) her
 * "compactVideoRenderer" dugumunu toplar - sabit bir yol (path) yerine bu
 * genel arama, YouTube'un ic sarmalayicilarini degistirmesine karsi daha
 * dayanikli. */
function collectCompactVideoRenderers(node: unknown, out: RelatedVideo[], seen: Set<string>, depth: number): void {
  if (depth > 60 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectCompactVideoRenderers(item, out, seen, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const renderer = obj.compactVideoRenderer;
  if (renderer && typeof renderer === "object") {
    const r = renderer as Record<string, unknown>;
    const videoId = typeof r.videoId === "string" ? r.videoId : null;
    if (videoId && !seen.has(videoId)) {
      seen.add(videoId);
      out.push({ videoId, title: extractTitle(r.title) });
    }
  }
  for (const key of Object.keys(obj)) {
    if (key === "compactVideoRenderer") continue;
    collectCompactVideoRenderers(obj[key], out, seen, depth + 1);
  }
}

async function fetchRelatedVideosUncached(videoId: string): Promise<RelatedVideo[]> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const json = extractBalancedJson(html, "ytInitialData");
    if (!json) return [];
    const data = JSON.parse(json);
    const out: RelatedVideo[] = [];
    collectCompactVideoRenderers(data, out, new Set(), 0);
    return out;
  } catch {
    return [];
  }
}

export async function getRelatedVideos(videoId: string): Promise<RelatedVideo[]> {
  const cached = cache.get(videoId);
  if (cached && cached.expiresAtMs > Date.now()) return cached.videos;
  const videos = await fetchRelatedVideosUncached(videoId);
  // Basarisiz (bos) sonucu da kisa sureligine cache'liyoruz - YouTube anlik
  // basarisiz olursa her "playback:ended" event'inde sayfayi tekrar tekrar
  // cekmeyelim.
  cache.set(videoId, { videos, expiresAtMs: Date.now() + CACHE_TTL_MS });
  return videos;
}

/** Odada ZATEN oynatilmis (su anki + gecmis) video id'lerini elenerek
 * ilgili videolar listesinden ilk uygun olani dondurur - boylece A bitince
 * ilgilisi yine A ya da zaten izlenmis B olursa sonsuz dongu/tekrar olmaz. */
export async function pickNextAutoplayVideo(currentVideoId: string, excludeVideoIds: Set<string>): Promise<RelatedVideo | null> {
  const related = await getRelatedVideos(currentVideoId);
  for (const video of related) {
    if (!excludeVideoIds.has(video.videoId)) return video;
  }
  return null;
}
