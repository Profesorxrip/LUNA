import Svg, { Path, Circle } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

/** Katilimcilar listesindeki lider rozeti icin OZEL cizilmis taç - hazir bir
 * ikon ailesindeki duz/kare taban yerine, tabani profil fotografinin
 * yuvarlak ust hattini saracak sekilde EGRI (ortada yuksek, iki yanda asagi
 * dogru kivrilan) tek parca bir SVG. Boylece avatarin TAM ustune, kenarlarda
 * bosluk birakmadan oturuyor (bkz. ParticipantsModal.tsx hostBadge). */
export default function CrownBadge({ size = 20, color = "#0EA5E9" }: Props) {
  return (
    <Svg width={size} height={size * 0.6} viewBox="0 0 100 60">
      {/* Taban bandi - ortada yuksek, iki ucta asagi kivrilan tek egri */}
      <Path d="M8,54 Q50,34 92,54 L92,44 Q50,24 8,44 Z" fill={color} />
      {/* Sol sivri uc */}
      <Path d="M15,40 L20,26 L25,40 Z" fill={color} />
      <Circle cx="20" cy="23" r="4" fill={color} />
      {/* Orta (en uzun) sivri uc */}
      <Path d="M42,26 L50,10 L58,26 Z" fill={color} />
      <Circle cx="50" cy="7" r="4.5" fill={color} />
      {/* Sag sivri uc */}
      <Path d="M75,40 L80,26 L85,40 Z" fill={color} />
      <Circle cx="80" cy="23" r="4" fill={color} />
    </Svg>
  );
}
