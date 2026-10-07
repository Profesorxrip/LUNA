import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

/** Katilimcilar listesindeki lider rozeti - lucide'nin orijinal, tanidik
 * "crown" glyph'inin AYNISI (bkz. Icon.tsx "crown"), SADECE alt kenari
 * (orijinalde duz bir "H" cizgisi) profil fotografinin yuvarlak ust
 * hattini saracak sekilde hafifce kivrilmis (Q egrisi). Geri kalan her
 * sey - sivri uclar, mücevher kabartmalari - BIREBIR ayni. */
export default function CrownBadge({ size = 20, color = "#0EA5E9" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734Q12 15 5.81 16.999a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
