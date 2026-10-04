import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import Icon from "../components/Icon";
import { showAlert } from "../components/CustomAlert";
import { triggerHaptic } from "../utils/haptics";

interface Props {
  onBack: () => void;
}

const ACCENT = "#0EA5E9";

const BENEFITS = [
  "Reklamsız, kesintisiz izleme deneyimi",
  "Profilinde özel Premium rozeti",
  "Odalarda daha yüksek katılımcı limiti",
  "Öncelikli destek",
];

type PlanKey = "monthly" | "yearly";

const PLANS: { key: PlanKey; label: string; price: string; note?: string }[] = [
  { key: "monthly", label: "Aylık", price: "₺49,99" },
  { key: "yearly", label: "Yıllık", price: "₺399,99", note: "2 ay bedava" },
];

/** Gercek bir odeme ekrani - plan secimi ve "Devam Et" akisi tamamen
 * calisiyor, ama GERCEK tahsilat (App Store/Play Store IAP ya da Stripe)
 * henuz baglanmadi (magaza hesaplari bu ortamdan kurulamiyor) - bu yuzden
 * "Devam Et" su an durumu acikca soyleyen bir bilgi mesaji gosteriyor. */
export default function PremiumScreen({ onBack }: Props) {
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("yearly");

  function handleContinue() {
    triggerHaptic();
    showAlert(
      "Ödeme altyapısı yakında",
      "Satın alma akışı (Apple/Google uygulama içi satın alma) henüz bağlanmadı - bu ekran hazır, ödeme sağlayıcısı eklenince aktif olacak."
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={10}>
            <Icon name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View style={styles.crownBadge}>
            <Icon name="crown" size={36} color={ACCENT} />
          </View>
          <Text style={styles.title}>LUNA PREMIUM</Text>
          <Text style={styles.tagline}>REKLAMSIZ BİR LUNA İÇİN...</Text>
        </View>

        <View style={styles.benefitList}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefitRow}>
              <View style={styles.benefitCheck}>
                <Icon name="check" size={14} color={ACCENT} />
              </View>
              <Text style={styles.benefitText}>{b}</Text>
            </View>
          ))}
        </View>

        <View style={styles.plans}>
          {PLANS.map((plan) => {
            const active = plan.key === selectedPlan;
            return (
              <TouchableOpacity
                key={plan.key}
                style={[styles.planCard, active && styles.planCardActive]}
                onPress={() => {
                  triggerHaptic();
                  setSelectedPlan(plan.key);
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
                <View style={styles.planTextCol}>
                  <Text style={styles.planLabel}>{plan.label}</Text>
                  {plan.note && <Text style={styles.planNote}>{plan.note}</Text>}
                </View>
                <Text style={styles.planPrice}>{plan.price}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.continueButton} onPress={handleContinue} activeOpacity={0.85}>
          <Text style={styles.continueButtonText}>Devam Et</Text>
        </TouchableOpacity>
        <Text style={styles.disclaimer}>İstediğin zaman iptal edebilirsin.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  scrollContent: { paddingBottom: 48 },
  header: { paddingHorizontal: 18, paddingTop: 54, paddingBottom: 10 },
  hero: { alignItems: "center", marginTop: 8, paddingHorizontal: 24 },
  crownBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(14,165,233,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
  tagline: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginTop: 6,
    textAlign: "center",
  },
  benefitList: { marginTop: 32, paddingHorizontal: 24, gap: 14 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(14,165,233,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  benefitText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", flex: 1 },
  plans: { marginTop: 32, paddingHorizontal: 18, gap: 10 },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.1)",
  },
  planCardActive: { borderColor: ACCENT, backgroundColor: "rgba(14,165,233,0.08)" },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  radioActive: { borderColor: ACCENT },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
  planTextCol: { flex: 1 },
  planLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  planNote: { color: ACCENT, fontSize: 11, fontWeight: "700", marginTop: 2 },
  planPrice: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  continueButton: {
    marginHorizontal: 18,
    marginTop: 28,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  continueButtonText: { color: "#04140D", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  disclaimer: { color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "500", textAlign: "center", marginTop: 14 },
});
