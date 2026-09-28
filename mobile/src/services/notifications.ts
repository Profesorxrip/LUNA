import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { getSocket } from "./socket";

/** Push bildirim izni ister, bir Expo push token'i alir ve sunucuya
 * kaydeder (roadmap AŞAMA 9). Gercek bir cihaz + EAS projesi (app.json
 * icinde extra.eas.projectId) gerektirir - bu ayar henuz yapilmadigi ve
 * web/emulator ortaminda calismayacagi icin, HER adim hata verirse
 * sessizce vazgecer (bildirim opsiyonel bir ozellik, uygulamayi bozmamali). */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) {
      console.log("Push bildirimleri sadece gercek cihazda calisir (emulator/web'de atlanir).");
      return;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      console.log("Push bildirim izni verilmedi.");
      return;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    // extra.eas.projectId app.json'da henuz tanimli degil - EAS build
    // kurulunca eklenmeli, o zamana kadar bu adim hata verip sessizce
    // durur (asagidaki catch).
    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;
    const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

    getSocket().emit("push:registerToken", { token, platform }, (res: any) => {
      if (!res?.ok) console.log("Push token sunucuya kaydedilemedi.");
    });
  } catch (err) {
    console.log("Push bildirim kaydi atlandi:", (err as Error).message);
  }
}
