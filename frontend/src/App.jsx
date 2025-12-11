import React, { useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";

// --- CONFIG & UTILS ---
const FIX_TOKEN = "jhdhhdhdhhsdsdhsdhshdh"; 
const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(dateInput) {
  const date = new Date(dateInput);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- MAIN APP COMPONENT (Auth Handler) ---
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [inputName, setInputName] = useState("");

  // 1. Check LocalStorage on Load
  useEffect(() => {
    const storedToken = localStorage.getItem("chat_app_token");
    const storedName = localStorage.getItem("chat_app_username");

    if (storedToken === FIX_TOKEN && storedName) {
      setUsername(storedName);
      setIsLoggedIn(true);
    }
  }, []);

  // 2. Handle Signup
  const handleLogin = () => {
    if (!inputName.trim()) return alert("Please enter your name!");
    
    localStorage.setItem("chat_app_token", FIX_TOKEN);
    localStorage.setItem("chat_app_username", inputName.trim());
    
    setUsername(inputName.trim());
    setIsLoggedIn(true);
  };

  // 3. Handle Logout (NEW FUNCTION)
  const handleLogout = () => {
    // Token aur details delete karo
    localStorage.removeItem("chat_app_token");
    localStorage.removeItem("chat_app_username");
    // State reset karo
    setIsLoggedIn(false);
    setUsername("");
    setInputName("");
  };

  // --- RENDER ---
  if (!isLoggedIn) {
    return (
      <div className="app-container">
        <StyleSheet /> 
        <div className="chat-card login-card">
          <div style={{ textAlign: 'center', width: '100%' }}>
            <h1 style={{ color: '#4f46e5', marginBottom: 10 }}>Welcome 👋</h1>
            <p style={{ color: '#6b7280', marginBottom: 30 }}>Enter your name to join the chat</p>
            
            <input 
              className="msg-input" 
              style={{ width: '70%', textAlign: 'center', fontSize: '1.1rem', marginBottom: 20 }}
              placeholder="What's your name?"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoFocus
            />
            <br />
            <button 
              className="send-btn" 
              style={{ width: '70%', borderRadius: '24px', height: '50px', fontSize: '1rem', fontWeight: 600 }}
              onClick={handleLogin}
            >
              Start Chatting
            </button>
          </div>
        </div>
      </div>
    );
  }

  // LOGGED IN -> SHOW CHAT (Pass handleLogout prop)
  return <ChatRoom username={username} onLogout={handleLogout} />;
}

// --- CHAT ROOM COMPONENT ---
function ChatRoom({ username, onLogout }) {
  // STATE
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [totalUsers, setTotalUsers] = useState(1);
  
  // NEW STATE FOR LOGOUT MENU
  const [showLogout, setShowLogout] = useState(false);

  // MUTE STATE
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("chat_muted") === "true");

  // REFS
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const pendingRef = useRef(new Map());
  
  const clientDisplayName = useRef(username); 
  const isMutedRef = useRef(isMuted);

  // Sync Ref
  useEffect(() => {
    isMutedRef.current = isMuted;
    localStorage.setItem("chat_muted", isMuted);
  }, [isMuted]);

  // Init audio
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.preload = "auto";
  }, []);

  const toggleMute = () => setIsMuted((prev) => !prev);

  // --- SOCKET CONNECTION ---
  useEffect(() => {
    const SOCKET_URL = "https://socketio-testing-chatbox.onrender.com";

    const socket = ioClient(SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 999,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("socket connected", socket.id);
      setConnected(true);
      socket.emit("identify", { displayName: clientDisplayName.current });
    });

    socket.on("disconnect", (reason) => {
      console.log("socket disconnected", reason);
      setConnected(false);
      setTypingUsers({});
    });

    socket.on("history", (history = []) => {
      setMessageList((prev) => {
        const merged = new Map();
        history.forEach((m) => { if (m && m.id) merged.set(m.id, m); });
        prev.forEach((m) => { if (m && m.id && !merged.has(m.id)) merged.set(m.id, m); });
        pendingRef.current.forEach((m, id) => { if (!merged.has(id)) merged.set(id, m); });
        return Array.from(merged.values());
      });
    });

    socket.on("receive_message", (data) => {
      if (!data || !data.id) return;
      setMessageList((prev) => {
        const map = new Map();
        prev.forEach((m) => map.set(m.id, m));
        map.set(data.id, data);
        return Array.from(map.values());
      });

      if (pendingRef.current.has(data.id)) {
        pendingRef.current.delete(data.id);
      }

      if (data.socketId && data.socketId !== socketRef.current?.id) {
        if (!isMutedRef.current) {
          try { audioRef.current?.play().catch(() => {}); } catch (e) {}
        }
      }
    });

    socket.on("user_typing", (payload) => {
      if (!payload || !payload.socketId) return;
      if (payload.socketId === socketRef.current?.id) return;
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

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Auto scroll
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

  // Send message
  const sendMessage = () => {
    if (!message.trim() || !socketRef.current) return;
    const id = generateId();
    const msgData = {
      id,
      message: message.trim(),
      time: new Date().toISOString(),
      socketId: socketRef.current.id,
      displayName: clientDisplayName.current,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${clientDisplayName.current}&backgroundColor=b6e3f4,c0aede,d1d4f9`
    };

    pendingRef.current.set(id, msgData);
    setMessageList((prev) => {
      const map = new Map();
      prev.forEach((m) => map.set(m.id, m));
      map.set(id, msgData);
      return Array.from(map.values());
    });

    socketRef.current.emit("send_message", msgData, (ack) => {
      if (ack && ack.id) pendingRef.current.delete(ack.id);
    });

    socketRef.current.emit("typing", { typing: false });
    setMessage("");
  };

  const otherUsersCount = Math.max(0, totalUsers - 1);
  const typingArr = Object.values(typingUsers);

  return (
    <div className="app-container">
      <StyleSheet />
      <div className="chat-card">
        {/* HEADER */}
        <div className="chat-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111" }}>Public Lounge</h2>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
              <span className={`status-dot ${connected ? "online" : "offline"}`} />
              {connected ? `${otherUsersCount} others online` : "Connecting..."}
            </div>
          </div>

          <div className="header-controls">
             {/* Logged in as... */}
             <div style={{fontSize: 12, marginRight: 10, fontWeight: 600, color: '#4f46e5'}}>
                {username}
             </div>
            <button className="icon-btn" onClick={toggleMute}>
              {isMuted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              )}
            </button>
            
            {/* --- AVATAR & LOGOUT MENU AREA --- */}
            <div style={{ position: 'relative' }}>
                <img
                  src={`https://api.dicebear.com/7.x/notionists/svg?seed=${username}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                  alt="My Avatar"
                  className="avatar"
                  // CLICK ON AVATAR TOGGLES MENU
                  onClick={() => setShowLogout(!showLogout)}
                  style={{ cursor: "pointer", border: showLogout ? "2px solid #ef4444" : "2px solid white" }}
                />
                
                {/* LOGOUT BUTTON DROPDOWN */}
                {showLogout && (
                  <button 
                    onClick={onLogout}
                    style={{
                      position: 'absolute',
                      top: '45px',
                      right: '0',
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      color: '#ef4444',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      zIndex: 100
                    }}
                  >
                    Logout ↪
                  </button>
                )}
            </div>
            {/* ------------------------------- */}

          </div>
        </div>

        {/* MESSAGES */}
        <div className="messages-area" onClick={() => setShowLogout(false)}> 
        {/* Clicking chat area closes menu */}
          {messageList.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 40, color: "#9ca3af", fontSize: 14 }}>
              Welcome, {username}! Say Hi! 👋
            </div>
          )}

          {messageList.map((msg) => {
            const isMine = msg.socketId === socketRef.current?.id;
            const seed = msg.displayName || msg.socketId;
            const avatarUrl = msg.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
            const isPending = pendingRef.current.has(msg.id);
            return (
              <div key={msg.id} className={`message-group ${isMine ? "mine" : "other"}`}>
                {!isMine && <img src={avatarUrl} className="avatar" alt="User avatar" />}
                <div className={`bubble ${isPending ? "pending" : ""}`}>
                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9em' }}>
                    {isMine ? "You" : (msg.displayName || "Anon")}
                  </div>
                  <div>{msg.message}</div>
                  <div className="meta">{formatTime(msg.time)}</div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* FOOTER */}
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
            placeholder="Type a message..."
            rows={1}
          />
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={!message.trim()}
            style={{ opacity: message.trim() ? 1 : 0.6 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// --- STYLES (Extracted to keep code clean) ---
const StyleSheet = () => (
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
    
    body { margin: 0; font-family: Inter, system-ui, -apple-system, sans-serif; background: var(--bg); }
    
    .app-container { 
      display:flex; justify-content:center; align-items:center; 
      min-height:100dvh; padding:20px; box-sizing:border-box; 
    }
    
    .chat-card { 
      width:100%; max-width:700px; height:85vh; 
      background:var(--chat-bg); border-radius:24px; 
      box-shadow:0 20px 50px -10px rgba(0,0,0,0.1); 
      display:flex; flex-direction:column; overflow:hidden; position:relative;
    }

    /* LOGIN CARD SPECIAL STYLE */
    .login-card {
      height: auto;
      min-height: 400px;
      justify-content: center;
      align-items: center;
      padding: 40px;
    }

    .chat-header { 
      padding:16px 20px; background: rgba(255,255,255,0.95); 
      backdrop-filter: blur(10px); border-bottom:1px solid #f0f0f0; 
      display:flex; justify-content:space-between; align-items:center; z-index:10;
    }

    .header-controls { display: flex; align-items: center; gap: 12px; }
    
    .icon-btn {
      background: transparent; border: none; cursor: pointer;
      color: #6b7280; padding: 6px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.2s, color 0.2s;
    }
    .icon-btn:hover { background: #f3f4f6; color: #111; }
    
    .status-dot { height:8px; width:8px; border-radius:50%; display:inline-block; margin-right:6px;}
    .online { background:#22c55e; box-shadow:0 0 8px #22c55e; }
    .offline { background:#ef4444; }

    .messages-area { 
      flex:1; padding:20px; overflow-y:auto; 
      background-image: radial-gradient(#e5e7eb 1px, transparent 1px); 
      background-size:20px 20px; 
      display:flex; flex-direction:column; gap:12px; 
    }

    .message-group { display:flex; gap:10px; width: 100%; animation:slideIn .2s ease; }
    .message-group.mine { flex-direction: row-reverse; }

    .avatar { 
      width:36px; height:36px; border-radius:50%; background:#ddd; 
      border:2px solid white; flex-shrink:0; object-fit: cover;
    }

    .bubble { 
      padding: 10px 16px; border-radius: 18px; position: relative; 
      font-size: 15px; line-height: 1.5; box-shadow: 0 1px 2px rgba(0,0,0,0.06);
      width: fit-content; max-width: 75%; 
      overflow-wrap: anywhere; word-break: normal; white-space: pre-wrap; 
    }

    .mine .bubble { background: var(--mine-bubble); color: white; border-bottom-right-radius: 4px; }
    .other .bubble { background: var(--other-bubble); color: var(--text-main); border-bottom-left-radius: 4px; }

    .meta { font-size: 10px; margin-top: 4px; opacity: 0.7; text-align: right; display: block; margin-bottom: -2px; }
    .bubble.pending { opacity:0.8; }

    .typing-indicator { font-size:12px; color:var(--text-sub); padding:0 24px 8px; height:20px; min-height:20px; }
    
    .input-area { 
      padding:12px 16px; background:white; border-top:1px solid #f3f4f6; 
      display:flex; gap:10px; align-items:flex-end; 
    }
    
    .msg-input { 
      flex:1; background:#f9fafb; border:1px solid #e5e7eb; 
      padding:12px 16px; border-radius:24px; outline:none; font-size:15px; 
      transition:all .2s; min-height:24px; max-height:120px; 
      overflow-y:auto; resize:none; line-height: 1.4; font-family: inherit;
    }
    .msg-input:focus { border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-light); background:white; }
    
    .send-btn { 
      background:var(--primary); color:white; border:none; width:46px; height:46px; 
      border-radius:50%; cursor:pointer; display:flex; align-items:center; 
      justify-content:center; flex-shrink: 0; margin-bottom: 2px;
    }
    .send-btn:active { transform:scale(.95); }

    @keyframes slideIn { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }

    @media (max-width: 900px) { .chat-card { max-width: 640px; height: 90vh; } }
    @media (max-width: 600px) {
      .app-container { padding: 0; height: 100dvh; }
      .chat-card { height: 100%; max-width: 100%; border-radius: 0; box-shadow: none; }
      .avatar { width: 32px; height: 32px; }
      .bubble { max-width: 85%; font-size: 15px; }
      .chat-header h2 { font-size: 16px; }
      .login-card { justify-content: center; }
    }
  `}</style>
);