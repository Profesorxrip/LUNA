import React from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react-native";
import Toggle from "./Toggle";
import type { ConnectionQuality } from "../hooks/useConnectionQuality";

interface Props {
  visible: boolean;
  onClose: () => void;
  noiseReduction: boolean;
  onToggleNoiseReduction: () => void;
  quality: ConnectionQuality;
  // Sadece VideoCallScreen'den verilir - "Arama Ekle" orada ayri bir kontrol
  // butonu olarak degil, bu panelin icinde bir satir olarak gosteriliyor
  // (bkz. VideoCallScreen.tsx). Verilmezse satir hic gosterilmez.
  onAddCall?: () => void;
}

const BAR_HEIGHTS = [6, 10, 14];
const QUALITY_CONFIG: Record<ConnectionQuality, { activeBars: number; color: string }> = {
  good: { activeBars: 3, color: "#22C55E" },
  medium: { activeBars: 2, color: "#F59E0B" },
  poor: { activeBars: 1, color: "#EF4444" },
};
const INACTIVE_BAR_COLOR = "rgba(255,255,255,0.18)";

/** VoiceCallScreen'deki "Diger" butonuna basilinca acilan alt panel -
 * arkaplan gurultusunu azaltma anahtari + GERCEK bir RTT olcumune
 * dayanan baglanti kalitesi gostergesi (bkz. useConnectionQuality.ts -
 * sunucuya "ping:rtt" gonderip donus suresini olcer, aramanin kendisi
 * mockup olsa da bu olcum gercek). Gösterge sekli: yukselen 3 bar,
 * kalite dustukce daha az bar renkli kalir (telekom sinyal cubuklari gibi). */
export default function CallMoreOptionsSheet({
  visible,
  onClose,
  noiseReduction,
  onToggleNoiseReduction,
  quality,
  onAddCall,
}: Props) {
  const { t } = useTranslation();
  const config = QUALITY_CONFIG[quality];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          {!!onAddCall && (
            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                onClose();
                onAddCall();
              }}
            >
              <Text style={styles.rowLabel}>{t("dm.callAddLabel")}</Text>
              <Plus size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t("dm.callNoiseReduction")}</Text>
            <Toggle value={noiseReduction} onValueChange={onToggleNoiseReduction} />
          </View>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t("dm.callConnectionQuality")}</Text>
            <View style={styles.bars}>
              {BAR_HEIGHTS.map((h, i) => (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    { height: h, backgroundColor: i < config.activeBars ? config.color : INACTIVE_BAR_COLOR },
                  ]}
                />
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#1E293B",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 32,
    paddingTop: 6,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "center", marginTop: 10, marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 },
  rowLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 14 },
  bar: { width: 4, borderRadius: 1 },
});
