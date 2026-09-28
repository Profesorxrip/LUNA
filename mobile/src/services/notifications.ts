import { Platform } from "react-native";
import { getSocket } from "./socket";

/** Push bildirim izni ister, bir Expo push token'i alir ve sunucuya
 * kaydeder (roadmap AŞAMA 9). Gercek bir cihaz + EAS projesi (app.json
 * icinde extra.eas.projectId) gerektirir. Expo Go SDK 53+ Android'de push
 * bildirimlerini tamamen kaldirdi - expo-notifications'i STATIC import
 * etmek bile Expo Go'da aninda crash'e yol aciyor, bu yuzden modul
 * BURADA, bir try/catch'in icinde, calisma zamaninda require ediliyor -
 * boylece Expo Go'da (veya baska herhangi bir nedenle) basarisiz olursa
 * sessizce vazgecilir, uygulamanin geri kalani calismaya devam eder. */
export async function registerForPushNotifications(): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require("expo-notifications");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Device = require("expo-device");

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
    console.log("Push bildirim kaydi atlandi (Expo Go'da desteklenmiyor olabilir):", (err as Error).message);
  }
}
