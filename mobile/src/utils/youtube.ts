/** "https://youtu.be/XXXX", "https://www.youtube.com/watch?v=XXXX" ya da
 * dogrudan video ID'sinin kendisinden gecerli bir YouTube video ID'si
 * cikarir. Taninmazsa null doner. */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  const idPattern = /^[a-zA-Z0-9_-]{11}$/;
  if (idPattern.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.slice(1);
      return idPattern.test(id) ? id : null;
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && idPattern.test(v)) return v;
      const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];
    }
  } catch {
    // gecerli bir URL degil
  }
  return null;
}

/** Video ID'sinden gercek YouTube video basligini, resmi oEmbed servisi
 * uzerinden (API anahtari gerektirmez) ceker. Odanin/kartin ismi olarak
 * kullanilir - istek basarisiz olursa (internet yok, video kaldirilmis vb.)
 * null doner ve cagiran taraf bir yedek isim kullanir. */
export async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.title === "string" ? data.title : null;
  } catch {
    return null;
  }
}
