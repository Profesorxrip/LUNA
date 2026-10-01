import React from "react";
import { View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

export type IconName =
  | "close"
  | "settings"
  | "search"
  | "people"
  | "mic"
  | "micOff"
  | "send"
  | "plus"
  | "mention"
  | "image"
  | "invite"
  | "share"
  | "globe"
  | "edit"
  | "chevronRight"
  | "chevronLeft"
  | "moreHoriz"
  | "play"
  | "eye"
  | "eyeOff"
  | "calendar"
  | "clock"
  | "hourglass"
  | "bell"
  | "bellOff"
  | "personBlock"
  | "warning"
  | "check"
  | "pin"
  | "crown"
  | "fastForward"
  | "phone"
  | "kicked";

interface Props {
  name: IconName;
  size?: number;
  color?: string;
}

// LUNA el yapimi SVG seti yerine Expo'nun resmi ikon paketi (Ionicons /
// MaterialCommunityIcons) kullaniliyor - binlerce tutarli, bakimi hazir
// ikon iceriyor, Android/iOS/Web'de ayni sekilde calisiyor.
// Hepsi AYNI aileden (suffix'siz - dolu, yuvarlak kose) seciliyor -
// "-outline" (ince) ve "-sharp" (kose) varyantlarini karistirmak ayni
// satirda bazi ikonlari ince/bos, bazilarini kalin/dolu gosterip optik
// dengeyi bozuyordu (ozellikle alt bardaki paylas/etiket/galeri/davet/
// harita sirasinda fark ediliyordu).
const IONICONS_MAP: Partial<Record<IconName, keyof typeof Ionicons.glyphMap>> = {
  close: "close",
  settings: "settings",
  search: "search",
  people: "people",
  mic: "mic",
  micOff: "mic-off",
  send: "send",
  plus: "add",
  mention: "at",
  image: "image",
  invite: "person-add",
  share: "share",
  globe: "globe",
  edit: "pencil",
  chevronRight: "chevron-forward",
  chevronLeft: "chevron-back",
  moreHoriz: "ellipsis-horizontal",
  play: "play",
  eye: "eye",
  eyeOff: "eye-off",
  calendar: "calendar",
  clock: "time",
  hourglass: "hourglass",
  bell: "notifications",
  bellOff: "notifications-off",
  personBlock: "person-remove",
  warning: "warning",
  check: "checkmark",
  pin: "location",
  fastForward: "play-forward",
  phone: "call",
  kicked: "exit",
};

// Ionicons'ta tac (crown) glyph'i yok - MaterialCommunityIcons'tan aliniyor.
const MATERIAL_COMMUNITY_MAP: Partial<Record<IconName, keyof typeof MaterialCommunityIcons.glyphMap>> = {
  crown: "crown",
};

// Font tabanli ikonlarda ayni "size" verilse bile her glyph kendi 24x24
// kutusunu FARKLI oranda dolduruyor (ornegin "check" ince bir tik cizgisi,
// "image" ise kutuyu tam dolduran bir kare) - bu da yan yana durunca bazi
// ikonlarin digerlerine gore kucuk/ince, bazilarinin buyuk/kalin gorunmesine
// yol aciyordu. Her ikon icin gozle kalibre edilmis bir buyutme carpani
// tanimlayip optik olarak ayni agirlikta gorunmelerini sagliyoruz. Disaridan
// verilen "size" HER ZAMAN gosterilen kutunun boyutu olarak kaliyor (layout
// bozulmaz), sadece icerideki glyph o kutu icinde buyutulup/kucultulup
// ortalaniyor.
const SCALE: Partial<Record<IconName, number>> = {
  close: 1.08,
  mic: 1.12,
  micOff: 1.12,
  send: 1.05,
  plus: 1.15,
  image: 0.92,
  share: 1.05,
  edit: 1.1,
  chevronRight: 1.35,
  chevronLeft: 1.35,
  moreHoriz: 1.3,
  play: 1.1,
  eye: 1.1,
  eyeOff: 1.1,
  hourglass: 1.08,
  check: 1.3,
  pin: 1.05,
  phone: 1.1,
  people: 0.94,
  settings: 0.95,
};

export default function Icon({ name, size = 24, color = "#F5F5F7" }: Props) {
  const scale = SCALE[name] ?? 1;
  const inner = size * scale;
  const ionName = IONICONS_MAP[name];
  const glyph = ionName ? (
    <Ionicons name={ionName} size={inner} color={color} />
  ) : MATERIAL_COMMUNITY_MAP[name] ? (
    <MaterialCommunityIcons name={MATERIAL_COMMUNITY_MAP[name]!} size={inner} color={color} />
  ) : null;
  if (!glyph) return null;
  if (scale === 1) return glyph;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>{glyph}</View>
  );
}
