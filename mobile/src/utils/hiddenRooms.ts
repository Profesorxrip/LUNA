import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "hidden_discover_rooms";

// "Odayı Sil" (bkz. RoomPreviewScreen.tsx) odayi GERCEKTEN silmiyor - sadece
// bu odanin kodunu cihaz bazli bir listeye ekleyip Keşfet ekranindan SADECE
// bu kullaniciya gizliyor (bkz. DiscoverScreen.tsx hiddenCodes).
export async function getHiddenRoomCodes(): Promise<Set<string>> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return new Set();
  try {
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

export async function hideRoomFromDiscover(code: string): Promise<void> {
  const codes = await getHiddenRoomCodes();
  codes.add(code);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(codes)));
}
