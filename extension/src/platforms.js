// Desteklenen platformlarin host adi -> goruntu adi eslemesi. Mobildeki
// utils/media.ts EXTERNAL_PLATFORMS listesiyle AYNI etiketleri kullaniyoruz
// ki oda sohbetinde/baslikta tutarli gorunsun - oradaki TUM platformlar
// burada da var (spotify haric: Spotify Web Player standart bir <video>/
// <audio> etiketi kullanmiyor, kendi oynatma motoru var - bu yuzden ayni
// "video elementini bul" teknigi onda GUVENILIR calismaz, simdilik disarida
// birakildi).
window.__LUNA_PLATFORMS__ = [
  { test: (h) => h.endsWith("netflix.com"), label: "Netflix" },
  { test: (h) => h.endsWith("disneyplus.com"), label: "Disney+" },
  { test: (h) => h.endsWith("primevideo.com") || h.endsWith("amazon.com"), label: "Prime Video" },
  { test: (h) => h.endsWith("max.com"), label: "HBO Max" },
  { test: (h) => h.endsWith("twitch.tv"), label: "Twitch" },
  { test: (h) => h.endsWith("drive.google.com"), label: "Drive" },
  { test: (h) => h.endsWith("icloud.com"), label: "iCloud" },
  { test: (h) => h === "x.com" || h.endsWith(".x.com"), label: "X" },
];

window.__LUNA_PLATFORM_LABEL__ = function platformLabel(hostname) {
  const match = window.__LUNA_PLATFORMS__.find((p) => p.test(hostname));
  return match ? match.label : hostname;
};
