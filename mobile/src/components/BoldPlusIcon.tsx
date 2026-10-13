import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

/** Discover ekranindaki "+" FAB'i icin - heroicons'un ince "plus" ikonunun
 * aksine cubuklari KALIN (4/24 birim) bir arti, ayni 24x24 cerceve icinde
 * (buton boyutu degismiyor, sadece iconun kendisi kalinlasiyor). */
export default function BoldPlusIcon({ size = 24, color = "#04140D" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8V2Z" fill={color} />
    </Svg>
  );
}
