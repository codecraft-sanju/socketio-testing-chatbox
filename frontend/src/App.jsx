import React, { useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";
import { Toaster, toast } from 'react-hot-toast';

// --- CONFIG & UTILS ---
const FIX_TOKEN = "jhdhhdhdhhsdsdhsdhshdh"; 
const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
// Available Emojis
const REACTION_EMOJIS = ["💗", "😽", "😼", "😻", "😿", "😹"]; 

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(dateInput) {
  const date = new Date(dateInput);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- MAIN APP COMPONENT (Auth & Theme Handler) ---
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [inputName, setInputName] = useState("");
  const [shakeError, setShakeError] = useState(false); 
  
  // 👇 THEME STATE
  const [theme, setTheme] = useState(() => localStorage.getItem("chat_app_theme") || "light");

  // 1. Check LocalStorage on Load
  useEffect(() => {
    const storedToken = localStorage.getItem("chat_app_token");
    const storedName = localStorage.getItem("chat_app_username");

    if (storedToken === FIX_TOKEN && storedName) {
      setUsername(storedName);
      setIsLoggedIn(true);
    }
  }, []);

  // Apply Theme to HTML Body
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem("chat_app_theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // 2. Handle Signup
  const handleLogin = () => {
    if (!inputName.trim()) {
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500); 
      return;
    }
    
    localStorage.setItem("chat_app_token", FIX_TOKEN);
    localStorage.setItem("chat_app_username", inputName.trim());
    
    setUsername(inputName.trim());
    setIsLoggedIn(true);
  };

  // 3. Handle Logout
  const handleLogout = () => {
    localStorage.removeItem("chat_app_token");
    localStorage.removeItem("chat_app_username");
    setIsLoggedIn(false);
    setUsername("");
    setInputName("");
  };

  // --- RENDER LOGIN ---
  if (!isLoggedIn) {
    const previewSeed = inputName.trim() || "guest";
    const avatarUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${previewSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

    return (
      <div className="login-wrapper">
        <StyleSheet /> 
        
        {/* Animated Background Shapes */}
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>

        <div className={`glass-card ${shakeError ? "shake-anim" : ""}`}>
          <div className="avatar-preview-container">
            <img src={avatarUrl} alt="Avatar Preview" className="avatar-preview" />
            <span className="online-badge"></span>
          </div>

          <div className="login-content">
            <h1 className="welcome-title">Hello There! 👋</h1>
            <p className="welcome-subtitle">Join the public lounge to start chatting.</p>
            
            <div className="input-group">
              <input 
                className="modern-input" 
                placeholder="Enter your nickname..."
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                autoFocus
                maxLength={15}
              />
              <span className="input-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </span>
            </div>

            <button className="modern-btn" onClick={handleLogin}>
              Join Chat Room 
              <svg style={{marginLeft:8}} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
            
            {/* Theme Toggle on Login Screen too */}
            <div style={{marginTop: 20}}>
                <button onClick={toggleTheme} className="theme-toggle-login">
                    {theme === 'light' ? '🌙 Dark Mode' : '☀️ Light Mode'}
                </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <ChatRoom username={username} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />;
}

// --- CHAT ROOM COMPONENT ---
function ChatRoom({ username, onLogout, theme, toggleTheme }) {
  // STATE
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [totalUsers, setTotalUsers] = useState(1);
  const [showMenu, setShowMenu] = useState(false); // Changed name to showMenu for clarity
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("chat_muted") === "true");
  
  // Track active reaction picker (Message ID)
  const [activeReactionId, setActiveReactionId] = useState(null);
  
  // REPLY STATE
  const [replyingTo, setReplyingTo] = useState(null);

  // REFS
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const inputRef = useRef(null);
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

    socket.on("user_joined", (data) => {
       const name = data.displayName || "A new user";
       toast.success(`${name} joined`, {
         duration: 3000,
         position: 'top-center',
         style: { background: 'var(--chat-bg)', color: 'var(--primary)', border: '1px solid var(--border)', fontWeight: '600', borderRadius: '20px' },
         iconTheme: { primary: 'var(--primary)', secondary: '#fff' },
       });
    });

    socket.on("user_left", (data) => {
       const name = data.displayName || "Someone";
       toast(`${name} left`, {
         duration: 3000,
         position: 'top-center',
         icon: '👋',
         style: { background: 'var(--chat-bg)', color: '#ef4444', border: '1px solid var(--border)', fontWeight: '600', borderRadius: '20px' },
       });
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

    socket.on("reaction_updated", (data) => {
        setMessageList((prev) => 
            prev.map((msg) => 
                msg.id === data.id ? { ...msg, reactions: data.reactions } : msg
            )
        );
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
  }, [messageList, typingUsers, replyingTo]);

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
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${clientDisplayName.current}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
      reactions: {},
      replyTo: replyingTo ? {
          id: replyingTo.id,
          displayName: replyingTo.displayName,
          message: replyingTo.message
      } : null
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
    setReplyingTo(null);
  };

  // --- HANDLE REACTION ---
  const handleReaction = (msgId, emoji) => {
      if(!socketRef.current) return;
      socketRef.current.emit("message_reaction", { messageId: msgId, emoji });
      setActiveReactionId(null);
  };

  // --- INIT REPLY ---
  const initReply = (msg) => {
      setReplyingTo(msg);
      inputRef.current?.focus();
  };

  const otherUsersCount = Math.max(0, totalUsers - 1);
  const typingArr = Object.values(typingUsers);

  return (
    <div className="app-container">
      <StyleSheet />
      <Toaster />

      <div className="chat-card">
        {/* HEADER */}
        <div className="chat-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-main)" }}>Public Lounge</h2>
            <div style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 2 }}>
              <span className={`status-dot ${connected ? "online" : "offline"}`} />
              {connected ? `${otherUsersCount} others online` : "Connecting..."}
            </div>
          </div>

          <div className="header-controls">
             {/* --- STYLISH NAME BADGE --- */}
             <div className="current-user-badge">
                <svg className="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                {username}
             </div>

            <button className="icon-btn" onClick={toggleMute}>
              {isMuted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              )}
            </button>
            
            {/* 👇 USER DROPDOWN MENU CONTAINER */}
            <div style={{ position: 'relative' }}>
                <img
                  src={`https://api.dicebear.com/7.x/notionists/svg?seed=${username}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                  alt="My Avatar"
                  className="avatar"
                  onClick={() => setShowMenu(!showMenu)}
                  style={{ cursor: "pointer", border: showMenu ? "2px solid #ef4444" : "2px solid var(--chat-bg)", boxShadow: '0 0 0 2px var(--border)' }}
                />
                
                {/* 👇 DROPDOWN MENU */}
                {showMenu && (
                  <div className="dropdown-menu">
                      <div className="menu-item" onClick={() => { toggleTheme(); }}>
                          <span style={{fontSize: 16}}>
                            {theme === 'light' ? '🌙' : '☀️'}
                          </span>
                          <span>{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
                      </div>
                      
                      <div className="menu-divider"></div>

                      <div className="menu-item danger" onClick={onLogout}>
                          <span style={{fontSize: 16}}>↪</span>
                          <span>Logout</span>
                      </div>
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* MESSAGES */}
        <div className="messages-area" onClick={() => { setShowMenu(false); setActiveReactionId(null); }}> 
          {messageList.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 40, color: "var(--text-sub)", fontSize: 14 }}>
              Welcome, {username}! Say Hi! 👋
            </div>
          )}

          {messageList.map((msg) => {
            const isMine = msg.socketId === socketRef.current?.id || msg.displayName === username;
            const seed = msg.displayName || msg.socketId;
            const avatarUrl = msg.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
            const isPending = pendingRef.current.has(msg.id);
            const showPicker = activeReactionId === msg.id;

            return (
              <div key={msg.id} className={`message-group ${isMine ? "mine" : "other"}`}>
                {!isMine && <img src={avatarUrl} className="avatar" alt="User avatar" />}
                
                <div className={`bubble ${isPending ? "pending" : ""}`}>
                  
                  {msg.replyTo && (
                      <div className="reply-quote-in-bubble">
                          <span className="reply-to-name">{msg.replyTo.displayName}</span>
                          <div className="reply-to-text">{msg.replyTo.message}</div>
                      </div>
                  )}

                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9em' }}>
                    {isMine ? "You" : (msg.displayName || "Anon")}
                  </div>
                  <div>{msg.message}</div>
                  <div className="meta">{formatTime(msg.time)}</div>

                  <div className="action-btns-group">
                      <button className="action-btn" onClick={(e) => { e.stopPropagation(); initReply(msg); }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                      </button>
                      <button className="action-btn" onClick={(e) => { e.stopPropagation(); setActiveReactionId(showPicker ? null : msg.id); }}>
                        ☺
                      </button>
                  </div>

                  {showPicker && (
                      <div className="reaction-picker-popup" onClick={(e) => e.stopPropagation()}>
                          {REACTION_EMOJIS.map(emoji => (
                              <div key={emoji} className="emoji-item" onClick={() => handleReaction(msg.id, emoji)}>
                                  {emoji}
                              </div>
                          ))}
                      </div>
                  )}

                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="reactions-row">
                          {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                             if(!userIds || userIds.length === 0) return null;
                             const iReacted = userIds.includes(socketRef.current?.id);
                             return (
                                  <div key={emoji} className={`reaction-pill ${iReacted ? "active-reaction" : ""}`} onClick={(e) => { e.stopPropagation(); handleReaction(msg.id, emoji); }}>
                                     {emoji} <span className="count">{userIds.length}</span>
                                  </div>
                             )
                          })}
                      </div>
                  )}
                </div>
              </div>
            );
          })}

          {typingArr.length > 0 && (
            <div className="typing-indicator-inline">
               <div className="typing-dots"><span></span><span></span><span></span></div>
               <span style={{ marginLeft: 8 }}><span style={{ fontWeight: 600 }}>{typingArr.length > 2 ? "Several people" : typingArr.join(", ")}</span> is typing...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* FOOTER */}
        <div style={{background: 'var(--chat-bg)', borderTop: '1px solid var(--border)', transition: 'background 0.3s'}}>
            {replyingTo && (
                <div className="reply-preview-bar">
                    <div className="reply-info">
                        <span className="reply-title">Replying to {replyingTo.displayName}</span>
                        <span className="reply-subtitle">{replyingTo.message}</span>
                    </div>
                    <button className="close-reply-btn" onClick={() => setReplyingTo(null)}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            )}

            <div className="input-area">
                <textarea
                    ref={inputRef}
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
                    style={{ opacity: message.trim() ? 1 : 1 }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}

// --- STYLES (UPDATED FOR DARK MODE) ---
const StyleSheet = () => (
  <style>{`
    /* --- CSS VARIABLES FOR THEMES --- */
    :root {
      /* LIGHT MODE (Default) */
      --bg: #f3f4f6;
      --chat-bg: #ffffff;
      --primary: #4f46e5;
      --primary-dark: #4338ca;
      --primary-light: #e0e7ff;
      --text-main: #1f2937;
      --text-sub: #6b7280;
      --mine-bubble: #4f46e5;
      --other-bubble: #f3f4f6;
      --border: #e5e7eb;
      --input-bg: #f9fafb;
      --shadow-color: rgba(0,0,0,0.1);
      --dropdown-bg: rgba(255, 255, 255, 0.95);
      --dropdown-hover: #f3f4f6;
    }

    /* DARK MODE OVERRIDES */
    [data-theme='dark'] {
      --bg: #0f172a;           /* Deep Slate Background */
      --chat-bg: #1e293b;      /* Slate-800 Chat Card */
      --primary: #6366f1;      /* Slightly brighter Indigo */
      --primary-dark: #4f46e5; 
      --primary-light: #312e81; /* Darker indigo for backgrounds */
      --text-main: #f8fafc;    /* Off-white text */
      --text-sub: #94a3b8;     /* Slate-400 subtext */
      --mine-bubble: #4f46e5;  /* Keep mine bubble distinct */
      --other-bubble: #334155; /* Slate-700 for others */
      --border: #334155;       /* Darker borders */
      --input-bg: #0f172a;     /* Dark input background */
      --shadow-color: rgba(0,0,0,0.4);
      --dropdown-bg: rgba(30, 41, 59, 0.95);
      --dropdown-hover: #334155;
    }
    
    body { margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; background: var(--bg); transition: background 0.3s ease; color: var(--text-main); }
    
    .app-container { 
      display:flex; justify-content:center; align-items:center; 
      min-height:100dvh; padding:20px; box-sizing:border-box; 
    }
    
    .chat-card { 
      width:100%; max-width:700px; height:85vh; 
      background:var(--chat-bg); border-radius:24px; 
      box-shadow:0 20px 50px -10px var(--shadow-color); 
      display:flex; flex-direction:column; overflow:hidden; position:relative;
      border: 1px solid var(--border);
      transition: background 0.3s, border-color 0.3s, box-shadow 0.3s;
    }

    /* --- LOGIN STYLES --- */
    .login-wrapper { width: 100vw; height: 100dvh; display: flex; justify-content: center; align-items: center; background: linear-gradient(135deg, var(--bg) 0%, var(--chat-bg) 100%); overflow: hidden; position: relative; transition: background 0.3s; }
    .shape { position: absolute; border-radius: 50%; opacity: 0.6; filter: blur(60px); z-index: 0; }
    .shape-1 { top: -100px; left: -100px; width: 400px; height: 400px; background: #a78bfa; animation: float 8s infinite alternate; }
    .shape-2 { bottom: -100px; right: -100px; width: 350px; height: 350px; background: #60a5fa; animation: float 10s infinite alternate-reverse; }
    @keyframes float { from { transform: translate(0,0); } to { transform: translate(40px, 40px); } }
    .glass-card { background: var(--dropdown-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid var(--border); padding: 40px; border-radius: 32px; box-shadow: 0 8px 32px 0 var(--shadow-color); width: 100%; max-width: 420px; text-align: center; z-index: 1; transition: transform 0.3s, background 0.3s; }
    .avatar-preview-container { position: relative; width: 100px; height: 100px; margin: 0 auto 20px; }
    .avatar-preview { width: 100%; height: 100%; border-radius: 50%; background: var(--primary-light); border: 4px solid var(--chat-bg); box-shadow: 0 10px 20px -5px var(--shadow-color); transition: all 0.3s ease; }
    .online-badge { position: absolute; bottom: 5px; right: 5px; width: 20px; height: 20px; background: #22c55e; border: 3px solid var(--chat-bg); border-radius: 50%; box-shadow: 0 2px 4px var(--shadow-color); }
    .welcome-title { margin: 0; font-size: 28px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; }
    .welcome-subtitle { margin: 8px 0 32px; color: var(--text-sub); font-size: 15px; }
    .input-group { position: relative; margin-bottom: 24px; }
    .modern-input { width: 100%; box-sizing: border-box; padding: 16px 16px 16px 48px; border-radius: 16px; border: 2px solid var(--border); background: var(--input-bg); font-size: 16px; font-weight: 500; color: var(--text-main); box-shadow: 0 4px 12px rgba(0,0,0,0.03); transition: all 0.3s ease; outline: none; }
    .modern-input:focus { border-color: var(--primary); box-shadow: 0 4px 20px rgba(79, 70, 229, 0.15); transform: translateY(-2px); }
    .input-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--text-sub); pointer-events: none; transition: color 0.3s; }
    .modern-input:focus + .input-icon { color: var(--primary); }
    .modern-btn { width: 100%; padding: 16px; border: none; border-radius: 16px; background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%); color: white; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.4); transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); display: flex; justify-content: center; align-items: center; }
    .modern-btn:hover { transform: translateY(-3px) scale(1.02); box-shadow: 0 15px 30px -5px rgba(79, 70, 229, 0.5); }
    .modern-btn:active { transform: translateY(-1px) scale(0.98); }
    .theme-toggle-login { background: transparent; border: 1px solid var(--border); color: var(--text-sub); padding: 8px 16px; border-radius: 20px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.2s; }
    .theme-toggle-login:hover { background: var(--input-bg); color: var(--text-main); border-color: var(--text-sub); }
    .shake-anim { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
    @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
    @media (max-width: 600px) { .glass-card { margin: 20px; padding: 30px 20px; } .welcome-title { font-size: 24px; } }

    /* --- CHAT STYLES --- */
    .chat-header { padding:16px 20px; background: var(--dropdown-bg); backdrop-filter: blur(10px); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; z-index:10; transition: background 0.3s, border-color 0.3s; }
    .header-controls { display: flex; align-items: center; gap: 12px; }
    .icon-btn { background: transparent; border: none; cursor: pointer; color: var(--text-sub); padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background 0.2s, color 0.2s; }
    .icon-btn:hover { background: var(--bg); color: var(--text-main); }
    .status-dot { height:8px; width:8px; border-radius:50%; display:inline-block; margin-right:6px;}
    .online { background:#22c55e; box-shadow:0 0 8px #22c55e; }
    .offline { background:#ef4444; }

    /* --- MESSAGES AREA --- */
    .messages-area { flex:1; padding:20px; overflow-y:auto; background-image: radial-gradient(var(--border) 1px, transparent 1px); background-size:20px 20px; display:flex; flex-direction:column; gap:12px; transition: background 0.3s; }
    .message-group { display:flex; gap:10px; width: 100%; animation:slideIn .2s ease; }
    .message-group.mine { flex-direction: row-reverse; }
    .avatar { width:36px; height:36px; border-radius:50%; background:var(--border); border:2px solid var(--chat-bg); flex-shrink:0; object-fit: cover; }
    
    .bubble { padding: 10px 16px; border-radius: 18px; position: relative; font-size: 15px; line-height: 1.5; box-shadow: 0 1px 2px var(--shadow-color); width: fit-content; max-width: 75%; overflow-wrap: anywhere; word-break: normal; white-space: pre-wrap; transition: background 0.3s, color 0.3s; }
    .mine .bubble { background: var(--mine-bubble); color: white; border-bottom-right-radius: 4px; }
    .other .bubble { background: var(--other-bubble); color: var(--text-main); border-bottom-left-radius: 4px; }
    .meta { font-size: 10px; margin-top: 4px; opacity: 0.7; text-align: right; display: block; margin-bottom: -2px; }
    .bubble.pending { opacity:0.8; }

    /* --- ACTION BUTTONS (REPLY & REACT) --- */
    .action-btns-group {
        position: absolute; top: -12px; right: -5px; 
        display: flex; gap: 4px;
        opacity: 0; transition: opacity 0.2s;
        z-index: 5;
    }
    .bubble:hover .action-btns-group { opacity: 1; }
    @media (max-width: 768px) { .action-btns-group { opacity: 1; top: -14px; } }
    .mine .action-btns-group { right: auto; left: -5px; flex-direction: row-reverse; }

    .action-btn {
        width: 26px; height: 26px;
        border-radius: 50%; border: 1px solid var(--border); background: var(--chat-bg);
        cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 5px var(--shadow-color); color: var(--text-sub);
        transition: transform 0.2s, background 0.3s, border-color 0.3s;
    }
    .action-btn:hover { transform: scale(1.1); color: var(--primary); border-color: var(--primary); }

    /* --- REPLY QUOTE STYLES --- */
    .reply-quote-in-bubble {
        margin-bottom: 8px; padding: 8px 10px; border-radius: 8px;
        background: rgba(0,0,0,0.1); border-left: 4px solid rgba(0,0,0,0.2);
        font-size: 13px; display: flex; flex-direction: column; gap: 2px;
        cursor: pointer; user-select: none;
    }
    .mine .reply-quote-in-bubble { background: rgba(0,0,0,0.15); border-left-color: rgba(255,255,255,0.6); }
    .reply-to-name { font-weight: 700; opacity: 0.9; font-size: 11px; }
    .reply-to-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.8; max-width: 200px; }

    /* --- REPLY PREVIEW BAR --- */
    .reply-preview-bar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 16px; background: var(--bg);
        border-bottom: 1px solid var(--border);
        border-left: 4px solid var(--primary);
        animation: slideUp 0.2s ease-out;
        transition: background 0.3s, border-color 0.3s;
    }
    .reply-info { display: flex; flex-direction: column; font-size: 13px; overflow: hidden; }
    .reply-title { font-weight: 700; color: var(--primary); margin-bottom: 2px; }
    .reply-subtitle { color: var(--text-sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80vw; }
    .close-reply-btn { background: none; border: none; cursor: pointer; color: var(--text-sub); padding: 4px; display: flex; align-items: center; }
    .close-reply-btn:hover { color: #ef4444; background: rgba(239, 68, 68, 0.1); border-radius: 50%; }
    
    @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    /* --- REACTION PICKER --- */
    .reaction-picker-popup {
        position: absolute; top: -55px; 
        left: 0; right: auto;
        background: var(--dropdown-bg); backdrop-filter: blur(8px);
        border: 1px solid var(--border); padding: 6px 10px;
        border-radius: 30px;
        box-shadow: 0 8px 20px var(--shadow-color);
        display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; 
        z-index: 50; animation: popIn 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .mine .reaction-picker-popup { left: auto; right: 0; }
    
    .emoji-item { cursor: pointer; font-size: 20px; transition: transform 0.2s; padding: 4px; border-radius: 50%; display: flex; justify-content: center; align-items: center; }
    .emoji-item:hover { transform: scale(1.3); background: var(--bg); }
    .emoji-item:active { transform: scale(0.9); }

    .reactions-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .reaction-pill { background: var(--chat-bg); border: 1px solid var(--border); border-radius: 12px; padding: 2px 8px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 1px 2px var(--shadow-color); transition: all 0.2s; color: var(--text-main); }
    .reaction-pill:hover { background: var(--bg); border-color: var(--text-sub); }
    .reaction-pill.active-reaction { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
    .mine .reaction-pill { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.3); color: white; }
    .mine .reaction-pill.active-reaction { background: white; color: var(--primary); border-color: white; font-weight: 600; }
    .count { font-size: 0.9em; opacity: 0.8; font-weight: 600; }

    @keyframes popIn { from { opacity: 0; transform: scale(0.5) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

    .typing-indicator-inline { display: flex; align-items: center; gap: 8px; margin-left: 10px; margin-bottom: 5px; font-size: 12px; color: var(--text-sub); animation: slideIn .2s ease; }
    .typing-dots { display: flex; gap: 3px; align-items: center; }
    .typing-dots span { width: 4px; height: 4px; background: var(--text-sub); border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; }
    .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
    .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
    
    .input-area { padding:12px 16px; background: var(--chat-bg); display:flex; gap:10px; align-items:flex-end; }
    .msg-input { flex:1; background: var(--input-bg); border:1px solid var(--border); padding:12px 16px; border-radius:24px; outline:none; font-size:15px; transition:all .2s; min-height:24px; max-height:120px; overflow-y:auto; resize:none; line-height: 1.4; font-family: inherit; color: var(--text-main); }
    .msg-input:focus { border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-light); background: var(--chat-bg); }
    
    .send-btn { background:var(--primary); color:white; border:none; width:46px; height:46px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink: 0; margin-bottom: 2px; }
    .send-btn:active { transform:scale(.95); }

    /* --- NEW DROPDOWN MENU STYLES --- */
    .dropdown-menu {
        position: absolute;
        top: 50px; right: 0;
        width: 180px;
        background: var(--dropdown-bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        box-shadow: 0 10px 25px var(--shadow-color);
        backdrop-filter: blur(12px);
        padding: 6px;
        display: flex; flex-direction: column; gap: 2px;
        z-index: 100;
        animation: scaleIn 0.2s ease-out;
        transform-origin: top right;
    }
    
    .menu-item {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        color: var(--text-main);
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s;
    }
    .menu-item:hover { background: var(--dropdown-hover); }
    
    .menu-divider { height: 1px; background: var(--border); margin: 4px 0; }
    
    .menu-item.danger { color: #ef4444; }
    .menu-item.danger:hover { background: rgba(239, 68, 68, 0.1); }

    @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    @keyframes slideIn { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
    @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

    @media (max-width: 600px) {
      .app-container { padding: 0; height: 100dvh; }
      .chat-card { height: 100%; max-width: 100%; border-radius: 0; box-shadow: none; border: none; }
      .avatar { width: 32px; height: 32px; }
      .bubble { max-width: 85%; font-size: 15px; }
      .chat-header h2 { font-size: 16px; }
      .action-btn { width: 30px; height: 30px; font-size: 16px; }
      .reaction-picker-popup { grid-template-columns: repeat(3, 1fr); width: 140px; top: -90px; }
      .reply-subtitle { max-width: 250px; }
    }

    /* --- BADGE (Updated to use Vars) --- */
    .current-user-badge {
      background: linear-gradient(135deg, var(--primary-light) 0%, var(--bg) 100%);
      color: var(--primary);
      padding: 6px 12px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 700;
      display: flex; align-items: center; gap: 6px; margin-right: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 2px 6px var(--shadow-color);
      transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
      cursor: default; user-select: none;
    }
    .current-user-badge:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); background: var(--chat-bg); border-color: var(--primary); }
    .badge-icon { width: 14px; height: 14px; opacity: 0.8; }
    @media (max-width: 600px) { .current-user-badge { padding: 4px 10px; font-size: 12px; margin-right: 8px; } }
  `}</style>
);