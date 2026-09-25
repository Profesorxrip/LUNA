import { useState } from "react";
import { getSocket } from "../services/socket";
import type { RoomState } from "../services/socket";

export default function Home({ onEnterRoom }: { onEnterRoom: (r: RoomState) => void }) {
  const [name, setName] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function requireName() {
    if (!name.trim()) {
      setError("Once bir isim/rumuz yaz.");
      return false;
    }
    setError(null);
    return true;
  }

  function createRoom() {
    if (!requireName()) return;
    getSocket().emit("room:create", { name: name.trim(), title: roomTitle.trim(), isPublic: true }, (res: any) => {
      if (res.ok) onEnterRoom(res.room);
    });
  }

  function joinRoom() {
    if (!requireName()) return;
    if (!joinCode.trim()) {
      setError("Oda kodu gerekli.");
      return;
    }
    getSocket().emit("room:join", { code: joinCode.trim().toUpperCase(), name: name.trim() }, (res: any) => {
      if (res.ok) onEnterRoom(res.room);
      else setError(res.error || "Katilinamadi.");
    });
  }

  return (
    <div className="home">
      <h1>Lavin</h1>
      <input placeholder="Adin / rumuzun" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Oda basligi (orn. Film Gecesi)" value={roomTitle} onChange={(e) => setRoomTitle(e.target.value)} />
      <button className="primary" onClick={createRoom}>
        Yeni Oda Olustur
      </button>
      <div className="divider" />
      <input
        placeholder="Oda kodu (orn. AB12CD)"
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
      />
      <button className="secondary" onClick={joinRoom}>
        Odaya Katil
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
