import React, { useRef, useState } from "react";
import { View, PanResponder, StyleSheet, LayoutChangeEvent } from "react-native";
import Icon, { IconName } from "./Icon";

interface Props {
  value: number; // 0..1
  onValueChange: (value: number) => void;
  icon: IconName;
  // Ses kapalıyken (deger esigin altindaysa) dolgu/ikon rengi acik/kapali
  // farkini HEMEN gosterebilsin diye ayri tutuluyor - sadece dolgu
  // yuksekligine bakarak "acik mi kapali mi" ayirt etmek zordu.
  muted: boolean;
}

// Deneme: "ses çubukları" - yatay kaydırıcı yerine dikey, hap (kapsül)
// şeklinde bir ses seviyesi göstergesi/kaydırıcısı.
export default function VerticalVolumeBar({ value, onValueChange, icon, muted }: Props) {
  const heightRef = useRef(1);
  const [trackHeight, setTrackHeight] = useState(1);

  function handleLayout(e: LayoutChangeEvent) {
    heightRef.current = e.nativeEvent.layout.height;
    setTrackHeight(e.nativeEvent.layout.height);
  }

  function updateFromY(y: number) {
    const clamped = Math.max(0, Math.min(heightRef.current, y));
    onValueChange(1 - clamped / heightRef.current);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => updateFromY(evt.nativeEvent.locationY),
      onPanResponderMove: (evt) => updateFromY(evt.nativeEvent.locationY),
    })
  ).current;

  // En altta birkaç pikselik mavi iz kalmasin diye deger neredeyse sifirsa
  // (ornegin tam dibe degmeyen bir surukleme/tiklama ile) dolguyu tamamen
  // kaldiriyoruz - cubuk o zaman komple ust yarinin (bos) rengine donuyor.
  const filledHeight = value <= 0.02 ? 0 : trackHeight * value;
  const capRadius = Math.min(28, filledHeight / 2);

  return (
    <View style={styles.wrap} onLayout={handleLayout} {...panResponder.panHandlers}>
      <View
        style={[
          styles.filled,
          { height: filledHeight, borderTopLeftRadius: capRadius, borderTopRightRadius: capRadius },
        ]}
      />
      <View style={styles.iconWrap}>
        <Icon name={icon} size={20} color={muted ? "#6B7686" : "#FFFFFF"} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 56,
    height: 200,
    borderRadius: 28,
    backgroundColor: "#0B1526",
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  filled: {
    width: "100%",
    backgroundColor: "#2A3F5F",
  },
  iconWrap: {
    position: "absolute",
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: "center",
  },
});
