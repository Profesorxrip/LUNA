import { useEffect, useState } from "react";
import { getSocket } from "../services/socket";

export type ConnectionQuality = "good" | "medium" | "poor";

// useCallEngine.ts'teki GERCEK WebRTC getStats() olcumu de AYNI esikleri
// kullansin diye disa aciliyor - iki ayri "kalite" tanimi olmasin.
export const GOOD_MS = 150;
export const MEDIUM_MS = 350;

/** Sunucuya "ping:rtt" gonderip donus suresini (RTT) olcerek GERCEK bir
 * baglanti kalitesi degeri uretir (bkz. server/src/index.ts ping:rtt) -
 * aramanin kendisi hala gorsel bir mockup ama bu olcum sahte degil,
 * istemci-sunucu arasindaki gercek gecikmeyi yansitiyor. `active` false
 * iken olcum durur (ornegin arama bitince). */
export function useConnectionQuality(active: boolean, intervalMs = 4000): ConnectionQuality {
  const [quality, setQuality] = useState<ConnectionQuality>("good");

  useEffect(() => {
    if (!active) return;
    const socket = getSocket();
    let cancelled = false;

    function measure() {
      const sentAt = Date.now();
      socket.emit("ping:rtt", () => {
        if (cancelled) return;
        const rtt = Date.now() - sentAt;
        setQuality(rtt < GOOD_MS ? "good" : rtt < MEDIUM_MS ? "medium" : "poor");
      });
    }

    measure();
    const id = setInterval(measure, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, intervalMs]);

  return quality;
}
