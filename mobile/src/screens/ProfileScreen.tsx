import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Modal, ActivityIndicator, Switch } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as StoreReview from "expo-store-review";
import { useFonts, BebasNeue_400Regular } from "@expo-google-fonts/bebas-neue";
import { useTranslation } from "react-i18next";
import {
  Link as LinkIcon,
  Crown,
  Heart,
  MailPlus,
  Vibrate,
  Languages as LanguagesIcon,
  VolumeX,
  MapPin,
  Globe,
  Lock,
  Bell,
  Ban,
  ChartBar,
  Star,
  BookOpen,
  MessageCircle,
  Activity,
  Antenna,
  Trash,
} from "lucide-react-native";
import { supabase } from "../services/supabase";
import { getSocket, SERVER_URL } from "../services/socket";
import Icon from "../components/Icon";
import AdultBadge from "../components/AdultBadge";
import EmojiPickerSheet from "../components/EmojiPickerSheet";
import { showAlert } from "../components/CustomAlert";
import { isHapticsEnabled, setHapticsEnabled, triggerHaptic } from "../utils/haptics";
import { isMuteOnOtherAudioEnabled, setMuteOnOtherAudioEnabled } from "../utils/audioSettings";
import { isHideLocationEnabled, setHideLocationEnabled } from "../utils/locationSettings";
import { LANGUAGES, setAppLanguage, LanguageCode } from "../i18n";

const SUPPORT_EMAIL = "destek@luna.app";
const ROW_ICON_COLOR = "#FFFFFF";
const SWITCH_TRACK_ON = "#38BDF8";

type InviteRestriction = "everyone" | "friends" | "none";

interface Props {
  onOpenUserProfile: () => void;
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
  onOpenUserProfile,
  onOpenPremium,
  onOpenPrivacy,
  onOpenBackgroundInfo,
}: Props) {
  const { t, i18n } = useTranslation();
  // Bolum basliklari (BAGLI HESAP/AYARLAR/GERI BILDIRIM/YARDIM) - diger
  // ekranlarda da kullanilan ayni "afis" fontu (bkz. LoginScreen.tsx,
  // DiscoverScreen.tsx emptyTitleFontLoaded).
  const [fontsLoaded] = useFonts({ BebasNeue_400Regular });
  const INVITE_OPTIONS: { key: InviteRestriction; label: string }[] = [
    { key: "everyone", label: t("profile.inviteEveryone") },
    { key: "friends", label: t("profile.inviteFriends") },
    { key: "none", label: t("profile.inviteNone") },
  ];
  const [languageSheetVisible, setLanguageSheetVisible] = useState(false);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [name, setName] = useState("Kullanici");
  // supabase/migrations/0018_is_premium.sql - su an herkeste false (henuz
  // gercek bir satin alma akisi yok, bkz. PremiumScreen.tsx).
  const [isPremium, setIsPremium] = useState(false);
  const [handle, setHandle] = useState("kullanici");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [googleLinked, setGoogleLinked] = useState(false);

  const [quickReaction, setQuickReaction] = useState("❤️");
  const [emojiSheetVisible, setEmojiSheetVisible] = useState(false);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const [inviteRestriction, setInviteRestriction] = useState<InviteRestriction>("everyone");
  const [hideAdult, setHideAdult] = useState(false);
  const [haptics, setHaptics] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [muteOnOtherAudio, setMuteOnOtherAudio] = useState(false);
  const [hideLocation, setHideLocation] = useState(true);
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
        .select(
          "name,handle,avatar_url,default_auto_translate,default_reaction_emoji,invite_restriction,hide_adult_content,is_premium"
        )
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
          setIsPremium(profile.is_premium === true);
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
    // Sunucu artik "Yakindakiler" eslesmesi icin de bu tercihi biliyor
    // (bkz. server/src/index.ts profile:hideLocation).
    getSocket().emit("profile:hideLocation", { enabled: next }, () => {});
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
        <SectionHeader title={t("profile.sectionAccounts")} fontsLoaded={fontsLoaded} />
        <TouchableOpacity
          style={styles.accountRow}
          onPress={() => (googleLinked ? undefined : placeholder(t("profile.connectGoogleAlertTitle")))}
        >
          <View style={styles.rowIcon}>
            <LinkIcon size={30} color={ROW_ICON_COLOR} strokeWidth={2} />
          </View>
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
        <GradientDivider />

        <SectionHeader title={t("profile.sectionSettings")} fontsLoaded={fontsLoaded} />
        <ChevronRow icon={<Crown size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.premiumTitle")} onPress={onOpenPremium} />
        <ChevronRow
          icon={<Heart size={30} color={ROW_ICON_COLOR} strokeWidth={2} />}
          title={t("profile.quickReactionTitle")}
          onPress={() => setEmojiSheetVisible(true)}
        />
        <ChevronRow
          icon={<MailPlus size={30} color={ROW_ICON_COLOR} strokeWidth={2} />}
          title={t("profile.restrictInvitesTitle")}
          onPress={() => setInviteSheetVisible(true)}
        />
        <SwitchRow
          icon={<AdultBadge size={34} />}
          title={t("profile.hideAdultTitle")}
          value={!hideAdult}
          onValueChange={(v) => applyHideAdultContent(!v)}
        />
        <SwitchRow
          icon={<Vibrate size={30} color={ROW_ICON_COLOR} strokeWidth={2} />}
          title={t("profile.hapticsTitle")}
          value={haptics}
          onValueChange={applyHaptics}
        />
        <SwitchRow
          icon={<LanguagesIcon size={30} color={ROW_ICON_COLOR} strokeWidth={2} />}
          title={t("profile.autoTranslateTitle")}
          value={autoTranslate}
          onValueChange={applyAutoTranslate}
        />
        <SwitchRow
          icon={<VolumeX size={30} color={ROW_ICON_COLOR} strokeWidth={2} />}
          title={t("profile.muteOtherAudioTitle")}
          value={muteOnOtherAudio}
          onValueChange={applyMuteOnOtherAudio}
        />
        <SwitchRow
          icon={<MapPin size={30} color={ROW_ICON_COLOR} strokeWidth={2} />}
          title={t("profile.hideLocationTitle")}
          value={hideLocation}
          onValueChange={applyHideLocation}
        />
        <ChevronRow icon={<Globe size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.languageTitle")} onPress={() => setLanguageSheetVisible(true)} />
        <ChevronRow icon={<Lock size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.privacyTitle")} onPress={onOpenPrivacy} />
        <ChevronRow icon={<Bell size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.notificationsTitle")} onPress={() => placeholder(t("profile.notificationsTitle"))} />
        <ChevronRow icon={<Ban size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.blockedTitle")} onPress={() => placeholder(t("profile.blockedTitle"))} />
        <ChevronRow icon={<ChartBar size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.statsTitle")} onPress={() => placeholder(t("profile.statsTitle"))} />
        <GradientDivider />

        <SectionHeader title={t("profile.sectionFeedback")} fontsLoaded={fontsLoaded} />
        <ChevronRow icon={<Star size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.rateTitle")} onPress={handleRateApp} />
        <GradientDivider />

        <SectionHeader title={t("profile.sectionHelp")} fontsLoaded={fontsLoaded} />
        <ChevronRow icon={<BookOpen size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.userGuideTitle")} onPress={() => placeholder(t("profile.userGuideTitle"))} />
        <ChevronRow icon={<MessageCircle size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.contactTitle")} onPress={handleContactUs} />
        <ChevronRow icon={<Activity size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.diagnosticsRun")} onPress={runDiagnostics} />
        <ChevronRow icon={<Antenna size={30} color={ROW_ICON_COLOR} strokeWidth={2} />} title={t("profile.backgroundTitle")} onPress={onOpenBackgroundInfo} />
        <ChevronRow
          icon={<Trash size={30} color="#FF8A8A" strokeWidth={2} />}
          title={t("profile.deleteAccountTitle")}
          titleStyle={styles.dangerText}
          onPress={handleDeleteAccount}
        />
        <GradientDivider />
        <Text style={styles.versionText}>{APP_VERSION}</Text>

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

      <Modal visible={inviteSheetVisible} transparent animationType="fade" onRequestClose={() => setInviteSheetVisible(false)} statusBarTranslucent>
        <TouchableOpacity style={styles.optionOverlay} activeOpacity={1} onPress={() => setInviteSheetVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.optionSheet}>
            {INVITE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={styles.optionRow}
                onPress={() => {
                  triggerHaptic();
                  applyInviteRestriction(opt.key);
                  setInviteSheetVisible(false);
                }}
              >
                <Text style={[styles.optionRowText, opt.key === inviteRestriction && styles.optionRowTextActive]}>{opt.label}</Text>
                {opt.key === inviteRestriction && <Icon name="check" size={16} color="#0EA5E9" />}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={languageSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageSheetVisible(false)}
        statusBarTranslucent
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
        statusBarTranslucent
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

function SectionHeader({ title, fontsLoaded }: { title: string; fontsLoaded: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionHeaderText, fontsLoaded && styles.sectionHeaderTextFontLoaded]}>{title}</Text>
    </View>
  );
}

function GradientDivider() {
  return (
    <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sectionDivider} />
  );
}

function ChevronRow({
  icon,
  title,
  subtitle,
  titleStyle,
  onPress,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  titleStyle?: object;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => {
        triggerHaptic();
        onPress();
      }}
    >
      {icon && <View style={styles.rowIcon}>{icon}</View>}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, titleStyle]}>{title}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Icon name="chevronRight" size={23} color="rgba(255,255,255,0.6)" />
    </TouchableOpacity>
  );
}

/** Carktaki (bkz. AYARLAR bolumu) acik/kapali ayarlar artik gercek bir
 * anahtar (Switch) ile gosteriliyor - kullanicinin gonderdigi ekran
 * goruntusundeki mavi/beyaz ios-tarzi anahtarlarla birebir ayni. */
function SwitchRow({
  icon,
  title,
  value,
  onValueChange,
}: {
  icon?: React.ReactNode;
  title: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      {icon && <View style={styles.rowIcon}>{icon}</View>}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          triggerHaptic();
          onValueChange(next);
        }}
        trackColor={{ false: "rgba(255,255,255,0.2)", true: SWITCH_TRACK_ON }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="rgba(255,255,255,0.2)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Artik App.tsx'teki paylasilan AppBackground (degrade) arkada duruyor -
  // UserProfileScreen.tsx'teki gibi (bkz. "screen" stili orada).
  screen: { flex: 1, backgroundColor: "transparent" },
  scrollContent: { paddingTop: 50, paddingBottom: 60 },
  sectionHeader: {
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  sectionHeaderText: { color: "rgba(255,255,255,0.65)", fontSize: 12.5, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  sectionHeaderTextFontLoaded: {
    fontFamily: "BebasNeue_400Regular",
    fontWeight: "400",
    fontSize: 20,
    letterSpacing: 1.6,
  },
  // Mavi/beyaz degrade "hap" cercevesiyle (bkz. StaticTabBar.tsx topDivider)
  // AYNI mantik - ama sadece 4 belirli yerde (Google, Istatistikler,
  // LUNA'yi Degerlendir, Hesabi Sil satirlarinin altinda) kullaniliyor,
  // diger tum satir cizgileri kaldirildi. marginHorizontal YOK - ekranin
  // sagina/soluna tam yapisiyor (bkz. kullanicinin istegi).
  sectionDivider: { height: 8 },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  accountLabel: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", flex: 1 },
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
  accountValueText: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: "500", flexShrink: 1 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 14,
  },
  rowIcon: { width: 36, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
  rowSubtitle: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "500", marginTop: 3, lineHeight: 17 },
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
  dangerText: { color: "#FF8A8A" },
  versionText: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "500", paddingHorizontal: 18, paddingVertical: 10 },
  // Kullanicinin gonderdigi ekran goruntusundeki gibi - kirmizi dolgu DEGIL,
  // mavi/beyaz CERCEVE (outline) hap buton.
  signOutButton: {
    marginHorizontal: 18,
    marginTop: 24,
    backgroundColor: "transparent",
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
  },
  signOutText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", letterSpacing: 0.2, textTransform: "uppercase" },
});
