import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Compass, Users, Plus, User, Settings } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { theme } from "../theme";

const INACTIVE = "#6b7690";

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  Discover: Compass,
  Friends: Users,
  Profile: User,
  Settings: Settings,
};

/** Variant B (kullanicinin onayladigi, bkz. tabbar_compare.html) - 5 sekme,
 * ortadaki "Oluştur" diger 4'unden FARKLI: etiketsiz, yukari tasmis, marka
 * gradyanli dairesel bir buton (Rave'deki gibi "+" HER ZAMAN direkt platform
 * secmeye goturur, bu yuzden digerleri gibi bir "aktif/pasif" sekme degil). */
export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const bottomPad = Math.max(insets.bottom, 10);

  const labels: Record<string, string> = {
    Discover: t("tabs.discover"),
    Friends: t("tabs.friends"),
    Profile: t("tabs.profile"),
    Settings: t("tabs.settings"),
  };

  return (
    <View style={[styles.bar, { paddingBottom: bottomPad, height: 58 + bottomPad }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (route.name === "Create") {
          return (
            <TouchableOpacity key={route.key} onPress={onPress} style={styles.tab} activeOpacity={0.85}>
              <LinearGradient
                colors={[theme.accentBright, theme.accent]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.createButton}
              >
                <Plus size={26} color="#04141F" strokeWidth={2.6} />
              </LinearGradient>
            </TouchableOpacity>
          );
        }

        const Glyph = ICONS[route.name] ?? Compass;
        return (
          <TouchableOpacity key={route.key} onPress={onPress} style={styles.tab} activeOpacity={0.7}>
            <Glyph size={22} color={isFocused ? theme.accentBright : INACTIVE} strokeWidth={1.8} />
            <Text style={[styles.label, isFocused && styles.labelActive]} numberOfLines={1}>
              {labels[route.name]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(10,14,22,0.94)",
    borderTopWidth: 1,
    borderTopColor: "rgba(14,165,233,0.2)",
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: INACTIVE,
  },
  labelActive: { color: "#FFFFFF" },
  createButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -24,
    borderWidth: 4,
    borderColor: "#0A0E16",
    shadowColor: theme.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
});
