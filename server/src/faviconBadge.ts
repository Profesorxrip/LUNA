import { Jimp } from "jimp";
import { decodeIco, isIco } from "icojs";

// "Web" ile girilip EXTERNAL_PLATFORMS'taki markali platformlardan hicbiriyle
// eslesmeyen genel siteler icin - sitenin KENDI favicon'unu ceker ve
// digerleri gibi tek renkli (beyaz) yari-seffaf bir "hayalet" rozete cevirir
// (bkz. PlatformBadge.tsx yorum). Ham renkli favicon'u OLDUGU GIBI gostermek
// diger rozetlerle tutarsiz durdugu icin (kullanici geri bildirimi), ama
// ilk versiyon (arkaplan rengini kose piksellerinden tahmin edip onu
// silmek) GERCEK seffafligi OLAN modern ikonlarda (cogu PNG/ICO) sonucu
// taninamaz hale getiriyordu - cunku zaten dogru olan seffafligi gorup
// gormezden gelip KENDI (daha kaba) tahminini uyguluyordu (bkz.
// buildSilhouette icindeki hasRealAlpha ayrimi).
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const SIZE = 64;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BG_DIST_LO = 25;
const BG_DIST_HI = 70;

interface CacheEntry {
  buffer: Buffer | null;
  expiresAtMs: number;
}
const cache = new Map<string, CacheEntry>();

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// En yaygin favicon formatlarindan biri olan .ico'yu Jimp DOGRUDAN
// okuyamiyor ("Mime type image/x-icon does not support decoding") - bu
// yuzden ico ise once gercek piksel verisine (PNG) ceviriyoruz, EN BUYUK
// boyuttaki varyanti seciyoruz (ico dosyalari genelde birden fazla boyut
// icerir, orn. 16x16 + 32x32 + 48x48).
async function toDecodablePngBuffer(sourceBuffer: Buffer): Promise<Buffer> {
  if (!isIco(sourceBuffer)) return sourceBuffer;
  const images = await decodeIco(sourceBuffer);
  if (images.length === 0) throw new Error("ico icinde gorsel yok");
  const best = images.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
  return Buffer.from(best.buffer);
}

async function buildSilhouette(rawBuffer: Buffer): Promise<Buffer> {
  const sourceBuffer = await toDecodablePngBuffer(rawBuffer);
  const img = await Jimp.read(sourceBuffer);
  img.resize({ w: SIZE, h: SIZE });
  const { data, width, height } = img.bitmap;

  // Cogu modern ikon (PNG/ICO) zaten DUZGUN bir alfa kanaliyla geliyor
  // (arkaplan GERCEKTEN seffaf) - bu durumda kendi tahminimizi (asagidaki
  // kose-rengi sezgiselligi) DEVREYE SOKMUYORUZ, var olan seffafliga
  // guveniyoruz. Sadece TUMU opak olan kaynaklarda (cogu .ico/favicon.ico)
  // arkaplan rengini kose piksellerinden tahmin edip ondan uzakligi alfa
  // olarak kullaniyoruz. Ikisinde de: renkleri BEYAZA, ama GERCEK PARLAKLIK
  // (luminance) degerini ALFAYA katarak cceviriyoruz - boylece HBO Max gibi
  // duz bir renge degil, orijinal golgelendirme/detay da (orn. bir kup
  // logosunun yuzeyleri) KORUNUYOR, tek bir duz beyaz blob'a donusmuyor.
  let hasRealAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      hasRealAlpha = true;
      break;
    }
  }

  let br = 255,
    bg = 255,
    bb = 255;
  if (!hasRealAlpha) {
    const corners = [
      0,
      (width - 1) * 4,
      (height - 1) * width * 4,
      ((height - 1) * width + width - 1) * 4,
    ];
    br = 0;
    bg = 0;
    bb = 0;
    for (const idx of corners) {
      br += data[idx];
      bg += data[idx + 1];
      bb += data[idx + 2];
    }
    br /= corners.length;
    bg /= corners.length;
    bb /= corners.length;
  }

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let alpha: number;
    if (hasRealAlpha) {
      // Seffaflik zaten dogru - rengi beyaza cevirirken kendi parlakligini
      // (luminance) da alfaya katiyoruz, boylece transparan zeminde cizilen
      // acik renkli (sari, beyaz, acik gri...) detaylar/golgeler KORUNUYOR,
      // tek duz bir beyaz blob'a donusmuyor.
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      alpha = (data[i + 3] / 255) * luminance;
    } else {
      // Opak kaynak (arkaplan rengi tahminine dayali) - burada luminance
      // KULLANILMIYOR: logo koyu renkli olabilir (orn. beyaz zeminde siyah
      // yazi), luminance'a gore soldurmak onu GORUNMEZ yapardi.
      alpha = Math.max(0, Math.min(1, (colorDistance(r, g, b, br, bg, bb) - BG_DIST_LO) / (BG_DIST_HI - BG_DIST_LO)));
    }
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = Math.round(alpha * 255);
  }

  return img.getBuffer("image/png");
}

// Sitenin KENDI sunucusundan en yuksek cozunurluklu ikonu denemek icin
// sira - Google'in favicon servisi genelde KUCUK (16/32px) bir favicon.ico
// dondurup onu buyuterek piksellestiriyordu (kullanici geri bildirimi).
// apple-touch-icon.png neredeyse her modern sitede VAR ve genelde 180x180
// gibi yuksek cozunurluklu - o yuzden ONCE o denenir, sonra favicon.ico,
// Google servisi EN SON (hicbiri calismazsa) basvurulacak yedek.
function candidateUrls(domain: string): string[] {
  return [
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/apple-touch-icon-precomposed.png`,
    `https://${domain}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
  ];
}

const FETCH_TIMEOUT_MS = 4000;

async function tryFetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength < 16) return null; // bos/anlamsiz yanit
    return Buffer.from(arrayBuf);
  } catch {
    return null;
  }
}

/** domain icin islenmis (beyaz siluet) rozet PNG'sini dondurur - basarisiz
 * olursa (gecersiz domain, hicbir aday calismadi) null doner. Once sitenin
 * KENDI ikonu denenir (yuksek cozunurluk), Google sadece son care. */
export async function getFaviconBadge(domain: string): Promise<Buffer | null> {
  if (!DOMAIN_RE.test(domain)) return null;

  const cached = cache.get(domain);
  if (cached && cached.expiresAtMs > Date.now()) return cached.buffer;

  let buffer: Buffer | null = null;
  for (const url of candidateUrls(domain)) {
    const sourceBuffer = await tryFetchImage(url);
    if (!sourceBuffer) continue;
    try {
      buffer = await buildSilhouette(sourceBuffer);
      break;
    } catch {
      continue; // gecersiz/bozuk gorsel - bir sonraki adaya gec
    }
  }

  cache.set(domain, { buffer, expiresAtMs: Date.now() + CACHE_TTL_MS });
  return buffer;
}
