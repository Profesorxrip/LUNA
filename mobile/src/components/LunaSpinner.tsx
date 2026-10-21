import { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Defs, ClipPath, Circle, Filter, FeGaussianBlur, G, Path, Image as SvgImage } from "react-native-svg";
import { theme } from "../theme";

// 36 kareli sprite sheet (6x6 grid) - her kare FARKLI bir boylam acisindan
// gercek bir kurenin ortografik izdusumu (kenara dogru DOGAL sikisma/
// yavaslama + kenara TAM oturan limb-darkening ile onceden hesaplandi,
// bkz. scratchpad/render_sphere_frames.py). Kaynak doku: NASA/USGS ay
// yuzey haritasi (kamu mali, three.js'in acik kaynak ornek varliklari
// uzerinden).
const SPRITE = require("../../assets/moon-sphere-sheet.png");
const SPRITE_COLS = 6;
const SPRITE_ROWS = 6;
const SPRITE_FRAMES = 36;
const CYCLE_MS = 22000;

// Faz (k/waxing) VE kure donusu (sprite karesi) AYNI "t" degerinden
// turetiliyor - ikisi FARKLI surelerde BAGIMSIZ ilerlerse aralarindaki
// iliski surekli kayar (drift), bu da bazen ayni bazen ters yonde
// gidiyormus gibi bir yanilsama yaratir. Tek bir "t" oldugu icin bu
// iliski HER ZAMAN sabit kalir.
function darkPath(size: number, cx: number, cy: number, k: number, waxing: boolean): string {
  const r = size / 2;
  const rx = r * Math.abs(1 - 2 * k);
  const outerSweep = waxing ? 0 : 1;
  const innerSweep = k < 0.5 ? (waxing ? 0 : 1) : waxing ? 1 : 0;
  return `M ${cx},${cy - r} A ${r},${r} 0 0,${outerSweep} ${cx},${cy + r} A ${rx},${r} 0 0,${innerSweep} ${cx},${cy - r} Z`;
}

interface Props {
  size?: number;
}

/** LUNA'ya ozel yukleniyor gostergesi - "Ay Evreleri": gercek NASA ay
 * dokusuyla kaplanmis bir kure, hem evreden evreye (yeniay -> dolunay ->
 * yeniay) geciyor hem de kendi ekseninde yavasca donuyor (bkz.
 * SplashScreen.tsx). Disaridaki yumusak parilti (glow) View'in shadow*
 * stilleriyle DEGIL - bu web/Android'de kare bir kutu gibi gorunurdu -
 * SVG icinde bulanik bir daire katmaniyla cizliyor, boylece HER platformda
 * ayin kendi yuvarlak seklini takip ediyor. */
export default function LunaSpinner({ size = 32 }: Props) {
  // Glow'un disari tasabilmesi icin moon cemberinin etrafinda bosluk -
  // Svg'nin kendi genisligi/yuksekligi moon capindan BUYUK.
  const pad = size * 0.35;
  const box = size + pad * 2;
  const cx = box / 2;
  const cy = box / 2;
  const r = size / 2;

  const [frame, setFrame] = useState(() => ({
    d: darkPath(size, cx, cy, 0, true),
    x: pad,
    y: pad,
  }));

  useEffect(() => {
    let raf: number;
    const start = Date.now();
    function tick() {
      const now = Date.now();
      const t = ((now - start) % CYCLE_MS) / CYCLE_MS;
      const k = (1 - Math.cos(t * Math.PI * 2)) / 2;
      const waxing = t < 0.5;
      const frameIdx = Math.floor(t * SPRITE_FRAMES) % SPRITE_FRAMES;
      const col = frameIdx % SPRITE_COLS;
      const row = Math.floor(frameIdx / SPRITE_COLS);
      setFrame({ d: darkPath(size, cx, cy, k, waxing), x: pad - col * size, y: pad - row * size });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size, pad, cx, cy]);

  return (
    <View style={{ width: box, height: box }}>
      <Svg width={box} height={box} viewBox={`0 0 ${box} ${box}`}>
        <Defs>
          <ClipPath id="moonClip">
            <Circle cx={cx} cy={cy} r={r} />
          </ClipPath>
          <Filter id="terminatorBlur" x="-20%" y="-20%" width="140%" height="140%">
            <FeGaussianBlur stdDeviation={size * 0.014} />
          </Filter>
          <Filter id="glowBlur" x="-100%" y="-100%" width="300%" height="300%">
            <FeGaussianBlur stdDeviation={size * 0.09} />
          </Filter>
        </Defs>
        <Circle cx={cx} cy={cy} r={r * 0.92} fill={theme.accentBright} opacity={0.55} filter="url(#glowBlur)" />
        <G clipPath="url(#moonClip)">
          <SvgImage href={SPRITE} x={frame.x} y={frame.y} width={size * SPRITE_COLS} height={size * SPRITE_ROWS} />
          <Path d={frame.d} fill="#070b14" opacity={0.78} filter="url(#terminatorBlur)" />
        </G>
      </Svg>
    </View>
  );
}
