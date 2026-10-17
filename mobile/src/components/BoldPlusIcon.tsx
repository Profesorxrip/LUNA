import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

/** Discover ekranindaki "+" FAB'i icin - heroicons'un ince "plus" ikonunun
 * aksine cubuklari KALIN (4/24 birim) bir arti, ayni 24x24 cerceve icinde
 * (buton boyutu degismiyor, sadece iconun kendisi kalinlasiyor). Kullanicinin
 * istegi uzerine uclari artik DIK DEGIL, strokeLinecap="round" ile oval/
 * yuvarlak (keskin kare kenarli dolgulu sekil yerine cizgi tabanli). */
export default function BoldPlusIcon({ size = 24, color = "#04140D" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4v16M4 12h16" stroke={color} strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}
