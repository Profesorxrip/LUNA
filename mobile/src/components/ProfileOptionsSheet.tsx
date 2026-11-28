import { useEffect, useState } from "react";
import { Image, Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { CircleArrowDown } from "lucide-react-native";
import Icon from "./Icon";
import type { IconName } from "./Icon";

// DM/UserProfileScreen'deki ile AYNI sunucu degerleri (bkz. server/src/
// social.ts FriendStatus) - "outgoing" = BEN istek attim (henuz kabul
// edilmedi), "incoming" = o bana istek atti, "blocked" = BEN onu
// engellemisim.
export type FriendStatus = "none" | "outgoing" | "incoming" | "friends" | "blocked";

export interface ProfileOptionsTarget {
  userId?: string | null;
  socketId?: string | null;
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  isHost?: boolean;
  isModerator?: boolean;
  // Gercek arkadaslik/istek/engel durumu (bkz. RoomScreen.tsx
  // openProfileOptions - acilista "friend:status" ile sunucudan sorulur,
  // gelene kadar undefined kalir ve "Istek at" varsayilan gosterilir).
  friendStatus?: FriendStatus;
  // Lider/moderator bu katilimcinin mikrofonunu zaten devre disi birakmis mi
  // (bkz. RoomScreen.tsx muteParticipant) - duruma gore "Mikrofonu Devre
  // Disi Birak" <-> "Mikrofonu Aktif Et" arasinda gidip gelir.
  micDisabled?: boolean;
  // Lider/moderator bu katilimcinin sohbete YAZMASINI kapatti mi (bkz.
  // RoomScreen.tsx room:setChatBanned) - "Chati Kapat" <-> "Chati Ac"
  // arasinda gidip gelir.
  chatBanned?: boolean;
  // Bu SADECE benim icin kisilmis mi (bkz. useVoiceChat.ts
  // setParticipantVolume) - host olup olmadigima bakmaksizin herkeste olan
  // kisisel bir tercih, odanin geneline etki etmez.
  locallyMuted?: boolean;
  // Bu kisinin sohbet mesajlari SADECE benim ekranimda gizlenmis mi - aynen
  // locallyMuted gibi kisisel bir tercih, odanin geneline etki etmez.
  locallyChatMuted?: boolean;
}

interface Props {
  visible: boolean;
  target: ProfileOptionsTarget | null;
  // Bu katilimcinin bulundugu odada BEN GERCEKTEN lider miyim - SADECE
  // liderin elinde olan aksiyonlar (Liderligi ver / Moderator yap /
  // Moderatorlukten cikar) buna bakar, moderatorler bunlari YAPAMAZ.
  isHost: boolean;
  // Odadan at / Mikrofon / Chat kapatma icin - BEN lider isem HER ZAMAN,
  // moderator isem SADECE hedef baska bir moderator/lider DEGILSE true gelir
  // (bkz. RoomScreen.tsx openProfileOptions - sunucudaki canModerate ile
  // AYNI mantik, sadece burada arayuzu dogru satirlari gosterip gizlemek
  // icin).
  canModerateTarget: boolean;
  // Hedef hala BU ODADA mi - "Odadan at" sonrasi oda-ozel satirlarin
  // (Liderligi ver/Moderator/Kick/Mikrofon/Sessize Al/Chat) kaybolmasi icin.
  // SADECE RoomScreen.tsx'teki kullanimda anlamli - Discover/Friends'te hic
  // oda kavrami olmadigindan (ve zaten o ekranlar bu handler'lari hic
  // vermedigiden) varsayilan true'nun hicbir etkisi yok.
  targetInRoom?: boolean;
  // RoomScreen.tsx'teki kullanimda - katilimcilar kutusu ekranda o an hangi
  // dikey aralikta duruyorsa (yarim ekranda videonun ALT KENARINDAN, tam
  // ekranda topBarHeight'tan basliyor - bkz. ParticipantsModal.tsx), kart
  // tum ekrana degil O ARALIGA gore dikey ORTALANSIN diye. Verilmezse
  // (Discover/Friends'teki kullanimda oldugu gibi) eskisi gibi TUM ekrana
  // gore ortalanir.
  verticalCenterBand?: { top: number; bottom: number };
  onClose: () => void;
  onOpenProfile: (target: ProfileOptionsTarget) => void;
  onMakeLeader?: (target: ProfileOptionsTarget) => void;
  onMakeModerator?: (target: ProfileOptionsTarget) => void;
  // Moderatorlugu GERI ALMAK - moderatorler birbirine dokunamadigi icin
  // (bkz. rooms.ts canModerate) SADECE gercek lidere ozel, canModerateTarget
  // DEGIL dogrudan isHost'a bakar.
  onRemoveModerator?: (target: ProfileOptionsTarget) => void;
  onKick?: (target: ProfileOptionsTarget) => void;
  onDisableMic?: (target: ProfileOptionsTarget) => void;
  onEnableMic?: (target: ProfileOptionsTarget) => void;
  onDisableChat?: (target: ProfileOptionsTarget) => void;
  onEnableChat?: (target: ProfileOptionsTarget) => void;
  onToggleLocalMute?: (target: ProfileOptionsTarget) => void;
  onToggleLocalChatMute?: (target: ProfileOptionsTarget) => void;
  onSendFriendRequest?: (target: ProfileOptionsTarget) => void;
  onCancelFriendRequest?: (target: ProfileOptionsTarget) => void;
  onRemoveFriend?: (target: ProfileOptionsTarget) => void;
  onBlock?: (target: ProfileOptionsTarget) => void;
  onUnblock?: (target: ProfileOptionsTarget) => void;
  onReport?: (target: ProfileOptionsTarget) => void;
}

interface Row {
  key: string;
  icon: IconName;
  label: string;
  danger?: boolean;
  onPress: () => void;
}

const PLACEHOLDER_COLORS = ["#F97316", "#10B981", "#3B82F6", "#EC4899", "#EAB308", "#8B5CF6", "#14B8A6"];
function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
}

/** Rave'deki gibi bir katilimcinin profiline/avatarina BASILI TUTUNCA
 * ekranin ORTASINDA acilan kucuk kutu - buyuk kare profil fotografi + isim/
 * kullanici adi karti, altinda her biri AYRI yuvarlatilmis birer "hap"
 * (pill) olan aksiyon satirlari. Hangi ekranda/baglamda kullanilirsa
 * kullanilsin ayni bilesen - Liderligi ver/Moderator yap/Moderatorlugu al
 * SADECE "isHost" true ise (gercek lider, moderatorler bunlari asla
 * yapamaz); Odadan at/Mikrofon/Chat kapatma "canModerateTarget" true ise
 * gosterilir (lider HER ZAMAN, moderator SADECE hedef baska bir
 * moderator/lider DEGILSE - bkz. rooms.ts canModerate); Profil/arkadaslik/
 * engelleme/bildirme SADECE gercek bir userId varsa, role BAKMAKSIZIN
 * herkese gosterilir; Sessize Al ise rolden tamamen BAGIMSIZ, herkeste. */
export default function ProfileOptionsSheet({
  visible,
  target,
  isHost,
  canModerateTarget,
  targetInRoom = true,
  verticalCenterBand,
  onClose,
  onOpenProfile,
  onMakeLeader,
  onMakeModerator,
  onRemoveModerator,
  onKick,
  onDisableMic,
  onEnableMic,
  onDisableChat,
  onEnableChat,
  onToggleLocalMute,
  onToggleLocalChatMute,
  onSendFriendRequest,
  onCancelFriendRequest,
  onRemoveFriend,
  onBlock,
  onUnblock,
  onReport,
}: Props) {
  const { t } = useTranslation();
  // "Sessize Al" artik (altinda baska bir seye izni varsa) bir ALT MENU
  // acan giris noktasi - Mikrofonu Devre Disi Birak/Chati Kapat gibi oda
  // geneline etki eden kisitlamalar ARTIK ana listede degil, bu alt menude
  // (bkz. asagidaki showMuteOptions/restrictionRows). Kart her
  // kapandiginda (visible false) sifirlanir, bir dahaki acilista HER ZAMAN
  // ana listeden baslansin diye.
  const [showMuteOptions, setShowMuteOptions] = useState(false);
  useEffect(() => {
    if (!visible) setShowMuteOptions(false);
  }, [visible]);
  if (!target) return null;

  // Coğu aksiyon (moderatorluk/mikrofon/chat/arkadaslik/engelleme) kart
  // ACIK KALIRKEN yerinde "diger" butona donusuyor - ilgili alan
  // RoomScreen/DiscoverScreen/FriendsScreen tarafindan guncellenip buraya
  // GUNCEL target olarak geri geliyor (canli oda verisinden turetilen
  // alanlar icin RoomScreen otomatik, arkadaslik/engelleme icin ilgili ekran
  // basarili ack sonrasi elle guncelliyor). SADECE Profil (ayri bir ekrana
  // gider) ve Bildir (tek seferlik, geri donusu olmayan bir islem) karti
  // kapatir (bkz. actAndClose).
  function act(fn?: (t: ProfileOptionsTarget) => void) {
    return () => {
      if (fn) fn(target!);
    };
  }
  function actAndClose(fn?: (t: ProfileOptionsTarget) => void) {
    return () => {
      if (fn) fn(target!);
      onClose();
    };
  }

  const rows: Row[] = [];
  if (target.userId) {
    rows.push({ key: "profile", icon: "person", label: t("profileOptions.profile"), onPress: actAndClose(onOpenProfile) });
  }
  // Liderligi devretmek ve moderator atamak SADECE gercek liderin elinde -
  // moderatorler bunlari YAPAMAZ (bkz. rooms.ts transferHost/setModerator,
  // bilerek canModerateTarget DEGIL dogrudan isHost kullanir). targetInRoom
  // kontrolu - hedef kick'lendiyse (artik odada degilse) bu satirlar
  // anlamsiz kalip kaybolur.
  if (targetInRoom && isHost && onMakeLeader) {
    rows.push({ key: "leader", icon: "crown", label: t("profileOptions.makeLeader"), onPress: act(onMakeLeader) });
  }
  if (targetInRoom && isHost) {
    if (target.isModerator && onRemoveModerator) {
      rows.push({ key: "removeModerator", icon: "leaderAward", label: t("profileOptions.removeModerator"), danger: true, onPress: act(onRemoveModerator) });
    } else if (!target.isModerator && onMakeModerator) {
      rows.push({ key: "moderator", icon: "leaderAward", label: t("profileOptions.makeModerator"), onPress: act(onMakeModerator) });
    }
  }
  if (target.userId) {
    if (target.friendStatus === "friends" && onRemoveFriend) {
      rows.push({ key: "removeFriend", icon: "personMinus", label: t("profileOptions.removeFriend"), onPress: act(onRemoveFriend) });
    } else if (target.friendStatus === "outgoing" && onCancelFriendRequest) {
      rows.push({ key: "cancelFriendRequest", icon: "personRemove", label: t("profileOptions.cancelFriendRequest"), onPress: act(onCancelFriendRequest) });
    } else if (onSendFriendRequest) {
      rows.push({ key: "addFriend", icon: "personAdd", label: t("profileOptions.addFriend"), onPress: act(onSendFriendRequest) });
    }
  }
  if (targetInRoom && canModerateTarget && onKick) {
    rows.push({ key: "kick", icon: "kicked", label: t("profileOptions.kick"), danger: true, onPress: act(onKick) });
  }

  // Mikrofonu Devre Disi Birak / Chati Kapat / Sessize Al - ucu de hedefe
  // yonelik bir "kisitlama" oldugu icin artik tek bir "Sessize Al" giris
  // noktasinin ALTINDA toplaniyor (bkz. yukarida showMuteOptions). Oda
  // geneline etki eden ilk ikisi gosterilecekse (canModerateTarget), tek
  // girisli buton ALT MENU acar; degilse (sade bir uye icin) "Sessize Al"
  // eskisi gibi DOGRUDAN kendi (kisisel) aksiyonunu yapar.
  const restrictionRows: Row[] = [];
  if (targetInRoom && canModerateTarget) {
    if (target.micDisabled && onEnableMic) {
      restrictionRows.push({ key: "enableMic", icon: "mic", label: t("profileOptions.enableMic"), onPress: act(onEnableMic) });
    } else if (!target.micDisabled && onDisableMic) {
      restrictionRows.push({ key: "disableMic", icon: "micOff", label: t("profileOptions.disableMic"), danger: true, onPress: act(onDisableMic) });
    }
  }
  if (targetInRoom && canModerateTarget) {
    if (target.chatBanned && onEnableChat) {
      restrictionRows.push({ key: "enableChat", icon: "chatBubble", label: t("profileOptions.enableChat"), onPress: act(onEnableChat) });
    } else if (!target.chatBanned && onDisableChat) {
      restrictionRows.push({ key: "disableChat", icon: "chatBubble", label: t("profileOptions.disableChat"), danger: true, onPress: act(onDisableChat) });
    }
  }
  // Chati Sustur - mikrofon/ses icin olan "Sessize Al" ile AYNI mantikta,
  // SADECE benim ekranimda bu kisinin mesajlarini gizler (bkz. RoomScreen.tsx
  // toggleLocalChatMute) - moderasyon yetkisi GEREKMEZ, canModerateTarget'a
  // bakilmaksizin herkeste var.
  if (targetInRoom && onToggleLocalChatMute) {
    restrictionRows.push({
      key: "localChatMute",
      icon: target.locallyChatMuted ? "chatBubble" : "chatMuted",
      label: target.locallyChatMuted ? t("profileOptions.unmuteChatLocal") : t("profileOptions.muteChatLocal"),
      onPress: act(onToggleLocalChatMute),
    });
  }
  const localMuteRow: Row | null =
    targetInRoom && onToggleLocalMute
      ? {
          key: "localMute",
          icon: target.locallyMuted ? "sesAcik1" : "sesKapali1",
          label: target.locallyMuted ? t("profileOptions.unmute") : t("profileOptions.mute"),
          onPress: act(onToggleLocalMute),
        }
      : null;
  if (localMuteRow && restrictionRows.length) {
    rows.push({ ...localMuteRow, onPress: () => setShowMuteOptions(true) });
  } else if (localMuteRow) {
    rows.push(localMuteRow);
  } else if (restrictionRows.length) {
    // Kisisel mute secenegi yoksa (onToggleLocalMute verilmemisse) ama
    // kisitlama satirlari varsa - bunlar DOGRUDAN ana listede kalir, bos
    // yere alt menu acilmaz.
    rows.push(...restrictionRows);
  }
  if (target.userId) {
    if (target.friendStatus === "blocked" && onUnblock) {
      rows.push({ key: "unblock", icon: "personRemove", label: t("profileOptions.unblock"), onPress: act(onUnblock) });
    } else if (onBlock) {
      rows.push({ key: "block", icon: "block", label: t("profileOptions.block"), onPress: act(onBlock) });
    }
  }
  if (target.userId && onReport) {
    rows.push({ key: "report", icon: "warningOutline", label: t("profileOptions.report"), danger: true, onPress: actAndClose(onReport) });
  }

  // Alt menudeyken - geri don satiri + Sessize Al (artik DOGRUDAN kendi
  // aksiyonunu yapar, ama burada "Sesi Kapat/Ac" olarak anilir - bir onceki
  // (ana) ekrandaki "Sessize Al" giris noktasi etiketi DEGISMEDEN kalir) +
  // kisitlama satirlari.
  const muteSubRows: Row[] = showMuteOptions
    ? [
        { key: "back", icon: "chevronLeft", label: t("profileOptions.back"), onPress: () => setShowMuteOptions(false) },
        ...(localMuteRow
          ? [{ ...localMuteRow, label: target.locallyMuted ? t("profileOptions.unmuteSubmenu") : t("profileOptions.muteSubmenu") }]
          : []),
        ...restrictionRows,
      ]
    : [];
  const visibleRows = showMuteOptions ? muteSubRows : rows;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View
          style={
            verticalCenterBand
              ? [styles.centerWrap, { position: "absolute", top: verticalCenterBand.top, bottom: verticalCenterBand.bottom, left: 0, right: 0 }]
              : styles.centerWrap
          }
        >
        <View style={[styles.card, verticalCenterBand && { marginTop: 0 }]}>
          {/* NowPlayingBar.tsx'teki yatay "hap" cercevesinin 90 derece
              dondurulmus hali - TEK bir dikey kapsul, fotograf da butonlar da
              bunun ICINDE/ONUNDE, ayri ayri cakisan iki parca degil. */}
          <LinearGradient
            colors={["#FFFFFF", "#1C6FD9"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardBorder}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.cardInner}>
              <View style={[StyleSheet.absoluteFill, { backgroundColor: "#132233" }]} />
            {target.avatarUrl ? (
              <Image source={{ uri: target.avatarUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colorForName(target.name) }]}>
                <Text style={styles.photoInitial}>{target.name.trim().charAt(0).toUpperCase() || "?"}</Text>
              </View>
            )}
            <Text style={styles.name} numberOfLines={1}>
              {target.name}
            </Text>
            {!!target.handle && (
              <Text style={styles.handle} numberOfLines={1}>
                @{target.handle}
              </Text>
            )}

            <View style={styles.list}>
              {visibleRows.map((row) => (
                <TouchableOpacity key={row.key} style={styles.pill} onPress={row.onPress}>
                  <View
                    style={[
                      styles.pillIcon,
                      (row.icon === "block" || row.icon === "warning" || row.icon === "warningOutline") && styles.pillIconNudgeLeft,
                      (row.icon === "warning" || row.icon === "warningOutline") && styles.pillIconNudgeDown,
                    ]}
                  >
                    {row.key === "back" ? (
                      // "Geri Dön" - DM/GroupChatScreen'deki standart geri
                      // dugmesi ile AYNI: CircleArrowDown'in 90 derece
                      // dondurulmus hali (yuvarlak icinde sola bakan ok).
                      <View style={{ transform: [{ rotate: "90deg" }] }}>
                        <CircleArrowDown size={16} color="#FFFFFF" />
                      </View>
                    ) : (
                      <Icon name={row.icon} size={16} color={row.danger ? "#FF6B6B" : "#FFFFFF"} />
                    )}
                  </View>
                  <View style={styles.pillLabelWrap}>
                    <Text
                      style={[styles.pillLabel, row.danger && styles.pillLabelDanger]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {row.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            </TouchableOpacity>
          </LinearGradient>
        </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const CARD_WIDTH = 170;
const PHOTO_WIDTH = 108;

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  // Varsayilan (verticalCenterBand verilmemisse, Discover/Friends'teki
  // kullanim) TUM ekrana gore ortalar - RoomScreen.tsx'teki kullanimda ise
  // JSX'te inline olarak position:absolute + top/bottom (band) ile
  // EZILEREK sadece katilimcilar kutusunun o anki dikey araligina gore
  // ortalar (bkz. yukarida verticalCenterBand).
  centerWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { width: CARD_WIDTH, marginTop: 70 },
  cardBorder: { borderRadius: CARD_WIDTH / 2, padding: 2 },
  // NowPlayingBar.tsx'teki yatay "hap" cercevesinin (borderRadius = kendi
  // yuksekliginin yarisi) 90 derece dondurulmus hali - burada DIKEY oldugu
  // icin yaricap GENISLIGIN yarisina (CARD_WIDTH/2) esitlendi. Fotograf da
  // butonlar da artik AYRI/cakisan iki parca degil, TEK bu kapsulun icinde.
  cardInner: {
    width: "100%",
    alignItems: "center",
    borderRadius: CARD_WIDTH / 2,
    paddingTop: 12,
    paddingBottom: 32,
    paddingHorizontal: 20,
    overflow: "hidden",
  },
  photo: { width: PHOTO_WIDTH, height: PHOTO_WIDTH, borderRadius: PHOTO_WIDTH / 2, marginBottom: 6 },
  photoPlaceholder: { justifyContent: "center", alignItems: "center" },
  photoInitial: { color: "#FFFFFF", fontSize: 28, fontWeight: "700" },
  name: { color: "#FFFFFF", fontSize: 18, fontFamily: "Inter_700Bold" },
  handle: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 },
  list: { width: "100%", marginTop: 10, gap: 4 },
  // Ikon artik metnin SOLUNA degil, butonun sol kenarina SABIT/mutlak
  // konumlanıyor - boylece yazi ikonun ittigi "grup" merkezine gore degil,
  // butonun GERCEK merkezine gore ortalaniyor.
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 36,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 13,
  },
  pillIcon: { position: "absolute", left: 10, top: 0, bottom: 0, justifyContent: "center", alignItems: "center" },
  pillIconNudgeLeft: { left: 8 },
  pillIconNudgeDown: { top: 2 },
  // Ikon SOLDA sabit (mutlak) durdugu icin yazi onun uzerine BINMESIN diye
  // kendi kutusu ikon payi kadar soldan baslayip (paddingLeft) kalan alanda
  // ortalaniyor - kisa etiketlerde gorsel olarak hala butonun ortasina yakin
  // duruyor, "İsteği iptal et" gibi UZUN etiketlerde ise artik ikona
  // DEGMIYOR (eskiden tum genislikte ortalandigi icin uzun yazi soldan
  // tasip ikonun ustune biniyordu).
  pillLabelWrap: { width: "100%", paddingLeft: 34, paddingRight: 10 },
  // Discover ekranindaki bos/arama-sonucu basliklariyla (bkz.
  // DiscoverScreen.tsx emptyTitleFontLoaded) AYNI "afis" tarzi - BebasNeue,
  // buyuk harf, hafif harf araligi.
  pillLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 17,
    fontWeight: "400",
    fontFamily: "BebasNeue_400Regular",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "left",
    textAlignVertical: "center",
    includeFontPadding: false,
    marginTop: 3,
  },
  pillLabelDanger: { color: "#FF6B6B" },
});
