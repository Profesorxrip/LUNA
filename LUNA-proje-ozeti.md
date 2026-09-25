# LUNA — Proje Özeti

Rave benzeri bir "watch party" (birlikte video izleme) mobil uygulaması. React Native/Expo istemci + Socket.io gerçek zamanlı sunucudan oluşuyor. Proje `/home/user/rave-clone` altında, bu oturumun git deposu kapsamının **dışında** yerel olarak geliştiriliyor.

## Teknoloji Yığını

- **Mobil**: Expo (React Native), TypeScript, `react-native-svg` (elle çizilmiş ikon seti), `expo-linear-gradient`, `@react-native-async-storage/async-storage`, `socket.io-client`, `@supabase/supabase-js` (auth altyapısı hazır ama şu an `PREVIEW_SKIP_AUTH=true` ile atlanıyor)
- **Sunucu**: Node.js, TypeScript, `socket.io`, `express`, in-memory veri (kalıcı veritabanı yok — sunucu yeniden başlayınca oda/arkadaş/mesaj verisi sıfırlanır)
- **Klasörler**: `mobile/`, `server/`, `web/` (web klasörü kullanılmıyor, ana hedef mobil)

## Marka Kimliği

- Uygulama adı: **LUNA** (büyük harf) — `app.json`, tüm ekran metinleri ve yorumlar güncel
- Görsel tema: koyu/siyah arkaplan + yeşil (`#2ECC71` / `#10B981`) vurgu rengi
- Rave'den esinlenilen ama birebir kopya olmayan özgün tasarım kararları alındı (özellikle kendi profil ekranı)

## Ana Ekranlar

### 1. Discover (Keşfet)
- Açık genel odaların listesi, canlı güncellenir (`rooms:list` socket event'i)
- Her kartta: kapak görseli (varsa), oda başlığı (= oynatılan içeriğin adı), **katılımcı avatar yığını** (emoji değil, gerçek katılımcı isim baş harfleri, üst üste binen daireler + taşan sayı "+N")
- Üstte: sol tarafta ayarlar (dişli) ikonu, ortada logo, sağda arkadaşlar ikonu
- "+" butonu → doğrudan platform seçme ekranını açar (oda, içerik seçilmeden var olamaz)
- Kenar kaydırma hareketleri: soldan sağa → Ayarlar, sağdan sola → Arkadaşlar

### 2. Platform Seçme Ekranı (`MediaPickerSheet`)
- Tam ekran, siyah arkaplan, gerçek platform logoları (YouTube, Netflix, Prime Video, Disney+, HBO Max, Twitch, Drive, iCloud, Web, X) — alan bazlı (`area-based`) normalize edilmiş boyutlarda
- YouTube seçilince gerçek bir mini tarayıcı (`WebView`) içinde gezinip video linkine gidince otomatik algılanıyor, başlık oEmbed API'siyle otomatik çekiliyor
- Diğer platformlarda (DRM korumalı) kullanıcı içerik adını elle giriyor + opsiyonel kapak görseli linki

### 3. Oda Ekranı (`RoomScreen`)
- Video/senkron oynatma (YouTube/HLS/MP4 için tam senkron; harici DRM platformlar için senkron yok, sadece "aç" bağlantısı)
- Sohbet, emoji reaksiyonları, katılımcı listesi, lider (host) devri/atma
- Sesli sohbet altyapısı (LiveKit) hazır ama Expo Go'da çalışmıyor — native development build'e geçilince aktif olacak (bilinçli olarak ertelendi)

### 4. Ayarlar Ekranı (`ProfileScreen`)
- Rave'in gerçek ayarlar ekranının **birebir kopyası** (kullanıcının açık isteğiyle), sadece marka adı LUNA olarak değiştirildi
- Bağlı hesaplar, bildirim/gizlilik toggle'ları, sosyal medya linkleri (placeholder), geri bildirim/yardım bölümleri, hesap silme, çıkış yap
- Üstte avatara dokununca → **Kendi Profilin** ekranı açılır
- Üstte arkadaşlar ikonuna dokununca (gerçek bekleyen istek sayısını gösteren rozetle) → **Arkadaşlar** ekranı açılır

### 5. Kendi Profilin / Başkasının Profili (`UserProfileScreen`) — "Vinil Kayıt" konsepti
- 10 farklı tasarım konseptinden (kartela) seçilip özelleştirildi: siyah arkaplan + yeşil vurgu, plak/vinil temalı konsantrik halkalı avatar
- **Kendi profilinde**: avatar/isim/kullanıcı adı/biyografi **doğrudan üzerlerine dokunarak** düzenlenebiliyor (ayrı "düzenle" butonu yok); avatar için alt sayfa (Fotoğraflar / Fotoğrafı Kaldır / Kapat)
- Galeri (fotoğraf önizlemeleri + görünürlük aç/kapa), İstatistikler (katılım tarihi, süre, arkadaş sayısı, en uzun oturum, en büyük oda — her biri göz ikonuyla gizlenebilir) + tıklanabilir günlük aktivite grafiği, Videolar (En İyiler/Geçmiş/Beğenilenler sekmeleri, YouTube tarzı kapak+süre rozetli kartlar)
- **Başkasının profilinde**: düzenleme yok, bunun yerine **gerçek arkadaşlık isteği akışı** (İstek Gönder → İsteği İptal Et / karşı taraf kabul edince → Mesaj butonu)
- Geri gitmek için ayrı buton yok, Android donanım geri tuşuyla çıkılıyor

### 6. Arkadaşlar Ekranı (`FriendsScreen`) — gerçek sunucu destekli
- 3 sekme: **Arkadaşlar** (gerçek liste + varsa son mesaj önizlemesi, dokununca DM açılır), **Son Zamanlarda** (gelen/giden bekleyen istekler — kabul/reddet/iptal), **Engellendi** (gerçek engelli listesi, dokununca engel kaldırma)
- Discover'daki arkadaşlar ikonu ve Ayarlar'daki arkadaşlar ikonu (rozetli) buraya açılıyor

### 7. Özelden Mesajlaşma (`DMScreen`) — gerçek sunucu destekli
- Gerçek zamanlı birebir mesajlaşma, okundu bilgisi (tek/çift tik), mesaja uzun basıp alıntılayarak cevap verme
- Üç nokta menüsü tamamen işlevsel:
  - **Ara**: sohbeti anlık filtreler
  - **Medya**: paylaşılan görselleri listeler (şu an boş, çünkü gerçek görsel gönderme henüz yok)
  - **Süre sonu**: 1 saat/1 gün/1 hafta seçilince mesajlar gerçekten o süre sonunda sunucu tarafında otomatik siliniyor
  - **Sessiz**: cihazda kalıcı olarak saklanıyor (AsyncStorage)

## Sunucu Mimarisi (`server/src/`)

| Dosya | Sorumluluk |
|---|---|
| `rooms.ts` | Oda oluşturma/katılma/ayrılma, senkron oynatma durumu, genel oda listesi |
| `dm.ts` | Kullanıcı kimliği ↔ socket eşlemesi, konuşma geçmişi, mesaj süresi (expiry) |
| `social.ts` | Arkadaşlık ilişkileri, bekleyen istekler, engelleme, kullanıcı adı dizini |
| `livekit.ts` | Sesli sohbet token üretimi (henüz native build'de aktif olacak) |
| `index.ts` | Tüm Socket.io event'lerinin bağlandığı ana giriş noktası |

Kullanıcı kimliği: Her cihaz `AsyncStorage`'da kalıcı, rastgele bir `userId` tutuyor (`mobile/src/utils/identity.ts`) — gerçek hesap sistemi devreye girene kadar bu şekilde.

## Bilinen Sınırlamalar

- **Gerçek fotoğraf yükleme yok**: `expo-image-picker` bu sandbox'ta internet erişimi olmadığı için kurulamadı; galeriden fotoğraf seçme yerine URL girme / placeholder kullanılıyor
- **Sesli sohbet ve DRM platformlarda (Netflix vb.) otomatik algılama** için native development build gerekiyor — bilinçli olarak en sona bırakıldı, tüm diğer ekranlar bitince tek seferde geçilecek
- **Sunucu verisi kalıcı değil**: oda/arkadaşlık/mesaj verisi bellekte tutuluyor, sunucu yeniden başlayınca sıfırlanıyor (gerçek veritabanı yok)
- Auth şu an atlanıyor (`PREVIEW_SKIP_AUTH=true`), Supabase altyapısı hazır ama devrede değil

## Test/Geliştirme Notları

- `npx expo start --web` + Playwright ile ekran görüntüsü alınarak test ediliyor (bu ortamda gerçek cihaz/emulator yok)
- Çok kullanıcılı senaryoları test etmek için bağımsız `socket.io-client` betikleri kullanılıyor (sahte oda katılımcıları, arkadaşlık isteği gönderip kabul eden "bot" bağlantılar)
