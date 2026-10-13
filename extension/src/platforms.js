// Desteklenen DRM'li platformlarin host adi -> goruntu adi eslemesi.
// Mobildeki utils/media.ts EXTERNAL_PLATFORMS listesiyle AYNI etiketleri
// kullaniyoruz ki oda sohbetinde/baslikta tutarli gorunsun.
window.__LUNA_PLATFORMS__ = [
  { test: (h) => h.endsWith("netflix.com"), label: "Netflix" },
  { test: (h) => h.endsWith("disneyplus.com"), label: "Disney+" },
  { test: (h) => h.endsWith("primevideo.com") || h.endsWith("amazon.com"), label: "Prime Video" },
  { test: (h) => h.endsWith("max.com"), label: "HBO Max" },
];

window.__LUNA_PLATFORM_LABEL__ = function platformLabel(hostname) {
  const match = window.__LUNA_PLATFORMS__.find((p) => p.test(hostname));
  return match ? match.label : hostname;
};
