import React, { useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, ScrollView, Linking, Modal, ActivityIndicator } from "react-native";
import * as StoreReview from "expo-store-review";
import { useTranslation } from "react-i18next";
import { supabase } from "../services/supabase";
import { getSocket, SERVER_URL } from "../services/socket";
import { theme } from "../theme";
import Icon from "../components/Icon";
import EmojiPickerSheet from "../components/EmojiPickerSheet";
import { showAlert } from "../components/CustomAlert";
import { isHapticsEnabled, setHapticsEnabled, triggerHaptic } from "../utils/haptics";
import { isMuteOnOtherAudioEnabled, setMuteOnOtherAudioEnabled } from "../utils/audioSettings";
import { isHideLocationEnabled, setHideLocationEnabled } from "../utils/locationSettings";
import { LANGUAGES, setAppLanguage, LanguageCode } from "../i18n";

const SUPPORT_EMAIL = "destek@luna.app";

type InviteRestriction = "everyone" | "friends" | "none";

interface Props {
  onBack: () => void;
  onOpenUserProfile: () => void;
  onOpenFriends: () => void;
  onOpenPremium: () => void;
  onOpenPrivacy: () => void;
  onOpenBackgroundInfo: () => void;
}

type DiagnosticStatus = "pending" | "ok" | "fail";
interface DiagnosticResult {
  label: string;
  status: DiagnosticStatus;
  detail?: string;
}

const APP_VERSION = "1.0.0 (1)";

/** Rave'in gercek profil/ayarlar ekraninin birebir kopyasi (bkz. kullanicinin
 * gonderdigi ekran goruntuleri) - sadece marka "LUNA" olarak degistirildi.
 * Isim/kullanici adi/avatar artik UserProfileScreen ile AYNI gercek
 * profiles satirindan okunuyor ve degisiklikler oraya da yansiyor (eskiden
 * isim SADECE burada yerel state'ti, kaydedilmiyordu). */
export default function ProfileScreen({
  onBack,
  onOpenUserProfile,
  onOpenFriends,
  onOpenPremium,
  onOpenPrivacy,
  onOpenBackgroundInfo,
}: Props) {
  const { t, i18n } = useTranslation();
  const INVITE_OPTIONS: { key: InviteRestriction; label: string }[] = [
    { key: "everyone", label: t("profile.inviteEveryone") },
    { key: "friends", label: t("profile.inviteFriends") },
    { key: "none", label: t("profile.inviteNone") },
  ];
  const ADULT_CONTENT_OPTIONS = [
    { key: "hidden", label: t("profile.adultHidden") },
    { key: "shown", label: t("profile.adultShown") },
  ];
  const ON_OFF_OPTIONS = [
    { key: "on", label: t("common.open") },
    { key: "off", label: t("common.closed") },
  ];
  const currentLanguageLabel = LANGUAGES.find((l) => l.code === i18n.language)?.label ?? LANGUAGES[0].label;
  const [languageSheetVisible, setLanguageSheetVisible] = useState(false);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [name, setName] = useState("Kullanici");
  const [handle, setHandle] = useState("kullanici");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [googleLinked, setGoogleLinked] = useState(false);

  const [quickReaction, setQuickReaction] = useState("❤️");
  const [emojiSheetVisible, setEmojiSheetVisible] = useState(false);
  const [inviteRestriction, setInviteRestriction] = useState<InviteRestriction>("everyone");
  const [hideAdult, setHideAdult] = useState(false);
  const [haptics, setHaptics] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [muteOnOtherAudio, setMuteOnOtherAudio] = useState(false);
  const [hideLocation, setHideLocation] = useState(true);
  const [incomingCount, setIncomingCount] = useState(0);
  const [diagnosticsVisible, setDiagnosticsVisible] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);

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
        .select("name,handle,avatar_url,default_auto_translate,default_reaction_emoji,invite_restriction,hide_adult_content")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (!profile) return;
          if (profile.name) setName(profile.name);
          if (profile.handle) setHandle(profile.handle);
          if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
          setAutoTranslate(profile.default_auto_translate === true);
          if (profile.default_reaction_emoji) setQuickReaction(profile.default_reaction_emoji);
          if (profile.invite_restriction) setInviteRestriction(profile.invite_restriction as InviteRestriction);
          setHideAdult(profile.hide_adult_content === true);
        });
    });
  }, []);

  // Cihaz bazli bir tercih oldugu icin profiles'ta degil, AsyncStorage'da
  // tutuluyor (bkz. src/utils/haptics.ts) - acikken Ayarlar ekranindaki
  // dokunma/geçis islemlerinde GERCEKTEN titresim tetikler.
  useEffect(() => {
    isHapticsEnabled().then(setHaptics);
    isMuteOnOtherAudioEnabled().then(setMuteOnOtherAudio);
    isHideLocationEnabled().then(setHideLocation);
  }, []);

  function applyHaptics(next: boolean) {
    setHaptics(next);
    setHapticsEnabled(next);
    if (next) triggerHaptic();
  }

  // "Baska Ses Calarken Sessize Al" - cihaz bazli, HlsPlayer'in audioMixingMode
  // ayarini gercekten degistirir (bkz. src/utils/audioSettings.ts).
  function applyMuteOnOtherAudio(next: boolean) {
    setMuteOnOtherAudio(next);
    setMuteOnOtherAudioEnabled(next);
  }

  // "Konumu Gizle" artik GERCEK: acikken (varsayilan) RoomScreen'deki oda
  // haritasi GPS konumunu hic istemez/gondermez (bkz. src/utils/locationSettings.ts).
  function applyHideLocation(next: boolean) {
    setHideLocation(next);
    setHideLocationEnabled(next);
  }

  // "Davetleri Kisitla" artik GERCEK: sunucuda send_friend_request/send_dm
  // RPC'leri (bkz. migration 0013) bu degere gore yeni arkadaslik
  // isteklerini ve/veya DM'leri reddediyor.
  function applyInviteRestriction(next: InviteRestriction) {
    setInviteRestriction(next);
    if (myUserId) supabase.from("profiles").update({ invite_restriction: next }).eq("id", myUserId);
  }

  // "Yetiskin Icerigini Gizle" artik GERCEK: sunucuya (soket uzerinden,
  // DOGRUDAN supabase degil) bildiriyoruz ki Discover listesini ANINDA
  // kisisellestirsin (bkz. server/src/index.ts profile:hideAdultContent).
  function applyHideAdultContent(next: boolean) {
    setHideAdult(next);
    getSocket().emit("profile:hideAdultContent", { enabled: next }, () => {});
  }

  async function handleRateApp() {
    try {
      if (await StoreReview.hasAction()) {
        await StoreReview.requestReview();
      } else {
        showAlert(t("profile.rateTitle"), t("profile.rateUnavailable"));
      }
    } catch {
      showAlert(t("profile.rateTitle"), t("profile.rateFailed"));
    }
  }

  function handleContactUs() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("LUNA Destek")}`).catch(() => {
      showAlert(t("profile.contactTitle"), t("profile.contactEmailFailed", { email: SUPPORT_EMAIL }));
    });
  }

  // "Tanilamayi calistir" artik GERCEK kontroller yapiyor: sunucuya HTTP ile
  // ulasilabiliyor mu, soket gercek zamanli baglantisi acik mi, Supabase'e
  // gercek bir sorguyla ulasilabiliyor mu ve oturum durumu ne. Bu ortamda
  // (sandbox) agin disari kapali olmasi sebebiyle bazilari basarisiz
  // cikabilir - bu GERCEK sonuc, sahte bir "hep basarili" degil.
  async function runDiagnostics() {
    triggerHaptic();
    const labels = [
      t("profile.diagnosticsServer"),
      t("profile.diagnosticsRealtime"),
      t("profile.diagnosticsSupabase"),
      t("profile.diagnosticsSession"),
    ];
    setDiagnostics(labels.map((label) => ({ label, status: "pending" })));
    setDiagnosticsVisible(true);

    function update(index: number, status: DiagnosticStatus, detail?: string) {
      setDiagnostics((prev) => prev.map((r, i) => (i === index ? { ...r, status, detail } : r)));
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${SERVER_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const json = await res.json();
      update(0, res.ok && json?.ok ? "ok" : "fail");
    } catch {
      update(0, "fail");
    }

    update(1, getSocket().connected ? "ok" : "fail");

    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000));
      const { error } = await Promise.race([supabase.from("profiles").select("id").limit(1), timeout]);
      update(2, error ? "fail" : "ok");
    } catch {
      update(2, "fail");
    }

    update(3, "ok", myUserId ? t("profile.diagnosticsLoggedIn") : t("profile.diagnosticsGuest"));
  }

  // Yeni actigin HER odanin "Chat Otomatik Cevir" baslangic degeri - sadece
  // bir varsayilan, host odanin icinde RoomSettingsSheet'ten yine
  // degistirebilir (bkz. server/src/index.ts room:create / rooms.ts
  // createRoom).
  function applyAutoTranslate(next: boolean) {
    setAutoTranslate(next);
    if (myUserId) supabase.from("profiles").update({ default_auto_translate: next }).eq("id", myUserId);
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
    showAlert(label, t("profile.comingSoon"));
  }

  function handleSignOut() {
    showAlert(t("profile.signOutTitle"), t("profile.signOutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("profile.signOutTitle"), style: "destructive", onPress: () => supabase.auth.signOut() },
    ]);
  }

  // GERCEK ve GERI ALINAMAZ hesap silme - sunucudaki delete_own_account()
  // RPC'sini (bkz. migration 0012) cagirir, auth.users satiri silinince
  // ON DELETE CASCADE sayesinde profil/DM/arkadaslik/galeri de otomatik gider.
  function handleDeleteAccount() {
    showAlert(t("profile.deleteAccountTitle"), t("profile.deleteAccountConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("profile.deleteAccountTitle"),
        style: "destructive",
        onPress: () => {
          getSocket().emit("account:delete", {}, (res: any) => {
            if (res?.ok) {
              supabase.auth.signOut();
            } else {
              showAlert(t("profile.deleteAccountTitle"), res?.error || t("profile.deleteAccountFailed"));
            }
          });
        },
      },
    ]);
  }

  function handleSelectLanguage(code: LanguageCode) {
    triggerHaptic();
    setAppLanguage(code);
    setLanguageSheetVisible(false);
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

        <SectionHeader title={t("profile.sectionAccounts")} />
        <TouchableOpacity
          style={styles.accountRow}
          onPress={() => (googleLinked ? undefined : placeholder(t("profile.connectGoogleAlertTitle")))}
        >
          <Text style={styles.accountLabel}>{t("profile.google")}</Text>
          <View style={styles.accountValue}>
            {googleLinked ? (
              <>
                <View style={styles.checkBadge}>
                  <Text style={styles.checkBadgeText}>✓</Text>
                </View>
                <Text style={styles.accountValueText} numberOfLines={1}>
                  {t("profile.googleConnected", { email })}
                </Text>
              </>
            ) : (
              <Text style={styles.accountValueText}>{t("profile.notConnected")}</Text>
            )}
          </View>
        </TouchableOpacity>

        <SectionHeader title={t("profile.sectionSettings")} />
        <ToggleRow title={t("profile.premiumTitle")} subtitle={t("profile.premiumSubtitle")} onPress={onOpenPremium} hideIndicator />
        <ToggleRow
          title={t("profile.quickReactionTitle")}
          subtitle={t("profile.quickReactionSubtitle")}
          onPress={() => setEmojiSheetVisible(true)}
          rightElement={<Text style={styles.emoji}>{quickReaction}</Text>}
        />
        <ToggleRow
          title={t("profile.restrictInvitesTitle")}
          subtitle={t("profile.restrictInvitesSubtitle")}
          rightElement={
            <OptionButton value={inviteRestriction} options={INVITE_OPTIONS} onChange={(v) => applyInviteRestriction(v as InviteRestriction)} />
          }
        />
        <ToggleRow
          title={t("profile.hideAdultTitle")}
          subtitle={t("profile.hideAdultSubtitle")}
          rightElement={
            <OptionButton
              value={hideAdult ? "hidden" : "shown"}
              options={ADULT_CONTENT_OPTIONS}
              onChange={(v) => applyHideAdultContent(v === "hidden")}
            />
          }
        />
        <ToggleRow
          title={t("profile.hapticsTitle")}
          subtitle={t("profile.hapticsSubtitle")}
          rightElement={
            <OptionButton value={haptics ? "on" : "off"} options={ON_OFF_OPTIONS} onChange={(v) => applyHaptics(v === "on")} />
          }
        />
        <ToggleRow
          title={t("profile.autoTranslateTitle")}
          subtitle={t("profile.autoTranslateSubtitle")}
          rightElement={
            <OptionButton value={autoTranslate ? "on" : "off"} options={ON_OFF_OPTIONS} onChange={(v) => applyAutoTranslate(v === "on")} />
          }
        />
        <ToggleRow
          title={t("profile.muteOtherAudioTitle")}
          subtitle={t("profile.muteOtherAudioSubtitle")}
          rightElement={
            <OptionButton
              value={muteOnOtherAudio ? "on" : "off"}
              options={ON_OFF_OPTIONS}
              onChange={(v) => applyMuteOnOtherAudio(v === "on")}
            />
          }
        />
        <ToggleRow
          title={t("profile.hideLocationTitle")}
          subtitle={t("profile.hideLocationSubtitle")}
          rightElement={
            <OptionButton value={hideLocation ? "on" : "off"} options={ON_OFF_OPTIONS} onChange={(v) => applyHideLocation(v === "on")} />
          }
        />
        <ChevronRow title={t("profile.languageTitle")} subtitle={currentLanguageLabel} onPress={() => setLanguageSheetVisible(true)} />
        <ChevronRow title={t("profile.privacyTitle")} onPress={onOpenPrivacy} />

        <SectionHeader title={t("profile.sectionFeedback")} />
        <TouchableOpacity style={styles.simpleRow} onPress={handleRateApp}>
          <Text style={styles.simpleTitle}>{t("profile.rateTitle")}</Text>
          <Text style={styles.simpleSubtitle}>{t("profile.rateSubtitle")}</Text>
        </TouchableOpacity>

        <SectionHeader title={t("profile.sectionHelp")} />
        <TouchableOpacity style={styles.simpleRow} onPress={handleContactUs}>
          <Text style={styles.simpleTitle}>{t("profile.contactTitle")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.simpleRow} onPress={runDiagnostics}>
          <Text style={styles.simpleTitle}>{t("profile.diagnosticsRun")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.simpleRow} onPress={onOpenBackgroundInfo}>
          <Text style={styles.simpleTitle}>{t("profile.backgroundTitle")}</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>{APP_VERSION}</Text>
        <TouchableOpacity style={styles.simpleRow} onPress={handleDeleteAccount}>
          <Text style={[styles.simpleTitle, styles.dangerText]}>{t("profile.deleteAccountTitle")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>{t("profile.signOutTitle")}</Text>
        </TouchableOpacity>
      </ScrollView>

      <EmojiPickerSheet
        visible={emojiSheetVisible}
        selected={quickReaction}
        onSelect={selectQuickReaction}
        onClose={() => setEmojiSheetVisible(false)}
      />

      <Modal
        visible={languageSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageSheetVisible(false)}
      >
        <TouchableOpacity style={styles.optionOverlay} activeOpacity={1} onPress={() => setLanguageSheetVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.optionSheet}>
            <ScrollView style={styles.languageSheetScroll}>
              {LANGUAGES.map((lang) => (
                <TouchableOpacity key={lang.code} style={styles.optionRow} onPress={() => handleSelectLanguage(lang.code)}>
                  <Text style={[styles.optionRowText, lang.code === i18n.language && styles.optionRowTextActive]}>{lang.label}</Text>
                  {lang.code === i18n.language && <Icon name="check" size={16} color="#0EA5E9" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={diagnosticsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDiagnosticsVisible(false)}
      >
        <TouchableOpacity style={styles.optionOverlay} activeOpacity={1} onPress={() => setDiagnosticsVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.diagnosticsCard}>
            <Text style={styles.diagnosticsTitle}>{t("profile.diagnosticsTitle").toUpperCase()}</Text>
            {diagnostics.map((r) => (
              <View key={r.label} style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>{r.label}</Text>
                {r.status === "pending" ? (
                  <ActivityIndicator size="small" color="#0EA5E9" />
                ) : (
                  <Text style={[styles.diagnosticsStatus, r.status === "ok" ? styles.diagnosticsOk : styles.diagnosticsFail]}>
                    {r.detail ?? (r.status === "ok" ? t("profile.diagnosticsSuccess") : t("profile.diagnosticsFail"))}
                  </Text>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.diagnosticsCloseBtn} onPress={() => setDiagnosticsVisible(false)}>
              <Text style={styles.diagnosticsCloseText}>{t("common.close")}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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

/** Secili degeri gosteren TEK bir buton - ToggleRow'un rightElement'i olarak
 * kullaniliyor. Basinca secenekleri listeleyen kucuk bir sayfa aciliyor
 * (2 secenekli Acik/Kapali gibi ayarlar icin de, Davetleri Kisitla'nin 3
 * secenegi - Herkes/Arkadaslar/Hickimse - icin de ayni bilesen calisiyor). */
function OptionButton({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { key: string; label: string }[];
  onChange: (key: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const current = options.find((o) => o.key === value);
  return (
    <>
      <TouchableOpacity
        style={styles.optionButton}
        onPress={() => {
          triggerHaptic();
          setVisible(true);
        }}
      >
        <Text style={styles.optionButtonText}>{current?.label ?? value}</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.optionOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.optionSheet}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={styles.optionRow}
                onPress={() => {
                  triggerHaptic();
                  onChange(opt.key);
                  setVisible(false);
                }}
              >
                <Text style={[styles.optionRowText, opt.key === value && styles.optionRowTextActive]}>{opt.label}</Text>
                {opt.key === value && <Icon name="check" size={16} color="#0EA5E9" />}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
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
  optionButton: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  optionButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  optionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" },
  optionSheet: {
    backgroundColor: "#0A0A0A",
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 220,
    borderWidth: 1,
    borderColor: "#1C1C1C",
  },
  languageSheetScroll: { maxHeight: 360 },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  optionRowText: { color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: "600" },
  optionRowTextActive: { color: "#FFFFFF", fontWeight: "800" },
  diagnosticsCard: {
    backgroundColor: "#0A0A0A",
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    minWidth: 280,
    borderWidth: 1,
    borderColor: "#1C1C1C",
  },
  diagnosticsTitle: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 14,
  },
  diagnosticsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  diagnosticsLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  diagnosticsStatus: { fontSize: 13, fontWeight: "700" },
  diagnosticsOk: { color: "#34D399" },
  diagnosticsFail: { color: "#FF8A8A" },
  diagnosticsCloseBtn: { marginTop: 16, alignItems: "center" },
  diagnosticsCloseText: { color: "#0EA5E9", fontSize: 14, fontWeight: "800" },
  simpleRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  simpleTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  simpleSubtitle: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: "500", marginTop: 3, lineHeight: 16 },
  dangerText: { color: "#FF8A8A" },
  versionText: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "500", paddingHorizontal: 18, paddingVertical: 10 },
  signOutButton: { marginHorizontal: 18, marginTop: 24, backgroundColor: "rgba(255,77,79,0.15)", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,77,79,0.4)" },
  signOutText: { color: "#FF8A8A", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
});
