// LUNA Watch Party - icerik betigi
//
// Bu dosya Netflix/Disney+/Prime Video/HBO Max sayfasinin icine enjekte
// edilir. Amac: videoyu KENDI hesabimizla, KENDI tarayicimizda, DRM'e hic
// dokunmadan oynatirken - sadece "oynat/durdur/su saniyedeyiz" bilgisini
// LUNA'nin ZATEN calisan Socket.IO sunucusuna (mobile uygulamayla AYNI
// sunucu, ayni oda/kod sistemi) gonderip odadaki herkesle paylasmak.
//
// Yetki modeli odanin "Liderin Secimi" moduyla AYNI: sadece HOST video
// durumunu yayinlar (bkz. server/src/rooms.ts canControlTransport - sadece
// host "playback:update" gonderebilir), digerleri SADECE ALIR ve kendi
// videolarini buna gore ayarlar. Bu yuzden tek yonlu bir akis - host'tan
// yayin, geri besleme (echo) riski yok.
(function () {
  "use strict";

  const PLATFORM_LABEL = window.__LUNA_PLATFORM_LABEL__(location.hostname);
  const SEEK_THRESHOLD_SECONDS = 1.5; // bu kadar sapma varsa gercekten seek et
  const HEARTBEAT_MS = 2000; // host konumunu bu araliklarla yayinlar
  const FOLLOWER_RECONCILE_MS = 1000; // takipci bu araliklarla konumunu kontrol eder

  let socket = null;
  let mySocketId = null;
  let room = null; // en son alinan room:state
  let isHost = false;
  let video = null;
  let lastEmittedAt = 0;
  let suppressNextSeek = false; // takipci videoyu KENDI kodumuzla seek ederken native 'seeked' olayini yok say

  // ---------------------------------------------------------------------
  // Depolama (sunucu adresi + son oda kodu - sekme kapanip acilinca hatirlanir)
  // ---------------------------------------------------------------------
  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["lunaServerUrl", "lunaRoomCode", "lunaName"], (data) => {
        resolve({
          serverUrl: data.lunaServerUrl || "http://localhost:3000",
          roomCode: data.lunaRoomCode || "",
          name: data.lunaName || "Misafir",
        });
      });
    });
  }
  function saveSettings(partial) {
    const map = {};
    if (partial.serverUrl !== undefined) map.lunaServerUrl = partial.serverUrl;
    if (partial.roomCode !== undefined) map.lunaRoomCode = partial.roomCode;
    if (partial.name !== undefined) map.lunaName = partial.name;
    chrome.storage.local.set(map);
  }

  // ---------------------------------------------------------------------
  // Arayuz - Shadow DOM icinde, sayfanin KENDI CSS'inden tamamen izole
  // (Netflix/Disney+ gibi agresif global stilleri olan sitelerde bu sart,
  // aksi halde panelimiz bozuk gorunur).
  // ---------------------------------------------------------------------
  const host = document.createElement("div");
  host.id = "luna-watchparty-host";
  const shadow = host.attachShadow({ mode: "open" });

  const styleLink = document.createElement("link");
  styleLink.rel = "stylesheet";
  styleLink.href = chrome.runtime.getURL("src/content.css");
  shadow.appendChild(styleLink);

  const root = document.createElement("div");
  root.className = "luna-root";
  root.innerHTML = `
    <div class="luna-bubble" id="lunaBubble">
      <span class="luna-dot" id="lunaDot"></span>
      <span>LUNA</span>
    </div>
    <div class="luna-panel" id="lunaPanel" hidden>
      <div class="luna-header">
        <span>LUNA Watch Party</span>
        <button class="luna-icon-btn" id="lunaClose">✕</button>
      </div>
      <div class="luna-status" id="lunaStatus">Bağlı değil</div>

      <div class="luna-section" id="lunaJoinSection">
        <input class="luna-input" id="lunaServerUrl" placeholder="Sunucu adresi (ör. http://localhost:3000)" />
        <div class="luna-row">
          <input class="luna-input" id="lunaRoomCode" placeholder="Oda kodu" />
          <button class="luna-btn" id="lunaJoinBtn">Katıl</button>
        </div>
        <button class="luna-btn" id="lunaCreateBtn">Bu sayfadan yeni oda oluştur (lider sen olursun)</button>
      </div>

      <div class="luna-section" id="lunaRoomSection" hidden>
        <div class="luna-room-title" id="lunaRoomTitle"></div>
        <div class="luna-row-between">
          <span id="lunaRoleTag" class="luna-tag"></span>
          <span id="lunaParticipantCount" class="luna-muted"></span>
        </div>
        <div id="lunaGoToBanner" class="luna-banner" hidden>
          <span id="lunaGoToText"></span>
          <button class="luna-btn luna-btn-sm" id="lunaGoToBtn">Git</button>
        </div>
        <div class="luna-chat" id="lunaChat"></div>
        <div class="luna-row">
          <input class="luna-input" id="lunaChatInput" placeholder="Mesaj yaz..." />
          <button class="luna-btn luna-btn-sm" id="lunaChatSend">Gönder</button>
        </div>
        <button class="luna-btn luna-btn-danger" id="lunaLeaveBtn">Odadan Çık</button>
      </div>
    </div>
  `;
  shadow.appendChild(root);
  document.documentElement.appendChild(host);

  const el = {
    bubble: shadow.getElementById("lunaBubble"),
    dot: shadow.getElementById("lunaDot"),
    panel: shadow.getElementById("lunaPanel"),
    close: shadow.getElementById("lunaClose"),
    status: shadow.getElementById("lunaStatus"),
    joinSection: shadow.getElementById("lunaJoinSection"),
    serverUrl: shadow.getElementById("lunaServerUrl"),
    roomCode: shadow.getElementById("lunaRoomCode"),
    joinBtn: shadow.getElementById("lunaJoinBtn"),
    createBtn: shadow.getElementById("lunaCreateBtn"),
    roomSection: shadow.getElementById("lunaRoomSection"),
    roomTitle: shadow.getElementById("lunaRoomTitle"),
    roleTag: shadow.getElementById("lunaRoleTag"),
    participantCount: shadow.getElementById("lunaParticipantCount"),
    goToBanner: shadow.getElementById("lunaGoToBanner"),
    goToText: shadow.getElementById("lunaGoToText"),
    goToBtn: shadow.getElementById("lunaGoToBtn"),
    chat: shadow.getElementById("lunaChat"),
    chatInput: shadow.getElementById("lunaChatInput"),
    chatSend: shadow.getElementById("lunaChatSend"),
    leaveBtn: shadow.getElementById("lunaLeaveBtn"),
  };

  el.bubble.addEventListener("click", () => {
    el.panel.hidden = !el.panel.hidden;
  });
  el.close.addEventListener("click", () => {
    el.panel.hidden = true;
  });

  function setStatus(text) {
    el.status.textContent = text;
  }
  function setDotState(state) {
    el.dot.className = "luna-dot luna-dot-" + state; // "off" | "connecting" | "on"
  }

  function addChatLine(line) {
    const div = document.createElement("div");
    div.className = "luna-chat-line" + (line.system ? " luna-chat-system" : "");
    if (line.system) {
      div.textContent = line.text;
    } else {
      const strong = document.createElement("strong");
      strong.textContent = (line.from || "?") + ": ";
      div.appendChild(strong);
      div.appendChild(document.createTextNode(line.text || ""));
    }
    el.chat.appendChild(div);
    el.chat.scrollTop = el.chat.scrollHeight;
  }

  // ---------------------------------------------------------------------
  // Video elementini bulma - Netflix/Disney+/Prime/HBO Max hepsi gercek
  // oynatimda standart bir <video> etiketi kullanir (agir ozel UI'nin
  // ALTINDA). SPA oldugu icin sayfa yenilenmeden video gelip gidebilir,
  // bu yuzden surekli gozlemliyoruz.
  // ---------------------------------------------------------------------
  function findVideo() {
    return document.querySelector("video");
  }

  function currentExpectedPosition() {
    if (!room || !room.playback) return 0;
    const p = room.playback;
    if (!p.isPlaying) return p.positionSeconds;
    return p.positionSeconds + (Date.now() - p.updatedAtMs) / 1000;
  }

  let hostHeartbeatTimer = null;
  let followerReconcileTimer = null;

  function stopTimers() {
    if (hostHeartbeatTimer) clearInterval(hostHeartbeatTimer);
    if (followerReconcileTimer) clearInterval(followerReconcileTimer);
    hostHeartbeatTimer = null;
    followerReconcileTimer = null;
  }

  // "source" alani SADECE sayfa (baslik) gercekten degisince gonderilir -
  // sunucu her "source" iceren playback:update'te sohbete "Simdi X
  // oynatiliyor" diye bir sistem mesaji dusuruyor (bkz. index.ts
  // playback:update) - oynat/durdur/surukleme/kalp atisi gibi RUTIN
  // guncellemelerde bunu tekrar tekrar gondermek sohbeti spam'ler.
  let lastEmittedUrl = null;
  function emitPlaybackUpdate(extra) {
    if (!socket || !video) return;
    lastEmittedAt = Date.now();
    const payload = {
      isPlaying: !video.paused && !video.ended,
      positionSeconds: video.currentTime,
      durationSeconds: isFinite(video.duration) ? video.duration : undefined,
      ...extra,
    };
    if (location.href !== lastEmittedUrl) {
      payload.source = { type: "external", url: location.href, label: PLATFORM_LABEL };
      lastEmittedUrl = location.href;
    }
    socket.emit("playback:update", payload);
  }

  function attachAsHost(v) {
    setStatus("Bağlısın - LİDERSİN, video senin ekranından yayınlanıyor");
    el.roleTag.textContent = "LİDER";
    el.roleTag.className = "luna-tag luna-tag-host";

    const onPlayPause = () => emitPlaybackUpdate({});
    const onSeeked = () => emitPlaybackUpdate({});
    v.addEventListener("play", onPlayPause);
    v.addEventListener("pause", onPlayPause);
    v.addEventListener("seeked", onSeeked);

    // Oynatirken drift duzeltmesi icin periyodik yayim - sadece olaylara
    // guvenmek yetmiyor, Netflix'in kendi arabellekleme/atlama davranislari
    // sessizce konumu kaydirabiliyor.
    hostHeartbeatTimer = setInterval(() => {
      if (!v.paused) emitPlaybackUpdate({});
    }, HEARTBEAT_MS);

    // Ilk konumu hemen gonder ki katilanlar beklemesin.
    emitPlaybackUpdate({});

    video.__lunaCleanup = () => {
      v.removeEventListener("play", onPlayPause);
      v.removeEventListener("pause", onPlayPause);
      v.removeEventListener("seeked", onSeeked);
    };
  }

  function attachAsFollower(v) {
    setStatus("Bağlısın - takip ediyorsun, lider ne izlerse o senkronlanıyor");
    el.roleTag.textContent = "TAKİPÇİ";
    el.roleTag.className = "luna-tag";

    followerReconcileTimer = setInterval(() => {
      if (!room || !room.playback) return;
      const expected = currentExpectedPosition();
      const drift = Math.abs(v.currentTime - expected);
      if (drift > SEEK_THRESHOLD_SECONDS) {
        suppressNextSeek = true;
        v.currentTime = expected;
      }
      if (room.playback.isPlaying && v.paused) v.play().catch(() => {});
      if (!room.playback.isPlaying && !v.paused) v.pause();
    }, FOLLOWER_RECONCILE_MS);
  }

  function detachVideo() {
    stopTimers();
    if (video && video.__lunaCleanup) video.__lunaCleanup();
    video = null;
  }

  function attachVideo() {
    // Henuz bir odada degilsek "video" degiskenini HIC ellemiyoruz - SPA
    // sitelerde (Netflix/Disney+) MutationObserver odaya katilmadan ONCE
    // tetiklenebilir; "video"yu erken atarsak, az sonra GERCEKTEN katilinca
    // "found === video" kisayolu yuzunden attachAsHost/attachAsFollower hic
    // cagrilmaz sanilir (oysa hicbir zaman gercekten baglanmamistir).
    if (!room) return;
    const found = findVideo();
    if (!found || found === video) return;
    detachVideo();
    video = found;
    if (isHost) attachAsHost(video);
    else attachAsFollower(video);
  }

  // SPA navigasyonu (baslik degisimi vs.) video etiketini yeniden olusturur -
  // bu yuzden surekli izliyoruz. Agir DOM'larda performans icin kaba bir
  // "debounce" uyguluyoruz.
  let observerTimer = null;
  const observer = new MutationObserver(() => {
    if (observerTimer) return;
    observerTimer = setTimeout(() => {
      observerTimer = null;
      attachVideo();
    }, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ---------------------------------------------------------------------
  // Oda durumu geldiginde uygula
  // ---------------------------------------------------------------------
  function deriveIsHost() {
    if (!room || !mySocketId) return false;
    const me = (room.participants || []).find((p) => p.socketId === mySocketId);
    return Boolean(me && me.isHost);
  }

  function renderRoom() {
    el.roomTitle.textContent = (room.title || "Oda") + " · Kod: " + room.code;
    el.participantCount.textContent = (room.participants || []).length + " kişi";

    const wasHost = isHost;
    isHost = deriveIsHost();
    if (wasHost !== isHost || !video) {
      detachVideo();
      attachVideo();
    }

    // Takipciyse ve lider farkli bir sayfadaysa "Git" bannerini goster.
    if (!isHost && room.playback && room.playback.source && room.playback.source.url) {
      const sourceUrl = room.playback.source.url;
      if (sourceUrl !== location.href) {
        el.goToBanner.hidden = false;
        el.goToText.textContent = "Lider " + (room.playback.source.label || "başka bir sayfa") + " açtı";
        el.goToBtn.onclick = () => {
          location.href = sourceUrl;
        };
      } else {
        el.goToBanner.hidden = true;
      }
    } else {
      el.goToBanner.hidden = true;
    }
  }

  // ---------------------------------------------------------------------
  // Baglanti - SENKRON: soket, cagrildigi aninda hemen olusturulur (storage
  // okumasi gibi asenkron bir seyi beklemez). socket.io-client zaten henuz
  // baglanmamisken yapilan emit'leri kendi icinde kuyruga alip baglanti
  // kurulunca gonderir, bu yuzden hemen ardindan joinRoom/createRoom
  // cagirmak guvenli - "connect" olayini beklemeye gerek yok.
  function connect(serverUrl) {
    setDotState("connecting");
    setStatus("Bağlanıyor...");
    socket = window.io(serverUrl, { transports: ["websocket", "polling"] });

    socket.on("connect", () => {
      mySocketId = socket.id;
      setDotState("on");
      setStatus("Sunucuya bağlandın");
    });

    socket.on("disconnect", () => {
      setDotState("off");
      setStatus("Bağlantı koptu, tekrar deneniyor...");
      detachVideo();
    });

    socket.on("room:state", (nextRoom) => {
      room = nextRoom;
      renderRoom();
    });

    socket.on("room:chat", (msg) => addChatLine(msg));
  }

  function onJoined(res) {
    if (!res || !res.ok) {
      setStatus("Katılamadın: " + (res && res.error ? res.error : "bilinmeyen hata"));
      return;
    }
    room = res.room;
    saveSettings({ roomCode: room.code });
    el.joinSection.hidden = true;
    el.roomSection.hidden = false;
    el.chat.innerHTML = "";
    renderRoom();
  }

  function joinRoom(code) {
    if (!socket || !code) return;
    setStatus("Odaya katılınıyor...");
    socket.emit("room:join", { code, name: "LUNA Tarayıcı" }, onJoined);
  }

  // Odayi BIZIM soketimiz olusturduysa host (lider) biziz demektir - bir
  // mobil odaya SONRADAN katilmak bizi asla lider yapmaz (bkz. rooms.ts
  // joinRoom/createRoom - lider HER ZAMAN odayi ilk acan soket).
  function createRoom() {
    if (!socket) return;
    setStatus("Oda oluşturuluyor...");
    const source = { type: "external", url: location.href, label: PLATFORM_LABEL };
    socket.emit("room:create", { name: "LUNA Tarayıcı", isPublic: true, source }, onJoined);
  }

  function withConnection(action) {
    const url = el.serverUrl.value.trim();
    if (!url) return;
    saveSettings({ serverUrl: url });
    if (!socket || !socket.connected) connect(url);
    action();
  }

  el.joinBtn.addEventListener("click", () => {
    const code = el.roomCode.value.trim();
    if (!code) return;
    saveSettings({ roomCode: code });
    withConnection(() => joinRoom(code));
  });

  el.createBtn.addEventListener("click", () => {
    withConnection(() => createRoom());
  });

  el.leaveBtn.addEventListener("click", () => {
    if (socket) socket.emit("room:leave");
    detachVideo();
    room = null;
    isHost = false;
    saveSettings({ roomCode: "" });
    el.joinSection.hidden = false;
    el.roomSection.hidden = true;
    setStatus("Odadan çıktın");
  });

  function sendChat() {
    const text = el.chatInput.value.trim();
    if (!text || !socket) return;
    socket.emit("chat:send", { text }, () => {});
    el.chatInput.value = "";
  }
  el.chatSend.addEventListener("click", sendChat);
  el.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  // Sayfa ilk acildiginda SADECE kutulari (son kullanilan sunucu adresi/oda
  // kodu) dolduruyoruz - OTOMATIK baglanip katilmiyoruz. "chrome.storage.local"
  // UZANTININ TUM SEKMELERI ARASINDA PAYLASILIR (sekmeye ozel degil) - eger
  // burada otomatik "connect+join" yapsaydik, AYNI ANDA acik baska bir
  // sekme (orn. host'un kendi odasi) de AYNI son-oda koduna otomatik
  // katilmaya calisirdi, istenmeyen sekmeler-arasi "sizinti" olurdu. Kullanici
  // her sayfada "Katıl"/"Oda Oluştur"a bilerek basmali.
  getSettings().then((settings) => {
    if (!el.serverUrl.value) el.serverUrl.value = settings.serverUrl;
    if (!el.roomCode.value) el.roomCode.value = settings.roomCode;
  });
})();
