import Svg, { Circle, Defs, G, Line, Mask, Path, Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// "Gönder" ikonu - Profil/Ikon gözden geçirmesinde kullanıcının sectigi
// "B (uçak)" secenegi: klasik ucgen kagit ucak sekli (Heroicons'un
// ok+kuyruklu "PaperAirplaneIcon"unun YERINE) - LUNA'nin genel "outline"
// (ince cizgi) yonune uysun diye dolgu degil, cizgi olarak ciziliyor.
export function PaperPlaneIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 20l18-8L3 4v7l12 1-12 1v7z" />
    </Svg>
  );
}

// "Katilimcilar" ikonu - Ikon gozden gecirmesinde secilen "D2" secenegi:
// on kisi (bas + govde) TAM DOLU, arkadaki kisinin omzu KARISMASIN diye
// sadece ince bir cizgi (lucide "users-round" siluetinden, bkz. Icon
// onizleme oturumu) - iki tam dolu siluet ust uste binince okunmaz
// oluyordu, bu karisim en net sonucu verdi.
export function ParticipantsIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M18 21a8 8 0 0 0-16 0Z" fill={color} />
      <Circle cx={10} cy={8} r={5} fill={color} />
    </Svg>
  );
}

// Mikrofon govdesinin yolu - "mic" (MicIcon) ve "micOff" (MicOffIcon) AYNI
// bu iki yolu kullanir (tek bir yerden gelsin, ikisi birbirinden asla
// SAPMASIN diye) - Heroicons'un solid MicrophoneIcon'uyla birebir ayni sekil.
const MIC_PATHS = [
  "M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z",
  "M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z",
];

// "Mikrofon acik" - MIC_PATHS'in cizik OLMAYAN hali (bkz. asagidaki MicOffIcon
// yorumu - kullanicinin istegi uzerine ikisi AYNI sekil tanimini paylasiyor).
export function MicIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {MIC_PATHS.map((d) => (
        <Path key={d} d={d} fill={color} />
      ))}
    </Svg>
  );
}

// "Mikrofon kapali" - "mic" ile AYNI sekil (MIC_PATHS), farkli bir ikon
// ailesine (lucide MicOff) GECMEK yerine, kullanicinin istedigi gibi
// dogrudan UZERINE bir cizik cekiliyor: SVG Mask ile mikrofon govdesinden
// capraz bir SERIT gercekten KESILIP (transparan) seffaf hale getiriliyor,
// sonra ayni rengiyle bir CIZGI o bosluktan geciriliyor - boylece hangi
// renk/arka plan uzerinde kullanilirsa kullanilsin (bkz. Icon.tsx'teki
// micOff cagrilari - bazen theme.danger, bazen theme.textMuted) dogru
// gorunur, sabit bir arka plan rengi varsayilmaz.
export function MicOffIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <Mask id="micOffCut">
          <Rect x={0} y={0} width={24} height={24} fill="white" />
          <Line x1={3.5} y1={3.5} x2={20.5} y2={20.5} stroke="black" strokeWidth={5.5} strokeLinecap="round" />
        </Mask>
      </Defs>
      <G mask="url(#micOffCut)">
        {MIC_PATHS.map((d) => (
          <Path key={d} d={d} fill={color} />
        ))}
      </G>
      <Line x1={3.5} y1={3.5} x2={20.5} y2={20.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// "Fotograf" ikonu - Heroicons'un PhotoIcon'u DIKDORTGEN (21x12) bir cerceve
// kullaniyordu, kullanici kare istedi. Ikon gozden gecirmesinde secilen "A1":
// lucide "image" ikonunun KARE (18x18) cercevesi + ayni gunes/dag dili, ama
// Heroicons'taki gibi cerceve ICI BOS (kalin cizgi), gunes+dag TAM DOLU -
// boylece hem kare oran hem de uygulamanin genel dolu/net agirligi korunuyor.
export function SquarePhotoIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={3} stroke={color} strokeWidth={2} />
      <Circle cx={9} cy={9} r={2} fill={color} />
      <Path d="M21 15 17.914 11.914A2 2 0 0 0 15.086 11.914L6 21 21 21Z" fill={color} />
    </Svg>
  );
}

// "Davet Et" ikonu - "people" (ParticipantsIcon) ile TUTARLI olsun diye,
// Heroicons'un FARKLI iki-kisi siluetini kullanmak yerine AYNI tek kisi
// (bas + govde) seklini alip sag-ustune Heroicons'un kendi "+" rozetini
// (UserPlusIcon'daki AYNI yol, sadece yukari-saga tasinmis) ekliyoruz.
// Artı rozeti govdenin yaninda (alt-sag), vurgu mavisiyle (theme.accentBright
// ile AYNI deger, #38BDF8) - kullanicinin "C, mavi olsun" secimine gore.
export function InvitePersonIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 21a8 8 0 0 0-16 0Z" fill={color} />
      <Circle cx={10} cy={8} r={5} fill={color} />
      <Path
        d="M22.5 17.25a.75.75 0 0 0-1.5 0v2.25H18.75a.75.75 0 0 0 0 1.5H21v2.25a.75.75 0 0 0 1.5 0V21H24.75a.75.75 0 0 0 0-1.5H22.5v-2.25Z"
        fill="#38BDF8"
        transform="translate(-3,-2)"
      />
    </Svg>
  );
}

// "Harita" (globe) butonu - lucide Compass'in CIZGILI hali yerine, ikon
// gozden gecirmesinde secilen "B": cember TAM DOLU, ibre SVG Mask ile
// arka plan rengiyle oyulmus (duz rozet hissi) - fotograf ikonundaki "A2"
// mantigiyla ayni teknik.
export function CompassBadgeIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <Mask id="compassCut">
          <Rect x={0} y={0} width={24} height={24} fill="white" />
          <Path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" fill="black" />
        </Mask>
      </Defs>
      <Circle cx={12} cy={12} r={10} fill={color} mask="url(#compassCut)" />
    </Svg>
  );
}

// "Paylas kutu" ikonu - Heroicons'un ORIJINAL ArrowUpOnSquareIcon sekli
// (kutu + ok) birebir AYNI kaliyor, HICBIR SEY yeniden cizilmedi - SADECE
// okun (ust taraftaki ok basi) rengi mavi (#38BDF8), kutu kendi rengi
// (beyaz/color) kaliyor. "share" (ag/3-nokta glyph'i) ise HIC KULLANILMADIGI
// icin tamamen kaldirildi (bkz. Icon.tsx).
export function ShareBoxIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11.47 1.72a.75.75 0 0 1 1.06 0l3 3a.75.75 0 0 1-1.06 1.06l-1.72-1.72V7.5h-1.5V4.06L9.53 5.78a.75.75 0 0 1-1.06-1.06l3-3Z"
        fill="#38BDF8"
      />
      <Path
        d="M11.25 7.5V15a.75.75 0 0 0 1.5 0V7.5h3.75a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3h3.75Z"
        fill={color}
      />
      {/* Kutunun icindeki, okun gectigi seffaf yarik - kullanicinin istegi
          uzerine arka plan yerine mavi dolduruluyor (okla gorsel olarak
          birlesik, kesintisiz bir hat olusturuyor). */}
      <Path d="M11.25 7.5V15a.75.75 0 0 0 1.5 0V7.5Z" fill="#38BDF8" />
    </Svg>
  );
}
