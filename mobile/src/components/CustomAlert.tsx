import React, { useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { theme } from "../theme";

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

interface AlertState {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

// RN'in kendi Alert.alert'i telefonun VARSAYILAN sistem popup'ini (beyaz,
// koyu temayla alakasiz) gosteriyordu - bu, kendi tasarimimizla ayni
// (koyu, yuvarlak koseli) gorunen, drop-in bir yedek. Cagri imzasi
// Alert.alert ile AYNI (title, message?, buttons?) - degisiklik sadece
// import + fonksiyon adi. showAlert herhangi bir komponentin DISINDAN da
// cagrilabilsin diye (Alert.alert gibi) modul seviyesinde bir fonksiyon
// referansi kullaniyoruz; gercek state'i <CustomAlertHost/> tutuyor (bir kez,
// App.tsx'te mount edilir).
let showFn: ((title: string, message?: string, buttons?: AlertButton[]) => void) | null = null;

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  showFn?.(title, message, buttons);
}

export default function CustomAlertHost() {
  const [state, setState] = useState<AlertState | null>(null);

  useEffect(() => {
    showFn = (title, message, buttons) => {
      setState({ title, message, buttons: buttons && buttons.length > 0 ? buttons : [{ text: "Tamam" }] });
    };
    return () => {
      showFn = null;
    };
  }, []);

  function handlePress(btn: AlertButton) {
    setState(null);
    btn.onPress?.();
  }

  if (!state) return null;

  const stacked = state.buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setState(null)} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <View style={[styles.buttonGroup, stacked ? styles.buttonGroupCol : styles.buttonGroupRow]}>
            {state.buttons.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.button,
                  stacked ? i > 0 && styles.buttonBorderTop : i > 0 && styles.buttonBorderLeft,
                ]}
                onPress={() => handlePress(btn)}
              >
                <Text
                  style={[
                    styles.buttonText,
                    btn.style === "destructive" && styles.destructiveText,
                    btn.style === "cancel" && styles.cancelText,
                  ]}
                >
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 32 },
  card: { width: "100%", maxWidth: 320, backgroundColor: theme.surface, borderRadius: 16, overflow: "hidden" },
  title: { color: theme.text, fontSize: 16, fontWeight: "700", textAlign: "center", paddingTop: 20, paddingHorizontal: 20 },
  message: { color: theme.textMuted, fontSize: 14, textAlign: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, lineHeight: 19 },
  buttonGroup: { borderTopWidth: 1, borderColor: theme.border },
  buttonGroupRow: { flexDirection: "row" },
  buttonGroupCol: { flexDirection: "column" },
  button: { flex: 1, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  buttonBorderLeft: { borderLeftWidth: 1, borderColor: theme.border },
  buttonBorderTop: { borderTopWidth: 1, borderColor: theme.border },
  buttonText: { color: theme.accent, fontSize: 15, fontWeight: "600" },
  cancelText: { color: theme.textMuted, fontWeight: "500" },
  destructiveText: { color: theme.danger },
});
