// frontend/src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";

// CONFIG
// Use environment variable or fallback to localhost
const SERVER_URL = "https://socketio-testing-chatbox.onrender.com";
const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

// --- HELPERS ---
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function App() {
  // STATE
  const [inputMsg, setInputMsg] = useState("");
  const [messages, setMessages] = useState([]); // List of { id, message, ... }
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({}); // Map<socketId, name>
  const [onlineCount, setOnlineCount] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // REFS
  const socketRef = useRef(null);
  const scrollRef = useRef(null);
  const audioRef = useRef(new Audio(NOTIFICATION_SOUND));
  const myName = useRef(`User-${Math.floor(Math.random() * 1000)}`);

  // --- INITIALIZATION ---
  useEffect(() => {
    // Initialize Socket
    socketRef.current = ioClient(SERVER_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 10,
    });

    const socket = socketRef.current;

    // 1. Connection Events
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("identify", { displayName: myName.current });
    });
    
    socket.on("disconnect", () => setConnected(false));
    
    socket.on("users_count", (data) => setOnlineCount(data.total));

    // 2. Message Handling
    socket.on("history", (historyMsg) => {
      setMessages(historyMsg); 
    });

    socket.on("receive_message", (msg) => {
      setMessages((prev) => {
        // Prevent duplicates using a Map
        const map = new Map(prev.map(m => [m.id, m]));
        map.set(msg.id, msg);
        return Array.from(map.values());
      });

      // Play sound if it's not me
      if (msg.socketId !== socket.id && soundEnabled) {
        audioRef.current.play().catch(() => {});
      }
    });

    // 3. Typing Indicators
    socket.on("user_typing", ({ socketId, typing, displayName }) => {
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (typing) next[socketId] = displayName;
        else delete next[socketId];
        return next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [soundEnabled]);

  // Auto-Scroll Logic
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingUsers]);

  // --- ACTIONS ---
  const handleTyping = (e) => {
    setInputMsg(e.target.value);
    
    // Emit typing event (debounced)
    if (socketRef.current?.connected) {
      socketRef.current.emit("typing", true);
      
      clearTimeout(window.typingTimer);
      window.typingTimer = setTimeout(() => {
        socketRef.current.emit("typing", false);
      }, 1000);
    }
  };

  const sendMessage = (e) => {
    e?.preventDefault();
    if (!inputMsg.trim() || !socketRef.current) return;

    const tempId = generateId();
    const payload = {
      id: tempId,
      message: inputMsg,
      time: new Date().toISOString(),
      socketId: socketRef.current.id,
      displayName: myName.current,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${socketRef.current.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`
    };

    // Optimistic Update (Show immediately)
    setMessages(prev => [...prev, payload]);
    
    // Send to Server
    socketRef.current.emit("send_message", payload);
    socketRef.current.emit("typing", false);

    setInputMsg("");
  };

  const typingList = Object.values(typingUsers);

  return (
    <div className="app-container">
      <style>{STYLES}</style>
      
      <div className="chat-card">
        {/* HEADER */}
        <div className="chat-header">
          <div className="header-info">
            <h2>Startup Discussion Group</h2>
            <div className="status-line">
              <span className={`dot ${connected ? "online" : "offline"}`} />
              <span>{connected ? `${onlineCount} Online` : "Reconnecting..."}</span>
            </div>
          </div>
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="icon-btn"
            title={soundEnabled ? "Mute" : "Unmute"}
          >
            {soundEnabled ? "🔔" : "🔕"}
          </button>
        </div>

        {/* MESSAGES AREA */}
        <div className="messages-area">
          {messages.length === 0 && (
             <div className="empty-state">No messages yet. Be the first! 👋</div>
          )}
          
          {messages.map((msg) => {
            const isMine = msg.socketId === socketRef.current?.id;
            return (
              <div key={msg.id} className={`message-row ${isMine ? "mine" : "other"}`}>
                {!isMine && <img src={msg.avatar} className="avatar" alt="av" />}
                
                <div className="bubble-group">
                  {!isMine && <span className="sender-name">{msg.displayName}</span>}
                  <div className="bubble">
                    {msg.message}
                    <span className="timestamp">{formatTime(msg.time)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          
          {/* Typing Indicator Bubble */}
          {typingList.length > 0 && (
             <div className="message-row other typing-row">
               <div className="bubble typing-bubble">
                 <div className="typing-dots">
                   <span>•</span><span>•</span><span>•</span>
                 </div>
               </div>
               <span className="typing-text">
                 {typingList.length > 2 ? "Several people are typing..." : `${typingList.join(", ")} is typing...`}
               </span>
             </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* INPUT AREA */}
        <form className="input-area" onSubmit={sendMessage}>
          <input
            value={inputMsg}
            onChange={handleTyping}
            placeholder="Type a message..."
            className="msg-input"
            maxLength={500}
          />
          <button type="submit" className="send-btn" disabled={!inputMsg.trim()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

// --- CSS STYLES ---
const STYLES = `
  :root {
    --primary: #6366f1;
    --bg-app: #eef2f6;
    --bg-card: #ffffff;
    --text-main: #1e293b;
    --text-sub: #64748b;
    --bubble-mine: #6366f1;
    --bubble-other: #f1f5f9;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', system-ui, sans-serif; background: var(--bg-app); }
  
  .app-container {
    display: flex; justify-content: center; align-items: center;
    height: 100vh; padding: 20px;
  }
  
  .chat-card {
    width: 100%; max-width: 480px; height: 90vh;
    background: var(--bg-card);
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
    display: flex; flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .chat-header {
    padding: 16px 20px;
    border-bottom: 1px solid #f1f5f9;
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(255,255,255,0.8); backdrop-filter: blur(8px);
    z-index: 10;
  }
  .header-info h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-main); }
  .status-line { display: flex; align-items: center; font-size: 13px; color: var(--text-sub); margin-top: 4px; gap: 6px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .online { background: #10b981; box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2); }
  .offline { background: #ef4444; }
  .icon-btn { background: none; border: none; cursor: pointer; font-size: 18px; padding: 8px; border-radius: 50%; transition: background 0.2s; }
  .icon-btn:hover { background: #f1f5f9; }

  /* Messages */
  .messages-area {
    flex: 1; padding: 20px;
    overflow-y: auto;
    display: flex; flex-direction: column; gap: 16px;
    scroll-behavior: smooth;
  }
  .empty-state { text-align: center; margin-top: 50%; color: var(--text-sub); font-size: 14px; }
  
  .message-row { display: flex; gap: 12px; max-width: 85%; animation: fadeIn 0.3s ease; }
  .message-row.mine { align-self: flex-end; flex-direction: row-reverse; }
  
  .avatar { width: 36px; height: 36px; border-radius: 50%; background: #eee; flex-shrink: 0; }
  .bubble-group { display: flex; flex-direction: column; gap: 4px; }
  
  .sender-name { font-size: 11px; color: var(--text-sub); margin-left: 12px; }
  .mine .sender-name { display: none; } /* hide own name */

  .bubble {
    padding: 10px 16px;
    border-radius: 20px;
    position: relative;
    font-size: 15px;
    line-height: 1.5;
    word-wrap: break-word;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .mine .bubble { background: var(--bubble-mine); color: white; border-bottom-right-radius: 4px; }
  .other .bubble { background: var(--bubble-other); color: var(--text-main); border-bottom-left-radius: 4px; }

  .timestamp {
    font-size: 9px; opacity: 0.7;
    margin-left: 8px; vertical-align: bottom;
    display: inline-block;
  }

  /* Typing Dots */
  .typing-row { align-items: center; gap: 12px; }
  .typing-bubble { padding: 12px 16px; background: #f1f5f9; border-radius: 20px; border-bottom-left-radius: 4px; width: fit-content; }
  .typing-dots span {
    animation: bounce 1.4s infinite ease-in-out both;
    display: inline-block; margin: 0 1px; font-size: 18px; line-height: 10px; color: #94a3b8;
  }
  .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
  .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
  .typing-text { font-size: 11px; color: var(--text-sub); margin-left: 10px; font-style: italic; }

  /* Input */
  .input-area {
    padding: 16px; background: white;
    border-top: 1px solid #f1f5f9;
    display: flex; gap: 10px; align-items: center;
  }
  .msg-input {
    flex: 1; padding: 12px 20px;
    border-radius: 99px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    font-size: 15px; outline: none;
    transition: all 0.2s;
  }
  .msg-input:focus { border-color: var(--primary); background: white; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
  
  .send-btn {
    width: 48px; height: 48px;
    border-radius: 50%; background: var(--primary);
    color: white; border: none; cursor: pointer;
    display: flex; justify-content: center; align-items: center;
    transition: transform 0.1s;
  }
  .send-btn:active { transform: scale(0.95); }
  .send-btn:disabled { background: #cbd5e1; cursor: not-allowed; }
  .send-btn svg { width: 20px; height: 20px; margin-left: -2px; margin-top: 2px; }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
  
  @media (max-width: 600px) {
    .app-container { padding: 0; }
    .chat-card { height: 100dvh; max-width: 100%; border-radius: 0; }
  }
`;