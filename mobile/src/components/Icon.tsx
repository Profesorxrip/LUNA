import React from "react";
import { View } from "react-native";
import {
  X,
  Settings,
  Search,
  Users,
  Mic,
  MicOff,
  Send,
  Plus,
  AtSign,
  Image as LucideImage,
  UserPlus,
  Share2,
  Globe,
  Pencil,
  ChevronRight,
  ChevronLeft,
  Ellipsis,
  Play,
  Eye,
  EyeOff,
  Calendar,
  Clock,
  Hourglass,
  Bell,
  BellOff,
  UserX,
  AlertTriangle,
  Check,
  MapPin,
  Crown,
  FastForward,
  Phone,
  LogOut,
  type LucideIcon,
} from "lucide-react-native";

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

// LUNA'nin ikon seti Lucide (lucide-react-native) kullaniyor - acik kaynak,
// tutarli tek-kalinlik cizgi stili, binlerce ikon. Her IconName tek bir
// Lucide bilesenine esleniyor.
const LUCIDE: Record<IconName, LucideIcon> = {
  close: X,
  settings: Settings,
  search: Search,
  people: Users,
  mic: Mic,
  micOff: MicOff,
  send: Send,
  plus: Plus,
  mention: AtSign,
  image: LucideImage,
  invite: UserPlus,
  share: Share2,
  globe: Globe,
  edit: Pencil,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  moreHoriz: Ellipsis,
  play: Play,
  eye: Eye,
  eyeOff: EyeOff,
  calendar: Calendar,
  clock: Clock,
  hourglass: Hourglass,
  bell: Bell,
  bellOff: BellOff,
  personBlock: UserX,
  warning: AlertTriangle,
  check: Check,
  pin: MapPin,
  crown: Crown,
  fastForward: FastForward,
  phone: Phone,
  kicked: LogOut,
};

// Ayni "size" verilse bile her Lucide glyph'i kendi 24x24 kutusunu farkli
// oranda dolduruyor (ornegin "check" ince bir tik, "ellipsis" cok az
// "murekkep" kullanan ince noktalar) - yan yana durunca bazilari
// digerlerine gore kucuk/ince, bazilari buyuk/kalin gorunuyordu. Gozle
// kalibre edilmis bir buyutme carpani ile dengeleniyor. Disaridan verilen
// "size" HER ZAMAN gosterilen kutunun boyutu olarak kaliyor (layout
// bozulmaz), sadece icerideki glyph o kutu icinde buyutulup/kucultulup
// ortalaniyor.
const SCALE: Partial<Record<IconName, number>> = {
  close: 1.1,
  plus: 1.15,
  moreHoriz: 1.3,
  check: 1.3,
  mic: 1.05,
  micOff: 1.05,
  chevronRight: 1.2,
  chevronLeft: 1.2,
};

export default function Icon({ name, size = 24, color = "#F5F5F7" }: Props) {
  const scale = SCALE[name] ?? 1;
  const inner = size * scale;
  const LucideGlyph = LUCIDE[name];
  const glyph = <LucideGlyph size={inner} color={color} strokeWidth={2} />;
  if (scale === 1) return glyph;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>{glyph}</View>
  );
}
