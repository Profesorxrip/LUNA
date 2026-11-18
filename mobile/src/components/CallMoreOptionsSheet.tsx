import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Plus, Lock, ChevronRight } from "lucide-react-native";
import Toggle from "./Toggle";
import type { ConnectionQuality } from "../hooks/useConnectionQuality";

export interface SecurityCodeEntry {
  userId: string;
  name: string;
  code: string | null;
}

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
  // GERCEK aramada verilir (bkz. useCallEngine.ts) - uctan uca sifreleme
  // satirini ve "Dogrula" ekranini gosterir. Verilmezse (DevHarness mockup
  // testi) satir hic gosterilmez.
  e2ee?: { supported: boolean; entries: SecurityCodeEntry[] };
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
  e2ee,
}: Props) {
  const { t } = useTranslation();
  const config = QUALITY_CONFIG[quality];
  const [codeModalVisible, setCodeModalVisible] = useState(false);

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

          {!!e2ee && (
            <TouchableOpacity style={styles.row} onPress={() => setCodeModalVisible(true)}>
              <View style={styles.e2eeLabelRow}>
                <Lock size={16} color="#22C55E" />
                <Text style={styles.rowLabel}>{t("dm.callE2eeLabel")}</Text>
              </View>
              <View style={styles.e2eeLabelRow}>
                <Text style={styles.e2eeVerifyText}>{t("dm.callE2eeVerify")}</Text>
                <ChevronRight size={18} color="rgba(255,255,255,0.4)" />
              </View>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </TouchableOpacity>

      {!!e2ee && (
        <Modal
          visible={codeModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCodeModalVisible(false)}
          statusBarTranslucent
        >
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setCodeModalVisible(false)}>
            <TouchableOpacity activeOpacity={1} style={styles.codeSheet} onPress={() => {}}>
              <View style={styles.handle} />
              <Text style={styles.codeTitle}>{t("dm.callE2eeTitle")}</Text>
              <Text style={styles.codeExplain}>
                {e2ee.supported ? t("dm.callE2eeExplain") : t("dm.callE2eeExplainFallback")}
              </Text>
              {e2ee.entries.map((entry) => (
                <View key={entry.userId} style={styles.codeRow}>
                  <Text style={styles.codeName} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text style={styles.codeValue}>{entry.code ?? t("dm.callE2eePending")}</Text>
                </View>
              ))}
              <TouchableOpacity style={styles.codeCloseBtn} onPress={() => setCodeModalVisible(false)}>
                <Text style={styles.codeCloseLabel}>{t("dm.callClose")}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
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
  e2eeLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  e2eeVerifyText: { color: "#38BDF8", fontSize: 13, fontWeight: "600" },
  codeSheet: {
    backgroundColor: "#1E293B",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 32,
    paddingTop: 6,
    paddingHorizontal: 20,
  },
  codeTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "700", marginBottom: 8 },
  codeExplain: { color: "rgba(255,255,255,0.6)", fontSize: 13, lineHeight: 18, marginBottom: 16 },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  codeName: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", flexShrink: 1 },
  codeValue: { color: "#22C55E", fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  codeCloseBtn: { alignItems: "center", paddingVertical: 14, marginTop: 10 },
  codeCloseLabel: { color: "rgba(255,255,255,0.65)", fontSize: 15, fontWeight: "600" },
});
