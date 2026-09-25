import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, Alert, TextInput } from "react-native";
import { supabase } from "../services/supabase";
import { getSocket } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";

interface Props {
  onBack: () => void;
  onOpenUserProfile: () => void;
  onOpenFriends: () => void;
}

const APP_VERSION = "1.0.0 (1)";

/** Rave'in gercek profil/ayarlar ekraninin birebir kopyasi (bkz. kullanicinin
 * gonderdigi ekran goruntuleri) - sadece marka "LUNA" olarak degistirildi.
 * Sosyal hesaplar/versiyon numarasi gibi Rave'e ozel kisimlar YER TUTUCU
 * (gercek hesaplarimiz yok) - kullanicinin acik istegiyle boyle birebir
 * kopyalandi. */
export default function ProfileScreen({ onBack, onOpenUserProfile, onOpenFriends }: Props) {
  const [name, setName] = useState("Kullanici");
  const [editingName, setEditingName] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  const [quickReaction, setQuickReaction] = useState("❤️");
  const [premium, setPremium] = useState(true);
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
      const mail = data.user?.email;
      if (mail) {
        setEmail(mail);
        setName(mail.split("@")[0]);
      }
    });
  }, []);

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
    Alert.alert(label, "Bu ozellik yakinda eklenecek.");
  }

  function handleSignOut() {
    Alert.alert("Cikis yap", "Hesabindan cikmak istedigine emin misin?", [
      { text: "Iptal", style: "cancel" },
      { text: "Cikis yap", style: "destructive", onPress: () => supabase.auth.signOut() },
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert("Hesabi Sil", "Bu islem geri alinamaz. Devam etmek istedigine emin misin?", [
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
            <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.nameRow}>
          {editingName ? (
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              autoFocus
              onBlur={() => setEditingName(false)}
              onSubmitEditing={() => setEditingName(false)}
            />
          ) : (
            <Text style={styles.name}>{name.toUpperCase()}</Text>
          )}
          <TouchableOpacity onPress={() => setEditingName(true)} hitSlop={10}>
            <Icon name="edit" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>
        <Text style={styles.handle}>@hickimse</Text>

        <SectionHeader title="Baglanan hesaplar" />
        <TouchableOpacity style={styles.accountRow} onPress={() => placeholder("Google")}>
          <Text style={styles.accountLabel}>Google</Text>
          <View style={styles.accountValue}>
            <View style={styles.checkBadge}>
              <Text style={styles.checkBadgeText}>✓</Text>
            </View>
            <Text style={styles.accountValueText} numberOfLines={1}>
              {email || "Baglanmadi"} olarak gi...
            </Text>
          </View>
        </TouchableOpacity>

        <SectionHeader title="Ayarlar" />
        <ToggleRow
          title="Hizli Tepki"
          subtitle="Sohbet mesajlarina cift tiklama tepkinizi degistirin"
          onPress={() => placeholder("Hizli Tepki")}
          rightElement={<Text style={styles.emoji}>{quickReaction}</Text>}
        />
        <ToggleRow
          title="LUNA Premium"
          subtitle="LUNA'yi gelistirmemize ve yeni ozellikler eklememize yardim edin!"
          checked={premium}
          onToggle={() => setPremium((v) => !v)}
        />
        <ToggleRow
          title="Davetleri Kisitla"
          subtitle="Sadece arkadaslardan gelen davetlere izin ver"
          checked={restrictInvites}
          onToggle={() => setRestrictInvites((v) => !v)}
        />
        <ToggleRow
          title="Yetiskin Icerigini Gizle"
          subtitle="Mustehcen icerik gosterme"
          checked={hideAdult}
          onToggle={() => setHideAdult((v) => !v)}
        />
        <ToggleRow
          title="Dokunsal geri bildirim"
          subtitle="Dokunuslarda ve islemlerde titret"
          checked={haptics}
          onToggle={() => setHaptics((v) => !v)}
        />
        <ToggleRow
          title="Yuzen Video Oynaticisi"
          subtitle="Videolarin uygulama disinda oynatilmasina izin ver"
          checked={floatingPlayer}
          onToggle={() => setFloatingPlayer((v) => !v)}
        />
        <ToggleRow
          title="Chat mesajlarini otomatik cevir"
          subtitle="Dilinizle eslesmeyen chat mesajlarini otomatik olarak cevir"
          checked={autoTranslate}
          onToggle={() => setAutoTranslate((v) => !v)}
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
        <TouchableOpacity style={styles.simpleRow} onPress={() => placeholder("LUNA'yi Degerlendir")}>
          <Text style={styles.simpleTitle}>LUNA'yi Degerlendir</Text>
          <Text style={styles.simpleSubtitle}>
            LUNA'yi begendin mi? Kisa bir degerlendirme cok yardimci olur. Tesekkurler!
          </Text>
        </TouchableOpacity>

        <SectionHeader title="Yardim" />
        <TouchableOpacity style={styles.simpleRow} onPress={() => placeholder("Bize ulasin")}>
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
}: {
  title: string;
  subtitle?: string;
  checked?: boolean;
  onToggle?: () => void;
  onPress?: () => void;
  rightElement?: React.ReactNode;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress || onToggle} activeOpacity={0.7}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {rightElement ? (
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
    <TouchableOpacity style={styles.row} onPress={onPress}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Icon name="chevronRight" size={20} color="rgba(255,255,255,0.6)" />
    </TouchableOpacity>
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
  headerLogo: { width: 40, height: 40 },
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
  },
  avatarInitial: { color: "#FFFFFF", fontSize: 56, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18 },
  name: { color: "#FFFFFF", fontSize: 24, fontWeight: "700", letterSpacing: 0.5 },
  nameInput: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.4)",
    minWidth: 120,
    textAlign: "center",
  },
  handle: { color: "rgba(255,255,255,0.6)", fontSize: 14, textAlign: "center", marginTop: 4 },
  sectionHeader: { backgroundColor: "rgba(0,0,0,0.25)", paddingHorizontal: 18, paddingVertical: 12, marginTop: 20 },
  sectionHeaderText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  accountLabel: { color: "#FFFFFF", fontSize: 15 },
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
  accountValueText: { color: "rgba(255,255,255,0.85)", fontSize: 13, flexShrink: 1 },
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
  rowTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  rowSubtitle: { color: "rgba(255,255,255,0.6)", fontSize: 12.5, marginTop: 3, lineHeight: 17 },
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
  simpleRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  simpleTitle: { color: "#FFFFFF", fontSize: 15.5 },
  simpleSubtitle: { color: "rgba(255,255,255,0.6)", fontSize: 12.5, marginTop: 3, lineHeight: 17 },
  dangerText: { color: "#FF8A8A" },
  versionText: { color: "rgba(255,255,255,0.4)", fontSize: 13, paddingHorizontal: 18, paddingVertical: 10 },
  signOutButton: { marginHorizontal: 18, marginTop: 24, backgroundColor: "rgba(255,77,79,0.15)", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,77,79,0.4)" },
  signOutText: { color: "#FF8A8A", fontSize: 16, fontWeight: "700" },
});
