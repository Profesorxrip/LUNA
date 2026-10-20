import React from "react";
import InfoScreen from "./InfoScreen";

const SECTIONS = [
  {
    heading: "Kabul",
    body:
      "LUNA'yı kullanarak bu Hizmet Koşulları'nı kabul etmiş olursun. Koşulları kabul etmiyorsan uygulamayı kullanmamalısın.",
  },
  {
    heading: "Hesabın",
    body:
      "Hesap oluştururken verdiğin bilgilerin doğru olmasından sen sorumlusun. Hesabının güvenliğinden (şifren, bağlı giriş yöntemlerin) sen sorumlusun - şüpheli bir aktivite fark edersen bize Ayarlar > Bize Ulaşın üzerinden haber ver.",
  },
  {
    heading: "Kullanım kuralları",
    body:
      "LUNA'da başka kullanıcılara taciz, nefret söylemi veya tehdit içeren davranışlarda bulunamaz; yasa dışı içerik paylaşamaz, başkalarının hesaplarını veya telif haklarını ihlal edemez, uygulamayı kötüye kullanamaz (spam, dolandırıcılık, botlar) veya başkalarının kişisel bilgilerini izinsiz paylaşamazsın. Bu kurallara uymayan hesaplar askıya alınabilir veya kalıcı olarak silinebilir.",
  },
  {
    heading: "Paylaşılan içerik",
    body:
      "Oda içinde paylaştığın video/içerik linklerinin ve sohbet mesajlarının sorumluluğu sana aittir. LUNA, üçüncü taraf platformlardan (YouTube, Netflix, Spotify vb.) gelen içeriği barındırmaz, yalnızca senkronizasyon ve sohbeti sağlar - bu platformların kendi kullanım şartları da geçerlidir.",
  },
  {
    heading: "Hesabın sonlandırılması",
    body:
      "Ayarlar ekranındaki \"Hesabı Sil\" seçeneğiyle hesabını istediğin zaman kapatabilirsin. Kurallarımızı ciddi veya tekrarlayan şekilde ihlal eden hesapları biz de sonlandırabiliriz.",
  },
  {
    heading: "Sorumluluk sınırı",
    body:
      "LUNA, hizmeti \"olduğu gibi\" sunar; kesintisiz veya hatasız çalışacağını garanti etmeyiz. Üçüncü taraf platformların (giriş sağlayıcıları, paylaşılan video kaynakları) kendi hizmetlerindeki aksaklıklardan sorumlu değiliz.",
  },
  {
    heading: "Değişiklikler",
    body:
      "Bu koşulları zaman zaman güncelleyebiliriz. Önemli değişikliklerde uygulama içinden haberdar ederiz.",
  },
  {
    heading: "Bize ulaş",
    body: "Hizmet koşullarıyla ilgili sorularının için Ayarlar > Bize Ulaşın üzerinden bize yazabilirsin.",
  },
];

export default function TermsScreen() {
  return <InfoScreen title="HİZMET KOŞULLARI" sections={SECTIONS} />;
}
