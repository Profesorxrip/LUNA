import React, { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, PanResponder } from "react-native";
import { useTranslation } from "react-i18next";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme";
import { clamp, hsvToRgb, rgbToHex, hexToRgb, rgbToHsv, hexToHsv, STICKER_COLORS } from "../utils/colorMath";

/** Gokkusagi dugmesiyle acilan GERCEK HSV renk secici (doygunluk/parlaklik
 * karesi + ton cubugu + hex girisi + hizli renk listesi) - SendMediaSheet
 * (fotograf) ve SendVideoSheet (video) editorleri AYNI bileseni, hem metin
 * etiketi HEM DE cizim rengi icin kullaniyor (hangisini degistirecegini
 * caginin kendisi - onChangeHex - belirliyor). */
export default function ColorPalettePickerModal({
  visible,
  initialHex,
  onChangeHex,
  onClose,
}: {
  visible: boolean;
  initialHex: string;
  onChangeHex: (hex: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [pickerHue, setPickerHue] = useState(0);
  const [pickerSat, setPickerSat] = useState(1);
  const [pickerVal, setPickerVal] = useState(1);
  const [pickerHexText, setPickerHexText] = useState("#FF0000");
  const [svSize, setSvSize] = useState({ width: 1, height: 1 });
  const [hueBarWidth, setHueBarWidth] = useState(1);

  useEffect(() => {
    if (!visible) return;
    const [h, s, v] = hexToHsv(initialHex);
    setPickerHue(h);
    setPickerSat(s);
    setPickerVal(v);
    setPickerHexText(initialHex.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function applyPickerHsv(h: number, s: number, v: number) {
    setPickerHue(h);
    setPickerSat(s);
    setPickerVal(v);
    const [r, g, b] = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    setPickerHexText(hex);
    onChangeHex(hex);
  }
  function applyPickerHex(text: string) {
    setPickerHexText(text);
    const clean = text.startsWith("#") ? text : `#${text}`;
    const rgb = hexToRgb(clean);
    if (!rgb) return;
    const [h, s, v] = rgbToHsv(...rgb);
    setPickerHue(h);
    setPickerSat(s);
    setPickerVal(v);
    onChangeHex(clean.toUpperCase());
  }

  // NOT useRef: diger surukleme responder'lariyla (StickerView) AYNI
  // sebepten - her render'da YENIDEN kuruluyor ki pickerHue/Sat/Val/svSize/
  // hueBarWidth KAPANISLARI her zaman GUNCEL olsun.
  const svResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      applyPickerHsv(pickerHue, clamp(locationX / svSize.width, 0, 1), clamp(1 - locationY / svSize.height, 0, 1));
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      applyPickerHsv(pickerHue, clamp(locationX / svSize.width, 0, 1), clamp(1 - locationY / svSize.height, 0, 1));
    },
  });
  const hueResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      applyPickerHsv(clamp(evt.nativeEvent.locationX / hueBarWidth, 0, 1) * 359, pickerSat, pickerVal);
    },
    onPanResponderMove: (evt) => {
      applyPickerHsv(clamp(evt.nativeEvent.locationX / hueBarWidth, 0, 1) * 359, pickerSat, pickerVal);
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.paletteOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.paletteCard}>
          <View style={styles.sheetHandleTop} />

          {/* Doygunluk (sat) / parlaklik (val) karesi - saf ton rengi
              uzerine beyaz->seffaf (yatay) ve seffaf->siyah (dikey) iki
              gradyan bindirilerek klasik HSV karesi elde ediliyor. */}
          <View style={styles.svSquare} onLayout={(e) => setSvSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} {...svResponder.panHandlers}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: rgbToHex(...hsvToRgb(pickerHue, 1, 1)) }]} />
            <LinearGradient colors={["#FFFFFF", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={["rgba(0,0,0,0)", "#000000"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            <View
              pointerEvents="none"
              style={[styles.svThumb, { left: pickerSat * svSize.width - 10, top: (1 - pickerVal) * svSize.height - 10, backgroundColor: pickerHexText }]}
            />
          </View>

          {/* Ton (hue) cubugu - tam renk spektrumu */}
          <View style={styles.hueBar} onLayout={(e) => setHueBarWidth(e.nativeEvent.layout.width)} {...hueResponder.panHandlers}>
            <LinearGradient
              colors={["#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#FF0000"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={[styles.hueThumb, { left: (pickerHue / 360) * hueBarWidth - 11 }]} />
          </View>

          {/* Canli onizleme + hex girisi - istenilen rengi dogrudan da yazabiliyoruz */}
          <View style={styles.hexRow}>
            <View style={[styles.hexPreview, { backgroundColor: pickerHexText }]} />
            <TextInput
              style={styles.hexInput}
              value={pickerHexText}
              onChangeText={applyPickerHex}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              placeholder="#FFFFFF"
              placeholderTextColor="#6B7280"
            />
          </View>

          <View style={styles.paletteQuickRow}>
            {STICKER_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                testID={`palette-color-${c}`}
                style={[styles.paletteSwatch, { backgroundColor: c, borderColor: c === "#FFFFFF" ? "#000000" : "#FFFFFF" }]}
                onPress={() => applyPickerHsv(...hexToHsv(c))}
              />
            ))}
          </View>

          <LinearGradient colors={["#FFFFFF", "#38BDF8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.paletteDoneGradientBorder}>
            <TouchableOpacity style={styles.paletteDoneBtnDark} onPress={onClose}>
              <Text style={styles.paletteDoneBtnDarkText}>{t("sendMedia.colorPaletteDone")}</Text>
            </TouchableOpacity>
          </LinearGradient>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  paletteOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  paletteCard: {
    backgroundColor: "#15202B",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingBottom: 30,
    paddingHorizontal: 20,
    alignItems: "stretch",
  },
  sheetHandleTop: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A4C5E", marginBottom: 18, alignSelf: "center" },
  paletteSwatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2 },
  svSquare: { width: "100%", height: 180, borderRadius: 14, overflow: "hidden", marginBottom: 14 },
  svThumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  hueBar: { width: "100%", height: 24, borderRadius: 12, overflow: "hidden", marginBottom: 16 },
  hueThumb: {
    position: "absolute",
    top: 1,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  hexRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  hexPreview: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  hexInput: {
    flex: 1,
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
  paletteQuickRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  paletteDoneGradientBorder: { borderRadius: 10, padding: 2 },
  paletteDoneBtnDark: { backgroundColor: "#000000", borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  paletteDoneBtnDarkText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", letterSpacing: 0.2, textTransform: "uppercase" },
});
