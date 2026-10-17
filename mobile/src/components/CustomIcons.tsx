import Svg, { Circle, Defs, G, Line, Mask, Path, Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// "Gönder" ikonu - Profil/Ikon gözden geçirmesinde kullanıcının sectigi
// "B (uçak)" secenegi: klasik ucgen kagit ucak sekli (Heroicons'un
// ok+kuyruklu "PaperAirplaneIcon"unun YERINE) - kullanicinin istegi
// uzerine artik dolgulu (fill=color), cizgi degil.
export function PaperPlaneIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 20l18-8L3 4v6l9 2-9 2z" />
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

// "Profil" ikonu - "people" (ParticipantsIcon) ile AYNI tek kisi (bas +
// govde) sekli, arkadaki ikinci kisi cizgisi olmadan (bkz. InvitePersonIcon -
// AYNI mantikla "davet et" icin de bu sekil kullaniliyor, boylece tum
// "kisi" ailesi - Katilimcilar/Davet Et/Profil - gorsel olarak tutarli).
export function PersonIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
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
// (bas + govde) seklini alip sag-alt kosesine daire icinde bir "+" rozeti
// ekliyoruz - "Engelle" (PersonBlockIcon) ile AYNI rozet yerlesimi/boyutu,
// sadece renk (mavi) ve ic sembol ("+") farkli, boylece ikisi ailece
// tutarli dursun.
export function InvitePersonIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 21a8 8 0 0 0-16 0Z" fill={color} />
      <Circle cx={10} cy={8} r={5} fill={color} />
      <Circle cx={18} cy={17} r={5} fill="#0A0A0C" />
      <Circle cx={18} cy={17} r={4.3} fill="#38BDF8" />
      <Rect x={15.7} y={16.3} width={4.6} height={1.4} rx={0.7} fill="#0A0A0C" />
      <Rect x={17.3} y={14.7} width={1.4} height={4.6} rx={0.7} fill="#0A0A0C" />
    </Svg>
  );
}

// "Engelle" (kisi) ikonu - "people"/"invite" ile AYNI tek kisi seklini
// alip, "invite"deki AYNI daire rozeti bu kez tehlike renginde (#E34848)
// ve icinde sadece "-" (minus) ile - Heroicons'un UserMinusIcon'u YERINE.
export function PersonBlockIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 21a8 8 0 0 0-16 0Z" fill={color} />
      <Circle cx={10} cy={8} r={5} fill={color} />
      <Circle cx={18} cy={17} r={5} fill="#0A0A0C" />
      <Circle cx={18} cy={17} r={4.3} fill="#E34848" />
      <Rect x={15.7} y={16.3} width={4.6} height={1.4} rx={0.7} fill="#0A0A0C" />
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

// "Saat" ikonu - Heroicons'un dolgulu ClockIcon'undaki akrep/yelkovan
// cizgileri cok inceydi (sadece ~1.5 birim) - AYNI "pusula" mask tekniginin
// (bkz. CompassBadgeIcon) tersi: cember TAM DOLU, akrep/yelkovan kalin bir
// cizgi olarak arka plan rengiyle OYULUYOR, boylece kalinlik dogrudan
// strokeWidth ile kontrol edilebiliyor.
export function ClockIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <Mask id="clockHandsCut">
          <Rect x={0} y={0} width={24} height={24} fill="white" />
          <Line x1={12} y1={12} x2={12} y2={6} stroke="black" strokeWidth={2.4} strokeLinecap="round" />
          <Line x1={12} y1={12} x2={16.5} y2={12} stroke="black" strokeWidth={2.4} strokeLinecap="round" />
        </Mask>
      </Defs>
      <Circle cx={12} cy={12} r={9.75} fill={color} mask="url(#clockHandsCut)" />
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

// "Sadece Davet Ile" oda gizliligi ikonu - kullanicinin gonderdigi suslu
// (barok) anahtar fotografindan potrace ile BIREBIR izlenmis siluet (hayal
// gucuyle yeniden cizilmedi, sadece beyaza boyandi). Kullanicinin istegi
// uzerine ust (suslu) kismi SAGA, disleri ASAGIYA bakacak sekilde
// donduruldu - orijinal potrace ciktisi dikey (ust yukarida) oldugu icin
// ic ice 3 transform kullaniliyor.
const ORNATE_KEY_PATH =
  "M1771 3541 c-11 -11 -23 -35 -26 -54 -6 -29 -12 -36 -38 -41 -50 -10 -103 -51 -134 -103 -23 -40 -28 -61 -31 -140 -4 -81 -2 -97 14 -115 24 -26 75 -48 113 -48 38 0 47 -15 27 -45 -21 -32 -82 -34 -142 -5 -50 25 -69 62 -59 118 5 30 3 41 -9 45 -8 3 -23 26 -34 51 -31 68 -76 86 -93 36 -8 -21 -17 -30 -33 -30 -34 0 -56 -31 -56 -78 0 -39 -2 -42 -27 -42 -87 0 -174 -63 -213 -153 -63 -144 1 -329 135 -388 44 -20 132 -27 183 -15 32 8 33 7 27 -21 -11 -50 -14 -53 -39 -53 -29 0 -86 -53 -86 -81 0 -21 35 -39 76 -39 21 0 24 -5 24 -34 0 -29 4 -36 31 -45 51 -18 70 -13 105 24 37 40 70 45 105 16 l22 -18 -22 -32 c-13 -18 -22 -33 -20 -35 2 -1 19 -13 36 -25 31 -21 32 -23 18 -45 -20 -30 -11 -52 26 -65 45 -15 45 -34 0 -91 -45 -57 -50 -85 -23 -121 30 -38 35 -73 12 -87 -10 -6 -24 -21 -30 -32 -14 -25 18 -60 56 -60 24 0 26 -3 21 -32 -3 -18 -9 -114 -12 -213 -3 -99 -8 -190 -11 -202 -2 -12 -19 -31 -38 -42 -72 -45 -69 -120 6 -168 27 -16 38 -29 34 -39 -3 -9 -6 -49 -6 -90 l0 -74 -92 0 c-51 0 -103 3 -115 6 -44 12 -22 24 45 24 37 0 73 4 79 8 8 5 14 35 15 73 l3 64 -125 6 c-134 6 -165 1 -171 -28 -2 -10 -3 -82 -1 -161 l4 -143 96 3 c90 3 98 5 107 26 6 15 17 22 30 20 18 -3 20 -11 20 -83 l0 -80 -111 4 c-157 4 -154 8 -154 -188 0 -97 4 -152 11 -157 6 -3 67 -9 136 -12 150 -6 153 -4 153 95 l0 62 -82 3 c-70 3 -83 6 -86 21 -3 15 8 17 117 17 l119 0 4 -140 3 -140 31 -31 c42 -42 100 -50 147 -20 67 41 67 41 67 515 l0 425 29 16 c86 44 78 158 -12 180 -24 6 -24 7 -30 178 -11 283 -11 297 14 297 55 0 78 49 39 85 -26 23 -26 60 0 92 30 39 25 74 -20 130 -43 55 -42 61 18 92 26 14 28 37 6 62 -15 16 -13 19 25 39 46 23 53 50 20 74 -27 19 -19 30 36 52 l45 17 40 -43 c37 -40 42 -42 77 -35 52 9 66 23 59 57 -5 26 -3 28 24 28 47 0 80 17 80 41 0 25 -52 76 -83 81 -18 2 -23 11 -25 40 -3 38 -3 38 25 27 39 -15 145 -3 199 23 56 26 118 95 138 155 19 55 21 181 4 220 -39 89 -105 142 -197 158 -41 7 -41 7 -41 50 0 49 -19 75 -55 75 -17 0 -26 8 -34 30 -6 19 -17 30 -29 30 -24 0 -58 -37 -73 -78 -6 -18 -20 -37 -30 -43 -21 -11 -25 -39 -8 -56 15 -15 -14 -67 -53 -96 -38 -28 -123 -35 -148 -12 -38 34 -27 46 51 59 22 4 48 19 69 41 31 32 35 42 38 106 5 87 -13 141 -66 192 -21 21 -61 46 -88 56 -42 16 -50 24 -56 52 -12 63 -86 91 -127 50z m198 -247 c31 -40 27 -67 -13 -86 -20 -10 -43 -33 -57 -60 -42 -75 -111 -78 -151 -5 -14 25 -38 50 -61 62 -42 23 -46 41 -16 79 26 34 32 33 50 -6 10 -25 21 -34 43 -36 16 -2 33 1 38 6 7 7 20 4 38 -6 25 -15 30 -15 52 0 14 9 28 30 31 47 8 38 19 39 46 5z m-785 -378 c3 -14 13 -32 22 -40 22 -23 77 -20 99 4 10 12 31 20 48 20 17 0 38 7 47 15 15 14 20 13 43 -5 22 -18 25 -24 16 -47 -12 -31 9 -69 47 -83 20 -8 24 -16 24 -54 0 -61 -7 -74 -51 -96 -48 -25 -49 -25 -49 5 0 71 -73 129 -128 103 -15 -7 -31 -27 -37 -43 -23 -68 -41 -71 -95 -17 -61 60 -72 166 -26 237 21 31 32 32 40 1z m1330 -20 c34 -72 15 -166 -45 -221 -52 -47 -92 -46 -97 1 -10 103 -151 79 -168 -27 -4 -22 -9 -39 -12 -39 -3 0 -22 8 -43 18 -30 14 -38 24 -43 52 -12 72 -8 85 32 111 31 20 37 30 40 65 4 50 35 74 72 54 12 -6 33 -9 46 -6 18 5 27 0 39 -18 35 -54 96 -41 131 27 17 32 26 29 48 -17z m-664 -1 c11 -13 9 -20 -10 -40 -22 -23 -25 -24 -42 -8 -21 19 -23 34 -6 51 17 17 43 15 58 -3z m-153 -164 c17 -27 48 -31 86 -11 30 16 37 17 53 5 30 -22 80 -19 98 7 25 36 41 8 41 -71 0 -59 -4 -72 -29 -105 -37 -50 -85 -69 -153 -64 -84 7 -143 74 -143 162 0 43 16 96 29 96 3 0 11 -8 18 -19z m-50 -261 c41 -27 79 -50 84 -50 18 0 9 -17 -16 -28 -37 -17 -78 2 -129 63 -26 29 -46 56 -46 59 0 17 40 1 107 -44z m418 30 c-18 -20 -55 -28 -55 -12 0 16 24 32 49 32 23 0 24 -1 6 -20z";

export function OrnateKeyIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 3600 3600">
      <G transform="translate(3600,0) scale(-1,1)">
        <G transform="rotate(-90 1800 1800)">
          <G transform="translate(0,3600) scale(1,-1)">
            <Path d={ORNATE_KEY_PATH} fill={color} />
          </G>
        </G>
      </G>
    </Svg>
  );
}

// "Liderin Secimi" ikonu - lucide'nin Crown'u (bkz. Icon.tsx LUCIDE_FALLBACK,
// digerleri icin hala ince cizgi) sadece bu secenekte DOLU (solid) gorunsun
// istegi uzerine - ayni Crown seklinin gövdesi dolduruluyor, alt cubugu
// (tabanin kendisi bir cizgi oldugu icin) stroke olarak kaliyor.
export function FilledCrownIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"
        fill={color}
      />
      <Path d="M5 21h14" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// "Sohbet Sesi" cubugundaki telefon ikonu secenegi (C) - Heroicons'un
// DevicePhoneMobileIcon'u (ahize yerine "cihaz") AYNI sekliyle, sadece govde
// opakligi degisiyor: kapali/sessizken govde SOLUK (opacity 0.4), ev tusu
// cubugu HER ZAMAN tam parlak kaliyor.
const PHONE_DEVICE_BODY =
  "M8.625.75A3.375 3.375 0 0 0 5.25 4.125v15.75a3.375 3.375 0 0 0 3.375 3.375h6.75a3.375 3.375 0 0 0 3.375-3.375V4.125A3.375 3.375 0 0 0 15.375.75h-6.75ZM7.5 4.125C7.5 3.504 8.004 3 8.625 3H9.75v.375c0 .621.504 1.125 1.125 1.125h2.25c.621 0 1.125-.504 1.125-1.125V3h1.125c.621 0 1.125.504 1.125 1.125v15.75c0 .621-.504 1.125-1.125 1.125h-6.75A1.125 1.125 0 0 1 7.5 19.875V4.125Z";
const PHONE_DEVICE_DOT = "M10.5 18.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z";

export function PhoneDeviceIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d={PHONE_DEVICE_BODY} />
      <Path d={PHONE_DEVICE_DOT} />
    </Svg>
  );
}

export function PhoneDeviceOffIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d={PHONE_DEVICE_BODY} opacity={0.4} />
      <Path d={PHONE_DEVICE_DOT} />
    </Svg>
  );
}
