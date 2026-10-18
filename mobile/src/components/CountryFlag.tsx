import React from "react";
import { Image, ImageStyle, StyleProp } from "react-native";
import FLAG_IMAGES from "./flagImages";

interface Props {
  country: string | null | undefined;
  size?: number;
  style?: StyleProp<ImageStyle>;
}

// Emoji bayrak yerine gercek bayrak gorseli - Android'de emoji bayraklar
// bitmap font oldugu icin buyutulunce pikselli/bloklu gorunuyordu, bu da her
// platformda ayni crisp gorseli veriyor. Eskiden flagcdn.com'dan CANLI
// cekiliyordu - artik yerel assets/flags/ icine gomulu (bkz. flagImages.ts),
// calisma zamaninda hic internet erisimi gerekmiyor, aglari engelli/yavas
// ortamlarda da (ya da offline) her zaman gorunuyor.
export default function CountryFlag({ country, size = 16, style }: Props) {
  const code = country?.trim().toLowerCase();
  const source = code ? FLAG_IMAGES[code] : undefined;

  if (!source) return null;

  const width = Math.round(size * 1.5);
  return <Image source={source} style={[{ width, height: size, borderRadius: 2 }, style]} />;
}
