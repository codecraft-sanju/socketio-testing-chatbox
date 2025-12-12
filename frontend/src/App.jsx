import React, { useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";
import { Toaster, toast } from 'react-hot-toast';

// --- CONFIG & UTILS ---
const FIX_TOKEN = "jhdhhdhdhhsdsdhsdhshdh"; 
const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";
const REACTION_EMOJIS = ["💗", "😽", "😼", "😻", "😿", "😹"]; 

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(dateInput) {
  const date = new Date(dateInput);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- MAIN APP COMPONENT ---
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [inputName, setInputName] = useState("");
  const [shakeError, setShakeError] = useState(false); 
  const [mounting, setMounting] = useState(true);

  useEffect(() => {
    setMounting(false);
    const storedToken = localStorage.getItem("chat_app_token");
    const storedName = localStorage.getItem("chat_app_username");

    if (storedToken === FIX_TOKEN && storedName) {
      setUsername(storedName);
      setIsLoggedIn(true);
    }
  }, []);

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
      <div className="app-wrapper">
        <StyleSheet /> 
        
        {/* Advanced Background */}
        <div className="aurora-bg"></div>
        <div className="grid-overlay"></div>

        <div className={`glass-card login-card ${shakeError ? "shake-anim" : ""} ${mounting ? "fade-in-up" : ""}`}>
          <div className="avatar-preview-container">
            <div className="avatar-glow"></div>
            <img src={avatarUrl} alt="Avatar Preview" className="avatar-preview" />
            <span className="online-badge pulse"></span>
          </div>

          <div className="login-content">
            <h1 className="welcome-title">Welcome Back</h1>
            <p className="welcome-subtitle">Enter the lounge.</p>
            
            <div className="input-group">
              <input 
                className="modern-input" 
                placeholder="Choose a nickname..."
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                autoFocus
                maxLength={15}
              />
              <span className="input-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </span>
              <div className="input-border-anim"></div>
            </div>

            <button className="modern-btn shimmer-btn" onClick={handleLogin}>
              <span>Join Room</span>
              <svg style={{marginLeft:8}} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <ChatRoom username={username} onLogout={handleLogout} />;
}

// --- CHAT ROOM COMPONENT ---
function ChatRoom({ username, onLogout }) {
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [totalUsers, setTotalUsers] = useState(1);
  const [showMenu, setShowMenu] = useState(false); 
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("chat_muted") === "true");
  
  const [activeReactionId, setActiveReactionId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const inputRef = useRef(null);
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

  // --- SOCKET ---
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
      setConnected(false);
      setTypingUsers({});
    });

    socket.on("user_joined", (data) => {
       const name = data.displayName || "A new user";
       toast.success(`${name} hopped in`, {
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageList, typingUsers, replyingTo]);

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

  const handleReaction = (msgId, emoji) => {
      if(!socketRef.current) return;
      socketRef.current.emit("message_reaction", { messageId: msgId, emoji });
      setActiveReactionId(null);
  };

  const initReply = (msg) => {
      setReplyingTo(msg);
      inputRef.current?.focus();
  };

  const otherUsersCount = Math.max(0, totalUsers - 1);
  const typingArr = Object.values(typingUsers);

  return (
    <div className="app-wrapper">
      <StyleSheet />
      <Toaster />
      <div className="aurora-bg"></div>
      <div className="grid-overlay"></div>

      <div className="chat-card chat-enter-anim">
        {/* HEADER */}
        <div className="chat-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--text-main)", letterSpacing: '-0.02em' }}>Public Lounge</h2>
            <div style={{ fontSize: 12, color: "var(--text-sub)", marginTop: 4, display: 'flex', alignItems: 'center' }}>
              <span className={`status-dot ${connected ? "online" : "offline"}`} />
              {connected ? <span className="fade-in-text">{otherUsersCount} others online</span> : "Connecting..."}
            </div>
          </div>

          <div className="header-controls">
             <div className="current-user-badge">
                <svg className="badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                {username}
             </div>

            <button className="icon-btn hover-scale" onClick={toggleMute}>
              {isMuted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              )}
            </button>
            
            <div style={{ position: 'relative' }}>
                <img
                  src={`https://api.dicebear.com/7.x/notionists/svg?seed=${username}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                  alt="My Avatar"
                  className="avatar hover-scale"
                  onClick={() => setShowMenu(!showMenu)}
                  style={{ cursor: "pointer", border: showMenu ? "2px solid #ef4444" : "2px solid var(--chat-bg)" }}
                />
                
                {showMenu && (
                  <div className="dropdown-menu">
                      <div className="menu-item danger" onClick={onLogout}>
                          <span>Logout</span>
                          <span style={{fontSize: 16}}>↪</span>
                      </div>
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* MESSAGES */}
        <div className="messages-area" onClick={() => { setShowMenu(false); setActiveReactionId(null); }}> 
          {messageList.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">👋</div>
              <div>Welcome, {username}!</div>
              <div style={{fontSize:12, opacity:0.6}}>Be the first to say hello.</div>
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
                {!isMine && <img src={avatarUrl} className="avatar small-avatar" alt="User avatar" />}
                
                <div className={`bubble ${isPending ? "pending" : ""}`}>
                  
                  {msg.replyTo && (
                      <div className="reply-quote-in-bubble">
                          <span className="reply-to-name">{msg.replyTo.displayName}</span>
                          <div className="reply-to-text">{msg.replyTo.message}</div>
                      </div>
                  )}

                  <div className="bubble-name">
                    {isMine ? "You" : (msg.displayName || "Anon")}
                  </div>
                  <div className="bubble-text">{msg.message}</div>
                  <div className="meta">{formatTime(msg.time)}</div>

                  <div className="action-btns-group">
                      <button className="action-btn" onClick={(e) => { e.stopPropagation(); initReply(msg); }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                      </button>
                      <button className="action-btn" onClick={(e) => { e.stopPropagation(); setActiveReactionId(showPicker ? null : msg.id); }}>
                        ☺
                      </button>
                  </div>

                  {showPicker && (
                      <div className="reaction-picker-popup" onClick={(e) => e.stopPropagation()}>
                          {REACTION_EMOJIS.map((emoji, idx) => (
                              <div key={emoji} className="emoji-item" style={{animationDelay: `${idx * 0.05}s`}} onClick={() => handleReaction(msg.id, emoji)}>
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
               <div className="wave-dots">
                 <span></span><span></span><span></span>
               </div>
               <span style={{ marginLeft: 8, opacity: 0.7 }}>
                 <span style={{ fontWeight: 600 }}>{typingArr.length > 2 ? "Several people" : typingArr.join(", ")}</span> typing...
               </span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* FOOTER */}
        <div className="chat-footer">
            {replyingTo && (
                <div className="reply-preview-bar">
                    <div className="reply-info">
                        <span className="reply-title">Reply to {replyingTo.displayName}</span>
                        <span className="reply-subtitle">{replyingTo.message}</span>
                    </div>
                    <button className="close-reply-btn" onClick={() => setReplyingTo(null)}>
                        ✕
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
                    className={`send-btn ${message.trim() ? "active" : ""}`}
                    onClick={sendMessage}
                    disabled={!message.trim()}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}

// --- ADVANCED CSS & ANIMATIONS ---
const StyleSheet = () => (
  <style>{`
    :root {
      /* Palette - Deep Space / Aurora */
      --bg-dark: #0f172a;
      --chat-bg: rgba(30, 41, 59, 0.75); /* More transparent for glass */
      --primary: #818cf8; /* Soft Indigo */
      --primary-glow: rgba(99, 102, 241, 0.5);
      --accent: #c084fc; /* Violet accent */
      
      --text-main: #f1f5f9;
      --text-sub: #94a3b8;
      
      --mine-bubble: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      --other-bubble: rgba(51, 65, 85, 0.9);
      
      --border: rgba(148, 163, 184, 0.15);
      --input-bg: rgba(15, 23, 42, 0.6);
      
      --shadow-lg: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      --glass-blur: blur(16px);
    }
    
    body { 
      margin: 0; 
      font-family: 'Inter', system-ui, sans-serif; 
      background: var(--bg-dark); 
      color: var(--text-main); 
      overflow: hidden; /* Prevent body scroll, handle in app */
    }
    
    .app-wrapper { 
      display:flex; justify-content:center; align-items:center; 
      height: 100dvh; width: 100vw; position: relative;
    }

    /* --- ANIMATED AURORA BACKGROUND --- */
    .aurora-bg {
        position: absolute; inset: 0; z-index: -2;
        background: linear-gradient(-45deg, #0f172a, #1e1b4b, #312e81, #0f172a);
        background-size: 400% 400%;
        animation: auroraMove 20s ease infinite;
    }
    .grid-overlay {
        position: absolute; inset: 0; z-index: -1;
        background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
        background-size: 40px 40px;
        mask-image: radial-gradient(circle at center, black 40%, transparent 100%);
    }

    @keyframes auroraMove {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }

    /* --- LOGIN CARD ADVANCED --- */
    .login-card {
        width: 100%; max-width: 400px; padding: 40px;
        text-align: center; z-index: 10;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(20px);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.05), 0 20px 40px rgba(0,0,0,0.4);
        border-radius: 32px;
        transform: translateY(0);
        transition: transform 0.3s ease;
    }
    .login-card:hover { transform: translateY(-5px); }
    
    .avatar-preview-container { 
        position: relative; width: 100px; height: 100px; margin: 0 auto 24px; 
    }
    .avatar-preview { 
        width: 100%; height: 100%; border-radius: 50%; 
        border: 4px solid var(--bg-dark); 
        box-shadow: 0 0 20px var(--primary-glow);
        position: relative; z-index: 2;
        transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .login-card:hover .avatar-preview { transform: scale(1.05) rotate(3deg); }

    .avatar-glow {
        position: absolute; inset: -10px; border-radius: 50%;
        background: conic-gradient(from 0deg, transparent, var(--primary), var(--accent), transparent);
        animation: spin 4s linear infinite;
        opacity: 0.6; z-index: 1; filter: blur(10px);
    }

    .online-badge { 
        position: absolute; bottom: 5px; right: 5px; width: 22px; height: 22px; 
        background: #10b981; border: 4px solid var(--chat-bg); border-radius: 50%; z-index: 3;
    }
    .pulse { animation: pulseGreen 2s infinite; }
    
    @keyframes pulseGreen {
        0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
        100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    @keyframes spin { 100% { transform: rotate(360deg); } }

    .welcome-title { font-size: 32px; font-weight: 800; margin: 0; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .welcome-subtitle { color: var(--text-sub); margin: 8px 0 32px; font-weight: 500; }

    /* --- INPUTS & BUTTONS --- */
    .input-group { position: relative; margin-bottom: 24px; }
    .modern-input { 
        width: 100%; box-sizing: border-box; padding: 18px 18px 18px 50px; 
        border-radius: 20px; border: 1px solid var(--border); 
        background: var(--input-bg); color: #fff; font-size: 16px; 
        transition: all 0.3s ease; outline: none;
    }
    .modern-input:focus { background: rgba(15, 23, 42, 0.9); border-color: var(--primary); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15); }
    .input-icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); color: var(--text-sub); transition: 0.3s; }
    .modern-input:focus + .input-icon { color: var(--primary); transform: translateY(-50%) scale(1.1); }

    .shimmer-btn {
        width: 100%; padding: 18px; border: none; border-radius: 20px;
        background: var(--primary); color: white; font-size: 16px; font-weight: 700;
        cursor: pointer; position: relative; overflow: hidden;
        display: flex; justify-content: center; align-items: center;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
    }
    .shimmer-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(99, 102, 241, 0.5); }
    .shimmer-btn:active { transform: scale(0.98); }
    .shimmer-btn::after {
        content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
        transform: skewX(-20deg); animation: shimmer 3s infinite;
    }
    @keyframes shimmer { 0% { left: -100%; } 20% { left: 200%; } 100% { left: 200%; } }

    /* --- CHAT MAIN CONTAINER --- */
    .chat-card { 
      width:100%; max-width:700px; height: 90vh;
      background: var(--chat-bg); 
      backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
      border-radius: 28px; 
      box-shadow: var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.05);
      display:flex; flex-direction:column; overflow:hidden;
      border: 1px solid var(--border);
    }
    .chat-enter-anim { animation: fadeScaleUp 0.5s cubic-bezier(0.16, 1, 0.3, 1); }

    @keyframes fadeScaleUp {
        from { opacity: 0; transform: scale(0.95) translateY(20px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .chat-header {
        padding: 18px 24px; background: rgba(15, 23, 42, 0.4); 
        border-bottom: 1px solid var(--border);
        display: flex; justify-content: space-between; align-items: center;
        backdrop-filter: blur(10px);
    }
    .header-controls { display: flex; align-items: center; gap: 14px; }
    
    .status-dot { height: 8px; width: 8px; border-radius: 50%; display: inline-block; margin-right: 8px; box-shadow: 0 0 10px currentColor; }
    .online { background: #10b981; color: #10b981; }
    .offline { background: #ef4444; color: #ef4444; }

    .current-user-badge {
        background: rgba(99, 102, 241, 0.1); color: var(--primary);
        padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700;
        display: flex; align-items: center; gap: 6px;
        border: 1px solid rgba(99, 102, 241, 0.2);
    }

    /* --- MESSAGES AREA --- */
    .messages-area { 
        flex:1; padding: 24px; overflow-y: auto; scroll-behavior: smooth;
        display:flex; flex-direction:column; gap: 16px;
    }
    .messages-area::-webkit-scrollbar { width: 6px; }
    .messages-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
    
    .message-group { display:flex; gap: 12px; width: 100%; align-items: flex-end; }
    .message-group.mine { flex-direction: row-reverse; }
    
    .avatar.small-avatar { width: 32px; height: 32px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
    
    .bubble { 
        padding: 12px 18px; border-radius: 22px; position: relative; 
        font-size: 15px; line-height: 1.5; max-width: 70%;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        transform-origin: bottom left;
        animation: springPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        transition: transform 0.2s;
    }
    .mine .bubble { 
        background: var(--mine-bubble); color: white; 
        border-bottom-right-radius: 4px; 
        transform-origin: bottom right;
        box-shadow: 0 4px 15px rgba(79, 70, 229, 0.3);
    }
    .other .bubble { 
        background: var(--other-bubble); color: var(--text-main); 
        border-bottom-left-radius: 4px; 
        border: 1px solid var(--border);
    }
    
    .bubble:hover { transform: translateY(-2px); }

    @keyframes springPop {
        0% { opacity: 0; transform: scale(0.5); }
        100% { opacity: 1; transform: scale(1); }
    }

    .bubble-name { font-size: 11px; font-weight: 700; margin-bottom: 4px; opacity: 0.6; }
    .mine .bubble-name { display: none; }
    .meta { font-size: 10px; margin-top: 4px; opacity: 0.5; text-align: right; }

    /* --- ACTION BUTTONS --- */
    .action-btns-group {
        position: absolute; top: -14px; right: 0; 
        display: flex; gap: 4px; opacity: 0; 
        transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        transform: translateY(10px);
    }
    .bubble:hover .action-btns-group { opacity: 1; transform: translateY(0); }
    .mine .action-btns-group { right: auto; left: 0; flex-direction: row-reverse; }

    .action-btn {
        width: 28px; height: 28px; border-radius: 50%; 
        border: 1px solid var(--border); background: #1e293b; color: var(--text-sub);
        display: flex; align-items: center; justify-content: center; cursor: pointer;
        transition: 0.2s;
    }
    .action-btn:hover { background: var(--primary); color: white; border-color: var(--primary); transform: scale(1.15); }

    /* --- REACTION PICKER --- */
    .reaction-picker-popup {
        position: absolute; top: -60px; left: 0; 
        background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px);
        border: 1px solid var(--border); padding: 8px; border-radius: 50px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        display: flex; gap: 4px; z-index: 50; 
        animation: scaleIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .mine .reaction-picker-popup { left: auto; right: 0; }
    
    .emoji-item { 
        width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        font-size: 18px; cursor: pointer; transition: transform 0.2s; 
        animation: popItem 0.3s backwards;
    }
    .emoji-item:hover { transform: scale(1.4); background: rgba(255,255,255,0.1); }
    
    @keyframes popItem { 0% { transform: scale(0); } 100% { transform: scale(1); } }

    /* --- FOOTER --- */
    .chat-footer { 
        background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(10px);
        border-top: 1px solid var(--border); 
        padding-bottom: 10px;
    }

    .reply-preview-bar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 24px; background: rgba(99, 102, 241, 0.1);
        border-left: 3px solid var(--primary);
        animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .close-reply-btn { background: none; border: none; color: var(--text-sub); cursor: pointer; padding: 4px; border-radius:50%; transition: 0.2s;}
    .close-reply-btn:hover { background: rgba(255,0,0,0.1); color: #ef4444; }

    .input-area { padding: 16px 24px; display: flex; gap: 12px; align-items: flex-end; }
    
    .msg-input { 
        flex: 1; background: rgba(30, 41, 59, 0.5); border: 1px solid var(--border); 
        padding: 14px 20px; border-radius: 24px; color: white; font-size: 15px; 
        resize: none; font-family: inherit; transition: 0.3s;
    }
    .msg-input:focus { background: rgba(30, 41, 59, 0.9); border-color: var(--primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }

    .send-btn { 
        width: 48px; height: 48px; border-radius: 50%; border: none;
        background: #334155; color: #64748b; 
        display: flex; align-items: center; justify-content: center; 
        cursor: not-allowed; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .send-btn.active { background: var(--primary); color: white; cursor: pointer; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4); }
    .send-btn.active:hover { transform: scale(1.1) rotate(-10deg); }
    .send-btn.active:active { transform: scale(0.95); }

    /* --- TYPING WAVE --- */
    .typing-indicator-inline { display: flex; align-items: center; margin-left: 24px; margin-bottom: 12px; font-size: 12px; color: var(--text-sub); }
    .wave-dots { display: flex; gap: 4px; }
    .wave-dots span {
        width: 5px; height: 5px; background: var(--accent); border-radius: 50%;
        animation: wave 1.2s infinite ease-in-out;
    }
    .wave-dots span:nth-child(1) { animation-delay: -0.24s; }
    .wave-dots span:nth-child(2) { animation-delay: -0.12s; }
    @keyframes wave { 0%, 40%, 100% { transform: translateY(0); } 20% { transform: translateY(-6px); } }

    /* --- UTILS --- */
    .icon-btn { 
        background: rgba(255,255,255,0.05); border: 1px solid transparent; 
        padding: 8px; border-radius: 12px; color: var(--text-sub); cursor: pointer; transition: 0.2s; 
    }
    .icon-btn:hover { background: rgba(255,255,255,0.1); color: white; border-color: rgba(255,255,255,0.1); }
    .hover-scale { transition: transform 0.2s; }
    .hover-scale:hover { transform: scale(1.05); }

    .dropdown-menu {
        position: absolute; top: 50px; right: 0; width: 160px;
        background: rgba(15, 23, 42, 0.9); border: 1px solid var(--border);
        border-radius: 16px; padding: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        backdrop-filter: blur(12px); animation: scaleIn 0.2s ease-out; transform-origin: top right; z-index: 100;
    }
    .menu-item { padding: 10px 12px; border-radius: 10px; cursor: pointer; display: flex; justify-content: space-between; color: white; font-size: 14px; transition: 0.2s; }
    .menu-item:hover { background: rgba(255,255,255,0.1); }
    .menu-item.danger { color: #ff6b6b; }
    .menu-item.danger:hover { background: rgba(255, 107, 107, 0.1); }

    .reply-quote-in-bubble { margin-bottom: 6px; padding: 6px 10px; background: rgba(0,0,0,0.2); border-left: 2px solid rgba(255,255,255,0.5); border-radius: 6px; font-size: 12px; cursor: pointer; }

    .reactions-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .reaction-pill { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 2px 8px; font-size: 12px; cursor: pointer; color: #cbd5e1; display: flex; gap: 4px; transition: 0.2s; }
    .reaction-pill:hover { background: rgba(255,255,255,0.1); transform: scale(1.05); }
    .reaction-pill.active-reaction { background: rgba(99, 102, 241, 0.3); border-color: var(--primary); color: #e0e7ff; }

    .empty-state { text-align: center; margin-top: 60px; color: var(--text-sub); animation: fadeScaleUp 0.8s; }
    .empty-icon { font-size: 40px; margin-bottom: 10px; display: inline-block; animation: wave 2s infinite; transform-origin: 70% 70%; }

    @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
    .shake-anim { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
    
    @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    @media (max-width: 600px) {
        .chat-card { height: 100%; border-radius: 0; border: none; width: 100%; max-width: 100%; }
        .bubble { max-width: 85%; }
        .login-card { margin: 20px; width: auto; }
        .reaction-picker-popup { grid-template-columns: repeat(3, 1fr); top: -100px; }
    }
  `}</style>
);