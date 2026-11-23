import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { Search, PhoneCall, BellOff, LogOut, Image as ImageIcon, Paperclip, CircleArrowDown, UserGroup, UserPlus, MoreVertical } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import AppBackground from "../components/AppBackground";
import Avatar from "../components/Avatar";
import { showAlert } from "../components/CustomAlert";
import { theme } from "../theme";
import type { FriendUser } from "../services/socket";

type MenuMember = FriendUser & { isOnline?: boolean; isAdmin?: boolean };

interface Props {
  members: MenuMember[];
  // Kullanici: "Yazdığım isim ... sıfırlanmamalı" - bu ekran "Üye Ekle" ile
  // kapanip tekrar acildiginda KENDI state'i olsaydi kaybolurdu, bu yuzden
  // FriendsScreen'de (selected uyelerle AYNI yerde) tutulup prop olarak
  // veriliyor.
  groupName: string;
  onChangeGroupName: (name: string) => void;
  // groupName ile AYNI sebepten (bkz. yukarisi) FriendsScreen'de tutulup
  // prop olarak veriliyor - ekran "Üye Ekle" ile kapanip acildiginda
  // sifirlanmamasi icin.
  groupAvatarUri: string;
  onChangeGroupAvatarUri: (uri: string) => void;
  onBack: () => void;
  onCreate?: (groupName: string) => void;
  // Kullanici: "grubun ppsine ismine basınca grup bilgisi ekranına
  // yönlendirmeli" - GroupChatScreen'den acilan, ZATEN var olan bir grup
  // icin: isim/fotograf artik DUZENLENEMEZ (onay ikonu da yok, "Üye Ekle"
  // de henuz "yakinda" - mevcut bir gruba uye eklemek, grup OLUSTURMADAN
  // FARKLI, ayrica bir backend gerektirir), uye listesi SUNUCUDAN gelen
  // GERCEK uyeler.
  readOnly?: boolean;
  // Kullanici: "Buradaki tüm üyelerin yanına üç nokta koysak bide kurucu ve
  // üye yazısı eklesek" - SADECE var olan (readOnly) bir grup icin anlamli
  // (olusturma akisinda henuz bir "kurucu" kavrami yok, gosterilen liste
  // "Ben" haric secilen uyeler), bu yuzden verilmediginde rozet/uc nokta
  // gosterilmez.
  creatorId?: string;
  // Kullanici: "sağ üste basınca kaydetme butonu ekleyelim ismi yada ppyi
  // değiştirince kaydedebilmemiz için o yukarı bakan ok ikonunu ekleyelim" -
  // var olan (readOnly) bir grupta SADECE kurucu duzenleyebilir (bkz.
  // 0054_group_rename.sql - rename_group RPC'si zaten created_by disinda
  // sessizce hicbir sey degistirmiyor). Bu prop'un VARLIGI "duzenlenebilir"
  // demek - verilmisse isim/fotograf acilir, "Grubu Oluştur" ile AYNI ok
  // ikonu (CircleArrowDown, 180deg) degisiklik oldugunda (dirty) aktif olur.
  onSave?: () => void;
  dirty?: boolean;
  saving?: boolean;
  // Kullanici: "Üç noktaya basınca kurucu neler görmeli profesyonel bir
  // uygulamada ... Hepsini yapalım" - uc nokta menusu. myUserId: kendi
  // satirimda menu hic gosterilmez. canManageMembers: BEN (kurucu ya da
  // yonetici) Yönetici Yap/Gruptan Çıkar'i GOREBILIR miyim - gercek yetki
  // (kurucuyu hedefleme / yonetici-yoneticiye dokunamaz) yine de sunucuda
  // (0055_group_admin_management.sql RPC'leri) kontrol edilir, buradaki
  // sadece anlamsiz/olumsuz sonuclanacak satirlari ONCEDEN gizlemek icin.
  myUserId?: string;
  canManageMembers?: boolean;
  onOpenProfile?: (member: MenuMember) => void;
  onOpenDM?: (member: MenuMember) => void;
  onSetMemberAdmin?: (member: MenuMember, admin: boolean) => void;
  onRemoveMember?: (member: MenuMember) => void;
}

type Tab = "media" | "files" | "members";

/** Kullanici: "Kişi mesajı ekranında pp isim ve handlea basınca bir üye
 * bilgisi ekranı açılıyor ... Herşeyi birebir aynı yap yalnızca üye bilgisi
 * yerine grup bilgisi yazsın" - DmInfoScreen.tsx'in (GERCEK "Üye Bilgisi"
 * ekrani) header/profileBlock/actionsRow/tabsRow yapisinin NEREDEYSE
 * BIREBIR kopyasi (sadece Avatar->grup ikonu, isim->duzenlenebilir grup adi,
 * handle YOK). Aksiyon kareleri (Ara/Sessize Al/Sesli Arama/Engelle) ve
 * medya/dosya sekmeleri grup icin HENUZ islevsel degil (kullanici: "ben
 * geriye kalan özellikleri ekliyicem zaten") - su an SADECE "yakinda"
 * uyarisi gosteriyor, bkz. placeholder(). Uye listesi + "Grubu Oluştur"
 * butonu bu kopyanin ALTINA EKLENDI (Üye Bilgisi ekraninda zaten boyle bir
 * kavram yok - grubun kendine ozgu, EKSTRA ihtiyaci). */
export default function GroupInfoScreen({
  members,
  groupName,
  onChangeGroupName,
  groupAvatarUri,
  onChangeGroupAvatarUri,
  onBack,
  onCreate,
  readOnly = false,
  creatorId,
  onSave,
  dirty = false,
  saving = false,
  myUserId,
  canManageMembers = false,
  onOpenProfile,
  onOpenDM,
  onSetMemberAdmin,
  onRemoveMember,
}: Props) {
  const { t } = useTranslation();
  const [titleFontLoaded] = useFonts({ BebasNeue_400Regular });
  const [tab, setTab] = useState<Tab>("members");
  const [menuTarget, setMenuTarget] = useState<MenuMember | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const canCreate = !readOnly && groupName.trim().length > 0;
  const editable = !readOnly || !!onSave;
  const canSave = !!onSave && dirty && groupName.trim().length > 0 && !saving;

  function placeholder(label: string) {
    showAlert(label, t("profile.comingSoon"));
  }

  function confirmRemoveMember(member: MenuMember) {
    showAlert(t("friends.groupMemberRemoveConfirmTitle"), t("friends.groupMemberRemoveConfirmBody", { name: member.name }), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("friends.groupMemberRemove"), style: "destructive", onPress: () => onRemoveMember?.(member) },
    ]);
  }

  // UserProfileScreen.tsx'teki pickFromGallery ile AYNI akis (izin iste ->
  // kare [1,1] kirpma) - grup icin henuz sunucuya yukleme YOK (bkz. dosya
  // basindaki not), bu yuzden secilen uri dogrudan local state'e yaziliyor.
  async function pickGroupAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert(t("dm.permissionRequiredTitle"), t("dm.permissionRequiredBody"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    onChangeGroupAvatarUri(result.assets[0].uri);
  }

  const actions: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: <Search size={20} color={theme.text} />, label: t("dm.callAction"), onPress: () => placeholder(t("dm.callAction")) },
    { icon: <BellOff size={20} color={theme.text} />, label: t("dm.menuMute"), onPress: () => placeholder(t("dm.menuMute")) },
    { icon: <PhoneCall size={20} color={theme.text} />, label: t("friends.groupCallAction"), onPress: () => placeholder(t("friends.groupCallAction")) },
    { icon: <LogOut size={20} color={theme.danger} />, label: t("friends.leaveGroup"), onPress: () => placeholder(t("friends.leaveGroup")), danger: true },
  ];

  return (
    <View style={styles.screen}>
      <AppBackground />
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.backTouch}>
          <View style={{ transform: [{ rotate: "90deg" }] }}>
            <CircleArrowDown size={22} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, titleFontLoaded && styles.headerTitleFontLoaded]}>{t("friends.groupInfoTitle")}</Text>
        {readOnly && !onSave ? (
          <View style={styles.confirmTouch} />
        ) : (
          // Kullanici: "Grubu oluştur butonunu kaldırıp sağ üste sol
          // üstteki ikonun yukarı bakanını koysak onun yerine daha
          // mantıklı olur gibi" - geri okuyla (CircleArrowDown, rotate
          // 90deg = sola bakar) AYNI ikon, 180deg (yukari bakar),
          // "onayla/oluştur" olarak. readOnly'de ("onSave" verilmisse,
          // SADECE kurucu) AYNI ikon "kaydet" olarak - isim/pp
          // degistirilmeden (dirty=false) pasif durur.
          <TouchableOpacity
            onPress={() => {
              if (readOnly) {
                if (canSave) onSave?.();
              } else if (canCreate) {
                onCreate?.(groupName.trim());
              }
            }}
            hitSlop={10}
            style={styles.confirmTouch}
            disabled={readOnly ? !canSave : !canCreate}
          >
            <View style={{ transform: [{ rotate: "180deg" }], opacity: (readOnly ? canSave : canCreate) ? 1 : 0.35 }}>
              <CircleArrowDown size={22} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.profileBlock}>
          <TouchableOpacity onPress={pickGroupAvatar} activeOpacity={0.8} disabled={!editable}>
            {groupAvatarUri ? (
              <Avatar name={groupName || "?"} avatarUrl={groupAvatarUri} size={88} ring={false} />
            ) : groupName.trim() ? (
              <Avatar name={groupName} size={88} ring={false} />
            ) : (
              <View style={styles.groupIconWrap}>
                <UserGroup size={36} color="#FFFFFF" strokeWidth={1.8} />
              </View>
            )}
          </TouchableOpacity>
          <TextInput
            style={styles.nameInput}
            value={groupName}
            onChangeText={onChangeGroupName}
            placeholder={t("friends.groupNamePlaceholder")}
            placeholderTextColor={theme.textMuted}
            maxLength={60}
            textAlign="center"
            editable={editable}
          />
        </View>

        <View style={styles.actionsRow}>
          {actions.map((a) => (
            <TouchableOpacity key={a.label} style={styles.actionSquare} onPress={a.onPress}>
              {a.icon}
              <Text style={[styles.actionLabel, a.danger && styles.actionLabelDanger]} numberOfLines={1}>
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tabsRow}>
          {/* Kullanici: "Galeri ikonu yerine grup ikonunu alsak galeri
              ikonunu ataç ikonunun yerine ataç ikonunuda grup ikonunun
              yerine geçicek şekilde ayarlasan" - sira: Grup, Galeri, Ataç. */}
          <TouchableOpacity style={styles.tabIconButton} onPress={() => setTab("members")} hitSlop={6}>
            <UserGroup size={24} color={tab === "members" ? "#FFFFFF" : theme.textMuted} strokeWidth={1.8} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabIconButton} onPress={() => setTab("media")} hitSlop={6}>
            <ImageIcon size={27.5} color={tab === "media" ? "#FFFFFF" : theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabIconButton} onPress={() => setTab("files")} hitSlop={6}>
            <View style={{ marginTop: 2 }}>
              <Paperclip size={24} color={tab === "files" ? "#FFFFFF" : theme.textMuted} />
            </View>
          </TouchableOpacity>
        </View>
        <LinearGradient colors={[theme.accent, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tabsBottomBar} />

        {tab === "members" ? (
          <>
            {/* Kullanici: "2 üye yazısı sağa kaysa sağda olsa solda da üye
                ekleme kısmı olsa" - ayni satirda sola "Üye Ekle", saga uye
                sayisi. */}
            <View style={styles.memberHeaderRow}>
              {/* Kullanici: "Bi önceki ekrana dönüp ordan üye seçebilsek" -
                  bir onceki ekran (FriendsScreen'in secim/"Üye Seç" modu)
                  zaten "selected" state'ini KORUYOR (bkz. onBack ->
                  setGroupInfoVisible(false)), bu yuzden AYNI geri cagirma
                  burada da yeterli - secili uyeler kaybolmadan geri donulur,
                  daha fazla kisi secilip tekrar "İleri" ile buraya donulebilir. */}
              <TouchableOpacity
                style={styles.addMemberRow}
                onPress={readOnly ? () => placeholder(t("friends.addMember")) : onBack}
              >
                <UserPlus size={16} color="#FFFFFF" />
                <Text style={styles.addMemberText}>{t("friends.addMember")}</Text>
              </TouchableOpacity>
              <Text style={styles.memberCountLabel}>{t("friends.groupMemberCount", { count: members.length })}</Text>
            </View>
            {members.map((item) => {
              const isCreatorRow = item.userId === creatorId;
              return (
                <View key={item.userId} style={styles.row}>
                  <Avatar name={item.name} avatarUrl={item.avatarUrl} size={48} isFriend />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{item.name}</Text>
                    {!!item.handle && <Text style={styles.rowHandle}>@{item.handle}</Text>}
                  </View>
                  {!!creatorId && (
                    <Text style={styles.rowRole}>
                      {isCreatorRow
                        ? t("friends.groupRoleCreator")
                        : item.isAdmin
                        ? t("friends.groupRoleAdmin")
                        : t("friends.groupRoleMember")}
                    </Text>
                  )}
                  {!!creatorId && (
                    <TouchableOpacity
                      onPress={(e) => {
                        setMenuAnchor({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
                        setMenuTarget(item);
                      }}
                      hitSlop={10}
                      style={styles.rowMenuTouch}
                    >
                      <MoreVertical size={20} color={theme.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <Text style={styles.emptyText}>{tab === "media" ? t("dm.noMedia") : t("dm.tabFilesEmpty")}</Text>
        )}
      </ScrollView>

      <Modal visible={!!menuTarget} transparent animationType="fade" onRequestClose={() => setMenuTarget(null)} statusBarTranslucent>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuTarget(null)}>
          {menuTarget &&
            (() => {
              const target = menuTarget;
              const isMe = !!myUserId && target.userId === myUserId;
              const targetIsCreator = target.userId === creatorId;
              // Yoneticiler birbirine dokunamaz - SADECE kurucu baska bir
              // yoneticiyi yonetimden alabilir/cikarabilir (bkz. 0055_
              // group_admin_management.sql - sunucu AYNI kurali uygular).
              // Kendi satirimda (isMe) zaten canManageMembers/targetIsCreator
              // hesaplamasi dogal olarak bu satiri disliyor (bkz. kurucu/
              // yonetici kendi uzerinde hicbir zaman "yetkili" degil).
              const canModerateTarget = canManageMembers && !targetIsCreator && (!target.isAdmin || myUserId === creatorId);
              const rows: { key: string; label: string; danger?: boolean; onPress: () => void }[] = [];
              if (onOpenProfile) {
                rows.push({
                  key: "profile",
                  label: t("friends.groupMemberViewProfile"),
                  onPress: () => {
                    setMenuTarget(null);
                    onOpenProfile(target);
                  },
                });
              }
              if (onOpenDM && !isMe) {
                rows.push({
                  key: "message",
                  label: t("friends.groupMemberMessage"),
                  onPress: () => {
                    setMenuTarget(null);
                    onOpenDM(target);
                  },
                });
              }
              if (canModerateTarget && onSetMemberAdmin) {
                rows.push({
                  key: "admin",
                  label: target.isAdmin ? t("friends.groupMemberRemoveAdmin") : t("friends.groupMemberMakeAdmin"),
                  onPress: () => {
                    setMenuTarget(null);
                    onSetMemberAdmin(target, !target.isAdmin);
                  },
                });
              }
              if (canModerateTarget && onRemoveMember) {
                rows.push({
                  key: "remove",
                  label: t("friends.groupMemberRemove"),
                  danger: true,
                  onPress: () => {
                    setMenuTarget(null);
                    confirmRemoveMember(target);
                  },
                });
              }
              if (!rows.length) return null;
              return (
                <View style={[styles.menuCard, menuAnchor && { top: menuAnchor.y + 8 }]}>
                  {rows.map((row) => (
                    <TouchableOpacity key={row.key} style={styles.menuRow} onPress={row.onPress}>
                      <Text style={[styles.menuRowText, row.danger && styles.menuRowTextDanger]}>{row.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // header/backTouch/headerTitle*/headerSpacer/profileBlock/actionsRow/
  // actionSquare/actionLabel*/tabsRow/tabIconButton/tabsBottomBar/emptyText -
  // DmInfoScreen.tsx'teki (GERCEK "Üye Bilgisi" ekrani) ile BIREBIR AYNI
  // degerler (kullanicinin istegi).
  screen: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 50,
    paddingBottom: 14,
  },
  backTouch: { width: 36, height: 36, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", color: theme.text, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  headerTitleFontLoaded: { fontFamily: "BebasNeue_400Regular", fontWeight: "400", fontSize: 22, letterSpacing: 1.4 },
  confirmTouch: { width: 36, height: 36, justifyContent: "center", alignItems: "flex-end" },
  scrollContent: { paddingBottom: 100 },
  profileBlock: { alignItems: "center", paddingVertical: 20, gap: 6 },
  groupIconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: "#14303F", alignItems: "center", justifyContent: "center" },
  nameInput: {
    width: 220,
    textAlign: "center",
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actionsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 18, marginBottom: 18 },
  actionSquare: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: "#15202B",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  actionLabel: { color: theme.text, fontSize: 10, fontWeight: "600" },
  actionLabelDanger: { color: theme.danger },
  tabsRow: { flexDirection: "row", marginHorizontal: 18 },
  tabIconButton: { flex: 1, alignItems: "center", paddingTop: 0, paddingBottom: 12 },
  tabsBottomBar: { height: 1 },
  emptyText: { color: theme.textMuted, fontSize: 13, textAlign: "center", marginTop: 30 },
  // Asagisi - Üye Bilgisi ekraninda KARSILIGI olmayan, grubun kendine ozgu
  // EK kismi (uye listesi + olustur butonu).
  memberHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 30,
    paddingBottom: 10,
  },
  addMemberRow: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 7 },
  addMemberText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  memberCountLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginRight: 7,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 18 },
  rowText: { flex: 1 },
  rowName: { color: theme.text, fontSize: 14, fontWeight: "700" },
  rowHandle: { color: theme.textMuted, fontSize: 12, fontWeight: "500", lineHeight: 16, marginTop: 2 },
  rowRole: { color: theme.textMuted, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  rowMenuTouch: { paddingLeft: 10 },
  // Uye satirindaki uc noktanin actigi kucuk menu - GroupChatScreen.tsx/
  // DMScreen.tsx'teki ust-sag "menuCard" dropdown'uyla AYNI kompakt
  // gorunum, ama sabit degil: basilan satirin tam hizasinda (menuAnchor.y)
  // acilsin diye dinamik "top" ile konumlanir (kullanici: "küçük kutu
  // açılsın bu büyük kutu değil").
  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  menuCard: {
    position: "absolute",
    right: 16,
    backgroundColor: "#15202B",
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 170,
  },
  menuRow: { paddingHorizontal: 16, paddingVertical: 12 },
  menuRowText: { color: theme.text, fontSize: 14, fontWeight: "600" },
  menuRowTextDanger: { color: theme.danger },
});
