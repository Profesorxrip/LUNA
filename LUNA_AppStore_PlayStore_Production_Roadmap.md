# LUNA — App Store & Google Play Production Roadmap

> **EK NOT (mevcut kod tabanını yazan asistandan — Abacus Agent'a devretmeden önce okunmalı):**
>
> Bu dokümanın altındaki roadmap genel olarak sağlam ve doğru sıralanmış. Ama mevcut kodu satır satır yazmış biri olarak, dokümanın genel geçtiği veya bilmediği 4 somut noktayı buraya ekliyorum — Abacus Agent'a AŞAMA 0'dan önce bunları da vermeni öneririm.
>
> **1) Git bootstrap:** Bu kod tabanı bu roadmap'i alana kadar hiçbir GitHub deposunda değildi. `mobile/` klasörünün içinde şablon kaynaklı, uzak deposu olmayan ayrı bir `.git` vardı — gerçek bir sürüm geçmişi sayılmaz. `profesorxrip/luna` adında yeni, temiz bir depo oluşturulup kod oraya push'landı (bu dokümanla birlikte aynı depoda).
>
> **2) AŞAMA 0 (Audit) prompt'unu birebir ver, atlama.** Sevindirici haber: kod tabanı göründüğünden basit. `server/src/rooms.ts`, `dm.ts`, `social.ts` üçü de düz JavaScript `Map`/`Set` üzerine kurulu, karmaşık bir ORM/ODM yok — bu da audit'in hızlı ve net çıkmasını sağlar.
>
> **3) EN KRİTİK bulgu — dokümanın "Authorization" bölümünde (9-10) bahsettiği IDOR riski şu an TAM OLARAK mevcut:** Hiçbir socket event'i gönderenin gerçekten kim olduğunu doğrulamıyor. `user:identify` event'i ile hangi `userId` gönderilirse sunucu onu olduğu gibi kabul ediyor — yani şu an biri başka birinin `userId`'sini bilip/tahmin edip gönderirse o kişi gibi davranabilir: onun arkadaşlarını değiştirebilir, DM'lerini okuyabilir/gönderebilir, onu biri tarafından engellenmiş gösterebilir. Bunun etkilediği event'ler: `dm:open`, `dm:send`, `dm:preview`, `dm:setExpiry`, `friend:request`, `friend:respond`, `friend:cancel`, `friend:remove`, `friend:block`, `friend:unblock`. **AŞAMA 3 (gerçek Authentication) tamamlanana kadar bu API'ler gerçek/genel kullanıcılara ASLA açılmamalı.** Şu ana kadar sorun çıkmadı çünkü uygulama hâlâ kapalı geliştirme/test aşamasında.
>
> **4) Model seviyesi tavsiyesi (Bölüm 4) doğru, harfiyen uygula.** Küçük UI/metin düzeltmelerine "xHigh"/"Max" verme — hem maliyeti boşuna artırır hem de agent'ın gereksiz dosyalara dokunma riskini büyütür.
>
> ### Hızlı dosya haritası (audit'i hızlandırmak için)
>
> | Konu | Dosya |
> |---|---|
> | Auth bypass anahtarı | `mobile/App.tsx` → `PREVIEW_SKIP_AUTH` |
> | Geçici (kalıcı olmayan) kullanıcı kimliği | `mobile/src/utils/identity.ts` (AsyncStorage'da rastgele `userId`) |
> | Oda/senkron oynatma mantığı | `server/src/rooms.ts` |
> | Özelden mesajlaşma (DM) | `server/src/dm.ts` |
> | Arkadaşlık/engelleme | `server/src/social.ts` |
> | Tüm socket event'lerinin bağlandığı yer | `server/src/index.ts` |
> | Supabase auth istemcisi (hazır ama devrede değil) | `mobile/src/services/supabase.ts` |
> | Login ekranı (var ama `PREVIEW_SKIP_AUTH` yüzünden atlanıyor) | `mobile/src/screens/LoginScreen.tsx` |
>
> ---

## 1. Bu dokümanın amacı

Bu doküman, mevcut **LUNA** watch-party uygulamasının geliştirme ortamından çıkarılıp **Apple App Store ve Google Play Store'da gerçek kullanıcıların kullanacağı production uygulamasına** dönüştürülmesi için uygulanacak yol haritasıdır.

Amaç sadece yeni özellik eklemek değildir. Süreç boyunca:

- mevcut çalışan özellikler korunacak,
- backend kalıcı hale getirilecek,
- gerçek kullanıcı/auth sistemi devreye alınacak,
- güvenlik kontrolleri yapılacak,
- Socket.io altyapısı production'a hazırlanacak,
- medya yükleme sistemi kurulacak,
- LiveKit/native build tamamlanacak,
- gizlilik ve hesap silme süreçleri hazırlanacak,
- performans ve yük testleri yapılacak,
- crash/analytics/monitoring kurulacak,
- App Store ve Google Play yayın gereksinimleri kontrol edilecek,
- son aşamada release candidate oluşturulacaktır.

> **Ana kural:** LUNA yeniden yazılmayacak. Önce mevcut kod okunacak, çalışan özellikler korunacak, değişiklikler küçük ve kontrol edilebilir aşamalarda yapılacak.

---

# 2. Mevcut LUNA'nın durumu

Mevcut proje:

- Expo / React Native + TypeScript mobil istemci
- Node.js + Express + Socket.io sunucusu
- Supabase altyapısı hazırlanmış
- Socket.io gerçek zamanlı iletişim
- Watch party / oda sistemi
- Senkron video oynatma
- Sohbet ve emoji reaksiyonları
- Host devri ve kullanıcı atma
- Arkadaşlık sistemi
- Arkadaşlık istekleri
- Engelleme
- Birebir DM
- Okundu bilgisi
- Mesaj süre sonu
- Profil sistemi
- YouTube WebView entegrasyonu
- LiveKit sesli sohbet altyapısı

bulunuyor.

Mevcut önemli eksikler:

1. Sunucu verileri RAM'de tutuluyor.
2. Sunucu yeniden başlarsa oda/arkadaşlık/mesaj verileri kayboluyor.
3. Gerçek authentication henüz aktif değil.
4. `PREVIEW_SKIP_AUTH=true` kullanılıyor.
5. Kullanıcı kimliği geçici olarak AsyncStorage'daki random `userId` ile tutuluyor.
6. Gerçek fotoğraf yükleme sistemi henüz yok.
7. LiveKit Expo Go ortamında aktif değil.
8. DRM platformlarında tam otomatik senkron oynatma bulunmuyor.
9. Production güvenlik ve yük testleri tamamlanmış değil.
10. Gerçek cihaz/emülatör test kapsamı artırılmalı.

Bu mevcut durumdan hareketle geliştirme yapılmalıdır.

---

# 3. Abacus AI ile çalışma prensibi

## 3.1. Projeyi tek seferde yeniden yazdırma

Abacus'a:

> "LUNA'yı baştan yaz"

şeklinde bir görev verilmemeli.

Bunun yerine Agent'ın mevcut kodu anlaması ve aşamalı değişiklik yapması sağlanmalıdır.

Her büyük aşama:

1. Analiz
2. Plan
3. Uygulama
4. Test
5. Kod inceleme
6. Commit/checkpoint
7. Sonraki aşama

şeklinde ilerlemelidir.

---

# 4. Model / Agent kullanım stratejisi

## Küçük görevler

Örneğin:

- küçük UI düzeltmesi
- typo
- basit component düzeltmesi
- küçük bug fix

→ **Auto**

## Orta seviye işler

Örneğin:

- ekran refactor
- API düzenleme
- socket event değişikliği
- test yazılması

→ **High**

## Kritik mimari işler

Örneğin:

- Supabase migration
- authentication
- database mimarisi
- Socket.io güvenliği
- authorization
- production migration
- büyük refactor

→ **xHigh**

## Çok büyük ve karmaşık işler

Örneğin:

- geniş çaplı production migration
- birbirine bağlı çok sayıda sistemin aynı anda değiştirilmesi

→ **Max**, sadece gerçekten gerekli olduğunda.

### Önemli

Her görevi en yüksek modele vermek yerine görev büyüklüğüne göre model seçilmelidir.

---

# 5. AŞAMA 0 — CODEBASE AUDIT

İlk görevde hiçbir dosya değiştirilmemelidir.

Abacus Agent'a:

```text
You are taking over an existing React Native / Expo + Node.js + Socket.io
application called LUNA.

Do NOT modify any files yet.

First inspect and understand the entire existing codebase.

Do not redesign the application.
Do not replace working features.
Do not rewrite the architecture.

Audit:

1. Mobile architecture
2. Server architecture
3. Socket.io events
4. Room lifecycle
5. Playback synchronization
6. Friend system
7. DM system
8. Profile system
9. Authentication
10. Persistence
11. Security
12. Authorization
13. Error handling
14. State management
15. Performance
16. Native build requirements
17. Production blockers
18. Database requirements
19. App Store / Google Play blockers
20. Testing gaps

Classify findings as:

CRITICAL
HIGH
MEDIUM
LOW

Do not implement anything.

At the end create a phased production migration plan.
```

Agent'ın raporu alınmadan kod değişikliğine geçilmemelidir.

---

# 6. AŞAMA 1 — Git ve geri dönüş noktaları

Production çalışmasına başlamadan önce:

- Git repository oluşturulmalı.
- `main` korunmalı.
- Production branch oluşturulmalı.
- Her büyük aşama ayrı commit olmalı.
- Büyük migration öncesi checkpoint alınmalı.

Önerilen yapı:

```text
main
production

feature/auth
feature/database
feature/socket-security
feature/media
feature/livekit
feature/notifications
feature/qa
```

## Kural

Bir aşama bozulursa bütün projeyi geri almak yerine sadece ilgili aşamaya dönülebilmelidir.

---

# 7. AŞAMA 2 — Production Database

Şu an LUNA'nın en önemli teknik eksiklerinden biri kalıcı veri katmanıdır.

Mevcut:

```text
Mobile
   ↓
Socket.io
   ↓
Node.js
   ↓
RAM
```

Production hedefi:

```text
Mobile
   ↓
API / Socket.io
   ↓
Node.js
   ↓
Supabase / PostgreSQL
   ↓
Storage
```

## Database tasarımı

Mevcut kod incelendikten sonra ihtiyaçlara göre tablolar tasarlanmalıdır.

Muhtemel alanlar:

- users
- profiles
- friendships
- friend_requests
- blocks
- rooms
- room_members
- room_sessions
- messages
- message_reactions
- message_expiry
- media
- user_settings
- notifications
- watch_history

> Bu tablo isimleri nihai şema değildir. Agent mevcut kodu inceleyerek gerçek ihtiyaca göre şema önermeli ve uygulanmadan önce migration planı çıkarmalıdır.

## Database kuralları

- Primary key kullanılmalı.
- Foreign key ilişkileri tanımlanmalı.
- Unique constraint'ler kullanılmalı.
- Gereken alanlara index eklenmeli.
- Nullability doğru belirlenmeli.
- Timestamp alanları standartlaştırılmalı.
- Soft-delete gereken yerlerde uygulanmalı.
- Migration dosyaları version-controlled olmalı.

---

# 8. AŞAMA 3 — Gerçek Authentication

Mevcut:

```text
PREVIEW_SKIP_AUTH=true
```

kapatılmalıdır.

Geçici:

```text
AsyncStorage random userId
```

production kimliği olarak kullanılmamalıdır.

Hedef:

```text
Supabase Auth
      ↓
Authenticated User
      ↓
Profile
      ↓
Permissions
      ↓
Rooms / Friends / DM
```

## Kontroller

- Login
- Logout
- Session restore
- Session expiration
- Password reset
- Email verification gerekiyorsa doğrulama
- Account deletion
- Duplicate account senaryoları
- Invalid token
- Expired token
- Unauthorized socket connection

test edilmelidir.

---

# 9. AŞAMA 4 — Authorization ve güvenlik

Authentication:

> "Sen kimsin?"

Authorization:

> "Bunu yapmaya hakkın var mı?"

İkisi ayrı kontrol edilmelidir.

## Örnek

Bir kullanıcı başka bir kullanıcının:

- DM geçmişini
- profil özel alanlarını
- özel odasını
- mesajlarını
- medya dosyalarını
- hesap ayarlarını

sadece ID değiştirerek okuyamamalıdır.

## Socket güvenliği

Her kritik event server tarafından doğrulanmalıdır.

Örneğin:

```text
room:create
room:join
room:leave
room:kick
room:transfer-host
message:send
message:delete
friend:request
friend:accept
friend:block
profile:update
```

Client'ın:

```text
"userId": "başka kullanıcı"
```

göndermesi tek başına yetki kabul edilmemelidir.

Server authenticated session üzerinden gerçek kullanıcıyı belirlemelidir.

---

# 10. Socket.io güvenlik checklist

Agent aşağıdaki kontrolleri yapmalıdır:

- Authentication handshake
- Socket authorization
- Room membership validation
- Host validation
- User identity validation
- Payload schema validation
- Rate limiting
- Spam protection
- Duplicate event protection
- Replay protection gereken eventler
- Disconnect cleanup
- Reconnect handling
- Ghost member cleanup
- Invalid room ID handling
- Invalid user ID handling
- Oversized payload protection
- Message length limits

Her socket event için:

```text
Input
 ↓
Authentication
 ↓
Authorization
 ↓
Validation
 ↓
Business logic
 ↓
Database
 ↓
Broadcast
```

mantığı kullanılmalıdır.

---

# 11. AŞAMA 5 — Watch Room sistemi

Watch party LUNA'nın temel özelliğidir.

Room sistemi aşağıdakileri güvenilir şekilde yönetmelidir:

- Room creation
- Room join
- Room leave
- Host
- Host transfer
- Kick
- Participant list
- Playback state
- Current timestamp
- Pause
- Play
- Seek
- Reconnect
- Late join
- Host disconnect

## Senkronizasyon

Server authoritative olmalıdır.

Client:

> "Ben video 35.2 saniyedeyim"

diyerek server state'ini değiştirmemelidir.

Gerekirse:

```text
Server playback state
- media
- position
- playing
- updatedAt
- host
```

üzerinden yeniden hesaplama yapılmalıdır.

---

# 12. AŞAMA 6 — Mesaj sistemi

DM ve room chat için:

- message ID
- sender ID
- receiver/room ID
- timestamp
- read state
- reply reference
- expiry time
- deleted state

kontrollü şekilde saklanmalıdır.

## Mesaj güvenliği

Kullanıcı:

- başkasının mesajını silememeli,
- başka konuşmayı okuyamamalı,
- block sonrası mesaj gönderememeli,
- silinmiş mesajı tekrar getirememeli.

## Expiry

1 saat / 1 gün / 1 hafta gibi süre sonu mesajları sadece client'tan silinmemeli.

Server/database tarafında da expiry uygulanmalıdır.

---

# 13. AŞAMA 7 — Arkadaşlık sistemi

Kontrol edilecekler:

- Send request
- Cancel request
- Accept
- Reject
- Remove friend
- Block
- Unblock
- Duplicate request
- Self request
- Blocked user request
- Race conditions

Örneğin iki taraf aynı anda istek gönderirse database seviyesinde duplicate ilişki oluşmamalıdır.

---

# 14. AŞAMA 8 — Profil ve medya

Mevcut profil sistemi korunmalıdır.

Gerçek medya sistemi eklenmelidir:

```text
Gallery / Camera
       ↓
Image validation
       ↓
Compression
       ↓
Upload
       ↓
Supabase Storage
       ↓
Database metadata
       ↓
Profile
```

## Kontroller

- Maksimum dosya boyutu
- Dosya tipi
- MIME validation
- Görsel boyutları
- Compression
- Upload cancellation
- Failed upload
- Retry
- Delete
- Replace avatar
- Private/public media

Dosya uzantısına güvenilmemeli; server/storage tarafında gerçek içerik doğrulanmalıdır.

---

# 15. AŞAMA 9 — Bildirim sistemi

Production uygulamada en azından şu bildirimler planlanmalıdır:

- Arkadaşlık isteği
- Arkadaşlık kabulü
- DM
- Odaya davet
- Gerekli sistem bildirimleri

Bildirimler:

```text
Push token
    ↓
User
    ↓
Notification preferences
    ↓
Notification service
```

mantığında olmalıdır.

Kullanıcı bildirimleri kapatabilmelidir.

---

# 16. AŞAMA 10 — LiveKit

LiveKit mevcut altyapıya entegre edilmelidir.

Ama mevcut video senkronizasyonu bozulmamalıdır.

Öncelik:

1. Native development build
2. LiveKit connection
3. Join voice room
4. Leave
5. Mute
6. Unmute
7. Connection recovery
8. Permission handling
9. Background/foreground
10. Audio route testing

## Mobil izinler

iOS:

- Microphone permission

Android:

- Microphone permission

gereksinimleri doğru yapılandırılmalıdır.

---

# 17. AŞAMA 11 — DRM platformları

Netflix, Disney+, Prime Video gibi DRM korumalı servislerde LUNA'nın içerikleri kendi video player'ında oynatmaya çalışmaması gerekir.

Mevcut ürün yaklaşımı:

> Kullanıcı platformu harici olarak açar; LUNA oda/sosyal deneyimini yönetir.

Bu davranış ürün ve platform kuralları açısından ayrıca test edilmelidir.

Agent:

- DRM bypass
- protected content extraction
- unauthorized playback

gibi yöntemler kullanmamalıdır.

---

# 18. AŞAMA 12 — Privacy / kullanıcı verileri

Production öncesi veri envanteri çıkarılmalıdır.

Hangi veri tutuluyor?

```text
Account
Profile
Username
Avatar
Messages
Friends
Blocks
Rooms
Watch history
Device information
Push token
Analytics
Crash data
```

Her veri için:

- neden tutuluyor?
- ne kadar süre tutuluyor?
- kim erişebiliyor?
- nasıl siliniyor?
- üçüncü tarafla paylaşılıyor mu?

soruları cevaplanmalıdır.

## Hesap silme

Kullanıcı hesap silmek istediğinde:

```text
Account
 ↓
Profile
 ↓
Friend relations
 ↓
Messages / content policy
 ↓
Media
 ↓
Sessions
 ↓
Push tokens
```

veri yaşam döngüsü tanımlanmalıdır.

---

# 19. Güvenlik testleri

Production öncesi minimum:

## Authentication

- Invalid credentials
- Expired session
- Invalid token
- Logout sonrası erişim
- Account deletion sonrası erişim

## Authorization

- IDOR
- Unauthorized room access
- Unauthorized DM access
- Unauthorized profile modification
- Unauthorized host actions

## Input validation

- Empty values
- Very long strings
- HTML
- Script payloads
- JSON abuse
- Oversized payloads
- Invalid IDs

## Abuse prevention

- Message spam
- Friend request spam
- Room creation spam
- Socket connection spam
- Login abuse

## Storage

- Unauthorized media access
- Invalid file type
- Oversized upload
- Deleted media access

---

# 20. Secrets / environment variables

Secret bilgiler source code'a yazılmamalıdır.

Örneğin:

```text
SUPABASE_SERVICE_ROLE_KEY
DATABASE_PASSWORD
LIVEKIT_SECRET
JWT_SECRET
PRIVATE_API_KEYS
```

Git repository'ye girmemelidir.

Environment ayrımı yapılmalıdır:

```text
.env.development
.env.staging
.env.production
```

Gerçek production secret'ları development ortamında kullanılmamalıdır.

---

# 21. Logging

Production'da log sistemi kurulmalıdır.

Ama loglara:

- password
- access token
- refresh token
- private messages
- private media URL
- hassas kişisel bilgiler

yazılmamalıdır.

Log seviyeleri:

```text
DEBUG
INFO
WARN
ERROR
```

şeklinde ayrılmalıdır.

---

# 22. Crash reporting ve monitoring

Production'da uygulamanın çöktüğünü kullanıcı söylemeden görebilmek gerekir.

Kurulması gereken sistemler:

- Crash reporting
- Error tracking
- Server monitoring
- Socket connection monitoring
- Database monitoring
- API latency
- Error rate
- Memory usage

Özellikle:

```text
Crash-free users
Crash-free sessions
API error rate
Socket disconnect rate
Room creation failures
Message failures
```

takip edilmelidir.

---

# 23. Performance

Mobil:

- Gereksiz re-render
- FlatList optimizasyonu
- Image caching
- Large image handling
- Memory usage
- Navigation performance
- Startup time

kontrol edilmeli.

Server:

- Database query performance
- Indexler
- Socket broadcast
- Memory leak
- Room cleanup
- Connection cleanup

kontrol edilmeli.

---

# 24. Offline / kötü internet senaryoları

Türkiye dahil gerçek mobil kullanımda internet her zaman stabil değildir.

Test:

```text
Wi-Fi → Mobile data
Mobile data → Wi-Fi
Internet lost
Internet restored
App background
App foreground
Phone lock
Socket reconnect
```

yapılmalıdır.

Kullanıcıya:

- reconnect
- loading
- retry
- offline state

gibi doğru UI gösterilmelidir.

---

# 25. App lifecycle

Test edilmesi gerekenler:

- App open
- Background
- Foreground
- Screen lock
- Incoming call
- Network change
- App killed
- App reopened
- Push notification üzerinden açılma
- Deep link

---

# 26. QA test matrisi

## Discover

- [ ] Rooms load
- [ ] Empty state
- [ ] Refresh
- [ ] Join
- [ ] Cover image
- [ ] Participant avatars
- [ ] Friend badge
- [ ] Navigation

## Room

- [ ] Create
- [ ] Join
- [ ] Leave
- [ ] Play
- [ ] Pause
- [ ] Seek
- [ ] Reconnect
- [ ] Chat
- [ ] Reaction
- [ ] Host transfer
- [ ] Kick

## Friends

- [ ] Request
- [ ] Accept
- [ ] Reject
- [ ] Cancel
- [ ] Remove
- [ ] Block
- [ ] Unblock

## DM

- [ ] Send
- [ ] Receive
- [ ] Read
- [ ] Reply
- [ ] Search
- [ ] Expiry
- [ ] Mute
- [ ] Media

## Profile

- [ ] Edit
- [ ] Avatar
- [ ] Bio
- [ ] Gallery
- [ ] Statistics
- [ ] Privacy

---

# 27. Çok kullanıcılı test

Tek kullanıcı testleri yeterli değildir.

En az:

```text
User A
User B
User C
User D
```

ile test edilmelidir.

Senaryolar:

### Senaryo 1

A oda oluşturur.

B katılır.

C katılır.

A oynatır.

B ve C senkron olur.

### Senaryo 2

Host çıkar.

Yeni host belirlenir.

### Senaryo 3

B internetini kaybeder.

Tekrar bağlanır.

Odaya doğru state ile döner.

### Senaryo 4

A → B DM gönderir.

B okur.

A read state görür.

### Senaryo 5

A B'yi engeller.

B:

- DM gönderemez.
- arkadaşlık isteği gönderemez.
- izin verilen profil alanlarını görebilir.

---

# 28. Load test

Production öncesi server test edilmelidir.

Örnek:

```text
10 users
50 users
100 users
500 concurrent connections
```

gibi kademeli testler yapılmalıdır.

Test:

- CPU
- RAM
- socket connections
- database connections
- message throughput
- room broadcasts
- reconnect behavior

üzerinden yapılmalıdır.

Gerçek production kapasitesi ölçülmeden kullanıcı sayısı konusunda garanti verilmemelidir.

---

# 29. App Store / Google Play hazırlığı

## Apple

Hazırlanması gerekenler:

- Apple Developer hesabı
- Bundle Identifier
- App icon
- Splash/launch assets
- App Store screenshots
- App description
- Keywords
- Privacy information
- Support URL
- Marketing URL gerekiyorsa
- Age rating
- App privacy declarations
- Account deletion flow
- Review notes
- Production build
- TestFlight

## Google Play

- Google Play Console
- Application ID
- App icon
- Feature graphic
- Screenshots
- Store description
- Privacy policy
- Data safety form
- Content rating
- Target SDK gereksinimleri
- Account deletion/data deletion açıklamaları
- Internal testing
- Closed testing gerekiyorsa tamamlanması
- Production release

> Store gereksinimleri zaman içinde değişebildiği için yayın sırasında Apple ve Google'ın güncel resmi gereksinimleri ayrıca kontrol edilmelidir.

---

# 30. Privacy Policy / Terms

Yayın öncesi uygulamaya uygun:

- Privacy Policy
- Terms of Service
- Community Guidelines
- Contact/Support

hazırlanmalıdır.

Özellikle sosyal özellikler nedeniyle:

- kullanıcı içerikleri
- DM
- profil
- arkadaşlık
- engelleme
- raporlama
- moderasyon

kuralları açık olmalıdır.

---

# 31. Moderation sistemi

LUNA sosyal bir uygulama olduğu için minimum moderasyon sistemi kurulmalıdır.

Kullanıcı:

- Report user
- Report message
- Block user
- Unblock user

yapabilmelidir.

Admin tarafında en az:

```text
Reports
Users
Messages
Blocks
Bans
Rooms
```

yönetilebilmelidir.

Bir kullanıcıyı tamamen silmek yerine gerektiğinde:

```text
warning
temporary restriction
temporary ban
permanent ban
```

gibi durumlar tasarlanabilir.

---

# 32. Yaş ve içerik politikası

Watch party + DM + sosyal kullanıcı sistemi nedeniyle yaş ve kullanıcı güvenliği konusu yayın öncesinde ayrıca değerlendirilmelidir.

Store yaş derecelendirmeleri ile uygulamadaki:

- kullanıcı iletişimi
- kullanıcı üretimli içerik
- DM
- sosyal özellikler
- report/block
- moderasyon

birbiriyle uyumlu olmalıdır.

---

# 33. Analytics

Analytics kullanıcı davranışını anlamak için kullanılabilir.

Örnek eventler:

```text
app_open
signup
login
room_create
room_join
room_leave
video_play
video_pause
friend_request
friend_accept
dm_send
profile_update
report_submit
```

Ancak gereksiz kişisel veri toplanmamalıdır.

Analytics event'lerinde mesaj içeriği veya hassas kullanıcı verileri gönderilmemelidir.

---

# 34. Staging ortamı

Production'a doğrudan deploy edilmemelidir.

En az:

```text
Development
      ↓
Staging
      ↓
Production
```

olmalıdır.

Staging:

- ayrı database
- ayrı secrets
- ayrı server
- test kullanıcıları

kullanmalıdır.

---

# 35. Release Candidate süreci

Production'dan önce:

```text
LUNA v1.0.0-rc.1
```

oluşturulmalıdır.

RC'de:

- yeni özellik eklenmez.
- sadece bug fix yapılır.
- crash test edilir.
- store build alınır.
- gerçek cihazlarda test edilir.

---

# 36. Gerçek cihaz testleri

Minimum:

### iOS

- küçük ekranlı iPhone
- modern iPhone
- farklı iOS sürümleri

### Android

- düşük/orta seviye cihaz
- modern Android
- farklı ekran oranı

Test:

- Wi-Fi
- 4G/5G
- düşük internet
- background
- lock screen
- notification
- audio
- camera/gallery
- memory

---

# 37. Store submission öncesi son checklist

## Teknik

- [ ] Production database
- [ ] Production auth
- [ ] Authorization
- [ ] Socket security
- [ ] Rate limiting
- [ ] Error handling
- [ ] Crash reporting
- [ ] Monitoring
- [ ] Analytics
- [ ] Backup
- [ ] Restore procedure
- [ ] Secrets secured
- [ ] HTTPS/TLS
- [ ] Database indexes
- [ ] Load test
- [ ] Security test

## Uygulama

- [ ] Login
- [ ] Register
- [ ] Logout
- [ ] Password recovery
- [ ] Account deletion
- [ ] Profile
- [ ] Friends
- [ ] Block
- [ ] Report
- [ ] DM
- [ ] Room
- [ ] Playback
- [ ] Reconnect
- [ ] Notifications
- [ ] Media
- [ ] Voice

## Store

- [ ] App icon
- [ ] Splash
- [ ] Screenshots
- [ ] Description
- [ ] Privacy Policy
- [ ] Terms
- [ ] Support URL
- [ ] Age rating
- [ ] Data declarations
- [ ] App privacy
- [ ] Store metadata
- [ ] Production build

---

# 38. Abacus Agent için ana çalışma kuralları

Agent'a bu kurallar sürekli uygulanmalıdır:

```text
1. Do not rewrite working features without justification.

2. Do not modify unrelated files.

3. Before changing architecture, explain the reason.

4. Never remove an existing feature silently.

5. Never disable security checks to make tests pass.

6. Never hardcode production secrets.

7. Never trust client-provided user IDs for authorization.

8. Validate all server inputs.

9. Keep database migrations reversible when possible.

10. Test every major change.

11. Report exactly which files changed.

12. Report what was tested.

13. Report what could not be tested.

14. Do not claim a test passed unless it actually ran.

15. Do not mark production-ready without completing the production checklist.

16. Preserve the existing LUNA visual identity unless a UI change is explicitly requested.

17. Keep DRM-protected platform handling within permitted integration boundaries.

18. Prefer incremental changes over large rewrites.

19. Create a checkpoint after every major milestone.

20. If an existing implementation conflicts with production requirements,
   explain the conflict before replacing it.
```

---

# 39. Önerilen geliştirme sırası

```text
PHASE 0
Codebase Audit
        ↓
PHASE 1
Git + Backup + Checkpoints
        ↓
PHASE 2
Database Architecture
        ↓
PHASE 3
Authentication
        ↓
PHASE 4
Authorization + Security
        ↓
PHASE 5
Production Socket.io
        ↓
PHASE 6
Persistent Rooms + Playback
        ↓
PHASE 7
Friends + DM hardening
        ↓
PHASE 8
Media Upload
        ↓
PHASE 9
Notifications
        ↓
PHASE 10
LiveKit + Native Build
        ↓
PHASE 11
Moderation
        ↓
PHASE 12
Analytics + Crash Reporting
        ↓
PHASE 13
Performance
        ↓
PHASE 14
Security Audit
        ↓
PHASE 15
Load Testing
        ↓
PHASE 16
Real Device QA
        ↓
PHASE 17
Staging
        ↓
PHASE 18
Release Candidate
        ↓
PHASE 19
App Store + Google Play
        ↓
PHASE 20
Production Monitoring
```

---

# 40. Production sonrası

Store'a çıktıktan sonra iş bitmez.

İlk dönem özellikle:

- crash rate
- login failures
- socket disconnects
- room failures
- DM failures
- server CPU/RAM
- database performance
- user reports
- App Store reviews
- Google Play reviews

izlenmelidir.

İlk release sonrasında büyük özellik geliştirmeden önce production verileri incelenmelidir.

---

# 41. LUNA için temel hedef

Son hedef şu mimaridir:

```text
                 ┌─────────────────────┐
                 │     iOS / Android   │
                 │    LUNA Mobile App  │
                 └──────────┬──────────┘
                            │
                    HTTPS / WebSocket
                            │
                 ┌──────────▼──────────┐
                 │      Backend API     │
                 │ Node.js + Socket.io │
                 └──────────┬──────────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
      ┌──────▼──────┐ ┌────▼─────┐ ┌─────▼─────┐
      │ PostgreSQL  │ │  Storage │ │  LiveKit  │
      │  Supabase   │ │  Media   │ │   Voice   │
      └─────────────┘ └──────────┘ └───────────┘
             │
      ┌──────▼─────────┐
      │ Auth / Profile │
      │ Friends / DM   │
      │ Rooms / Data   │
      └────────────────┘
```

Bu hedefe ulaşmadan uygulama "production-ready" kabul edilmemelidir.

---

# 42. Son kontrol

LUNA'nın App Store ve Google Play'e gönderilmesi için temel prensip:

> **Önce çalışan MVP → sonra kalıcı veri → sonra gerçek kullanıcı → sonra güvenlik → sonra native özellikler → sonra QA → sonra store → sonra production monitoring.**

Yeni özellik eklemekten önce mevcut özelliklerin güvenilirliği ve veri güvenliği tamamlanmalıdır.

Bu doküman LUNA'nın bundan sonraki geliştirmelerinde ana roadmap olarak kullanılabilir.
