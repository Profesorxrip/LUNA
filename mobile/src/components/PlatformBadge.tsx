import React from "react";
import { Image } from "react-native";
import type { PlatformKey } from "./PlatformLogo";

// Discover kartinin sag ust kosesindeki rozet icin - platform secme
// ekranindaki (PlatformLogo.tsx) renkli logolardan FARKLI, ayri bir set:
// arkaplan/ic renkler temizlenip tek renkli (beyaz) siluete cevrildi,
// yari-seffaf bir "hayalet" rozet olarak gosterilecek (bkz. DiscoverScreen).
const BADGES: Record<PlatformKey, { source: any; ratio: number }> = {
  youtube: { source: require("../../assets/badges/youtube.png"), ratio: 1.4478 },
  netflix: { source: require("../../assets/badges/netflix.png"), ratio: 0.5512 },
  primevideo: { source: require("../../assets/badges/primevideo.png"), ratio: 1.1739 },
  disneyplus: { source: require("../../assets/badges/disneyplus.png"), ratio: 1.8422 },
  hbomax: { source: require("../../assets/badges/hbomax.png"), ratio: 1.3831 },
  twitch: { source: require("../../assets/badges/twitch.png"), ratio: 0.8579 },
  drive: { source: require("../../assets/badges/drive.png"), ratio: 1.1346 },
  icloud: { source: require("../../assets/badges/icloud.png"), ratio: 1.5515 },
  x: { source: require("../../assets/badges/x.png"), ratio: 0.9786 },
  web: { source: require("../../assets/logos/web.png"), ratio: 0.748 },
};

interface Props {
  platform: PlatformKey;
  size?: number;
}

/** PlatformLogo'daki gibi ALAN bazli olceklendirme - kare bir ikon da,
 * genis bir wordmark da goze ayni buyuklukte gorunur. */
export default function PlatformBadge({ platform, size = 16 }: Props) {
  const { source, ratio } = BADGES[platform];
  const scale = Math.sqrt(ratio);
  const width = size * scale;
  const height = size / scale;
  return <Image source={source} resizeMode="stretch" style={{ width, height, opacity: 0.62 }} />;
}
