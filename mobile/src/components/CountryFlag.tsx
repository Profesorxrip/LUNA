import React, { useEffect, useState } from "react";
import { Image, ImageStyle, StyleProp } from "react-native";

interface Props {
  country: string | null | undefined;
  size?: number;
  style?: StyleProp<ImageStyle>;
}

// Emoji bayrak yerine gercek bayrak gorseli (flagcdn.com) - Android'de emoji
// bayraklar bitmap font oldugu icin buyutulunce pikselli/bloklu gorunuyordu,
// bu da her platformda ayni crisp gorseli veriyor.
const FLAG_CDN = "https://flagcdn.com/w80";

export default function CountryFlag({ country, size = 16, style }: Props) {
  const code = country?.trim().toLowerCase();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [code]);

  if (!code || !/^[a-z]{2}$/.test(code) || failed) return null;

  const width = Math.round(size * 1.33);
  return (
    <Image
      source={{ uri: `${FLAG_CDN}/${code}.png` }}
      style={[{ width, height: size, borderRadius: 2 }, style]}
      onError={() => setFailed(true)}
    />
  );
}
