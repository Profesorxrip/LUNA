import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Kullanicinin gonderdigi referans gorseldeki ("Sana Ozel" karti) ikonun
// birebir ayni yapisi: kapali bir ucgen anahat (play) + ayri, tek bir acik
// ok (chevron) - iki ozdes ok DEGIL. Aralarindaki mesafe, kullanicinin
// onayladigi "K" secenegine gore ayarlandi.
export function SkipForwardIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 4 L14 12 L4 20 Z" />
      <Path d="M11 4 L21 12 L11 20" />
    </Svg>
  );
}

export function SkipBackIcon({ size = 24, color = "#F5F5F7" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 4 L10 12 L20 20 Z" />
      <Path d="M13 4 L3 12 L13 20" />
    </Svg>
  );
}
