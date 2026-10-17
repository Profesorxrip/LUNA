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

// "Mikrofon kapali" - "mic" (Heroicons solid MicrophoneIcon) ile AYNI sekil,
// farkli bir ikon ailesine (lucide MicOff) GECMEK yerine, kullanicinin
// istedigi gibi dogrudan UZERINE bir cizik cekiliyor: SVG Mask ile mikrofon
// govdesinden capraz bir SERIT gercekten KESILIP (transparan) seffaf hale
// getiriliyor, sonra ayni rengiyle bir CIZGI o bosluktan geciriliyor - boylece
// hangi renk/arka plan uzerinde kullanilirsa kullanilsin (bkz. Icon.tsx'teki
// micOff cagrilari - bazen theme.danger, bazen theme.textMuted) dogru gorunur,
// sabit bir arka plan rengi varsayilmaz.
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
        <Path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" fill={color} />
        <Path
          d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z"
          fill={color}
        />
      </G>
      <Line x1={3.5} y1={3.5} x2={20.5} y2={20.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
