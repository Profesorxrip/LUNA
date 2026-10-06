import type { PlatformKey } from "../components/PlatformLogo";

/** "+"" menusundeki DRM'li platformlar - otomatik senkron desteklenmez,
 * sadece harici olarak acilir; sohbet/sesli sohbet odada acik kalir. */
export const EXTERNAL_PLATFORMS: { key: string; label: string; url: string; logo: PlatformKey }[] = [
  { key: "netflix", label: "Netflix", url: "https://www.netflix.com", logo: "netflix" },
  { key: "prime", label: "Prime Video", url: "https://www.primevideo.com", logo: "primevideo" },
  { key: "disney", label: "Disney+", url: "https://www.disneyplus.com", logo: "disneyplus" },
  { key: "hbomax", label: "HBO Max", url: "https://www.max.com", logo: "hbomax" },
  { key: "twitch", label: "Twitch", url: "https://www.twitch.tv", logo: "twitch" },
  { key: "drive", label: "Drive", url: "https://drive.google.com", logo: "drive" },
  { key: "icloud", label: "iCloud", url: "https://www.icloud.com", logo: "icloud" },
  { key: "spotify", label: "Spotify", url: "https://open.spotify.com", logo: "spotify" },
  { key: "x", label: "X", url: "https://www.x.com", logo: "x" },
];
