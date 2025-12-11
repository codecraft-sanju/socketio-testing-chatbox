import React, { useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";

// --- CONFIGURATION ---
// FIXED BACKEND URL (Render)
const SOCKET_URL = "https://socketio-testing-chatbox.onrender.com";

// Sound Effect
const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

// Time Helper
const formatTime = (isoString) => {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function App() {
  // --- STATE ---
  const [joined, setJoined] = useState(false);
  const [user, setUser] = useState({ name: "", role: "Founder" });
  
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [totalOnline, setTotalOnline] = useState(1);
  const [typingInfo, setTypingInfo] = useState("");

  const bottomRef = useRef(null);
  const audioRef = useRef(new Audio(NOTIFICATION_SOUND));

  // --- SOCKET CONNECTION ---
  useEffect(() => {
    if (!joined) return;

    // Connect to Render Backend
    const newSocket = ioClient(SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 10,
    });
    setSocket(newSocket);

    // 1. Load History
    newSocket.on("history", (history) => {
      setMessages(history);
      scrollToBottom();
    });

    // 2. Receive Message
    newSocket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
      scrollToBottom();
      // Play sound if message is from someone else
      if (data.senderName !== user.name) {
        try { audioRef.current.play().catch(()=>{}); } catch(e){}
      }
    });

    // 3. User Count
    newSocket.on("users_count", (data) => setTotalOnline(data.total));

    // 4. Typing
    newSocket.on("user_typing", (data) => {
      if (data.isTyping) setTypingInfo(`${data.name} is typing...`);
      else setTypingInfo("");
    });

    return () => newSocket.disconnect();
  }, [joined]);

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // --- HANDLERS ---
  const handleJoin = (e) => {
    e.preventDefault();
    if (user.name.trim()) setJoined(true);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!currentMessage.trim() || !socket) return;

    const payload = {
      text: currentMessage,
      senderName: user.name,
      senderRole: user.role
    };

    socket.emit("send_message", payload);
    socket.emit("typing", { isTyping: false });
    setCurrentMessage("");
  };

  const handleTyping = (e) => {
    setCurrentMessage(e.target.value);
    if (!socket) return;
    
    socket.emit("typing", { isTyping: true, name: user.name });
    setTimeout(() => socket.emit("typing", { isTyping: false }), 2000);
  };

  // --- LOGIC: OTHERS COUNT ---
  const othersCount = Math.max(0, totalOnline - 1);

  return (
    <div className="app-container">
      {/* GLOBAL STYLES */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        :root {
          --primary: #4f46e5;
          --primary-dark: #4338ca;
          --bg: #f8fafc;
          --white: #ffffff;
          --mine-bg: #4f46e5;
          --other-bg: #f1f5f9;
        }

        body { margin: 0; font-family: 'Inter', sans-serif; background: var(--bg); color: #1e293b; }

        .app-container {
          display: flex; justify-content: center; align-items: center;
          height: 100dvh; width: 100%; padding: 20px; box-sizing: border-box;
        }

        /* --- LOGIN CARD --- */
        .login-card {
          background: var(--white); width: 100%; max-width: 400px;
          padding: 40px; border-radius: 24px;
          box-shadow: 0 20px 60px -10px rgba(0,0,0,0.1);
          text-align: center;
        }
        .form-group { margin-bottom: 20px; text-align: left; }
        .label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #475569; }
        .input-field {
          width: 100%; padding: 14px; border: 1px solid #e2e8f0; border-radius: 12px;
          font-size: 16px; outline: none; transition: 0.2s; box-sizing: border-box;
        }
        .input-field:focus { border-color: var(--primary); box-shadow: 0 0 0 3px #e0e7ff; }
        
        .join-btn {
          width: 100%; padding: 16px; background: var(--primary); color: white;
          border: none; border-radius: 12px; font-weight: 600; font-size: 16px;
          cursor: pointer; transition: 0.2s;
        }
        .join-btn:hover { background: var(--primary-dark); transform: translateY(-1px); }

        /* --- CHAT INTERFACE --- */
        .chat-box {
          width: 100%; max-width: 600px; height: 90vh; background: var(--white);
          border-radius: 20px; display: flex; flex-direction: column;
          box-shadow: 0 10px 40px -5px rgba(0,0,0,0.1); overflow: hidden;
        }

        .header {
          padding: 20px; border-bottom: 1px solid #f1f5f9; background: rgba(255,255,255,0.95);
          display: flex; justify-content: space-between; align-items: center;
        }
        .status-badge {
          background: #dcfce7; color: #166534; padding: 6px 12px;
          border-radius: 20px; font-size: 12px; font-weight: 600;
          display: flex; align-items: center; gap: 6px;
        }
        .dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; }

        .messages-list {
          flex: 1; padding: 20px; overflow-y: auto; background: #fff;
          display: flex; flex-direction: column; gap: 18px;
        }

        .msg-row { display: flex; gap: 12px; max-width: 80%; }
        .msg-row.mine { align-self: flex-end; flex-direction: row-reverse; }

        .avatar {
          width: 40px; height: 40px; border-radius: 12px; background: #f1f5f9;
          flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .msg-content { display: flex; flex-direction: column; }
        
        .sender-info {
          font-size: 11px; font-weight: 600; margin-bottom: 4px; color: #64748b;
        }
        .msg-row.mine .sender-info { text-align: right; }

        .bubble {
          padding: 12px 16px; border-radius: 16px; font-size: 15px; line-height: 1.5;
          position: relative; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .msg-row.mine .bubble {
          background: var(--mine-bg); color: white; border-bottom-right-radius: 2px;
        }
        .msg-row.other .bubble {
          background: var(--other-bg); color: #0f172a; border-bottom-left-radius: 2px;
        }

        .role-tag {
          font-size: 10px; padding: 2px 6px; background: #e2e8f0; color: #475569;
          border-radius: 4px; margin-left: 6px; vertical-align: middle;
        }

        .typing-area { font-size: 12px; color: #94a3b8; height: 20px; padding: 0 24px 10px; }

        .input-bar {
          padding: 16px; border-top: 1px solid #f1f5f9; background: white;
          display: flex; gap: 10px; align-items: center;
        }
        .text-input {
          flex: 1; padding: 14px 20px; border-radius: 99px; border: 1px solid #e2e8f0;
          background: #f8fafc; font-size: 15px; outline: none; transition: 0.2s;
        }
        .text-input:focus { background: white; border-color: var(--primary); }

        .send-btn {
          width: 50px; height: 50px; border-radius: 50%; background: var(--primary);
          color: white; border: none; cursor: pointer; display: flex;
          align-items: center; justify-content: center; transition: 0.2s;
        }
        .send-btn:hover { background: var(--primary-dark); transform: scale(1.05); }

        @media (max-width: 600px) {
          .app-container { padding: 0; }
          .chat-box { height: 100dvh; max-width: 100%; border-radius: 0; }
          .login-card { height: 100vh; max-width: 100%; border-radius: 0; justify-content: center; display: flex; flex-direction: column; }
        }
      `}</style>

      {/* --- UI RENDER LOGIC --- */}
      
      {!joined ? (
        // LOGIN SCREEN
        <div className="login-card">
          <h1 style={{margin:'0 0 10px 0', fontSize:24}}>🚀 StartupHub</h1>
          <p style={{color:'#64748b', marginBottom:30}}>Enter the secure lounge.</p>
          
          <form onSubmit={handleJoin}>
            <div className="form-group">
              <label className="label">Full Name</label>
              <input 
                className="input-field" 
                placeholder="e.g. Sam Altman"
                value={user.name}
                onChange={e => setUser({...user, name: e.target.value})}
                required 
              />
            </div>
            
            <div className="form-group">
              <label className="label">Your Role</label>
              <select 
                className="input-field"
                value={user.role}
                onChange={e => setUser({...user, role: e.target.value})}
              >
                <option value="Founder">Founder 💡</option>
                <option value="CTO">CTO 💻</option>
                <option value="Developer">Developer ⚙️</option>
                <option value="Designer">Designer 🎨</option>
                <option value="Investor">Investor 💸</option>
              </select>
            </div>

            <button type="submit" className="join-btn">Enter Room</button>
          </form>
        </div>
      ) : (
        // CHAT SCREEN
        <div className="chat-box">
          <div className="header">
            <div>
              <h3 style={{margin:0, fontSize:18}}>Startup Lounge</h3>
              <div style={{fontSize:12, color:'#64748b'}}>
                Logged in as <b>{user.name}</b>
              </div>
            </div>
            <div className="status-badge">
              <span className="dot" />
              {othersCount === 0 ? "You are alone (0)" : `${othersCount} Others Online`}
            </div>
          </div>

          <div className="messages-list">
            {messages.map((msg, i) => {
              const isMine = msg.senderName === user.name;
              // Generate Avatar from Name
              const avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${msg.senderName}&backgroundColor=e2e8f0,c0aede,b6e3f4`;

              return (
                <div key={i} className={`msg-row ${isMine ? 'mine' : 'other'}`}>
                  {!isMine && <img src={avatar} className="avatar" alt="av" />}
                  
                  <div className="msg-content">
                    <div className="sender-info">
                      {isMine ? "You" : msg.senderName}
                      <span className="role-tag">{msg.senderRole}</span>
                    </div>
                    <div className="bubble">
                      {msg.text}
                      <div style={{fontSize:10, opacity:0.7, marginTop:5, textAlign:'right'}}>
                        {formatTime(msg.time)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="typing-area">{typingInfo}</div>

          <form className="input-bar" onSubmit={sendMessage}>
            <input 
              className="text-input" 
              placeholder="Share your idea..." 
              value={currentMessage}
              onChange={handleTyping}
            />
            <button type="submit" className="send-btn">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}