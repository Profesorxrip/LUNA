import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Plus } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { theme } from "../theme";
import TabGlowIcon, { TabGlowIconName } from "./TabGlowIcon";

const INACTIVE = "#6b7690";

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
              <View style={styles.createWrap}>
                {/* Isik huzmesi artik + butonunun yaninda SABIT durmuyor -
                    sadece o AN gercekten "Olustur" sekmesindeysek (isFocused)
                    butonun kendi sinirlarinda (dairesel) beliriyor, digerleriyle
                    (asagidaki iconGlow) AYNI mantik. */}
                {isFocused && <View style={styles.createGlow} />}
                <LinearGradient
                  // theme.accent (canlı/cırtlak camgöbeği mavi) yerine -
                  // digerleriyle AYNI mat/steel-blue ailesinden iki ton,
                  // sadece bu buton icin biraz daha acik/koyu uclar.
                  colors={["#6E9BC0", "#3B6480"]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.createButton}
                >
                  <Plus size={26} color="#04141F" strokeWidth={2.6} />
                </LinearGradient>
              </View>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity key={route.key} onPress={onPress} style={styles.tab} activeOpacity={0.7}>
            {/* TabGlowIcon gercek bir SVG Gaussian blur kullanir (bkz.
                LunaSpinner.tsx'teki AYNI teknik) - CSS "filter: blur()"'un
                aksine native'de (Android/iOS) de calisir. Eskiden burada
                ustuste binen, bulaniklastirilmamis ham ikon kopyalari vardi -
                gercek cihazda "yildiz patlamasi" gibi cirkin duruyordu. */}
            <TabGlowIcon name={route.name as TabGlowIconName} size={22} color={isFocused ? theme.accentBright : INACTIVE} glow={isFocused} strokeWidth={1.8} />
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
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: INACTIVE,
  },
  labelActive: { color: "#FFFFFF" },
  createWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -24,
  },
  // "+" sekmesindeysek (isFocused) AYNI iconGlow mantigi, sadece butonun
  // daha buyuk dairesine gore olceklendi.
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
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#0A0E16",
    // Butonun kendi hafif derinlik golgesi - artik HER ZAMAN yanan bir isik
    // huzmesi degil, sade/mat bir golge (bkz. createGlow, o SADECE "+"
    // sekimindeyken gorunuyor).
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
});
