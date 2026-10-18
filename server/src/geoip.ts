// IP adresinden ulke kodu (ISO 3166-1 alpha-2) cikarir - Discover'daki oda
// onizlemesinde katilimcinin bayragini gostermek icin en iyi caba (best-effort).
// Ucretsiz ipapi.co servisini kullanir; herhangi bir sebeple basarisiz
// olursa (agi engellendi, rate limit, gecersiz IP...) sessizce null doner -
// bu bilgi hicbir zaman kritik bir akisi bloklamamali.
export async function lookupCountry(ip: string): Promise<string | null> {
  if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127.")) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const code = (await res.text()).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}

// IP adresinden il/bolge adi cikarir - "Yakindakiler" gizlilik modunu artik
// ulke degil il (+ komsu iller) bazinda eslestirebilmek icin (bkz.
// turkeyProvinces.ts, rooms.ts visibleToViewer). Ayni ipapi.co servisinin
// "region" alanini kullanir - ulke tespitiyle AYNI best-effort mantik:
// basarisiz olursa sessizce null doner, hicbir akisi bloklamaz.
export async function lookupCity(ip: string): Promise<string | null> {
  if (!ip || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127.")) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/region/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const region = (await res.text()).trim();
    return region && region.length < 100 ? region : null;
  } catch {
    return null;
  }
}

// Socket.io handshake'inden gercek istemci IP'sini cikarir. "cf-connecting-ip"
// ONCE kontrol edilir - Cloudflare (tunnel dahil) her zaman bu basligi GERCEK
// istemci IP'siyle ekler, "x-forwarded-for" ise bazi Cloudflare Tunnel
// surumlerinde/yapilandirmalarinda hic gelmeyebilir ve bu durumda koda
// handshake.address (tunnel'in sunucuya BAGLANDIGI yerel adres, yani
// "127.0.0.1") kalirdi - ki bu da lookupCountry tarafindan loopback diye
// reddedilip ulke HICBIR ZAMAN tespit edilemezdi (bayragin hic gorunmemesinin
// sebebi buydu, bkz. GEÇİCİ teshis loglari). Ters proxy arkasinda degilse
// (orn. Render/Heroku gibi dogrudan X-Forwarded-For ekleyen platformlar) o
// da yedek olarak kontrol edilir.
export function clientIpFromHandshake(handshake: { address: string; headers: Record<string, unknown> }): string {
  const cfConnectingIp = handshake.headers["cf-connecting-ip"];
  if (typeof cfConnectingIp === "string" && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }
  const forwarded = handshake.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return handshake.address;
}
