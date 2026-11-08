import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus } from "lucide-react-native";
import { theme } from "../theme";
import TabGlowIcon, { TabGlowIconName } from "./TabGlowIcon";

const INACTIVE = "#6b7690";

export type TabKey = TabGlowIconName | "Create";

// MainTabsRoute (RootNavigator.tsx) icindeki <Tab.Navigator> cocuklarinin
// GERCEK sirasiyla birebir ayni - TabBar.tsx'in normal durumda state.routes
// uzerinden aldigi sirayi, Tab.Navigator DISINDAKI ekranlar (orn.
// RoomPreviewScreen) icin burada sabit tekrar ediyoruz.
const TAB_ORDER: TabKey[] = ["Profile", "Discover", "Create", "DMs", "Friends"];

interface Props {
  activeTab: TabKey | null;
  onSelect: (tab: TabKey) => void;
}

/** TabBar.tsx'in GORSEL olarak birebir aynisi, ama react-navigation'in
 * BottomTabBarProps'una (state/descriptors/navigation) bagli degil - Tab
 * Navigator'in DISINDAKI "derinlemesine" ekranlarda (orn. RoomPreviewScreen)
 * da ayni altbari gosterip buradan sekme degistirebilmek icin ayristirildi.
 * TabBar.tsx da GERCEK altbarda bunu sarmalayip kullaniyor, boylece iki
 * yerde de TEK bir gorsel kaynak var. */
export default function StaticTabBar({ activeTab, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <View style={[styles.bar, { paddingBottom: bottomPad, height: 58 + bottomPad }]}>
      <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.topDivider} />
      {TAB_ORDER.map((tab) => {
        const isFocused = activeTab === tab;

        if (tab === "Create") {
          return (
            <TouchableOpacity key={tab} onPress={() => onSelect(tab)} style={styles.tab} activeOpacity={0.85}>
              <View style={styles.createWrap}>
                {isFocused && <View style={styles.createGlow} />}
                <LinearGradient colors={["#6E9BC0", "#FFFFFF"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.createButton}>
                  <Plus size={28} color="#17344A" strokeWidth={2.6} />
                </LinearGradient>
              </View>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity key={tab} onPress={() => onSelect(tab)} style={styles.tab} activeOpacity={0.7}>
            <TabGlowIcon name={tab} size={28} color={isFocused ? "#FFFFFF" : INACTIVE} glow={isFocused} strokeWidth={1.8} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(10,14,22,0.94)" },
  topDivider: { position: "absolute", top: 0, left: 0, right: 0, height: 1 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
  createWrap: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center", marginTop: -24 },
  createGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 35,
    backgroundColor: theme.accentBright,
    opacity: 0.22,
    shadowColor: theme.accentBright,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 16,
    elevation: 8,
  },
  createButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#17344A",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
});
