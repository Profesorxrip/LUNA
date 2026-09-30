import React, { useRef, useState } from "react";
import { View, PanResponder, StyleSheet, LayoutChangeEvent } from "react-native";
import { theme } from "../theme";

interface Props {
  value: number; // 0..1
  onValueChange: (value: number) => void;
}

// Disariya bagimliligi olmayan basit bir kaydirici (kutuphane kurmaya gerek
// kalmadan) - Ayarlar ekranindaki ses seviyesi icin.
export default function SimpleSlider({ value, onValueChange }: Props) {
  const widthRef = useRef(1);
  const [trackWidth, setTrackWidth] = useState(1);

  function handleLayout(e: LayoutChangeEvent) {
    widthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  }

  function updateFromX(x: number) {
    const clamped = Math.max(0, Math.min(widthRef.current, x));
    onValueChange(clamped / widthRef.current);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => updateFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => updateFromX(evt.nativeEvent.locationX),
    })
  ).current;

  return (
    <View style={styles.wrap} onLayout={handleLayout} {...panResponder.panHandlers}>
      <View style={styles.track} />
      <View style={[styles.filled, { width: trackWidth * value }]} />
      <View style={[styles.thumb, { left: trackWidth * value - 8 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 24, justifyContent: "center" },
  track: { position: "absolute", left: 0, right: 0, height: 3, borderRadius: 2, backgroundColor: theme.border },
  filled: { position: "absolute", left: 0, height: 3, borderRadius: 2, backgroundColor: theme.text },
  thumb: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.text,
  },
});
