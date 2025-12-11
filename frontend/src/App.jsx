import React, { useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";

// --- UTILS ---
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function formatTime(dateInput) {
  const date = new Date(dateInput);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

export default function App() {
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [totalUsers, setTotalUsers] = useState(1);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const pendingRef = useRef(new Map());

  // persistent clientId (saved to localStorage)
  const CLIENT_ID_KEY = "chat_client_id_v1";
  const [clientId] = useState(() => {
    try {
      const existing = localStorage.getItem(CLIENT_ID_KEY);
      if (existing) return existing;
      const id = `cid-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem(CLIENT_ID_KEY, id);
      return id;
    } catch (e) {
      // fallback if localStorage not available
      return `cid-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    }
  });

  const clientDisplayName = useRef(`User-${clientId.slice(-6)}`);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.preload = "auto";
  }, []);

  useEffect(() => {
    const SOCKET_URL = "https://socketio-testing-chatbox.onrender.com";
    const socket = ioClient(SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 999,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // identify with persistent clientId + displayName
      socket.emit("identify", { clientId, displayName: clientDisplayName.current });
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setTypingUsers({});
    });

    // history: server messages include clientId
    socket.on("history", (history = []) => {
      setMessageList((prev) => {
        // dedupe by id but preserve server order
        const map = new Map();
        history.forEach((m) => { if (m && m.id) map.set(m.id, m); });
        // include any previous non-server messages (pending)
        prev.forEach((m) => { if (m && m.id && !map.has(m.id)) map.set(m.id, m); });
        // ensure pending optimistic messages are present
        pendingRef.current.forEach((m) => { if (!map.has(m.id)) map.set(m.id, m); });
        return Array.from(map.values());
      });
    });

    socket.on("receive_message", (data) => {
      if (!data || !data.id) return;
      setMessageList((prev) => {
        const map = new Map();
        prev.forEach((m) => map.set(m.id, m));
        // prefer server's message object (it has clientId normalized by server)
        map.set(data.id, data);
        return Array.from(map.values());
      });
      if (pendingRef.current.has(data.id)) pendingRef.current.delete(data.id);

      // sound only if from other clientId
      if (data.clientId && data.clientId !== clientId) {
        try { audioRef.current?.play().catch(()=>{}); } catch(e){}
      }
    });

    socket.on("user_typing", (payload) => {
      // payload: { socketId, clientId, typing, displayName }
      if (!payload) return;
      // don't show our own typing
      if (payload.clientId === clientId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (payload.typing) next[payload.clientId || payload.socketId] = payload.displayName || "Someone";
        else delete next[payload.clientId || payload.socketId];
        return next;
      });
    });

    socket.on("users_count", (payload) => {
      if (payload && typeof payload.total === "number") setTotalUsers(payload.total);
    });

    socket.on("connect_error", (err) => console.warn("connect_error:", err?.message || err));
    socket.on("error", (err) => console.warn("socket_error:", err));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [clientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageList, typingUsers]);

  const typingTimeoutRef = useRef(null);
  const handleTyping = () => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit("typing", { typing: true, displayName: clientDisplayName.current, clientId });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("typing", { typing: false, clientId });
    }, 1200);
  };

  const sendMessage = () => {
    if (!message.trim() || !socketRef.current) return;
    const id = generateId();
    const msgData = {
      id,
      message: message.trim(),
      time: new Date().toISOString(),
      // include persistent clientId so server can store it
      clientId,
      displayName: clientDisplayName.current,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${clientId}&backgroundColor=b6e3f4,c0aede,d1d4f9`
    };

    // optimistic update + mark pending
    pendingRef.current.set(id, msgData);
    setMessageList((prev) => {
      const map = new Map();
      prev.forEach((m) => map.set(m.id, m));
      map.set(id, msgData);
      return Array.from(map.values());
    });

    // emit with ack
    socketRef.current.emit("send_message", msgData, (ack) => {
      if (ack && ack.id) {
        pendingRef.current.delete(ack.id);
      }
    });

    socketRef.current.emit("typing", { typing: false, clientId });
    setMessage("");
  };

  const otherUsersCount = Math.max(0, totalUsers - 1);
  const typingArr = Object.values(typingUsers);

  return (
    <div className="app-container">
      <style>{/* same styling as before, omitted here for brevity (use your existing CSS) */}</style>

      <div className="chat-card">
        <div className="chat-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111" }}>Public Lounge</h2>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              <span className={`status-dot ${connected ? "online" : "offline"}`} />
              {connected ? `${otherUsersCount} others online` : "Connecting..."}
            </div>
          </div>
          {clientId && (
            <img
              src={`https://api.dicebear.com/7.x/notionists/svg?seed=${clientId}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
              alt="My Avatar"
              style={{ width: 36, height: 36, borderRadius: "50%" }}
            />
          )}
        </div>

        <div className="messages-area" aria-live="polite">
          {messageList.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 40, color: "#9ca3af", fontSize: 14 }}>
              No messages yet. Say Hi! 👋
            </div>
          )}

          {messageList.map((msg) => {
            // Compare by persistent clientId instead of socketId
            const isMine = msg.clientId === clientId;
            const avatarSeed = msg.clientId || msg.socketId || "anon";
            const avatarUrl = msg.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}`;
            return (
              <div key={msg.id} className={`message-group ${isMine ? "mine" : "other"}`}>
                {!isMine && <img src={avatarUrl} className="avatar" alt="User avatar" />}
                <div className="bubble">
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{isMine ? "You" : (msg.displayName || "Anon")}</div>
                  <div>{msg.message}</div>
                  <div className="meta">{formatTime(msg.time)}</div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="typing-indicator">
          {typingArr.length > 0 && (
            <span>
              <span style={{ fontWeight: 600 }}>
                {typingArr.length > 2 ? "Several people" : typingArr.join(", ")}
              </span>{" "}
              is typing...
            </span>
          )}
        </div>

        <div className="input-area">
          <input
            className="msg-input"
            value={message}
            onChange={(e) => { setMessage(e.target.value); handleTyping(); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendMessage(); } }}
            placeholder="Type a message..."
            aria-label="Type a message"
          />
          <button
            className="send-btn"
            onClick={sendMessage}
            title="Send"
            aria-label="Send message"
            disabled={!message.trim()}
            style={{ opacity: message.trim() ? 1 : 0.6 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
