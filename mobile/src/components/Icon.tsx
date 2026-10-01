import React from "react";
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
const IONICONS_MAP: Partial<Record<IconName, keyof typeof Ionicons.glyphMap>> = {
  close: "close",
  settings: "settings-sharp",
  search: "search",
  people: "people",
  mic: "mic",
  micOff: "mic-off",
  send: "send",
  plus: "add",
  mention: "at",
  image: "image-outline",
  invite: "person-add",
  share: "share-social-outline",
  globe: "globe-outline",
  edit: "pencil",
  chevronRight: "chevron-forward",
  chevronLeft: "chevron-back",
  moreHoriz: "ellipsis-horizontal",
  play: "play",
  eye: "eye",
  eyeOff: "eye-off",
  calendar: "calendar-outline",
  clock: "time-outline",
  hourglass: "hourglass-outline",
  bell: "notifications",
  bellOff: "notifications-off",
  personBlock: "person-remove",
  warning: "warning",
  check: "checkmark",
  pin: "location-sharp",
  fastForward: "play-forward",
  phone: "call",
  kicked: "exit-outline",
};

// Ionicons'ta tac (crown) glyph'i yok - MaterialCommunityIcons'tan aliniyor.
const MATERIAL_COMMUNITY_MAP: Partial<Record<IconName, keyof typeof MaterialCommunityIcons.glyphMap>> = {
  crown: "crown",
};

export default function Icon({ name, size = 24, color = "#F5F5F7" }: Props) {
  const ionName = IONICONS_MAP[name];
  if (ionName) return <Ionicons name={ionName} size={size} color={color} />;
  const mcName = MATERIAL_COMMUNITY_MAP[name];
  if (mcName) return <MaterialCommunityIcons name={mcName} size={size} color={color} />;
  return null;
}
