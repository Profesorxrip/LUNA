import Svg, { Path } from "react-native-svg";

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
