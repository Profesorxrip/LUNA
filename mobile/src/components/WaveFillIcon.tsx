import { useEffect, useRef, useState } from "react";
import { ImageSourcePropType, View } from "react-native";
import Svg, { Defs, G, Image as SvgImage, Mask, Path, Rect } from "react-native-svg";

let nextMaskId = 0;

function wavePath(size: number, t: number): string {
  const amp = size * 0.06;
  const steps = 10;
  // TEK, YAVAS ve DUZGUN bir sinus - once iki farkli frekansli sinus
  // toplanmisti ama bu KAOTIK/titrek durdugu icin ("saçma", kullanici
  // geri bildirimi) kaldirildi - su seviyesi KADEME KADEME, anlasilir
  // sekilde yukselip alcalmali, rastgele zipliyormus gibi degil.
  const level = 0.5 + 0.38 * Math.sin(t * 1.1);
  const baseY = size * (1 - Math.max(0.1, Math.min(0.95, level)));
  const phase = t * 1.8;
  let d = `M 0,${(size * 2).toFixed(2)} L 0,${(baseY + Math.sin(phase) * amp).toFixed(2)}`;
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * size;
    const y = baseY + Math.sin((i / steps) * Math.PI * 2 + phase) * amp;
    d += ` L ${x.toFixed(2)},${y.toFixed(2)}`;
  }
  d += ` L ${size.toFixed(2)},${(size * 2).toFixed(2)} Z`;
  return d;
}

/** Konusan bir katilimcinin ikonu (mikrofon/kamera) - mikrofon/kamera zaten
 * ACIK oldugu icin ikonun DIS CIZGISI (anahat) HER ZAMAN tam beyaz durur
 * (bkz. `source` - orijinal anahat PNG'si, bkz. CustomIcons.tsx); konusma
 * oldukca, ikonun BOS/ic kismi da (orn. mikrofonun ic ovali, kameranin
 * govdesi) asagidan yukari dalgali bir sinirla BEYAZA dolar - bunun icin
 * `filledSource` (asset'teki ayni ikonun ic bosluklari doldurulmus/solid
 * hali, bkz. assets/icons/*-filled.png - orijinal anahat PNG'sinden
 * tasma-doldurma/flood-fill ile turetildi, TEK SEFERLIK bir onisleme) bir
 * maske olarak kullanilir. Iki ayri anahat/dolgu SVG maskesi de AYNI tek
 * <Svg> agacinda ciziliyor (ayri bir RN <Image> katmani KULLANILMIYOR) -
 * boylece hicbir kenar uyusmazligi/hale OLUSMAZ (daha once bu yuzden
 * "beyaz ikonun cevresinde gri bir isaret" hatasi vardi). */
export default function WaveFillIcon({
  size,
  source,
  filledSource,
}: {
  size: number;
  source: ImageSourcePropType;
  filledSource: ImageSourcePropType;
}) {
  const outlineMaskId = useRef(`waveOutlineMask${nextMaskId++}`).current;
  const filledMaskId = useRef(`waveFilledMask${nextMaskId++}`).current;
  const [d, setD] = useState(() => wavePath(size, 0));

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setD(wavePath(size, (Date.now() - start) / 1000));
    }, 60);
    return () => clearInterval(interval);
  }, [size]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <Mask id={outlineMaskId} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
            <SvgImage href={source} x={0} y={0} width={size} height={size} />
          </Mask>
          <Mask id={filledMaskId} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
            <SvgImage href={filledSource} x={0} y={0} width={size} height={size} />
          </Mask>
        </Defs>
        {/* Dalgali dolgu ONCE (altta) ciziliyor, anahat (disaridaki cizgi)
            SONRA (ustte) - boylece iki AYRI maskenin kenarlari arasinda
            olusabilecek 1 piksellik bosluktan arka plan (lacivert) sizip
            "mavi leke" gibi gorunmesi, ustteki anahat tarafindan ORTULUR
            (kullanici geri bildirimi: ic/dis kisim "ic ice gecmiyor, mavi
            lekeler kaliyor"). */}
        <G mask={`url(#${filledMaskId})`}>
          <Path d={d} fill="#FFFFFF" />
        </G>
        <G mask={`url(#${outlineMaskId})`}>
          <Rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
        </G>
      </Svg>
    </View>
  );
}
