import { useState } from "react";
import Home from "./screens/Home";
import Room from "./screens/Room";
import type { RoomState } from "./services/socket";
import "./App.css";

export default function App() {
  const [room, setRoom] = useState<RoomState | null>(null);

  return (
    <div className="app-shell">
      {room ? (
        <Room initialRoom={room} onLeave={() => setRoom(null)} />
      ) : (
        <Home onEnterRoom={setRoom} />
      )}
    </div>
  );
}
