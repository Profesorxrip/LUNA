import React from "react";
import InfoScreen from "./InfoScreen";

const SECTIONS = [
  {
    body:
      "Bazı Android telefon üreticileri (Xiaomi, Huawei, OnePlus, Samsung, Oppo gibi) pil tasarrufu için arka plandaki uygulamaları agresif şekilde kapatır. Bu yüzden LUNA arka plandayken bazen bildirimler gecikebilir veya sesli sohbet/oda bağlantın kopabilir - bu LUNA'nın bir hatası değil, telefonunun pil yönetimi ayarlarından kaynaklanır.",
  },
  {
    heading: "Ne yapabilirsin",
    body:
      "Telefonunun Ayarlar > Pil (veya Uygulamalar > LUNA > Pil) bölümünden LUNA için pil optimizasyonunu kapatıp \"Kısıtlama yok\" / \"İzin ver\" seçeneğini seçersen, LUNA arka planda daha güvenilir çalışır. Bazı telefonlarda ayrıca \"Otomatik başlatma\" (autostart) iznini de LUNA için açman gerekebilir.",
  },
  {
    heading: "iPhone kullanıyorsan",
    body: "iOS, uygulamaları Android kadar agresif kapatmaz; bu sorunla büyük olasılıkla karşılaşmazsın.",
  },
];

export default function BackgroundInfoScreen() {
  return <InfoScreen title="LUNA ARKA PLANDA DURDURULUYOR MU?" sections={SECTIONS} />;
}
