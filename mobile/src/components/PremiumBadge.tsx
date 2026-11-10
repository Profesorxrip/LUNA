import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path as SvgPath } from "react-native-svg";
import { Check } from "lucide-react-native";

/** Premium rozetinin disli/yildiz kenarini (hem disa hem ice sivri, hafif
 * oval uclu) ciziyor - her kosede (hem disa hem ice sivri ucta) quadratic
 * bezier ile hafifce yuvarlatiyor (roundAmt). */
function roundedStarPath(size: number, points: number, innerRatio: number, roundAmt: number): string {
  const center = size / 2;
  const outerR = center;
  const innerR = center * innerRatio;
  const total = points * 2;
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    verts.push({ x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) });
  }
  let d = "";
  for (let i = 0; i < total; i++) {
    const curr = verts[i];
    const prev = verts[(i - 1 + total) % total];
    const next = verts[(i + 1) % total];
    const pIn = { x: curr.x + (prev.x - curr.x) * roundAmt, y: curr.y + (prev.y - curr.y) * roundAmt };
    const pOut = { x: curr.x + (next.x - curr.x) * roundAmt, y: curr.y + (next.y - curr.y) * roundAmt };
    if (i === 0) d += `M ${pIn.x} ${pIn.y} `;
    else d += `L ${pIn.x} ${pIn.y} `;
    d += `Q ${curr.x} ${curr.y} ${pOut.x} ${pOut.y} `;
  }
  d += "Z";
  return d;
}

// Iki onayli dis preseti elde tutuluyor - D1 (6 dis) ve D2 (8 dis), ikisi
// de ayni oval-uclu stil (innerRatio/roundAmt). Su an D2 kullaniliyor,
// istenirse D1'e gecmek icin asagidaki points degerini degistirmek yeterli.
const PREMIUM_BADGE_D1 = { points: 6, innerRatio: 0.55, roundAmt: 0.6 };
const PREMIUM_BADGE_D2 = { points: 8, innerRatio: 0.55, roundAmt: 0.6 };
const PREMIUM_BADGE_ACTIVE = PREMIUM_BADGE_D2;

/** UserProfileScreen.tsx'teki isim satirinda kullanicinin premium oldugunu
 * gosteren AYNI dolu-beyaz, disli yildiz + ic tik rozeti - PremiumScreen.tsx
 * gibi baska ekranlarda da AYNI gorsel kimlik icin paylasiliyor. */
export default function PremiumBadge({ size }: { size: number }) {
  const d = roundedStarPath(size, PREMIUM_BADGE_ACTIVE.points, PREMIUM_BADGE_ACTIVE.innerRatio, PREMIUM_BADGE_ACTIVE.roundAmt);
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <SvgPath d={d} fill="#fff" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.checkWrap]}>
        <Check size={size * 0.42} color="#04070c" strokeWidth={3.5} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: -1 },
  checkWrap: { alignItems: "center", justifyContent: "center" },
});
