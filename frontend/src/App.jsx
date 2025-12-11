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

// Notification sound URL (you can replace)
const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

export default function App() {
  // STATE
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [totalUsers, setTotalUsers] = useState(1);

  // REFS
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const pendingRef = useRef(new Map()); // optimistic messages not yet confirmed by server (keyed by id)
  const clientDisplayName = useRef(`User-${Math.random().toString(36).slice(2,6)}`);

  // init audio once
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.preload = "auto";
  }, []);

  // --- SOCKET CONNECTION ---
  useEffect(() => {
    const SOCKET_URL = "https://socketio-testing-chatbox.onrender.com"; // change if needed

    const socket = ioClient(SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 999,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("socket connected", socket.id);
      setConnected(true);
      // Inform server of our name (optional)
      socket.emit("identify", { displayName: clientDisplayName.current });
    });

    socket.on("disconnect", (reason) => {
      console.log("socket disconnected", reason);
      setConnected(false);
      setTypingUsers({});
    });

    // Server history (array)
    socket.on("history", (history = []) => {
      // Merge server history with any pending local optimistic messages
      setMessageList((prev) => {
        const merged = new Map();
        // add server history first
        history.forEach((m) => {
          if (m && m.id) merged.set(m.id, m);
        });
        // then add previous existing messages (in case there are local-only messages)
        prev.forEach((m) => {
          if (m && m.id && !merged.has(m.id)) merged.set(m.id, m);
        });
        // ensure pending optimistic messages (if any) are present
        pendingRef.current.forEach((m, id) => {
          if (!merged.has(id)) merged.set(id, m);
        });
        return Array.from(merged.values());
      });
    });

    // Receive message broadcast
    socket.on("receive_message", (data) => {
      if (!data || !data.id) return;
      setMessageList((prev) => {
        // put messages into a map key'd by id to dedupe & keep order
        const map = new Map();
        prev.forEach((m) => map.set(m.id, m));
        // insert/overwrite with incoming server message
        map.set(data.id, data);
        return Array.from(map.values());
      });

      // If this message was pending, remove from pending
      if (pendingRef.current.has(data.id)) {
        pendingRef.current.delete(data.id);
      }

      // Play sound only if message is from someone else
      if (data.socketId && data.socketId !== socketRef.current?.id) {
        try {
          // browsers require user interaction for autoplay; catch any error silently
          audioRef.current?.play().catch(() => {});
        } catch (e) {}
      }
    });

    // Typing events
    socket.on("user_typing", (payload) => {
      // payload: { socketId, typing, displayName }
      if (!payload || !payload.socketId) return;
      if (payload.socketId === socketRef.current?.id) return; // ignore our own
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (payload.typing) next[payload.socketId] = payload.displayName || "Someone";
        else delete next[payload.socketId];
        return next;
      });
    });

    socket.on("users_count", (payload) => {
      if (payload && typeof payload.total === "number") setTotalUsers(payload.total);
    });

    // debug errors
    socket.on("connect_error", (err) => console.warn("connect_error:", err?.message || err));
    socket.on("error", (err) => console.warn("socket_error:", err));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Auto scroll on messages or typing changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageList, typingUsers]);

  // Typing debounce
  const typingTimeoutRef = useRef(null);
  const handleTyping = () => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit("typing", { typing: true, displayName: clientDisplayName.current });

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("typing", { typing: false });
    }, 1200);
  };

  // Send message (optimistic)
  const sendMessage = () => {
    if (!message.trim() || !socketRef.current) return;
    const id = generateId();
    const msgData = {
      id,
      message: message.trim(),
      time: new Date().toISOString(),
      socketId: socketRef.current.id,
      displayName: clientDisplayName.current,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${socketRef.current.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`
    };

    // optimistic update + mark as pending
    pendingRef.current.set(id, msgData);
    setMessageList((prev) => {
      const map = new Map();
      prev.forEach((m) => map.set(m.id, m));
      map.set(id, msgData);
      return Array.from(map.values());
    });

    // emit with optional acknowledgement
    socketRef.current.emit("send_message", msgData, (ack) => {
      // ack may contain { ok: true, id } if server sends it
      if (ack && ack.id) {
        // server confirmed storage; if server modifies message we rely on receive_message to sync
        pendingRef.current.delete(ack.id);
      }
    });

    // stop typing state
    socketRef.current.emit("typing", { typing: false });

    setMessage("");
  };

  // helpers
  const otherUsersCount = Math.max(0, totalUsers - 1);
  const typingArr = Object.values(typingUsers);

  return (
    <div className="app-container">
      <style>{`
        :root {
          --primary: #4f46e5;
          --primary-light: #e0e7ff;
          --bg: #f3f4f6;
          --chat-bg: #ffffff;
          --mine-bubble: #4f46e5;
          --other-bubble: #f3f4f6;
          --text-main: #1f2937;
          --text-sub: #6b7280;
        }
        body { margin: 0; font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; background: var(--bg); }
        .app-container { display:flex; justify-content:center; align-items:center; min-height:100dvh; padding:20px; box-sizing:border-box; }
        .chat-card { width:100%; max-width:700px; height:85vh; background:var(--chat-bg); border-radius:24px; box-shadow:0 20px 50px -10px rgba(0,0,0,0.1); display:flex; flex-direction:column; overflow:hidden; position:relative;}
        .chat-header { padding:16px 20px; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); border-bottom:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center; z-index:10;}
        .status-dot { height:8px; width:8px; border-radius:50%; display:inline-block; margin-right:6px;}
        .online { background:#22c55e; box-shadow:0 0 8px #22c55e; }
        .offline { background:#ef4444; }
        .messages-area { flex:1; padding:20px; overflow-y:auto; background-image: radial-gradient(#e5e7eb 1px, transparent 1px); background-size:20px 20px; display:flex; flex-direction:column; gap:12px; }
        .message-group { display:flex; gap:10px; max-width:100%; animation:slideIn .2s ease; }
        .message-group.mine { align-self:flex-end; flex-direction:row-reverse; }
        .avatar { width:36px; height:36px; border-radius:50%; background:#ddd; border:2px solid white; flex-shrink:0; }

        /* BUBBLE: flexible wrapping + long-word handling */
        .bubble { padding:10px 14px; border-radius:18px; position:relative; font-size:14px; line-height:1.45; box-shadow:0 2px 5px rgba(0,0,0,0.05); white-space:pre-wrap; /* keep user's line breaks */
          word-break:break-word; /* break long words when needed */
          overflow-wrap:anywhere; /* strong guarantee to avoid overflow */
          max-width: calc(100% - 120px); /* keep room for avatar + padding */
        }
        .mine .bubble { background:var(--mine-bubble); color:white; border-bottom-right-radius:4px; }
        .other .bubble { background:var(--other-bubble); color:var(--text-main); border-bottom-left-radius:4px; }
        .meta { font-size:10px; margin-top:6px; opacity:0.8; text-align:right; }

        /* Show slightly faded for optimistic (pending) messages */
        .bubble.pending { opacity:0.85; filter:grayscale(.02); }

        .typing-indicator { font-size:12px; color:var(--text-sub); padding:0 24px 8px; height:20px; }
        .input-area { padding:12px 16px; background:white; border-top:1px solid #f3f4f6; display:flex; gap:10px; align-items:center; }
        .msg-input { flex:1; background:#f9fafb; border:1px solid #e5e7eb; padding:12px 16px; border-radius:99px; outline:none; font-size:14px; transition:all .2s; min-height:44px; max-height:140px; overflow:auto; resize:none; }
        .msg-input:focus { border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-light); background:white; }
        .send-btn { background:var(--primary); color:white; border:none; width:44px; height:44px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform .1s; }
        .send-btn:active { transform:scale(.95); }

        @keyframes slideIn { from { opacity:0; transform:translateY(6px);} to { opacity:1; transform:translateY(0);} }

        /* RESPONSIVE TWEAKS */
        @media (max-width:900px) {
          .chat-card { max-width:640px; height:88vh; }
          .bubble { max-width: calc(100% - 100px); }
        }
        @media (max-width:600px) {
          .app-container { padding:0; }
          .chat-card { height:100dvh; max-width:100%; border-radius:0; }
          .avatar { width:32px; height:32px; }
          .bubble { max-width: calc(100% - 72px); font-size:15px; }
          .chat-header h2 { font-size:16px; }
        }
      `}</style>
      <div className="chat-card">
        <div className="chat-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111" }}>Public Lounge</h2>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              <span className={`status-dot ${connected ? "online" : "offline"}`} />
              {connected ? `${otherUsersCount} others online` : "Connecting..."}
            </div>
          </div>
          {socketRef.current?.id && (
            <img
              src={`https://api.dicebear.com/7.x/notionists/svg?seed=${socketRef.current.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
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
            const isMine = msg.socketId === socketRef.current?.id;
            const avatarUrl = msg.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${msg.socketId}`;
            const isPending = pendingRef.current.has(msg.id);
            return (
              <div key={msg.id} className={`message-group ${isMine ? "mine" : "other"}`}>
                {!isMine && <img src={avatarUrl} className="avatar" alt="User avatar" />}
                <div className={`bubble ${isPending ? "pending" : ""}`}>
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
          <textarea
            className="msg-input"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message... (Shift+Enter for newline)"
            aria-label="Type a message"
            rows={1}
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
