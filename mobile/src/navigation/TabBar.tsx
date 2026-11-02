import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Plus } from "lucide-react-native";
import { theme } from "../theme";
import TabGlowIcon, { TabGlowIconName } from "./TabGlowIcon";

const INACTIVE = "#6b7690";

/** Variant B (kullanicinin onayladigi, bkz. tabbar_compare.html) - 5 sekme,
 * ortadaki "Oluştur" diger 4'unden FARKLI: etiketsiz, yukari tasmis, marka
 * gradyanli dairesel bir buton (Rave'deki gibi "+" HER ZAMAN direkt platform
 * secmeye goturur, bu yuzden digerleri gibi bir "aktif/pasif" sekme degil).
 * Diger 4 sekmenin ikon ALTINDAKI yazilari artik yok (sadece ikon) - aktif
 * sekmede ikon mavi (theme.accentBright) yerine BEYAZ oluyor. */
export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <View style={[styles.bar, { paddingBottom: bottomPad, height: 58 + bottomPad }]}>
      {/* Eskiden duz renkli (rgba cam gobegi) bir "borderTopColor" cizgisiydi -
          artik beyazdan maviye gecen ince bir degrade seritle ayni rolu
          oynuyor (RN'de borderColor dogrudan gradyan olamadigi icin ayri bir
          1px LinearGradient katmani olarak cizliyoruz). */}
      <LinearGradient
        colors={["#FFFFFF", "#38BDF8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topDivider}
      />
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
                  colors={["#6E9BC0", "#FFFFFF"]}
                  start={{ x: 0.2, y: 0 }}
                  end={{ x: 0.8, y: 1 }}
                  style={styles.createButton}
                >
                  <Plus size={26} color="#17344A" strokeWidth={2.6} />
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
            <TabGlowIcon name={route.name as TabGlowIconName} size={28} color={isFocused ? "#FFFFFF" : INACTIVE} glow={isFocused} strokeWidth={1.8} />
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
  },
  topDivider: { position: "absolute", top: 0, left: 0, right: 0, height: 1 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center" },
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
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#17344A",
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
