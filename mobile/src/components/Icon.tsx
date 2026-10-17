import React from "react";
import {
  XMarkIcon as XMarkIconOutline,
  MagnifyingGlassIcon as MagnifyingGlassIconOutline,
  AtSymbolIcon as AtSymbolIconOutline,
} from "react-native-heroicons/outline";
import {
  Cog6ToothIcon,
  MicrophoneIcon,
  PlusIcon,
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
  PauseIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  BackwardIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  ChatBubbleOvalLeftIcon,
  ClipboardDocumentIcon,
  UserIcon,
  NoSymbolIcon,
  TrashIcon,
  SparklesIcon,
} from "react-native-heroicons/solid";
import { Hourglass, Crown, RotateCcw, RotateCw, Heart } from "lucide-react-native";
import { SkipForwardIcon, SkipBackIcon } from "./SkipIcons";
import { PaperPlaneIcon, ParticipantsIcon, MicOffIcon, SquarePhotoIcon } from "./CustomIcons";
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
  // Video kontrol panelindeki ("sıradakine geç"/"onceki video") ayri bir
  // ikon ailesi - "fastForward"/"fastBackward" (Heroicons solid, otomatik
  // oynat modu ikonu vb. yerlerde kullaniliyor) ile KARISTIRMA, bu ikisi
  // kullanicinin gonderdigi referans gorselden potrace ile BIREBIR izlenmis
  // ozel bir sekil (bkz. SkipIcons.tsx) - hazir bir ikon kutuphanesi glyph'i
  // DEGIL.
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
  mic: MicrophoneIcon,
  plus: PlusIcon,
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
  trash: TrashIcon,
  sparkles: SparklesIcon,
  check: CheckIcon,
  pin: MapPinIcon,
  fastForward: ForwardIcon,
  fastBackward: BackwardIcon,
  volume: SpeakerWaveIcon,
  volumeOff: SpeakerXMarkIcon,
  phone: PhoneIcon,
  kicked: ArrowRightOnRectangleIcon,
  reply: ArrowUturnLeftIcon,
  pause: PauseIcon,
  expand: ArrowsPointingOutIcon,
  collapse: ArrowsPointingInIcon,
  chatBubble: ChatBubbleOvalLeftIcon,
  clipboard: ClipboardDocumentIcon,
  person: UserIcon,
  block: NoSymbolIcon,
};

const LUCIDE_FALLBACK: Partial<Record<IconName, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>>> = {
  hourglass: Hourglass,
  crown: Crown,
  rotateCcw: RotateCcw,
  rotateCw: RotateCw,
};

// Hazir kutuphanelerde olmayan, kullanicinin kendi gorselinden birebir
// izlenmis ozel ikonlar (bkz. SkipIcons.tsx).
const CUSTOM: Partial<Record<IconName, React.ComponentType<{ size?: number; color?: string }>>> = {
  skipForward: SkipForwardIcon,
  skipBack: SkipBackIcon,
  shield: ModeratorBadge,
  send: PaperPlaneIcon,
  people: ParticipantsIcon,
  micOff: MicOffIcon,
  image: SquarePhotoIcon,
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
  const HeroGlyph = HEROICONS[name];
  if (HeroGlyph) return <HeroGlyph size={size} color={color} />;
  const LucideGlyph = LUCIDE_FALLBACK[name];
  if (LucideGlyph) return <LucideGlyph size={size} color={color} strokeWidth={2.2} />;
  const CustomGlyph = CUSTOM[name];
  if (CustomGlyph) return <CustomGlyph size={size} color={color} />;
  return null;
}
