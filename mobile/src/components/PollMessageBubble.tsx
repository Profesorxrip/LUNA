import React from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { BarChart2, Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";

interface Props {
  question: string;
  options: string[];
  optionImages?: (string | null)[] | null;
  votes: number[];
  myVote: number | null;
  onVote: (optionIndex: number) => void;
}

const ACCENT = "#0EA5E9";

/** Sohbette paylasilan anket balonu - soru + her secenek icin bir oy
 * cubugu (yuzdeye gore dolan arka plan + oy sayisi). Kendi oyum vurgulu
 * (tik + accent cerceve) gosterilir, baska bir secenege dokununca oyum
 * degisir (bkz. DMScreen.tsx votePoll - "dm:votePoll" ile sunucuya, GERCEK
 * ZAMANLI "dm:pollVote" ile karsi tarafa da yansir). */
export default function PollMessageBubble({ question, options, optionImages, votes, myVote, onVote }: Props) {
  const { t } = useTranslation();
  const totalVotes = votes.reduce((sum, v) => sum + v, 0);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <BarChart2 size={16} color="rgba(255,255,255,0.7)" />
        <Text style={styles.question}>{question}</Text>
      </View>
      {options.map((opt, i) => {
        const count = votes[i] ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMine = myVote === i;
        return (
          <TouchableOpacity key={i} style={[styles.optionRow, isMine && styles.optionRowMine]} onPress={() => onVote(i)} activeOpacity={0.8}>
            <View style={[styles.fillBar, { width: `${pct}%` }]} />
            <View style={styles.optionContent}>
              <View style={styles.optionTextRow}>
                {!!optionImages?.[i] && <Image source={{ uri: optionImages[i]! }} style={styles.optionImage} />}
                {isMine && <Check size={13} color="#FFFFFF" />}
                <Text style={styles.optionText} numberOfLines={2}>
                  {opt}
                </Text>
              </View>
              <Text style={styles.optionPct}>{pct}%</Text>
            </View>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.totalText}>{t("dm.pollTotalVotes", { count: totalVotes })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 230,
    maxWidth: 270,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  question: { flex: 1, color: "#FFFFFF", fontSize: 14, fontWeight: "700" },
  optionRow: {
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  optionRowMine: { borderWidth: 1, borderColor: ACCENT },
  fillBar: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "rgba(14,165,233,0.3)",
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 8,
  },
  optionTextRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  optionImage: { width: 28, height: 28, borderRadius: 6 },
  optionText: { flex: 1, color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  optionPct: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700" },
  totalText: { color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 2 },
});
