import React, { useRef } from "react";
import Svg, { Defs, Filter, FeGaussianBlur, Path, Circle, G } from "react-native-svg";

type NodeDef = { tag: "path"; d: string } | { tag: "circle"; cx: string; cy: string; r: string };

// Lucide'nin KENDI ham path verisi (node_modules/lucide-react-native/.../icons/*.mjs) -
// TabBar.tsx'teki 4 sekme ikonuyla (Compass/Users/User/Settings) BIREBIR AYNI cizim.
// Burada elle kopyalanmasinin SEBEBI: lucide-react-native'in Icon bileseni KENDI
// kapali <Svg>'ini olusturuyor, disaridan gercek bir SVG <Filter>/<FeGaussianBlur>
// (LunaSpinner.tsx'teki AYNI, native'de de calisan teknik) enjekte edilemiyor - CSS
// "filter: blur()" ise SADECE web'de calisiyor, gercek cihazda (Android/iOS) hic
// yok sayilip ham, keskin kenarli ikon kopyalarinin ust uste binmesi "yildiz
// patlamasi" gibi cirkin bir goruntu veriyordu (bkz. kullanicinin gercek cihaz
// ekran goruntusu). Gercek SVG filter ile BLUR, platform farki olmadan calisiyor.
const ICON_NODES: Record<string, NodeDef[]> = {
  Discover: [
    { tag: "circle", cx: "12", cy: "12", r: "10" },
    { tag: "path", d: "m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" },
  ],
  Friends: [
    { tag: "path", d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" },
    { tag: "path", d: "M16 3.128a4 4 0 0 1 0 7.744" },
    { tag: "path", d: "M22 21v-2a4 4 0 0 0-3-3.87" },
    { tag: "circle", cx: "9", cy: "7", r: "4" },
  ],
  Profile: [
    { tag: "path", d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" },
    { tag: "circle", cx: "12", cy: "7", r: "4" },
  ],
  Settings: [
    {
      tag: "path",
      d: "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",
    },
    { tag: "circle", cx: "12", cy: "12", r: "3" },
  ],
};

function renderNodes(nodes: NodeDef[], strokeWidth: number, color: string) {
  const common = { fill: "none", stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return nodes.map((n, i) =>
    n.tag === "circle" ? <Circle key={i} cx={n.cx} cy={n.cy} r={n.r} {...common} /> : <Path key={i} d={n.d} {...common} />
  );
}

let idSeq = 0;

export type TabGlowIconName = keyof typeof ICON_NODES;

interface Props {
  name: TabGlowIconName;
  size?: number;
  color: string;
  glow?: boolean;
  strokeWidth?: number;
}

/** Sekme ikonlarinin "aktifken kendi cizgilerinden isik yayma" efekti - gercek
 * bir SVG Gaussian blur ile (bkz. yukaridaki yorum), bu yuzden native'de de
 * web'deki gibi yumusak gorunuyor. `glow` false/undefined iken SADECE normal
 * ikon ciziliyor (TabBar.tsx'teki pasif durum). */
export default function TabGlowIcon({ name, size = 22, color, glow = false, strokeWidth = 1.8 }: Props) {
  const filterId = useRef(`tgi-${name}-${idSeq++}`).current;
  const nodes = ICON_NODES[name] ?? ICON_NODES.Discover;
  // 24 birimlik lucide viewBox'inin etrafinda, blur tasmasina yer birak -
  // kenarlara kirpilmasin diye.
  const MARGIN = 8;
  const VB = 24 + MARGIN * 2;
  const box = size * (VB / 24);
  return (
    <Svg width={box} height={box} viewBox={`${-MARGIN} ${-MARGIN} ${VB} ${VB}`}>
      {glow && (
        <>
          <Defs>
            <Filter id={filterId} x="-120%" y="-120%" width="340%" height="340%">
              <FeGaussianBlur stdDeviation={1.7} />
            </Filter>
          </Defs>
          <G filter={`url(#${filterId})`} opacity={0.95}>
            {renderNodes(nodes, strokeWidth + 1.4, color)}
          </G>
        </>
      )}
      {renderNodes(nodes, strokeWidth, color)}
    </Svg>
  );
}
