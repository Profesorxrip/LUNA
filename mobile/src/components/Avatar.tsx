import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts, Inter_700Bold } from "@expo-google-fonts/inter";

const COLORS = ["#F97316", "#10B981", "#3B82F6", "#EC4899", "#EAB308", "#8B5CF6", "#14B8A6"];

export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface Props {
  name: string;
  size?: number;
  avatarUrl?: string | null;
  // Discover'daki oda kartlarinda zaten var olan mavi "arkadas halkasi" ile
  // AYNI - bu kisi gercek arkadasimizsa true gelir, profilini her gordugumuz
  // yerde (katilimcilar paneli, oda onizlemesi, sohbet avatarlari) aynen
  // gorunsun diye RoomCard.tsx'teki yerine artik BURADAN tek kaynaktan gelir.
  isFriend?: boolean;
  // Varsayilan true - disinda ince gri (ya da arkadassa mavi degrade) bir
  // cerceve cizilir. VoiceCallScreen gibi avatarin zaten buyuk ve tek basina
  // durdugu yerlerde false verilip cerceve tamamen kaldirilabilir.
  ring?: boolean;
}

/** Gercek bir profil fotografi (avatarUrl) varsa onu gosterir - yoksa isme
 * gore sabit bir renk + bas harf iceren eski yedek goruntuye duser. */
export default function Avatar({ name, size = 28, avatarUrl, isFriend = false, ring = true }: Props) {
  // Sistem fontunun sentetik kalin hali (fontWeight 700) harf harf esit
  // olmayan cizgi kalinligi veriyordu (bkz. kullanicinin "PP'lerin icindeki
  // harflerin cizgi kalinliklari esit degil" geri bildirimi) - gercekten
  // kalin cizilmis Inter_700Bold, hangi harf olursa olsun tutarli duruyor.
  const [fontsLoaded] = useFonts({ Inter_700Bold });
  const core = avatarUrl ? (
    <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colorForName(name) }]}>
      <Text style={[styles.text, fontsLoaded && styles.textFontLoaded, { fontSize: size * 0.45, marginTop: -1 }]}>
        {name.trim().charAt(0).toUpperCase() || "?"}
      </Text>
    </View>
  );
  // Arkadas halkasi eskiden ayni kutunun icine borderWidth olarak ekleniyordu -
  // bu da RN'de kutuyu BUYUTMEK yerine icerigi (gercek pp/bas harf dairesini)
  // halka kalinligi kadar KUCULTUYORDU (kullanicinin "pp'ler kucuk, cerceveler
  // buyuk" geri bildirimi). Artik halka, pp'yi AYNI boyutta tutup disina
  // eklenen ayri bir cember.
  if (!ring) return core;
  if (isFriend) {
    const ringWidth = 2;
    const outerSize = size + ringWidth * 2;
    // Duz theme.accentBright (#5C87A8) gri-mavi/sonuk duruyordu - digerlerinde
    // (arama cubugu cercevesi, playlist sekme ayirici cizgisi vb.) kullanilan
    // AYNI beyazdan maviye gecen degrade "halka" burada da kullaniliyor.
    return (
      <LinearGradient
        colors={["#FFFFFF", "#38BDF8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          padding: ringWidth,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {core}
      </LinearGradient>
    );
  }
  // Arkadas DEGILSE de RoomCard.tsx'teki oda kartlarindaki katilimci
  // avatarlariyla AYNI mantikta ince bir cerceve - RoomCard'daki
  // rgba(0,0,0,0.55) koyu arka planlarda (ustuste binen avatarlar) ise
  // yariyordu ama buradaki (duz koyu lacivert) arka planda neredeyse hic
  // secilmiyordu, bu yuzden GERCEKTEN gri bir renk kullaniliyor
  // (kullanicinin "oda kartindaki gibi gri cerceve" istegi).
  const ringWidth = 1;
  const outerSize = size + ringWidth * 2;
  return (
    <View
      style={{
        width: outerSize,
        height: outerSize,
        borderRadius: outerSize / 2,
        borderWidth: ringWidth,
        borderColor: "#6B7690",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {core}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { justifyContent: "center", alignItems: "center", flexShrink: 0 },
  text: { color: "#fff", fontWeight: "700" },
  textFontLoaded: { fontFamily: "Inter_700Bold", fontWeight: "400" },
});
