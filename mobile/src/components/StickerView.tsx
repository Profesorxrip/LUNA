import React, { useRef } from "react";
import { View, Text, TextInput, StyleSheet, PanResponder } from "react-native";
import type { TextSticker } from "../utils/mediaEditorTypes";

/** Onizlemedeki (fotograf ya da video) bir metin etiketi - kendi
 * PanResponder'iyla surukleniyor. Her render'da YENIDEN olusturuluyor
 * (useRef/useMemo YOK) ki "grant" aninda HER ZAMAN guncel x/y'yi yakalasin
 * (eski/durgun closure sorunu olmasin). SendMediaSheet (fotograf) ve
 * SendVideoSheet (video) editorleri AYNI bileseni paylasiyor. */
export default function StickerView({
  sticker,
  editing,
  placeholder,
  onDrag,
  onStartEdit,
  onChangeText,
  onFinishEdit,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  sticker: TextSticker;
  editing: boolean;
  placeholder: string;
  onDrag: (id: string, x: number, y: number) => void;
  onStartEdit: (id: string) => void;
  onChangeText: (id: string, text: string) => void;
  onFinishEdit: () => void;
  onDelete: (id: string) => void;
  onDragStart: () => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (id: string, pageX: number, pageY: number) => void;
}) {
  const grantTime = useRef(0);
  const moved = useRef(false);
  // Kullanici: "O metni yazdıktan sonra istediğimiz yere oynatabiliyoruz
  // değilmi" - ONCEKI halde Text, kendi dokunusunu KENDI uzerine alan bir
  // TouchableOpacity'nin icindeydi, bu yuzden ustteki surukleme View'i hic
  // devreye giremiyordu (surukleme calismiyordu). Tek bir PanResponder'la
  // hem durma/tiklama (duzenlemeye gir), hem uzun basma (sil), hem de
  // surukleme ayni yerde ayirt ediliyor.
  //
  // Onemli: bu bilesen setState sonrasi HER render'da yeniden olusturuluyor
  // (bkz. dosya basindaki not), ve react-native-web'de PanResponder'in HER
  // YENIDEN OLUSTURULMASI gesture'in baslangic referans noktasini da
  // SIFIRLIYOR - yani gestureState.dx/dy, ilk dokunustan beri TOPLAM kayma
  // DEGIL, SADECE bir onceki "move" karesinden bu yana olan KUCUK artis.
  // Bu yuzden pozisyonu "grant anindaki konum + toplam dx" yerine her
  // seferinde "GUNCEL konum + bu karenin dx'i" ile guncelliyoruz.
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => !editing,
    onMoveShouldSetPanResponder: () => !editing,
    onPanResponderGrant: () => {
      grantTime.current = Date.now();
      moved.current = false;
    },
    onPanResponderMove: (evt, g) => {
      if (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3) {
        if (!moved.current) onDragStart();
        moved.current = true;
      }
      onDrag(sticker.id, sticker.x + g.dx, sticker.y + g.dy);
      if (moved.current) onDragMove(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    },
    onPanResponderRelease: (evt) => {
      if (!moved.current) {
        if (Date.now() - grantTime.current > 350) onDelete(sticker.id);
        else onStartEdit(sticker.id);
        return;
      }
      // Kullanici: "Yazıyı sürükleyip çöp kovasına atabilelim" - surukleme
      // bittigi an sayfa koordinatini (pageX/Y) ust bilesene bildiriyoruz,
      // o da cop kutusunun olculmus konumuyla karsilastirip gerekirse siliyor.
      onDragEnd(sticker.id, evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    },
    // Ustteki onizlemenin pinch-zoom/pan/kaydir-kapat PanResponder'i, bu
    // sticker'in GRANT ettigi responder'i ilk "move" aninda geri
    // isteyip ALIYORDU (RNW'de onPanResponderTerminationRequest varsayilan
    // true oldugu icin) - bu yuzden tek bir piksel bile surukleme GERCEKTE
    // calismiyordu. Artik reddediyoruz, surukleme gesture'i sonuna kadar
    // bu sticker'da kaliyor.
    onPanResponderTerminationRequest: () => false,
  });

  const dynamicTextStyle = { color: sticker.color, fontFamily: sticker.font, fontWeight: sticker.font ? undefined : ("800" as const) };

  return (
    <View style={[styles.stickerWrap, { left: sticker.x, top: sticker.y }]} {...responder.panHandlers}>
      {editing ? (
        <TextInput
          autoFocus
          value={sticker.text}
          onChangeText={(txt) => onChangeText(sticker.id, txt)}
          onBlur={onFinishEdit}
          onSubmitEditing={onFinishEdit}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.5)"
          style={[styles.stickerInput, dynamicTextStyle]}
        />
      ) : (
        <Text style={[styles.stickerText, dynamicTextStyle]}>{sticker.text}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stickerWrap: { position: "absolute" },
  stickerText: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  stickerInput: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    minWidth: 60,
    padding: 0,
    outlineWidth: 0,
    outlineStyle: "none",
  } as any,
});
