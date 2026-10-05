import React from "react";
import InfoScreen from "./InfoScreen";

const SECTIONS = [
  {
    heading: "Hangi verileri topluyoruz",
    body:
      "Hesabını oluştururken e-posta adresini (veya Google hesabını) ve bir şifreyi Supabase üzerinden saklıyoruz. Profilinde doldurduğun isim, kullanıcı adı, biyografi ve profil fotoğrafı; katıldığın/oluşturduğun odalar, oda sohbeti ve özel mesajların (DM); arkadaşlık istekleri ve arkadaş listen; IP adresinden tahmin edilen ülke bilginin (yalnızca \"yakınımdaki odalar\" özelliği için) de bizde tutulur.",
  },
  {
    heading: "Verilerini nasıl kullanıyoruz",
    body:
      "Bu veriler sadece LUNA'nın temel özelliklerini çalıştırmak için kullanılır: profilini göstermek, odalarda ve DM'lerde mesajlaşmanı sağlamak, arkadaşlık sistemini yürütmek ve (izin verirsen) bildirim göndermek. Verilerini reklam amacıyla satmıyor veya üçüncü taraflarla paylaşmıyoruz.",
  },
  {
    heading: "Kullandığımız alt yapı sağlayıcıları",
    body:
      "Hesap ve veritabanı altyapımız Supabase üzerinde çalışır. Sesli sohbet özelliği için LiveKit kullanılır. Push bildirimleri Expo'nun bildirim servisi üzerinden gönderilir. Bu sağlayıcılar yalnızca LUNA'nın onlara ilettiği kadar veri görür ve kendi gizlilik politikalarına tabidir.",
  },
  {
    heading: "Verilerinin kontrolü",
    body:
      "Profilindeki gizlilik ayarlarından biyografini, istatistiklerini ve çevrimiçi durumunu kimlerin görebileceğini sen belirlersin. Ayarlar ekranındaki \"Hesabı Sil\" seçeneğiyle hesabını ve ona bağlı tüm verileri (profil, mesajlar, arkadaşlıklar, galeri) kalıcı ve geri alınamaz şekilde silebilirsin.",
  },
  {
    heading: "Bize ulaş",
    body: "Gizlilikle ilgili sorularının için Ayarlar > Bize Ulaşın üzerinden bize yazabilirsin.",
  },
];

export default function PrivacyScreen() {
  return <InfoScreen title="GİZLİLİK" sections={SECTIONS} />;
}
