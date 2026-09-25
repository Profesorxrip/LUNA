# rave-clone

Rave benzeri, senkronize video izleme + sesli/yazili sohbet mobil uygulamasi.
React Native (Expo) + Node.js/Socket.io sunucu + LiveKit (sesli sohbet).

**Bilinerek eklenmedi:** "Herhangi bir web sitesinden video" senkronize etme
ozelligi. Rave'in tam olarak bu yuzden basi dertte (piyasadaki tube/korsan
siteleri senkronize edilebildigi icin App Store'dan atildi, hukuki sorunlar
yasiyor). Bu klon SADECE YouTube (resmi IFrame API uzerinden) destekliyor -
istersen ileride kendi sunucunda barindirdigin (senin moderasyon
edebildigin) videolari eklemek guvenli bir sonraki adim olur.

## Neler var (MVP)

- Oda olusturma / kod ile odaya katilma
- YouTube videosu senkronize oynatma (sadece oda lideri kontrol eder: play/pause/seek)
- Yazili sohbet
- Sesli sohbet (LiveKit - WebRTC)
- Katilimci listesi, lider birini **atabilir (kick)** ve **liderligi devredebilir**
- Lider ayrilirsa liderlik otomatik baska bir katilimciya geciyor
- Surukleme (drift) duzeltmesi: misafirlerin oynaticisi periyodik olarak lider ile
  yeniden senkronize ediliyor

## Proje yapisi

```
rave-clone/
  server/     - Node.js + TypeScript + Socket.io + LiveKit token sunucusu
  mobile/     - React Native (Expo) uygulamasi
```

## 1) Sunucuyu calistirma

```bash
cd server
npm install
cp .env.example .env
```

`.env` icine LiveKit bilgilerini ekle (asagida nasil alinacagi anlatiliyor).
LiveKit bilgisi girmesen de sunucu ve video senkronizasyonu/yazili sohbet
calisir - sadece sesli sohbet ozelligi hata verir.

```bash
npm run dev
```

Sunucu `http://localhost:3000` adresinde ayaga kalkar. `/health` adresine
gidip `{"ok":true}` gorursen calisiyordur.

### LiveKit hesabi/API key nasil alinir (sesli sohbet icin)

1. https://cloud.livekit.io adresine git, ucretsiz hesap ac
2. Bir proje olustur
3. Sol menuden **Settings > API Keys** - "Create Key" ile bir API Key + Secret uret
4. Proje sayfasindaki **WebSocket URL**'i (orn. `wss://senin-projen.livekit.cloud`) kopyala
5. Bu ucunu de `server/.env` dosyasina yaz: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`

API Key/Secret **sadece sunucuda** kaliyor, telefona hic gitmiyor - telefona
sadece sunucunun urettigi, o oda icin gecerli, sinirli sureli bir token
gidiyor.

## 2) Mobil uygulamayi calistirma (Expo Go ile, telefonunda)

Once telefonuna **Expo Go** uygulamasini (Play Store/App Store) kur.

`mobile/src/services/socket.ts` icindeki `SERVER_URL`'i, sunucuyu calistirdigin
bilgisayarin **yerel agdaki (LAN) IP adresi** ile degistir (telefon ve
bilgisayar ayni Wi-Fi'da olmali):

```ts
export const SERVER_URL = "http://192.168.1.20:3000"; // kendi IP'inle degistir
```

Bilgisayarinin LAN IP'sini ogrenmek icin:
- Windows: `ipconfig` (IPv4 Address)
- Mac/Linux: `ifconfig` ya da `ip addr` (192.168.x.x gibi bir adres)

Sonra:

```bash
cd mobile
npm install
npx expo start
```

Terminalde cikan **QR kodu** telefonundaki Expo Go uygulamasiyla tara -
uygulama telefonunda acilir.

> Not: LiveKit'in native WebRTC modulu (`@livekit/react-native-webrtc`)
> gercek native kod icerdigi icin **Expo Go'da CALISMAYABILIR** - Expo Go
> sadece "managed" JS modullerini destekler. Sesli sohbeti gercekten test
> etmek icin muhtemelen bir **development build** olusturman gerekecek:
> ```
> npx expo prebuild
> npx expo run:android   # ya da: npx expo run:ios (Mac gerekir)
> ```
> Bu, Android Studio (ya da Xcode) kurulu olmasini gerektirir. Once video
> senkronu + yazili sohbeti Expo Go ile test edip calistigini gordukten
> sonra sesli sohbet icin bu adima gecmeni oneririm.

## Sonraki adimlar (bu MVP'de yok, ama eklenebilir)

- Kalici hesap sistemi (su an sadece oda icinde gecerli bir isim var)
- Kendi sunucunda barindirilan/yuklenen video destegi (moderasyon senin kontrolunde olur)
- Push bildirimleri (arkadasin oda actiginda haber verme)
- Odalari herkese acik listeleme / kesfetme sayfasi
- Netflix/Prime gibi DRM'li platformlar (bunlar teknik olarak COK zor - Rave
  bile ekran paylasimi gibi yontemlere basvuruyor, gercek DRM icerigi
  JS ile kontrol etmek mumkun degil)
