import React from "react";
import {
  XMarkIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  PlusIcon,
  AtSymbolIcon,
  PhotoIcon,
  UserPlusIcon,
  ShareIcon,
  ArrowUpOnSquareIcon,
  GlobeAltIcon,
  PencilIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  EllipsisHorizontalIcon,
  PlayIcon,
  EyeIcon,
  EyeSlashIcon,
  CalendarIcon,
  ClockIcon,
  BellIcon,
  BellSlashIcon,
  UserMinusIcon,
  ExclamationTriangleIcon,
  CheckIcon,
  MapPinIcon,
  PhoneIcon,
  ArrowRightOnRectangleIcon,
  ForwardIcon,
  ArrowUturnLeftIcon,
  HeartIcon,
  PauseIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  BackwardIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "react-native-heroicons/solid";
import { HeartIcon as HeartOutlineIcon } from "react-native-heroicons/outline";
import { MicOff, Hourglass, Crown, RotateCcw, RotateCw } from "lucide-react-native";

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
  | "shareBox"
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
  | "fastBackward"
  | "phone"
  | "kicked"
  | "reply"
  | "heart"
  | "heartOutline"
  | "pause"
  | "rotateCcw"
  | "rotateCw"
  | "expand"
  | "collapse"
  | "volume"
  | "volumeOff";

interface Props {
  name: IconName;
  size?: number;
  color?: string;
}

// LUNA'nin ikon seti Heroicons Solid (react-native-heroicons/solid) - Tailwind
// ekibinin tasarladigi, tutarli dolu stil. Heroicons'ta "mic kapali",
// "kum saati" ve "tac" glyph'leri olmadigi icin bu uc tanesi lucide-
// react-native'den (zaten kurulu) geliyor - gorsel olarak farkli bir aile
// ama ayni "dolu/net" agirlikta oldugu icin yan yana durunca fark etmiyor.
const HEROICONS: Partial<Record<IconName, React.ComponentType<{ size?: number; color?: string }>>> = {
  close: XMarkIcon,
  settings: Cog6ToothIcon,
  search: MagnifyingGlassIcon,
  people: UsersIcon,
  mic: MicrophoneIcon,
  send: PaperAirplaneIcon,
  plus: PlusIcon,
  mention: AtSymbolIcon,
  image: PhotoIcon,
  invite: UserPlusIcon,
  share: ShareIcon,
  // Discover ekranindaki (UsersIcon/ClockIcon gibi DOLU/simetrik) sekme
  // ikonlarinin yaninda ShareIcon (3 noktali "ag" glyph'i) cok ince/dagili
  // kaliyordu - bunun yerine klasik, dolu ve simetrik paylasim kutusu
  // (bkz. FriendsScreen.tsx "Paylas" sekme ogesi).
  shareBox: ArrowUpOnSquareIcon,
  globe: GlobeAltIcon,
  edit: PencilIcon,
  chevronRight: ChevronRightIcon,
  chevronLeft: ChevronLeftIcon,
  moreHoriz: EllipsisHorizontalIcon,
  play: PlayIcon,
  eye: EyeIcon,
  eyeOff: EyeSlashIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  bell: BellIcon,
  bellOff: BellSlashIcon,
  personBlock: UserMinusIcon,
  warning: ExclamationTriangleIcon,
  check: CheckIcon,
  pin: MapPinIcon,
  fastForward: ForwardIcon,
  fastBackward: BackwardIcon,
  volume: SpeakerWaveIcon,
  volumeOff: SpeakerXMarkIcon,
  phone: PhoneIcon,
  kicked: ArrowRightOnRectangleIcon,
  reply: ArrowUturnLeftIcon,
  heart: HeartIcon,
  heartOutline: HeartOutlineIcon,
  pause: PauseIcon,
  expand: ArrowsPointingOutIcon,
  collapse: ArrowsPointingInIcon,
};

const LUCIDE_FALLBACK: Partial<Record<IconName, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>> = {
  micOff: MicOff,
  hourglass: Hourglass,
  crown: Crown,
  rotateCcw: RotateCcw,
  rotateCw: RotateCw,
};

export default function Icon({ name, size = 24, color = "#F5F5F7" }: Props) {
  const HeroGlyph = HEROICONS[name];
  if (HeroGlyph) return <HeroGlyph size={size} color={color} />;
  const LucideGlyph = LUCIDE_FALLBACK[name];
  if (LucideGlyph) return <LucideGlyph size={size} color={color} strokeWidth={2.2} />;
  return null;
}
