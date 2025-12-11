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
  const [isAnimating, setIsAnimating] = useState(false); // For exit animation

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
    if (!inputName.trim()) {
      // Shake effect logic could go here
      return;
    }
    
    setIsAnimating(true); // Start exit animation
    
    // Slight delay to let animation play
    setTimeout(() => {
      localStorage.setItem("chat_app_token", FIX_TOKEN);
      localStorage.setItem("chat_app_username", inputName.trim());
      setUsername(inputName.trim());
      setIsLoggedIn(true);
      setIsAnimating(false);
    }, 600);
  };

  // --- RENDER ---
  if (!isLoggedIn) {
    // UPDATED ADVANCED LOGIN SCREEN
    return (
      <div className="login-container">
        <StyleSheet /> 
        
        {/* Animated Background Elements */}
        <div className="bg-shape shape-1"></div>
        <div className="bg-shape shape-2"></div>
        <div className="bg-shape shape-3"></div>

        <div className={`login-glass-card ${isAnimating ? 'zoom-out' : 'fade-in-up'}`}>
          <div className="login-content">
            {/* Live Avatar Preview */}
            <div className="avatar-preview-wrapper">
              <div className="avatar-ring">
                <img 
                  src={`https://api.dicebear.com/7.x/notionists/svg?seed=${inputName || "guest"}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                  alt="Avatar Preview"
                  className="avatar-preview"
                />
              </div>
              <div className="status-badge">👋</div>
            </div>

            <div className="text-section">
              <h1 className="welcome-title">Hello there!</h1>
              <p className="welcome-subtitle">Join the <b>Public Lounge</b> to chat with others.</p>
            </div>
            
            <div className="input-group">
              <input 
                className="modern-input" 
                placeholder=" " // Important for CSS floating label
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                autoFocus
                maxLength={15}
              />
              <label className="floating-label">Enter your nickname</label>
              <div className="input-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
            </div>

            <button 
              className="modern-btn" 
              onClick={handleLogin}
              disabled={!inputName.trim()}
            >
              <span>Join Conversation</span>
              <svg className="btn-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
            
            <p className="footer-note">Secure • Anonymous • Fast</p>
          </div>
        </div>
      </div>
    );
  }

  // LOGGED IN -> SHOW CHAT
  return <ChatRoom username={username} />;
}

// --- CHAT ROOM COMPONENT (Logic Unchanged) ---
function ChatRoom({ username }) {
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [totalUsers, setTotalUsers] = useState(1);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("chat_muted") === "true");

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const pendingRef = useRef(new Map());
  const clientDisplayName = useRef(username); 
  const isMutedRef = useRef(isMuted);

  useEffect(() => {
    isMutedRef.current = isMuted;
    localStorage.setItem("chat_muted", isMuted);
  }, [isMuted]);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.preload = "auto";
  }, []);

  const toggleMute = () => setIsMuted((prev) => !prev);

  useEffect(() => {
    const SOCKET_URL = "https://socketio-testing-chatbox.onrender.com";
    const socket = ioClient(SOCKET_URL, { transports: ["websocket"], reconnectionAttempts: 999, reconnectionDelay: 1000 });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("identify", { displayName: clientDisplayName.current });
    });

    socket.on("disconnect", () => { setConnected(false); setTypingUsers({}); });

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
      if (pendingRef.current.has(data.id)) pendingRef.current.delete(data.id);
      if (data.socketId && data.socketId !== socketRef.current?.id && !isMutedRef.current) {
        try { audioRef.current?.play().catch(() => {}); } catch (e) {}
      }
    });

    socket.on("user_typing", (payload) => {
      if (!payload || !payload.socketId || payload.socketId === socketRef.current?.id) return;
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

    return () => { socket.disconnect(); socketRef.current = null; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageList, typingUsers]);

  const typingTimeoutRef = useRef(null);
  const handleTyping = () => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit("typing", { typing: true, displayName: clientDisplayName.current });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("typing", { typing: false });
    }, 1200);
  };

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
      <div className="chat-card fade-in-up">
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
            <img
              src={`https://api.dicebear.com/7.x/notionists/svg?seed=${username}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
              alt="My Avatar"
              className="avatar"
            />
          </div>
        </div>

        {/* MESSAGES */}
        <div className="messages-area">
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
              <span style={{ fontWeight: 600 }}>{typingArr.length > 2 ? "Several people" : typingArr.join(", ")}</span> is typing...
            </span>
          )}
        </div>
        <div className="input-area">
          <textarea
            className="msg-input"
            value={message}
            onChange={(e) => { setMessage(e.target.value); handleTyping(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
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

// --- UPDATED STYLESHEET ---
const StyleSheet = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
      --primary-light: #e0e7ff;
      --bg-gradient: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
      --bg: #f3f4f6;
      --chat-bg: #ffffff;
      --mine-bubble: #6366f1;
      --other-bubble: #f3f4f6;
      --text-main: #1e293b;
      --text-sub: #64748b;
      --glass-border: rgba(255, 255, 255, 0.6);
      --glass-bg: rgba(255, 255, 255, 0.7);
    }
    
    body { margin: 0; font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg); color: var(--text-main); }
    
    /* --- LOGIN PAGE STYLES (NEW) --- */
    .login-container {
      position: relative;
      height: 100vh;
      width: 100vw;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #eef2ff;
      overflow: hidden;
    }

    /* Animated Shapes Background */
    .bg-shape {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      z-index: 1;
      animation: float 20s infinite alternate;
      opacity: 0.6;
    }
    .shape-1 { width: 400px; height: 400px; background: #c084fc; top: -50px; left: -100px; animation-delay: 0s; }
    .shape-2 { width: 300px; height: 300px; background: #6366f1; bottom: 50px; right: -50px; animation-delay: -5s; }
    .shape-3 { width: 200px; height: 200px; background: #38bdf8; top: 40%; left: 40%; animation-delay: -10s; }

    @keyframes float {
      0% { transform: translate(0, 0) rotate(0deg); }
      100% { transform: translate(30px, 50px) rotate(20deg); }
    }

    /* Glass Card */
    .login-glass-card {
      position: relative;
      z-index: 10;
      width: 100%;
      max-width: 420px;
      background: rgba(255, 255, 255, 0.65);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      border-radius: 32px;
      padding: 40px;
      box-shadow: 
        0 25px 50px -12px rgba(0, 0, 0, 0.1),
        0 0 0 1px rgba(255, 255, 255, 0.5) inset;
      transition: all 0.4s ease;
    }

    .login-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    /* Avatar Preview */
    .avatar-preview-wrapper {
      position: relative;
      margin-bottom: 24px;
    }
    .avatar-ring {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: linear-gradient(135deg, #fff, #e0e7ff);
      padding: 4px;
      box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.3);
      animation: pulse-ring 3s infinite;
    }
    .avatar-preview {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: #fff;
      object-fit: cover;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .status-badge {
      position: absolute;
      bottom: 5px;
      right: 5px;
      background: #fff;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      animation: wave 2s infinite;
    }

    .welcome-title {
      font-size: 28px;
      font-weight: 800;
      color: var(--text-main);
      margin: 0 0 8px 0;
      letter-spacing: -0.5px;
    }
    .welcome-subtitle {
      color: var(--text-sub);
      font-size: 15px;
      margin: 0 0 32px 0;
      line-height: 1.5;
    }

    /* Modern Input */
    .input-group {
      position: relative;
      width: 100%;
      margin-bottom: 24px;
    }
    .modern-input {
      width: 100%;
      padding: 16px 16px 16px 48px; /* Space for icon */
      border-radius: 20px;
      border: 2px solid transparent;
      background: #fff;
      font-size: 16px;
      color: var(--text-main);
      font-weight: 600;
      outline: none;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
      transition: all 0.3s ease;
      box-sizing: border-box;
      font-family: inherit;
    }
    .modern-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
      transform: translateY(-2px);
    }
    .input-icon {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: #94a3b8;
      transition: color 0.3s;
      pointer-events: none;
    }
    .modern-input:focus ~ .input-icon { color: var(--primary); }

    /* Floating Label Logic */
    .floating-label {
      position: absolute;
      left: 48px;
      top: 50%;
      transform: translateY(-50%);
      color: #94a3b8;
      pointer-events: none;
      transition: 0.2s ease all;
      font-weight: 500;
    }
    .modern-input:focus ~ .floating-label,
    .modern-input:not(:placeholder-shown) ~ .floating-label {
      top: -10px;
      left: 10px;
      font-size: 12px;
      background: var(--primary);
      color: white;
      padding: 2px 10px;
      border-radius: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    /* Modern Button */
    .modern-btn {
      width: 100%;
      padding: 16px;
      border: none;
      border-radius: 20px;
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.4);
    }
    .modern-btn:hover:not(:disabled) {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 15px 30px -5px rgba(79, 70, 229, 0.5);
    }
    .modern-btn:active:not(:disabled) { transform: translateY(-1px) scale(0.98); }
    .modern-btn:disabled { opacity: 0.6; cursor: not-allowed; filter: grayscale(1); }
    
    .btn-arrow { transition: transform 0.3s; }
    .modern-btn:hover .btn-arrow { transform: translateX(5px); }

    .footer-note {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 24px;
      font-weight: 500;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    /* Animations */
    @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); } 70% { box-shadow: 0 0 0 15px rgba(99, 102, 241, 0); } 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); } }
    @keyframes wave { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-10deg); } 75% { transform: rotate(10deg); } }
    
    .fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .zoom-out { animation: zoomOut 0.5s ease forwards; pointer-events: none; }
    
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes zoomOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }

    /* --- CHAT STYLES (Kept & Refined) --- */
    .app-container { display:flex; justify-content:center; align-items:center; min-height:100dvh; padding:20px; box-sizing:border-box; background: #eef2ff; }
    .chat-card { width:100%; max-width:700px; height:85vh; background:var(--chat-bg); border-radius:24px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.15); display:flex; flex-direction:column; overflow:hidden; position:relative; border: 1px solid rgba(255,255,255,0.8); }
    .chat-header { padding:16px 20px; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; z-index:10; }
    .header-controls { display: flex; align-items: center; gap: 12px; }
    .icon-btn { background: transparent; border: none; cursor: pointer; color: #64748b; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .icon-btn:hover { background: #f1f5f9; color: var(--primary); }
    .status-dot { height:8px; width:8px; border-radius:50%; display:inline-block; margin-right:6px;}
    .online { background:#22c55e; box-shadow:0 0 10px #22c55e; }
    .offline { background:#ef4444; }
    .messages-area { flex:1; padding:20px; overflow-y:auto; background-color: #ffffff; background-image: radial-gradient(#e2e8f0 1px, transparent 1px); background-size: 24px 24px; display:flex; flex-direction:column; gap:12px; }
    .message-group { display:flex; gap:12px; width: 100%; animation:slideIn .2s ease; }
    .message-group.mine { flex-direction: row-reverse; }
    .avatar { width:36px; height:36px; border-radius:50%; background:#e2e8f0; border:2px solid #fff; flex-shrink:0; object-fit: cover; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .bubble { padding: 12px 18px; border-radius: 20px; position: relative; font-size: 15px; line-height: 1.5; box-shadow: 0 2px 4px rgba(0,0,0,0.03); width: fit-content; max-width: 75%; overflow-wrap: anywhere; word-break: normal; white-space: pre-wrap; }
    .mine .bubble { background: var(--mine-bubble); color: white; border-bottom-right-radius: 4px; box-shadow: 0 4px 10px -2px rgba(99, 102, 241, 0.3); }
    .other .bubble { background: var(--other-bubble); color: var(--text-main); border-bottom-left-radius: 4px; }
    .meta { font-size: 10px; margin-top: 4px; opacity: 0.7; text-align: right; display: block; margin-bottom: -2px; }
    .bubble.pending { opacity:0.8; }
    .typing-indicator { font-size:12px; color:var(--text-sub); padding:0 24px 8px; height:20px; min-height:20px; font-weight: 500; }
    .input-area { padding:16px; background:white; border-top:1px solid #f1f5f9; display:flex; gap:12px; align-items:flex-end; }
    .msg-input { flex:1; background:#f8fafc; border:1px solid #e2e8f0; padding:14px 18px; border-radius:24px; outline:none; font-size:15px; transition:all .2s; min-height:24px; max-height:120px; overflow-y:auto; resize:none; line-height: 1.4; font-family: inherit; color: var(--text-main); }
    .msg-input:focus { border-color:var(--primary); box-shadow:0 0 0 4px var(--primary-light); background:white; }
    .send-btn { background:var(--primary); color:white; border:none; width:50px; height:50px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink: 0; transition: all 0.2s; box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3); }
    .send-btn:hover:not(:disabled) { transform: scale(1.05); background: var(--primary-dark); }
    .send-btn:active { transform:scale(.95); }
    @keyframes slideIn { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
    
    @media (max-width: 600px) {
      .app-container { padding: 0; }
      .chat-card { height: 100%; border-radius: 0; border: none; }
      .login-glass-card { width: 90%; padding: 30px 20px; }
      .bg-shape { filter: blur(60px); opacity: 0.4; }
      .bubble { font-size: 14px; max-width: 85%; }
    }
  `}</style>
);