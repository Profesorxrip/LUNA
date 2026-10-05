# LUNA — Proje Özeti (güncel: 2026-10-05)

Rave benzeri bir "watch party" (birlikte video izleme) mobil uygulaması.
React Native/Expo istemci + Node.js/Socket.io gerçek zamanlı sunucu +
Supabase (Auth + Postgres + Storage). Bu dosya, projeye **farklı bir
oturumda/ortamda** devam edecek biri (veya Claude) için güncel bir
"nerede kaldık" haritası olsun diye yazıldı — repo'daki `README.md` ve
`LUNA_AppStore_PlayStore_Production_Roadmap.md` dosyaları daha eski/kısmen
güncelliğini yitirmiş durumda, bu dosyaya güvenin.

## Teknoloji Yığını

- **Mobil**: Expo SDK 57 (React Native), TypeScript, `react-navigation` v7,
  `socket.io-client`, `@supabase/supabase-js`, `expo-video`, `expo-image-picker`,
  `expo-blur`, `expo-linear-gradient`, `react-native-heroicons` + `lucide-react-native`
  (ikonlar — gerçek SVG vektör, `react-native-svg` üzerine kurulu),
  `i18next` + `react-i18next` (7 dil: TR/EN/DE/FR/AR/KU/EL)
- **Sunucu**: Node.js, TypeScript, `express`, `socket.io`, `ts-node-dev`
  (geliştirmede hot-reload) — oda/sohbet verisi **in-memory** (kalıcı değil,
  sunucu yeniden başlayınca sıfırlanır); kullanıcı/arkadaşlık/DM/profil
  verisi **Supabase Postgres**'te kalıcı
- **Supabase**: Auth (gerçek email/şifre + Google), Postgres (profiller,
  arkadaşlıklar, DM'ler, galeri, istatistikler), Storage (3 bucket:
  `avatars`, `gallery`, `chat-media`)
- **Klasörler**: `mobile/`, `server/`, `supabase/migrations/`, `web/`
  (kullanılmıyor, hedef platform sadece mobil)

## Geliştirme Ortamı Notu (önemli — farklı bir oturumda devam edecekseniz)

Bu proje bu oturumda **iki ayrı dizinde** tutuluyordu:
- `/home/user/rave-clone` — sandbox'ta node_modules kurulu, gerçek test
  edilebilen çalışma kopyası, bazı dev-only şeyler içeriyor (örn.
  `server/src/index.ts`'de `app.use("/test-assets", ...)` satırı — **bu
  satır asla gerçek repoya gitmemeli**, sadece yerel test için).
- Bu git deposu (`/home/user/luna`, GitHub: `profesorxrip/LUNA`,
  branch `claude/remember-where-we-left-off-2psulh`) — "temiz" kaynak kodu,
  gerçek commit geçmişi burada.

**Yeni bir ortamda** (bu iki-dizin ayrımı olmadan) çalışıyorsanız, sadece
BU repoyu klonlayıp `mobile/` ve `server/` içinde `npm install` çalıştırmanız
yeterli — tek bir çalışma dizini yeterli, ayrıca bir "sandbox kopyası"
tutmanıza gerek yok.

### Çalıştırma

```bash
# Sunucu
cd server && npm install && cp .env.example .env   # .env'e Supabase URL/anon key/service key gir
npm run dev          # http://localhost:3000, /health kontrol et

# Mobil (Expo Go ile telefonunda, aynı Wi-Fi)
cd mobile && npm install
# src/services/socket.ts içindeki SERVER_URL'i bilgisayarının LAN IP'siyle değiştir
npx expo start
```

`mobile/App.tsx` içindeki `PREVIEW_SKIP_AUTH` **her zaman `false` olmalı**
(gerçek login zorunlu) — sadece sandbox'ta otomatik test yaparken geçici
olarak `true` yapılıp iş bitince hemen geri alınıyordu.

## Marka Kimliği

- Uygulama adı: **LUNA**, logo `mobile/assets/lavin-icon-mark.png`
- Görsel tema: koyu/siyah arkaplan + gök mavisi (`#0EA5E9` / `#38BDF8`)
  vurgu rengi (`mobile/src/theme.ts`)

## Ekran Envanteri (`mobile/src/screens/`)

- **LoginScreen** — gerçek Supabase Auth (email/şifre + Google)
- **DiscoverScreen** — açık odaların canlı listesi (`rooms:list`), arama,
  "+" ile oda açma, kenar kaydırmayla Ayarlar/Arkadaşlar'a geçiş
- **RoomScreen** — senkron oynatma (YouTube/HLS/MP4 tam senkron; DRM'li
  harici platformlarda senkron yok), sohbet (metin + **gerçek fotoğraf
  gönderme, +18 işaretleme ile**), emoji tepkileri, katılımcı listesi,
  lider devri/atma, oda ayarları sheet'i (gizlilik, playback modu, sohbet
  otomatik çeviri, **18+ içerik işareti**, mikrofon/ses)
- **RoomPreviewScreen** — karta uzun basınca açılan, odaya katılmadan
  önizleme (kapak, platform rozeti, 18+ rozeti/blur, katılımcılar)
- **ProfileScreen** (= Ayarlar ekranı) — bkz. aşağıdaki "Ayarlar" bölümü
- **UserProfileScreen** — "Vinil Kayıt" konsepti; kendi profilinde
  avatar/isim/bio direkt düzenlenebilir, galeri (gerçek fotoğraf yükleme),
  istatistikler, videolar (En İyiler/Geçmiş/Beğenilenler); başkasının
  profilinde gerçek arkadaşlık isteği akışı + ülke bayrağı (artık gerçek
  görsel, emoji değil)
- **FriendsScreen** — Arkadaşlar / Son Zamanlarda (istekler) / Engellendi
  sekmeleri, hepsi gerçek sunucu destekli
- **DMScreen** — gerçek zamanlı DM, okundu tiki, alıntılı cevap, mesaj
  süresi (expiry), sessize alma, şikayet, arama, **Medya sekmesi (artık
  gerçek küçük resimler gösteriyor)**, **gerçek fotoğraf gönderme (+18
  işaretleme ile)**
- **PremiumScreen** — gerçek görünümlü ödeme ekranı (gerçek satın alma
  entegrasyonu yok, UI tamamlanmış)
- **PrivacyScreen**, **BackgroundInfoScreen**, **InfoScreen** — bilgi/yardım
  ekranları

## Ayarlar Ekranı (ProfileScreen) — tam liste

Hepsi **gerçek**, çalışan özellikler (sahte/placeholder toggle yok):

| Ayar | Davranış |
|---|---|
| Hızlı Tepki | mesaja çift tıklayınca atılan emoji, Supabase'de kalıcı |
| Davetleri Kısıtla (Herkes/Arkadaşlar/Hiçkimse) | sunucuda `send_friend_request`/`send_dm` RPC'leri gerçekten engelliyor |
| Yetişkin İçeriğini Gizle (Açık/Gizli) | açıksa Discover'da (ve profildeki "şu an açık oda" kartında) +18 odalar hiç görünmez |
| Dokunsal Geri Bildirim (Açık/Kapalı) | gerçek haptic tetikleniyor |
| Chat Mesajlarını Otomatik Çevir (Açık/Kapalı) | oda varsayılanı, oda içinde host değiştirebilir |
| Başka Ses Çalarken Sessize Al (Açık/Kapalı) | `expo-video`'nun `audioMixingMode`'unu gerçekten değiştiriyor |
| Konumu Gizle | **BİLİNÇLİ OLARAK ERTELENDİ** — gerçek harita özelliği (`react-native-maps`) Expo Go'da çalışmıyor, native development build gerektiriyor; kullanıcı "bunu sona bırakalım" dedi |
| Dil (7 dil) | `i18next`, `loadStoredLanguage()`/`setAppLanguage()` — **şu an sadece ProfileScreen tam çevrili**, diğer ekranlar (Discover/Room/DM/Friends/UserProfile/Premium/Privacy/Login/RoomPreview) hâlâ sadece Türkçe |
| Gizlilik, Yardım, Hesabı Sil, Çıkış Yap | hepsi gerçek |

## Oda İçi "18+ İçerik" Sistemi (bu oturumda tamamlandı)

1. Host, oda ayarları sheet'inden odayı **18+** işaretleyebilir
   (`room.isAdult`, `server/src/rooms.ts`).
2. "Yetişkin İçeriğini Gizle" açık olan kullanıcılar için bu odalar
   Discover'da **hiç görünmez** (`visibleToViewer()`, gizlilik tipinden
   bağımsız — açık/davetli fark etmez).
3. Bu ayar kapalı olsa bile (oda görünür durumda), **kapak resmi her
   zaman bulanık** gösterilir — Discover kartı, profildeki "şu an açık
   oda" kartı ve oda önizleme ekranı (`expo-blur` `BlurView`, `RoomCard.tsx`
   TEK kaynak olduğu için hepsini otomatik kapsıyor).
4. Oda sohbetinde ve DM'de **gerçek fotoğraf gönderme** var (daha önce
   hiç yoktu, bu oturumda sıfırdan kuruldu): fotoğraf seçilince "+18
   içerik" anahtarlı bir onay ekranı çıkıyor (`SendMediaSheet.tsx`),
   işaretliyse alıcı tarafta görsel varsayılan bulanık gelir, dokununca
   açılır (`ChatImageBubble.tsx`).
5. Rozetler: `AdultBadge.tsx` (18+ çember rozeti) ve `PlatformBadge.tsx`'e
   eklenen "web" (küre) rozeti — ikisi de `PlatformBadge`'deki gibi
   yarı-şeffaf "hayalet" stilinde (gerçek renk/arka plan yok).
6. Ülke bayrakları artık emoji değil, gerçek PNG (`flagcdn.com`,
   `CountryFlag.tsx`) — Android'de emoji bayraklar pikselli görünüyordu.

## Sunucu Mimarisi (`server/src/`)

| Dosya | Sorumluluk |
|---|---|
| `rooms.ts` | Oda yaşam döngüsü, senkron oynatma, Discover listesi, `isAdult` görünürlük filtresi |
| `dm.ts` | DM mesajlaşma (Supabase RPC'leri: `send_dm`, `send_dm_image`, `open_dm`...), online kullanıcı ↔ socket eşlemesi |
| `social.ts` | Arkadaşlık, bekleyen istekler, engelleme, kullanıcı adı |
| `livekit.ts` | Sesli sohbet token üretimi (native build bekliyor) |
| `moderation.ts` | Şikayet gönderme |
| `analytics.ts` | Oda geçmişi loglama (Geçmiş sekmesi için) |
| `notifications.ts` | Push bildirimleri (çevrimdışı kullanıcıya DM geldiğinde vb.) |
| `geoip.ts` | IP → ülke tespiti ("Yakındakiler" gizlilik modu için) |
| `validate.ts` | Socket payload doğrulama yardımcıları |
| `index.ts` | Tüm Socket.io event'lerinin bağlandığı ana giriş noktası |

Kimlik: Gerçek Supabase Auth access token'ı `user:identify` ile sunucuya
gönderilir, sunucu bunu doğrulayıp gerçek `userId`'yi kendisi çıkarır
(client "ben buyum" diyemiyor — IDOR koruması).

## Supabase Migration'ları (`supabase/migrations/`)

0001'den 0015'e kadar sırayla çalıştırılmalı (her biri `alter table ... if
not exists` / `create or replace function` kullanıyor, tekrar çalıştırmak
güvenli). **Son 3 tanesi bu oturumda eklendi, henüz gerçek Supabase
projesinde çalıştırılmamış olabilir — yeni ortamda ilk iş bunları
Supabase SQL Editor'de (veya `supabase db push` ile) sırayla uygulamak:**

- `0013_invite_restriction.sql` — "Davetleri Kısıtla" gerçek engelleme
- `0014_hide_adult_content.sql` — `profiles.hide_adult_content` sütunu
- `0015_chat_media.sql` — `chat-media` storage bucket, `dm_messages`'a
  `media_url`/`is_adult`, `send_dm_image` RPC'si

## Bilinen Sınırlamalar / Bilinçli Olarak Ertelenenler

- **Sesli sohbet (LiveKit) ve gerçek harita (react-native-maps)**: Expo
  Go'da çalışmıyor, native development build gerektiriyor — kullanıcı
  "en sona bırakalım" dedi, diğer her şey bitince tek seferde geçilecek.
- **i18n sadece ProfileScreen'de tam** — diğer ekranlar Türkçe sabit;
  kullanıcı şu an bunu istemiyor, ileride tekrar istenirse genişletilebilir.
- **DM fotoğraf gönderme sandbox'ta uçtan uca canlı test edilemedi** —
  Supabase'e gerçek ağ erişimi bu geliştirme sandbox'ında engelli; kod
  oda-sohbeti fotoğraf gönderme ile birebir aynı deseni kullanıyor
  (orası canlı test edildi, çalıştığı doğrulandı), ama DM tarafı gerçek
  cihazda bir kez elle doğrulanmalı.
- Sunucu verisi (oda/sohbet) kalıcı değil — bilinçli tasarım kararı.

## Devam Ederken Dikkat Edilmesi Gerekenler

- Kullanıcı **sadece Türkçe** konuşuyor, yanıtlar hep Türkçe olmalı.
- Geliştirme sunucusu (`ts-node-dev`) bazen dosya değişikliklerini
  otomatik yeniden yüklemiyor (watcher kaçırıyor) — bir özellik "neden
  çalışmıyor" diye şüphelenirseniz önce sunucuyu elle yeniden başlatıp
  tekrar test edin, bu oturumda birkaç kez gerçek bug zannedilen şey
  aslında bu oldu.
- `PREVIEW_SKIP_AUTH` sadece yerel/sandbox testi için geçici `true`
  yapılır, **commit/push öncesi mutlaka `false`'a geri alınmalı**.
