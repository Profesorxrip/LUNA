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
 * degistirebilir (canChangeSpeed). Video ayrintilari/kalite SADECE YouTube
 * kaynaklarda GERCEKTEN anlamli veri/secenek oldugu icin (IFrame API) o
 * satirlar mp4/hls gibi diger turlerde hic GORUNMUYOR ("Kullanılamıyor"
 * yazan soluk bir satir yerine). Altyazilar bundan biraz farkli: YouTube'da
 * satir HER ZAMAN gorunur ama SADECE o SPESIFIK videonun gercekten altyazi
 * track'i varsa (subtitlesAvailable, bkz. onCaptionsAvailabilityChange)
 * acilabilir - yoksa "Kullanılamıyor" gosterip soluk/dokunulamaz kalir,
 * mp4/hls'te zaten hic gorunmez. Dublaj ise YouTube'un herkese acik
 * API'sinde HIC yok, bu yuzden HER zaman (turden bagimsiz) soluk/
 * dokunulamaz gorunur. */
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
}: Props) {
  const [expanded, setExpanded] = useState<"details" | "speed" | "quality" | null>(null);
  const isYoutube = source?.type === "youtube";
  const badge = badgeInfoForSource(source);
  const currentQualityLabel = QUALITY_OPTIONS.find((o) => o.key === videoQuality)?.label || "Otomatik";

  function toggle(section: "details" | "speed" | "quality") {
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
                handleWebUrlSubmit) - yaniltici "ayrinti" gostermemek icin bu
                satir SADECE gercek baslik/kanal bilgisi paylasan YouTube'da
                gorunur. */}
            {isYoutube && (
              <>
                <TouchableOpacity style={styles.row} onPress={() => toggle("details")}>
                  <Text style={styles.rowLabel}>Video ayrıntıları</Text>
                  <Icon name={expanded === "details" ? "chevronRight" : "chevronLeft"} size={16} color={theme.textMuted} />
                </TouchableOpacity>
                {expanded === "details" && (
                  <View style={styles.detailsBox}>
                    <DetailLine label="Başlık" value={source?.label || "—"} />
                    <DetailLine label="Platform" value={badge?.label || "Web"} />
                    {!!source?.channelName && <DetailLine label="Kanal" value={source.channelName} />}
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

            {/* Kalite/altyazi secimi SADECE YouTube'un IFrame API'sinde var -
                mp4/hls'te gosterilecek gercek bir secenek olmadigi icin
                "Kullanılamıyor" yazan soluk bir satir yerine satirin KENDISI
                gizleniyor (bkz. yukaridaki "Video ayrıntıları" ile ayni mantik). */}
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
              </>
            )}

            {/* Dublaj (farkli dil sesi secimi) - kalite/altyazi gibi KISISEL
                olmasi gerekse de YouTube'un herkese acik IFrame API'si su an
                dublaj/ikinci ses parcasi secimini DISARIYA ACMIYOR - bu yuzden
                yanlis bir "calisiyor" izlenimi vermemek icin HER zaman
                "Kullanılamıyor" gosteriliyor (bkz. RoomScreen.tsx yorumlari). */}
            <TouchableOpacity style={styles.row} disabled>
              <Text style={[styles.rowLabel, styles.rowLabelDisabled]}>Dublaj</Text>
              <Text style={[styles.rowValueText, styles.rowLabelDisabled]}>Kullanılamıyor</Text>
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
