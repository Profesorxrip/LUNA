import React from "react";
import { Text, TextStyle } from "react-native";

interface Props {
  country: string | null | undefined;
  size?: number;
  style?: TextStyle;
}

// ISO 3166-1 alpha-2 kodu ("TR", "US"...) -> bayrak emoji. Her harf, Unicode
// "regional indicator symbol" karsiligina cevrilir (A -> 🇦 ... Z -> 🇿),
// iki harf yan yana gelince isletim sistemi bunlari otomatik bayrak olarak
// render eder - resim/ikon paketi gerekmez.
function flagEmoji(country: string): string {
  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  const base = 0x1f1e6;
  const chars = [...code].map((c) => base + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...chars);
}

export default function CountryFlag({ country, size = 16, style }: Props) {
  if (!country) return null;
  return <Text style={[{ fontSize: size }, style]}>{flagEmoji(country)}</Text>;
}
