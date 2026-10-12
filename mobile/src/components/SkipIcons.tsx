import Svg, { G, Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Kullanicinin gonderdigi referans gorselden potrace ile BIREBIR izlenmis
// (bitmap -> vektor) yol - elle yeniden cizilmis bir yaklasik degil,
// gercek gorseldeki ucgen+cift ok seklinin tam izi. "Sıradakine geç"
// (VideoControlsOverlay) icin kullanilir.
function SkipForwardPaths() {
  return (
    <G transform="translate(0,50) scale(0.1,-0.1)" stroke="none">
      <Path
        d="M33 473 c-10 -3 -13 -57 -13 -218 0 -195 2 -215 18 -224 14 -7 52 12
185 98 92 59 172 112 177 117 5 5 -57 51 -158 116 -176 112 -189 119 -209 111z
m165 -151 c56 -35 102 -67 102 -71 0 -3 -37 -30 -83 -58 -45 -29 -97 -62 -115
-74 l-32 -21 0 152 c0 118 3 150 13 144 6 -4 58 -36 115 -72z"
      />
      <Path
        d="M236 465 c-9 -26 4 -37 145 -126 71 -44 129 -84 129 -87 0 -4 -63
-47 -140 -96 -77 -48 -140 -94 -140 -101 0 -7 6 -18 14 -24 12 -10 48 9 190
99 97 62 178 115 180 119 5 7 -325 221 -353 228 -11 3 -21 -2 -25 -12z"
      />
    </G>
  );
}

export function SkipForwardIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 -7 64 64" fill={color}>
      <SkipForwardPaths />
    </Svg>
  );
}

// AYNI izlenmis sekil, SADECE yatayda aynalanmis - "onceki video" butonu
// icin ayrica elle cizilmedi, tam olarak SkipForwardIcon'un ters cevrilmis hali.
export function SkipBackIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 -7 64 64" fill={color}>
      <G transform="translate(64,0) scale(-1,1)">
        <SkipForwardPaths />
      </G>
    </Svg>
  );
}
