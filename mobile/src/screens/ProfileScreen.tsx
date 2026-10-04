import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, Linking } from "react-native";
import * as StoreReview from "expo-store-review";
import { supabase } from "../services/supabase";
import { getSocket } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import EmojiPickerSheet from "../components/EmojiPickerSheet";
import { showAlert } from "../components/CustomAlert";
import { isHapticsEnabled, setHapticsEnabled, triggerHaptic } from "../utils/haptics";

const SUPPORT_EMAIL = "destek@luna.app";
const PREMIUM_SUBTITLE = "REKLAMSIZ BİR LUNA İÇİN...";

interface Props {
  onBack: () => void;
  onOpenUserProfile: () => void;
  onOpenFriends: () => void;
  onOpenPremium: () => void;
}

const APP_VERSION = "1.0.0 (1)";

/** Rave'in gercek profil/ayarlar ekraninin birebir kopyasi (bkz. kullanicinin
 * gonderdigi ekran goruntuleri) - sadece marka "LUNA" olarak degistirildi.
 * Isim/kullanici adi/avatar artik UserProfileScreen ile AYNI gercek
 * profiles satirindan okunuyor ve degisiklikler oraya da yansiyor (eskiden
 * isim SADECE burada yerel state'ti, kaydedilmiyordu). */
export default function ProfileScreen({ onBack, onOpenUserProfile, onOpenFriends, onOpenPremium }: Props) {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [name, setName] = useState("Kullanici");
  const [handle, setHandle] = useState("kullanici");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [googleLinked, setGoogleLinked] = useState(false);

  const [quickReaction, setQuickReaction] = useState("❤️");
  const [emojiSheetVisible, setEmojiSheetVisible] = useState(false);
  const [restrictInvites, setRestrictInvites] = useState(false);
  const [hideAdult, setHideAdult] = useState(true);
  const [haptics, setHaptics] = useState(false);
  const [floatingPlayer, setFloatingPlayer] = useState(true);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [muteOnOtherAudio, setMuteOnOtherAudio] = useState(false);
  const [hideLocation, setHideLocation] = useState(true);
  const [incomingCount, setIncomingCount] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      setMyUserId(userId);
      setEmail(data.user?.email || null);
      // Gercek Google hesap baglantisi - Supabase auth.users.identities
      // dizisinde "google" saglayicisi varsa KULLANICI GERCEKTEN Google ile
      // giris yapmis/baglamis demektir (eskiden bu rozet HER ZAMAN sahte
      // bir yesil tikle "bagli" gosteriliyordu).
      setGoogleLinked((data.user?.identities || []).some((i: any) => i.provider === "google"));
      supabase
        .from("profiles")
        .select("name,handle,avatar_url,default_auto_translate,default_reaction_emoji")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (!profile) return;
          if (profile.name) setName(profile.name);
          if (profile.handle) setHandle(profile.handle);
          if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
          setAutoTranslate(profile.default_auto_translate === true);
          if (profile.default_reaction_emoji) setQuickReaction(profile.default_reaction_emoji);
        });
    });
  }, []);

  // Cihaz bazli bir tercih oldugu icin profiles'ta degil, AsyncStorage'da
  // tutuluyor (bkz. src/utils/haptics.ts) - acikken Ayarlar ekranindaki
  // dokunma/geçis islemlerinde GERCEKTEN titresim tetikler.
  useEffect(() => {
    isHapticsEnabled().then(setHaptics);
  }, []);

  function applyHaptics(next: boolean) {
    setHaptics(next);
    setHapticsEnabled(next);
    if (next) triggerHaptic();
  }

  async function handleRateApp() {
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
      } else {
        showAlert("LUNA'yı Değerlendir", "Değerlendirme şu anda bu cihazda kullanılamıyor.");
      }
    } catch {
      showAlert("LUNA'yı Değerlendir", "Değerlendirme açılamadı.");
    }
  }

  function handleContactUs() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("LUNA Destek")}`).catch(() => {
      showAlert("Bize ulaşın", `${SUPPORT_EMAIL} adresine e-posta gönderemedik. Posta uygulamanızı kontrol edin.`);
    });
  }

  // Yeni actigin HER odanin "Chat Otomatik Cevir" baslangic degeri - sadece
  // bir varsayilan, host odanin icinde RoomSettingsSheet'ten yine
  // degistirebilir (bkz. server/src/index.ts room:create / rooms.ts
  // createRoom).
  function toggleAutoTranslateDefault() {
    if (!myUserId) return;
    setAutoTranslate((v) => {
      const next = !v;
      supabase.from("profiles").update({ default_auto_translate: next }).eq("id", myUserId);
      return next;
    });
  }

  // Oda sohbetinde/dm'de bir mesaja CIFT TIKLAYINCA gonderilecek emoji -
  // bkz. RoomScreen.tsx/DMScreen.tsx cift-tik tepki ozelligi.
  function selectQuickReaction(emoji: string) {
    setQuickReaction(emoji);
    setEmojiSheetVisible(false);
    if (myUserId) supabase.from("profiles").update({ default_reaction_emoji: emoji }).eq("id", myUserId);
  }

  useEffect(() => {
    const socket = getSocket();
    function refreshIncoming() {
      socket.emit("friends:list", {}, (res: any) => {
        if (res?.ok) setIncomingCount(res.incoming.length);
      });
    }
    refreshIncoming();
    socket.on("friend:incoming", refreshIncoming);
    socket.on("friend:cancelled", refreshIncoming);
    return () => {
      socket.off("friend:incoming", refreshIncoming);
      socket.off("friend:cancelled", refreshIncoming);
    };
  }, []);

  function placeholder(label: string) {
    showAlert(label, "Bu ozellik yakinda eklenecek.");
  }

  function handleSignOut() {
    showAlert("Cikis yap", "Hesabindan cikmak istedigine emin misin?", [
      { text: "Iptal", style: "cancel" },
      { text: "Cikis yap", style: "destructive", onPress: () => supabase.auth.signOut() },
    ]);
  }

  function handleDeleteAccount() {
    showAlert("Hesabi Sil", "Bu islem geri alinamaz. Devam etmek istedigine emin misin?", [
      { text: "Iptal", style: "cancel" },
      { text: "Hesabi Sil", style: "destructive", onPress: () => placeholder("Hesabi Sil") },
    ]);
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={10}>
            <Icon name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
          <Image source={require("../../assets/lavin-icon-mark.png")} style={styles.headerLogo} resizeMode="contain" />
          <TouchableOpacity onPress={onOpenFriends} hitSlop={10} style={styles.friendsButton}>
            <Icon name="people" size={26} color="#FFFFFF" />
            {incomingCount > 0 && (
              <View style={styles.friendsBadge}>
                <Text style={styles.friendsBadgeText}>{incomingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.avatarWrap} onPress={onOpenUserProfile} activeOpacity={0.8}>
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
            )}
          </View>
        </TouchableOpacity>

        <Text style={styles.name}>{name.toUpperCase()}</Text>
        <Text style={styles.handle}>@{handle}</Text>

        <SectionHeader title="Baglanan hesaplar" />
        <TouchableOpacity
          style={styles.accountRow}
          onPress={() => (googleLinked ? undefined : placeholder("Google ile bağlama"))}
        >
          <Text style={styles.accountLabel}>Google</Text>
          <View style={styles.accountValue}>
            {googleLinked ? (
              <>
                <View style={styles.checkBadge}>
                  <Text style={styles.checkBadgeText}>✓</Text>
                </View>
                <Text style={styles.accountValueText} numberOfLines={1}>
                  {email} olarak bağlı
                </Text>
              </>
            ) : (
              <Text style={styles.accountValueText}>Bağlanmadı</Text>
            )}
          </View>
        </TouchableOpacity>

        <SectionHeader title="Ayarlar" />
        <ToggleRow title="LUNA Premium" subtitle={PREMIUM_SUBTITLE} onPress={onOpenPremium} hideIndicator />
        <ToggleRow
          title="Hizli Tepki"
          subtitle="Sohbet mesajlarina cift tiklama tepkinizi degistirin"
          onPress={() => setEmojiSheetVisible(true)}
          rightElement={<Text style={styles.emoji}>{quickReaction}</Text>}
        />
        <ToggleRow
          title="Davetleri Kisitla"
          subtitle="Sadece arkadaslardan gelen davetlere izin ver"
          rightElement={<SegmentedToggle value={restrictInvites} onChange={setRestrictInvites} />}
        />
        <ToggleRow
          title="Yetiskin Icerigini Gizle"
          subtitle="Mustehcen icerik gosterme"
          rightElement={<SegmentedToggle value={hideAdult} onChange={setHideAdult} />}
        />
        <ToggleRow
          title="Dokunsal geri bildirim"
          subtitle="Dokunuslarda ve islemlerde titret"
          rightElement={<SegmentedToggle value={haptics} onChange={applyHaptics} />}
        />
        <ToggleRow
          title="Yuzen Video Oynaticisi"
          subtitle="Videolarin uygulama disinda oynatilmasina izin ver"
          checked={floatingPlayer}
          onToggle={() => setFloatingPlayer((v) => !v)}
        />
        <ToggleRow
          title="Chat mesajlarini otomatik cevir"
          subtitle="Yeni acacagin odalarda bu ayar varsayilan olarak boyle baslar (oda icinde yine degistirebilirsin)"
          checked={autoTranslate}
          onToggle={toggleAutoTranslateDefault}
        />
        <ToggleRow
          title="Baska Ses Calarken Sessize Al"
          subtitle="Baska bir uygulama ses calarken LUNA'nin sesini kisar, ancak cihaziniz aramalar sirasinda LUNA'yi otomatik olarak sessize alabilir"
          checked={muteOnOtherAudio}
          onToggle={() => setMuteOnOtherAudio((v) => !v)}
        />
        <ToggleRow
          title="Konumu Gizle"
          subtitle="Haritada gozukmeyeceksiniz"
          checked={hideLocation}
          onToggle={() => setHideLocation((v) => !v)}
        />
        <ChevronRow title="Dil" subtitle="Cihaz dili (Turkce)" onPress={() => placeholder("Dil")} />
        <ChevronRow title="Gizlilik" onPress={() => placeholder("Gizlilik")} />

        <SectionHeader title="Geri Bildirim" />
        <TouchableOpacity style={styles.simpleRow} onPress={handleRateApp}>
          <Text style={styles.simpleTitle}>LUNA'yi Degerlendir</Text>
          <Text style={styles.simpleSubtitle}>
            LUNA'yi begendin mi? Kisa bir degerlendirme cok yardimci olur. Tesekkurler!
          </Text>
        </TouchableOpacity>

        <SectionHeader title="Yardim" />
        <TouchableOpacity style={styles.simpleRow} onPress={handleContactUs}>
          <Text style={styles.simpleTitle}>Bize ulasin</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.simpleRow} onPress={() => placeholder("Tanilamayi calistir")}>
          <Text style={styles.simpleTitle}>Tanilamayi calistir</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.simpleRow} onPress={() => placeholder("Arka plan")}>
          <Text style={styles.simpleTitle}>LUNA arka planda durduruluyor mu?</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>{APP_VERSION}</Text>
        <TouchableOpacity style={styles.simpleRow} onPress={handleDeleteAccount}>
          <Text style={[styles.simpleTitle, styles.dangerText]}>Hesabi Sil</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Cikis yap</Text>
        </TouchableOpacity>
      </ScrollView>

      <EmojiPickerSheet
        visible={emojiSheetVisible}
        selected={quickReaction}
        onSelect={selectQuickReaction}
        onClose={() => setEmojiSheetVisible(false)}
      />
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

function ToggleRow({
  title,
  subtitle,
  checked,
  onToggle,
  onPress,
  rightElement,
  hideIndicator,
}: {
  title: string;
  subtitle?: string;
  checked?: boolean;
  onToggle?: () => void;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  hideIndicator?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => {
        triggerHaptic();
        (onPress || onToggle)?.();
      }}
      activeOpacity={0.7}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {hideIndicator ? null : rightElement ? (
        rightElement
      ) : (
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
}

function ChevronRow({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => {
        triggerHaptic();
        onPress();
      }}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Icon name="chevronRight" size={20} color="rgba(255,255,255,0.6)" />
    </TouchableOpacity>
  );
}

/** Checkbox yerine "Açık/Kapalı" yazili iki segmentli secici - ToggleRow'un
 * rightElement'i olarak kullaniliyor. Satirin ic ice gecen dokunulabilir
 * alani oldugu icin dis satirin onPress'i tetiklenmeyebiliyor - titresim
 * burada ayrica cagiriliyor. */
function SegmentedToggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  function choose(next: boolean) {
    triggerHaptic();
    onChange(next);
  }
  return (
    <View style={styles.segmented}>
      <TouchableOpacity style={[styles.segmentOption, !value && styles.segmentOptionActive]} onPress={() => choose(false)}>
        <Text style={[styles.segmentText, !value && styles.segmentTextActive]}>Kapalı</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.segmentOption, value && styles.segmentOptionActive]} onPress={() => choose(true)}>
        <Text style={[styles.segmentText, value && styles.segmentTextActive]}>Açık</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  scrollContent: { paddingBottom: 60 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 50,
    paddingBottom: 10,
  },
  // lavin-icon-mark.png'nin gorsel agirlik merkezi (yildiz susleme + "LUNA"
  // yazisi) kutunun geometrik ortasinin ~6px altinda - ikonlarla ayni
  // hizaya gelmesi icin bu kadar yukari kaydiriyoruz (piksel analiziyle
  // olculdu, tahmini degil).
  headerLogo: { width: 74, height: 34, marginTop: -6, tintColor: "#FFFFFF" },
  friendsButton: { position: "relative" },
  friendsBadge: {
    position: "absolute",
    top: -4,
    right: -6,
    backgroundColor: theme.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  friendsBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
  avatarWrap: { alignItems: "center", marginTop: 24 },
  avatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitial: { color: "#FFFFFF", fontSize: 56, fontWeight: "700" },
  name: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: 0.3, textAlign: "center", marginTop: 18 },
  handle: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "600", letterSpacing: 0.2, textAlign: "center", marginTop: 4, marginBottom: 18 },
  sectionHeader: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#1C1C1C",
  },
  sectionHeaderText: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  accountLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  accountValue: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  checkBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  checkBadgeText: { color: "#1a2a6c", fontSize: 12, fontWeight: "700" },
  accountValueText: { color: "rgba(255,255,255,0.6)", fontSize: 12.5, fontWeight: "500", flexShrink: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  rowText: { flex: 1 },
  rowTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  rowSubtitle: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500", marginTop: 3, lineHeight: 16 },
  emoji: { fontSize: 24 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: { backgroundColor: "#D4C9F5", borderColor: "#D4C9F5" },
  checkboxMark: { color: "#3a2140", fontSize: 15, fontWeight: "700" },
  segmented: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 2 },
  segmentOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  segmentOptionActive: { backgroundColor: "#0EA5E9" },
  segmentText: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" },
  segmentTextActive: { color: "#04140D", fontWeight: "800" },
  simpleRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  simpleTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  simpleSubtitle: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500", marginTop: 3, lineHeight: 16 },
  dangerText: { color: "#FF8A8A" },
  versionText: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "500", paddingHorizontal: 18, paddingVertical: 10 },
  signOutButton: { marginHorizontal: 18, marginTop: 24, backgroundColor: "rgba(255,77,79,0.15)", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,77,79,0.4)" },
  signOutText: { color: "#FF8A8A", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
});
