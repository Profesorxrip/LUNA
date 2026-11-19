import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSocket, MediaSource, RoomState } from "../services/socket";
import { supabase } from "../services/supabase";
import { showAlert } from "../components/CustomAlert";
import MediaPickerSheet from "../components/MediaPickerSheet";
import { addToBlankPlaylist } from "../utils/blankPlaylist";
import { useCallEngineContext } from "../contexts/CallEngineContext";

interface Props {
  onRoomCreated: (room: RoomState) => void;
}

/** "Oluştur" TAB'i - eskiden DiscoverScreen.tsx'teki FAB'dan acilan
 * MediaPickerSheet Modal'i, artik kalici bir sekme (bkz. MediaPickerSheet.tsx
 * embedded prop'u) - oda, icerik secilmeden var olamaz, bu yuzden ekranin
 * tamami dogrudan platform secme grid'i. */
export default function CreateRoomScreen({ onRoomCreated }: Props) {
  const { t } = useTranslation();
  const [hostName, setHostName] = useState(t("discover.defaultGuestName"));
  const { setBannerSuppressedByScreen } = useCallEngineContext();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email;
      if (email) setHostName(email.split("@")[0]);
    });
  }, []);

  // Kucultulmus arama banner'i SADECE platform secme IZGARASINDA gorunmeli -
  // youtube/weburl/history/liked/external gibi alt ekranlarin ust barlari
  // banner'in bindirme bolgesiyle cakisiyor (bkz. CallEngineContext.tsx
  // bannerSuppressedByScreen). Ekrandan tamamen ayrilinca (unmount) da
  // bastirma sifirlanir, aksi halde baska bir sekmede banner GEREKSIZ YERE
  // gizli kalabilirdi.
  useEffect(() => {
    return () => setBannerSuppressedByScreen(false);
  }, [setBannerSuppressedByScreen]);

  function createRoomWithSource(source: MediaSource) {
    getSocket()
      .timeout(8000)
      .emit("room:create", { name: hostName, isPublic: true, source }, (err: any, res: any) => {
        if (err) return showAlert(t("discover.createFailedTitle"), t("common.connectionIssueBody"));
        if (res?.ok) {
          if (source.url) addToBlankPlaylist(source.url);
          onRoomCreated(res.room);
        } else showAlert(t("discover.createFailedTitle"), res?.error || t("common.unknownError"));
      });
  }

  return (
    <MediaPickerSheet
      visible
      embedded
      onClose={() => {}}
      onSelect={createRoomWithSource}
      onModeChange={(mode) => setBannerSuppressedByScreen(mode !== "grid")}
    />
  );
}
