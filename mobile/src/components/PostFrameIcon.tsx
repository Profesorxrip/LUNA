import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

/** Kullanicinin referans gorseline gore ozel ikon - lucide'de birebir
 * karsiligi olmadigi icin elle olcup react-native-svg ile cizildi. */
export default function PostFrameIcon({ size = 24, color = "#FFFFFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.34,2 H17.66 A4.34,4.34 0 0 1 22,6.34 V17.66 A4.34,4.34 0 0 1 17.66,22 H6.34 A4.34,4.34 0 0 1 2,17.66 V6.34 A4.34,4.34 0 0 1 6.34,2 Z M6.923,4.113 H17.077 A2.81,2.81 0 0 1 19.887,6.923 V17.077 A2.81,2.81 0 0 1 17.077,19.887 H6.923 A2.81,2.81 0 0 1 4.113,17.077 V6.923 A2.81,2.81 0 0 1 6.923,4.113 Z"
        fill={color}
      />
      <Rect x="8" y="8.55" width="8" height="2.39" rx="0.3" fill={color} />
      <Rect x="8" y="13.02" width="4.98" height="2.43" rx="0.3" fill={color} />
    </Svg>
  );
}
