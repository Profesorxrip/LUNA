import React, { useEffect, useMemo } from "react";
import { View, TouchableOpacity, StyleSheet, Image } from "react-native";
import { Play, Pause } from "lucide-react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { formatDuration } from "../utils/format";

interface Props {
  uri: string;
  durationMs?: number | null;
  // Sure etiketi artik bu bilesenin KENDI icinde cizilmiyor - DMScreen'deki
  // alt bilgi satirina (gonderim saatiyle AYNI hizaya) tasinabilsin diye
  // deger her degistiginde bu callback ile yukari bildiriliyor.
  onTimeLabel?: (label: string) => void;
  // SADECE tek-gorunumluk (view-once) mesajlarda verilir - DURDURULMUS/
  // BASLANGICTAKI durumdan OYNAMAYA gecerken (ilk "play" basisi) bir kere
  // cagrilir, DMScreen bunu sunucuya "dm:consumeVoiceOnce" olarak iletir.
  onPlay?: () => void;
  // Kullanici istegi: tek-gorunumluk sesli mesaj HENUZ hic oynatilmadiysa
  // play ucgeni yerine gonderim ekranindaki (SendMediaSheet/SendVideoSheet)
  // "1" rozetinin DOLU versiyonu (VoiceOnceFilledIcon) gosterilsin.
  viewOnceUnplayed?: boolean;
}

const BAR_COUNT = 24;

// uri'ye gore SABIT (her render'da ayni, mesajdan mesaja farkli) sozde-rastgele
// cubuk yukseklikleri - gercek bir ses analizi yapmiyoruz, sadece gercekci
// goruneb bir waveform deseni uretiyoruz.
function waveformHeights(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const heights: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    heights.push(4 + ((h >>> 8) % 1000) / 1000 * 14);
  }
  return heights;
}

/** Sohbette gelen/giden sesli mesaj balonu - beyaz dolgulu play/pause dugmesi +
 * mesaja ozel sabit waveform cubuklari (calinan kisim beyaz, kalani soluk).
 * Sure etiketi artik DMScreen'in alt bilgi satirinda (gonderim saatiyle ayni
 * hizada) gosteriliyor - bkz. onTimeLabel. expo-audio'nun kendi oynatma
 * durumunu (useAudioPlayerStatus) izler, kendi "playing" state'ini TUTMAZ. */
export default function VoiceMessageBubble({ uri, durationMs, onTimeLabel, onPlay, viewOnceUnplayed }: Props) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || (durationMs ? durationMs / 1000 : 0);
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const heights = useMemo(() => waveformHeights(uri), [uri]);
  const activeBars = Math.round(progress * BAR_COUNT);
  const timeLabel = formatDuration(status.playing || status.currentTime > 0 ? status.currentTime : duration);

  useEffect(() => {
    onTimeLabel?.(timeLabel);
  }, [timeLabel, onTimeLabel]);

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.8}
      onPress={() => {
        if (status.playing) {
          player.pause();
        } else {
          onPlay?.();
          if (status.currentTime >= duration && duration > 0) player.seekTo(0);
          player.play();
        }
      }}
    >
      {!status.playing && viewOnceUnplayed && status.currentTime === 0 ? (
        // Rozetin (voice-once-filled.png) "1" rakami GERCEKTE opak daire
        // icinde SEFFAF bir delik - tintColor tek renk uygulandigi icin
        // "ici siyah, disi beyaz" ayni resimle yapilamiyor. Bunun yerine
        // SIYAH arkaplanli bir daire + ustune resmi (BEYAZA boyanmis) koyuyoruz
        // - sonuc: beyaz daire + "1" deliginden gorunen SIYAH arkaplan.
        // "voice-once-filled-badge.png" ORIJINAL gorselin (voice-once-filled.png,
        // paylasim ekranlarinda baska boyutlarda kullanildigi icin DOKUNULMADI)
        // daire-ici-tam-ortalanmis bir kopyasi - orijinalde daire canvas'in tam
        // merkezinde degildi, bu da 30px dugmeye sigdirinca bir kenarda ince
        // siyah bir hilal birakiyordu (kullanici sikayeti).
        <View style={styles.playBtnVoiceOnce}>
          <Image
            source={require("../../assets/icons/voice-once-filled-badge.png")}
            style={{ width: 36, height: 36, tintColor: "#FFFFFF" }}
            resizeMode="contain"
          />
        </View>
      ) : (
        <View style={styles.playBtn}>
          {status.playing ? <Pause size={13} color="#0F172A" /> : <Play size={13} color="#0F172A" fill="#0F172A" />}
        </View>
      )}
      <View style={styles.wave}>
        {heights.map((barHeight, i) => (
          <View key={i} style={[styles.bar, { height: barHeight }, i < activeBars && styles.barActive]} />
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 205 },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnVoiceOnce: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  wave: { flex: 1, flexDirection: "row", alignItems: "center", gap: 2.5, height: 18 },
  bar: { flex: 1, borderRadius: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  barActive: { backgroundColor: "#FFFFFF" },
});
