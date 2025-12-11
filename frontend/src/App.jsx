import React, { useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";

// --- UTILS ---
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(dateInput) {
  const date = new Date(dateInput);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Simple notification sound (Base64 URL)
const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

export default function App() {
  // STATE
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({}); 
  const [totalUsers, setTotalUsers] = useState(1);
  
  // REFS
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const audioRef = useRef(new Audio(NOTIFICATION_SOUND));

  // --- EFFECT: SOCKET CONNECTION ---
  useEffect(() => {
    // BACKEND URL
    const SOCKET_URL = "https://socketio-testing-chatbox.onrender.com"; 
    
    const socket = ioClient(SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    // Events
    socket.on("connect", () => setConnected(true));
    
    socket.on("disconnect", () => {
      setConnected(false);
      setTypingUsers({});
    });

    // Load History
    socket.on("history", (history) => {
      setMessageList(history);
    });

    // Receive New Message
    socket.on("receive_message", (data) => {
      setMessageList((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
      // Play Sound (only if page is visible interaction allowed usually)
      try { audioRef.current.play().catch(e => {}); } catch(e){}
    });

    socket.on("user_typing", (data) => {
      if (data.socketId === socketRef.current?.id) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (data.typing) {
          next[data.socketId] = { displayName: data.displayName };
        } else {
          delete next[data.socketId];
        }
        return next;
      });
    });

    socket.on("users_count", (data) => setTotalUsers(data.total));

    return () => socket.disconnect();
  }, []);

  // --- EFFECT: AUTO SCROLL ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageList, typingUsers]);

  // --- HANDLERS ---
  const typingTimeoutRef = useRef(null);

  const handleTyping = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("typing", { typing: true, displayName: "Someone" });
    
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current.emit("typing", { typing: false });
    }, 1500);
  };

  const sendMessage = () => {
    if (!message.trim() || !socketRef.current) return;

    const msgData = {
      id: generateId(),
      message: message.trim(),
      time: new Date().toISOString(),
      socketId: socketRef.current.id,
      // Generate a consistent avatar based on socket ID
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${socketRef.current.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`
    };

    // Optimistic Update
    setMessageList((prev) => [...prev, msgData]);
    socketRef.current.emit("send_message", msgData);
    socketRef.current.emit("typing", { typing: false });
    
    setMessage("");
  };

  // --- RENDER HELPERS ---
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

        body { margin: 0; font-family: 'Inter', sans-serif; background: var(--bg); }

        .app-container {
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100dvh; /* Dynamic Viewport Height for Mobile */
          padding: 20px;
          box-sizing: border-box;
        }

        .chat-card {
          width: 100%;
          max-width: 500px;
          height: 85vh;
          background: var(--chat-bg);
          border-radius: 24px;
          box-shadow: 0 20px 50px -10px rgba(0,0,0,0.1);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }

        /* HEADER */
        .chat-header {
          padding: 16px 20px;
          background: rgba(255,255,255,0.9);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid #f0f0f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 10;
        }
        .status-dot {
          height: 8px; width: 8px; border-radius: 50%;
          display: inline-block; margin-right: 6px;
        }
        .online { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
        .offline { background: #ef4444; }

        /* MESSAGES AREA */
        .messages-area {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          background-image: radial-gradient(#e5e7eb 1px, transparent 1px);
          background-size: 20px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .message-group {
          display: flex;
          gap: 10px;
          max-width: 80%;
          animation: slideIn 0.3s ease;
        }
        .message-group.mine {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .avatar {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: #ddd;
          border: 2px solid white;
          flex-shrink: 0;
        }

        .bubble {
          padding: 10px 14px;
          border-radius: 18px;
          position: relative;
          font-size: 14px;
          line-height: 1.5;
          box-shadow: 0 2px 5px rgba(0,0,0,0.05);
        }
        .mine .bubble {
          background: var(--mine-bubble);
          color: white;
          border-bottom-right-radius: 4px;
        }
        .other .bubble {
          background: var(--other-bubble);
          color: var(--text-main);
          border-bottom-left-radius: 4px;
        }

        .meta {
          font-size: 10px;
          margin-top: 4px;
          opacity: 0.7;
          text-align: right;
        }

        /* TYPING */
        .typing-indicator {
          font-size: 12px;
          color: var(--text-sub);
          padding: 0 24px 8px;
          height: 20px;
        }

        /* INPUT AREA */
        .input-area {
          padding: 16px;
          background: white;
          border-top: 1px solid #f3f4f6;
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .msg-input {
          flex: 1;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          padding: 12px 16px;
          border-radius: 99px;
          outline: none;
          font-size: 14px;
          transition: all 0.2s;
        }
        .msg-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-light);
          background: white;
        }
        .send-btn {
          background: var(--primary);
          color: white;
          border: none;
          width: 44px; height: 44px;
          border-radius: 50%;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.1s;
        }
        .send-btn:active { transform: scale(0.95); }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* MOBILE OVERRIDES */
        @media (max-width: 600px) {
          .app-container { padding: 0; }
          .chat-card { height: 100dvh; max-width: 100%; border-radius: 0; }
        }
      `}</style>

      <div className="chat-card">
        {/* HEADER */}
        <div className="chat-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111' }}>Public Lounge</h2>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
              <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
              {connected ? `${otherUsersCount} others online` : 'Connecting...'}
            </div>
          </div>
          {/* Your Avatar Preview */}
          {socketRef.current?.id && (
            <img 
              src={`https://api.dicebear.com/7.x/notionists/svg?seed=${socketRef.current.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`} 
              alt="My Avatar" 
              style={{ width: 36, height: 36, borderRadius: '50%' }}
            />
          )}
        </div>

        {/* MESSAGES */}
        <div className="messages-area">
          {messageList.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40, color: '#9ca3af', fontSize: 14 }}>
              No messages yet. Say Hi! 👋
            </div>
          )}
          
          {messageList.map((msg, index) => {
            const isMine = msg.socketId === socketRef.current?.id;
            // Generate avatar if missing (for legacy or basic messages)
            const avatarUrl = msg.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${msg.socketId}`;
            
            return (
              <div key={index} className={`message-group ${isMine ? 'mine' : 'other'}`}>
                {!isMine && <img src={avatarUrl} className="avatar" alt="User" />}
                <div className="bubble">
                  {msg.message}
                  <div className="meta">{formatTime(msg.time)}</div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* TYPING INDICATOR */}
        <div className="typing-indicator">
          {typingArr.length > 0 && (
             <span>
               <span style={{ fontWeight: 600 }}>
                 {typingArr.length > 2 ? 'Several people' : 'Someone'}
               </span> is typing...
             </span>
          )}
        </div>

        {/* INPUT */}
        <div className="input-area">
          <input
            className="msg-input"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
          />
          <button className="send-btn" onClick={sendMessage}>
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