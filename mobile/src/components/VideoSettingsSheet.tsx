import { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import type { MediaSource } from "../services/socket";
import { badgeInfoForSource } from "../utils/media";
import Icon from "./Icon";
import { theme } from "../theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  source: MediaSource | null;
  videoHidden: boolean;
  onToggleHideVideo: () => void;
  // Video kalitesi/altyazi/dublaj'in aksine oynatma hizi KISISEL DEGIL -
  // odadaki herkesin ekraninda AYNI olmasi gerekir (aksi halde senkron
  // zamanla kayar) - bu yuzden SADECE lider degistirebilir, digerleri
  // mevcut degeri gorur ama soluk/dokunulamaz kalir.
  canChangeSpeed: boolean;
  playbackRate: number;
  onChangePlaybackRate: (rate: number) => void;
  videoQuality: string;
  onChangeVideoQuality: (quality: string) => void;
  subtitlesEnabled: boolean;
  onToggleSubtitles: () => void;
  // Su an oynayan videonun GERCEKTEN altyazi track'i var mi (bkz.
  // RoomScreen.tsx/YouTubePlayer.tsx onCaptionsAvailabilityChange) -
  // subtitlesEnabled bir TERCIH, bu ise videonun kendi durumu: false'ken
  // "Altyazılar" satiri "Kullanılamıyor" gosterir, acilamaz.
  subtitlesAvailable: boolean;
  // Bu videoda GERCEKTEN birden fazla ses parcasi (dublaj) varsa dil
  // etiketlerinin listesi - BELGELENMEMIS bir YouTube API'si uzerinden
  // deneniyor (bkz. YouTubePlayer.tsx setDubTrack), bos ise "Dublaj" satiri
  // "Kullanılamıyor" gosterir.
  dubTracks: string[];
  selectedDubIndex: number;
  onChangeDubTrack: (index: number) => void;
  // SADECE hls/mp4'te gelir - su an oynayan video track'inin GERCEK
  // cozunurlugu (bkz. HlsPlayer.tsx). expo-video'da kalite KULLANICI
  // TARAFINDAN SECILEMEZ (videoTrack salt-okunur, secim adaptif/otomatik) -
  // bu yuzden YouTube'daki gibi bir secim listesi degil, sadece bilgi
  // amacli (dokunulamaz) bir satir olarak gosterilir.
  videoResolution: { width: number; height: number } | null;
  // Profil ekranindaki "Ayarlar" bolumundeki iki KISISEL (cihaz bazli)
  // tercihin dogrudan video panelinden de degistirilebilmesi icin - odadan
  // cikmaya gerek kalmasin diye. hideAdultContent RoomScreen'deki
  // myHideAdultContent/toggleMyHideAdultContent ile AYNI (adultBlurActive'i
  // aninda etkiler), muteOtherAudio ise src/utils/audioSettings.ts'teki
  // AsyncStorage tercihiyle AYNI (hls/mp4'te aninda, YouTube/external'da bir
  // sonraki hls/mp4 videoda gecerli olur - bkz. MediaPlayer.tsx).
  hideAdultContent: boolean;
  onToggleHideAdultContent: (enabled: boolean) => void;
  muteOtherAudio: boolean;
  onToggleMuteOtherAudio: (enabled: boolean) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const QUALITY_OPTIONS: { key: string; label: string }[] = [
  { key: "default", label: "Otomatik" },
  { key: "hd1080", label: "1080p" },
  { key: "hd720", label: "720p" },
  { key: "large", label: "480p" },
  { key: "medium", label: "360p" },
];

function formatSpeed(rate: number): string {
  return rate === 1 ? "1x" : `${rate}x`;
}

/** Rave'deki video kontrol panelinin SAG USTUNDEKI cark ile acilan, oda
 * ayarlarindan (üst bar carki, bkz. RoomSettingsSheet) TAMAMEN AYRI kucuk
 * panel. Video gizleme/ayrintilar/kalite/altyazi/dublaj HERKESIN kendi
 * ekrani icin ayri ayri secebildigi KISISEL tercihler - hicbiri sunucuya
 * gonderilmez. TEK istisna "oynatma hizi": bu oda genelinde ortak olmali
 * (herkes farkli hizda izlerse senkron bozulur), bu yuzden SADECE lider
 * degistirebilir (canChangeSpeed). Video ayrintilari artik hem YouTube'da
 * (Baslik/Kanal GERCEK, oEmbed'ten) hem hls/mp4'te (Platform/Tur GERCEK,
 * bkz. badgeInfoForSource) gorunur - Baslik/Kanal SADECE YouTube'da
 * gosterilir (hls/mp4'te bu bilgi yok, yaniltici olmasin diye satir
 * atlanir). Video kalitesi iki FARKLI mantikla calisir: YouTube'da
 * kullanicinin SECEBILDIGI bir liste (IFrame API), hls/mp4'te ise
 * expo-video'da videoTrack SALT-OKUNUR oldugu icin (secim adaptif/otomatik)
 * sadece su anki GERCEK cozunurlugu gosteren, dokunulamaz bir bilgi satiri.
 * Altyazilar/Dublaj her iki turde de GERCEK veriye (subtitlesAvailable/
 * dubTracks) bakar - YouTube'da captions tracklist'i/BELGELENMEMIS
 * multiaudio modulunden, hls/mp4'te expo-video'nun RESMI
 * availableSubtitleTracks/availableAudioTracks'inden gelir - hicbiri yoksa
 * satirlar "Kullanılamıyor" gosterip soluk/dokunulamaz kalir. */
export default function VideoSettingsSheet({
  visible,
  onClose,
  source,
  videoHidden,
  onToggleHideVideo,
  canChangeSpeed,
  playbackRate,
  onChangePlaybackRate,
  videoQuality,
  onChangeVideoQuality,
  subtitlesEnabled,
  onToggleSubtitles,
  subtitlesAvailable,
  dubTracks,
  selectedDubIndex,
  onChangeDubTrack,
  videoResolution,
  hideAdultContent,
  onToggleHideAdultContent,
  muteOtherAudio,
  onToggleMuteOtherAudio,
}: Props) {
  const [expanded, setExpanded] = useState<"details" | "speed" | "quality" | "dub" | null>(null);
  const isYoutube = source?.type === "youtube";
  const isHlsOrMp4 = source?.type === "hls" || source?.type === "mp4";
  const badge = badgeInfoForSource(source);
  const currentQualityLabel = QUALITY_OPTIONS.find((o) => o.key === videoQuality)?.label || "Otomatik";
  const hasDub = dubTracks.length > 0;

  function toggle(section: "details" | "speed" | "quality" | "dub") {
    setExpanded((cur) => (cur === section ? null : section));
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.header}>Ayarlar</Text>

            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                onToggleHideVideo();
                onClose();
              }}
            >
              <Text style={styles.rowLabel}>{videoHidden ? "Videoyu göster" : "Videoyu gizle"}</Text>
              <Icon name="chevronLeft" size={16} color={theme.textMuted} />
            </TouchableOpacity>

            {/* mp4/hls (dogrudan dosya linki) kaynaklarda "Baslik" alanimiz
                videonun KENDI paylastigi gercek bir baslik degil, sadece
                linkten tahmin edilen alan adi (bkz. MediaPickerSheet.tsx
                handleWebUrlSubmit) - yaniltici olmasin diye SADECE o satir
                atlanir. Platform/Tur ise artik hls/mp4'te de GERCEK (bkz.
                badgeInfoForSource'taki alan adi eslestirmesi) - bu yuzden
                satirin TAMAMI degil, sadece Baslik/Kanal YouTube'a ozel. */}
            {(isYoutube || isHlsOrMp4) && (
              <>
                <TouchableOpacity style={styles.row} onPress={() => toggle("details")}>
                  <Text style={styles.rowLabel}>Video ayrıntıları</Text>
                  <Icon name={expanded === "details" ? "chevronRight" : "chevronLeft"} size={16} color={theme.textMuted} />
                </TouchableOpacity>
                {expanded === "details" && (
                  <View style={styles.detailsBox}>
                    {isYoutube && <DetailLine label="Başlık" value={source?.label || "—"} />}
                    <DetailLine label="Platform" value={badge?.label || "Web"} />
                    {isYoutube && !!source?.channelName && <DetailLine label="Kanal" value={source.channelName} />}
                    <DetailLine label="Tür" value={source?.type || "—"} />
                  </View>
                )}
              </>
            )}

            <TouchableOpacity style={styles.row} onPress={() => canChangeSpeed && toggle("speed")} disabled={!canChangeSpeed}>
              <Text style={[styles.rowLabel, !canChangeSpeed && styles.rowLabelDisabled]}>Oynatma hızı</Text>
              <View style={styles.rowValue}>
                <Text style={[styles.rowValueText, !canChangeSpeed && styles.rowLabelDisabled]}>{formatSpeed(playbackRate)}</Text>
                {canChangeSpeed && (
                  <Icon name={expanded === "speed" ? "chevronRight" : "chevronLeft"} size={16} color={theme.textMuted} />
                )}
              </View>
            </TouchableOpacity>
            {expanded === "speed" && canChangeSpeed && (
              <View style={styles.optionsRow}>
                {SPEED_OPTIONS.map((rate) => (
                  <TouchableOpacity
                    key={rate}
                    style={styles.speedOption}
                    onPress={() => {
                      onChangePlaybackRate(rate);
                      setExpanded(null);
                    }}
                  >
                    <Text style={[styles.speedOptionText, rate === playbackRate && { color: theme.accent }]}>{formatSpeed(rate)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Video kalitesi YouTube'da SECILEBILIR bir liste (IFrame API) -
                hls/mp4'te ise expo-video'da videoTrack SALT-OKUNUR oldugu
                icin (secim adaptif/otomatik, kullanici degistiremez) sadece
                su anki GERCEK cozunurlugu gosteren, dokunulamaz bir satir. */}
            {isYoutube && (
              <>
                <TouchableOpacity style={styles.row} onPress={() => toggle("quality")}>
                  <Text style={styles.rowLabel}>Video kalitesi</Text>
                  <View style={styles.rowValue}>
                    <Text style={styles.rowValueText}>{currentQualityLabel}</Text>
                    <Icon name={expanded === "quality" ? "chevronRight" : "chevronLeft"} size={16} color={theme.textMuted} />
                  </View>
                </TouchableOpacity>
                {expanded === "quality" && (
                  <View style={styles.optionsRow}>
                    {QUALITY_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        style={styles.speedOption}
                        onPress={() => {
                          onChangeVideoQuality(opt.key);
                          setExpanded(null);
                        }}
                      >
                        <Text style={[styles.speedOptionText, opt.key === videoQuality && { color: theme.accent }]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
            {isHlsOrMp4 && videoResolution && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Video kalitesi</Text>
                <Text style={styles.rowValueText}>{videoResolution.height}p</Text>
              </View>
            )}

            {/* Altyazilar her iki turde de AYNI satir - sadece bu SPESIFIK
                videoda gercekten bir track varsa (subtitlesAvailable)
                acilabilir, yoksa "Kullanılamıyor" gosterip dokunulamaz kalir. */}
            {(isYoutube || isHlsOrMp4) && (
              <TouchableOpacity
                style={styles.row}
                onPress={() => subtitlesAvailable && onToggleSubtitles()}
                disabled={!subtitlesAvailable}
              >
                <Text style={[styles.rowLabel, !subtitlesAvailable && styles.rowLabelDisabled]}>Altyazılar</Text>
                <Text style={[styles.rowValueText, !subtitlesAvailable && styles.rowLabelDisabled]}>
                  {!subtitlesAvailable ? "Kullanılamıyor" : subtitlesEnabled ? "Açık" : "Kapalı"}
                </Text>
              </TouchableOpacity>
            )}

            {/* Dublaj (farkli dil sesi secimi) - YouTube'da BELGELENMEMIS,
                hls/mp4'te expo-video'nun RESMI audioTrack API'si (bkz.
                yukaridaki doc-comment). external/kaynaksiz durumda da
                gosterip "hasDub" false oldugu icin hep "Kullanılamıyor"
                kalmasi zararsiz - ayri bir kosulla gizlemeye gerek yok. */}
            <TouchableOpacity style={styles.row} onPress={() => hasDub && toggle("dub")} disabled={!hasDub}>
              <Text style={[styles.rowLabel, !hasDub && styles.rowLabelDisabled]}>Dublaj</Text>
              <View style={styles.rowValue}>
                <Text style={[styles.rowValueText, !hasDub && styles.rowLabelDisabled]}>
                  {hasDub ? dubTracks[selectedDubIndex] || dubTracks[0] : "Kullanılamıyor"}
                </Text>
                {hasDub && <Icon name={expanded === "dub" ? "chevronRight" : "chevronLeft"} size={16} color={theme.textMuted} />}
              </View>
            </TouchableOpacity>
            {expanded === "dub" && hasDub && (
              <View style={styles.optionsRow}>
                {dubTracks.map((label, index) => (
                  <TouchableOpacity
                    key={`${label}-${index}`}
                    style={styles.speedOption}
                    onPress={() => {
                      onChangeDubTrack(index);
                      setExpanded(null);
                    }}
                  >
                    <Text style={[styles.speedOptionText, index === selectedDubIndex && { color: theme.accent }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Profil > Ayarlar'daki AYNI iki kisisel tercih - odadan
                cikmadan burdan da degistirilebilsin diye (bkz. Props
                yorumu yukarida). */}
            <TouchableOpacity style={styles.row} onPress={() => onToggleHideAdultContent(!hideAdultContent)}>
              <Text style={styles.rowLabel}>Yetişkin içeriği bulanıklaştır</Text>
              <Text style={styles.rowValueText}>{hideAdultContent ? "Açık" : "Kapalı"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={() => onToggleMuteOtherAudio(!muteOtherAudio)}>
              <Text style={styles.rowLabel}>Başka ses çalarken sessize al</Text>
              <Text style={styles.rowValueText}>{muteOtherAudio ? "Açık" : "Kapalı"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#1C1C1E",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingBottom: 30,
    maxHeight: "70%",
  },
  header: { color: theme.text, fontSize: 18, fontWeight: "700", marginBottom: 8, paddingHorizontal: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  rowLabel: { color: theme.text, fontSize: 15, fontWeight: "600" },
  rowLabelDisabled: { color: theme.textMuted },
  rowValue: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowValueText: { color: theme.textMuted, fontSize: 14 },
  detailsBox: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  detailLine: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { color: theme.textMuted, fontSize: 13 },
  detailValue: { color: theme.text, fontSize: 13, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 10,
  },
  speedOption: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  speedOptionText: { color: theme.text, fontSize: 13, fontWeight: "700" },
});
