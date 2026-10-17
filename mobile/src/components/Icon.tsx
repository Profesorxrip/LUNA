import React from "react";
import {
  XMarkIcon as XMarkIconOutline,
  MagnifyingGlassIcon as MagnifyingGlassIconOutline,
  AtSymbolIcon as AtSymbolIconOutline,
  ArrowRightOnRectangleIcon as ArrowRightOnRectangleIconOutline,
  NoSymbolIcon as NoSymbolIconOutline,
} from "react-native-heroicons/outline";
import {
  Cog6ToothIcon,
  PlusIcon,
  PencilIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  EllipsisHorizontalIcon,
  PlayIcon,
  EyeIcon,
  EyeSlashIcon,
  CalendarIcon,
  BellIcon,
  BellSlashIcon,
  ExclamationTriangleIcon,
  CheckIcon,
  MapPinIcon,
  PhoneIcon,
  ArrowUturnLeftIcon,
  PauseIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ChatBubbleOvalLeftIcon,
  ClipboardDocumentIcon,
  TrashIcon,
  SparklesIcon,
  GlobeEuropeAfricaIcon,
  LanguageIcon,
} from "react-native-heroicons/solid";
import { Hourglass, Crown, RotateCcw, RotateCw, Heart, Maximize, Minimize, Radar, CirclePlay, ListVideo, Vote } from "lucide-react-native";
import { PaperPlaneIcon, ParticipantsIcon, PersonIcon, PersonBlockIcon, MicIcon, MicOffIcon, SquarePhotoIcon, InvitePersonIcon, CompassBadgeIcon, ClockIcon, ShareBoxIcon, OrnateKeyIcon, FilledCrownIcon, PhoneDeviceIcon, PhoneDeviceOffIcon } from "./CustomIcons";
import AdultBadge from "./AdultBadge";
import { SkipForwardIcon, SkipBackIcon } from "./SkipIcons";
import ModeratorBadge from "./ModeratorBadge";

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
  | "radar"
  | "inviteKey"
  | "worldOpen"
  | "playOnlyControl"
  | "autoplayQueue"
  | "voteBox"
  | "crownFilled"
  | "phoneOff"
  | "phoneDevice"
  | "language"
  | "adultOff"
  | "crown"
  | "skipForward"
  | "skipBack"
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
  | "volumeOff"
  | "chatBubble"
  | "clipboard"
  | "person"
  | "block"
  | "shield"
  | "trash"
  | "sparkles";

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
  settings: Cog6ToothIcon,
  plus: PlusIcon,
  edit: PencilIcon,
  chevronRight: ChevronRightIcon,
  chevronLeft: ChevronLeftIcon,
  moreHoriz: EllipsisHorizontalIcon,
  play: PlayIcon,
  eye: EyeIcon,
  eyeOff: EyeSlashIcon,
  calendar: CalendarIcon,
  bell: BellIcon,
  bellOff: BellSlashIcon,
  warning: ExclamationTriangleIcon,
  trash: TrashIcon,
  sparkles: SparklesIcon,
  language: LanguageIcon,
  worldOpen: GlobeEuropeAfricaIcon,
  check: CheckIcon,
  pin: MapPinIcon,
  volume: SpeakerWaveIcon,
  volumeOff: SpeakerXMarkIcon,
  phone: PhoneIcon,
  reply: ArrowUturnLeftIcon,
  pause: PauseIcon,
  chatBubble: ChatBubbleOvalLeftIcon,
  clipboard: ClipboardDocumentIcon,
};

const LUCIDE_FALLBACK: Partial<Record<IconName, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>> = {
  crown: Crown,
  rotateCcw: RotateCcw,
  rotateCw: RotateCw,
  expand: Maximize,
  collapse: Minimize,
  radar: Radar,
  playOnlyControl: CirclePlay,
  autoplayQueue: ListVideo,
  voteBox: Vote,
};

const CUSTOM: Partial<Record<IconName, React.ComponentType<{ size?: number; color?: string }>>> = {
  skipForward: SkipForwardIcon,
  skipBack: SkipBackIcon,
  shield: ModeratorBadge,
  send: PaperPlaneIcon,
  people: ParticipantsIcon,
  mic: MicIcon,
  micOff: MicOffIcon,
  image: SquarePhotoIcon,
  invite: InvitePersonIcon,
  inviteKey: OrnateKeyIcon,
  crownFilled: FilledCrownIcon,
  phoneOff: PhoneDeviceOffIcon,
  adultOff: AdultBadge,
  phoneDevice: PhoneDeviceIcon,
  globe: CompassBadgeIcon,
  clock: ClockIcon,
  shareBox: ShareBoxIcon,
  person: PersonIcon,
  personBlock: PersonBlockIcon,
};

export default function Icon({ name, size = 24, color = "#F5F5F7" }: Props) {
  // Kalp (begeni) - Ikon gozden gecirmesinde secilen "B (geometrik)" stili:
  // Heroicons'un cok yuvarlak kalbi YERINE lucide'in daha koseli/geometrik
  // Heart glyph'i - begenilmisken dolgulu (fill=color), degilken sadece
  // cizgi (outline) olsun diye TEK bir bilesen uzerinde fill'i degistiriyoruz.
  if (name === "heart") return <Heart size={size} color={color} fill={color} />;
  if (name === "heartOutline") return <Heart size={size} color={color} fill="none" />;
  // Ikon gozden gecirmesinde outline'a cevrilen ilk ikon - "kalin" istegi
  // uzerine 2.2 strokeWidth veriliyor (lucide ikonlarinda da ayni kalinlik
  // kullaniliyor, bkz. LUCIDE_FALLBACK render'i asagida - tutarli dursun diye).
  if (name === "close") return <XMarkIconOutline size={size} color={color} strokeWidth={2.8} />;
  if (name === "search") return <MagnifyingGlassIconOutline size={size} color={color} strokeWidth={2.8} />;
  if (name === "mention") return <AtSymbolIconOutline size={size} color={color} strokeWidth={2.1} />;
  if (name === "kicked") return <ArrowRightOnRectangleIconOutline size={size} color={color} strokeWidth={2} />;
  if (name === "block") return <NoSymbolIconOutline size={size} color={color} strokeWidth={2} />;
  // "Bekleniyor" (hourglass) - lucide'nin varsayilan cizgi (fill=none) hali
  // yerine dolgulu istendi - digerlerinden (hourglass DISI lucide ikonlar)
  // FARKLI olarak burada fill={color} VERILIYOR, stroke de ayni renkte kalip
  // kenarlari net tutuyor.
  if (name === "hourglass") return <Hourglass size={size} color={color} fill={color} strokeWidth={2.2} />;
  const HeroGlyph = HEROICONS[name];
  if (HeroGlyph) return <HeroGlyph size={size} color={color} />;
  const LucideGlyph = LUCIDE_FALLBACK[name];
  if (LucideGlyph) return <LucideGlyph size={size} color={color} strokeWidth={2.2} />;
  const CustomGlyph = CUSTOM[name];
  if (CustomGlyph) return <CustomGlyph size={size} color={color} />;
  return null;
}
