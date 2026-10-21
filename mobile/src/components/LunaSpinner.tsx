import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { theme } from "../theme";

interface Props {
  size?: number;
  color?: string;
}

// Uc nokta, merkez etrafinda 120 derece araliklarla - en buyuk/en parlak
// olan "basi cekiyor", digerleri gittikce kuculup soluklasarak bir
// "yorunge" hissi veriyor (platformun tek-halkali ActivityIndicator'inden
// bilerek farkli - LUNA'ya ozel bir yukleniyor gostergesi).
const ORBIT_DOTS = [
  { angle: 0, scale: 1, opacity: 1 },
  { angle: 120, scale: 0.72, opacity: 0.6 },
  { angle: 240, scale: 0.5, opacity: 0.32 },
];

/** LUNA'ya ozel yukleniyor gostergesi - genel ActivityIndicator yerine,
 * marka vurgu rengiyle (varsayilan theme.accent) uc noktanin merkez
 * etrafinda surekli donmesiyle olusan bir "yorunge" spinner'i (bkz.
 * SplashScreen.tsx). */
export default function LunaSpinner({ size = 32, color = theme.accent }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const radius = size / 2 - size * 0.09;

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size, transform: [{ rotate: spin }] }]}>
      {ORBIT_DOTS.map((dot, i) => {
        const dotSize = size * 0.18 * dot.scale;
        const rad = (dot.angle * Math.PI) / 180;
        const x = radius * Math.cos(rad);
        const y = radius * Math.sin(rad);
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                top: size / 2 - dotSize / 2,
                left: size / 2 - dotSize / 2,
                backgroundColor: color,
                opacity: dot.opacity,
                transform: [{ translateX: x }, { translateY: y }],
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute" },
});
