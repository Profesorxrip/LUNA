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

export interface YouTubeMeta {
  title: string | null;
  channelName: string | null;
}

/** Video ID'sinden gercek YouTube video basligini VE kanal adini, resmi
 * oEmbed servisi uzerinden (API anahtari gerektirmez) ceker. Baslik odanin/
 * kartin ismi, kanal adi da NowPlayingBar.tsx'teki kompakt bardaki alt
 * satir icin kullanilir - istek basarisiz olursa (internet yok, video
 * kaldirilmis vb.) ikisi de null doner, cagiran taraf yedek deger kullanir. */
export async function fetchYouTubeMeta(videoId: string): Promise<YouTubeMeta> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`
    );
    if (!res.ok) return { title: null, channelName: null };
    const data = await res.json();
    return {
      title: typeof data.title === "string" ? data.title : null,
      channelName: typeof data.author_name === "string" ? data.author_name : null,
    };
  } catch {
    return { title: null, channelName: null };
  }
}
