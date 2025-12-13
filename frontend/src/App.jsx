import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
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

// --- HELPER: Detect Links in Text ---
const renderMessageWithLinks = (text) => {
  if (!text) return "";
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="msg-link"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
};

// --- MAIN APP COMPONENT (Auth Handler) ---
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [inputName, setInputName] = useState("");
  const [shakeError, setShakeError] = useState(false);

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
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>

        <div className={`glass-card ${shakeError ? "shake-anim" : ""}`}>
          <div className="avatar-preview-container">
            <img src={avatarUrl} alt="Avatar Preview" className="avatar-preview" />
            <span className="online-badge"></span>
          </div>

          <div className="login-content">
            <h1 className="welcome-title">Welcome Back</h1>
            <p className="welcome-subtitle">Enter your details to join the workspace.</p>

            <div className="input-group">
              <input
                className="modern-input"
                placeholder="Display Name"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                autoFocus
                maxLength={15}
              />
            </div>

            <button className="modern-btn" onClick={handleLogin}>
              Enter Lounge
              <svg style={{ marginLeft: 8 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <ChatInterface username={username} onLogout={handleLogout} />;
}

// --- MAIN CHAT INTERFACE (Layout Manager) ---
function ChatInterface({ username, onLogout }) {
  // STATE
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  
  // Layout States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Infinite Scroll States
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const previousScrollHeightRef = useRef(0);

  // User List
  const [onlineUsersList, setOnlineUsersList] = useState([]); 

  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("chat_muted") === "true");
  const [activeReactionId, setActiveReactionId] = useState(null);
  const [selectedMsgId, setSelectedMsgId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);

  // REFS
  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const inputRef = useRef(null);
  const pendingRef = useRef(new Map());
  const fileInputRef = useRef(null);
  const messagesContainerRef = useRef(null); 
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
  
  const isUserNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return false;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 150;
  };

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
      console.log("Connected");
      setConnected(true);
      socket.emit("identify", { displayName: clientDisplayName.current });
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setTypingUsers({});
      setOnlineUsersList([]);
    });

    socket.on("user_joined", (data) => {
      toast.success(`${data.displayName} joined`, { duration: 2000, position: 'bottom-left', style: {background: '#334155', color:'#fff'} });
    });

    socket.on("user_left", (data) => {
      toast(`${data.displayName} left`, { duration: 2000, icon: '👋', position: 'bottom-left', style: {background: '#334155', color:'#fff'} });
    });

    socket.on("history", (history = []) => {
      setMessageList((prev) => {
        const merged = new Map();
        history.forEach((m) => { if (m && m.id) merged.set(m.id, m); });
        prev.forEach((m) => { if (m && m.id && !merged.has(m.id)) merged.set(m.id, m); });
        pendingRef.current.forEach((m, id) => { if (!merged.has(id)) merged.set(id, m); });
        return Array.from(merged.values());
      });
      setTimeout(() => { try { messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" }); } catch (e) {} }, 50);
      setLoadingHistory(false);
    });

    socket.on("more_messages_loaded", (olderMessages) => {
        if (!olderMessages || olderMessages.length === 0) {
            setHasMoreMessages(false);
            setIsLoadingMore(false);
            return;
        }
        setMessageList((prev) => {
            const merged = new Map();
            olderMessages.forEach((m) => { if (m && m.id) merged.set(m.id, m); });
            prev.forEach((m) => { if (m && m.id && !merged.has(m.id)) merged.set(m.id, m); });
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
      
      const isMine = data.socketId === socketRef.current?.id;
      if (isMine || isUserNearBottom()) {
          setTimeout(() => { try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {} }, 40);
      }
    });

    socket.on("reaction_updated", (data) => {
      setMessageList((prev) => prev.map((msg) => msg.id === data.id ? { ...msg, reactions: data.reactions } : msg));
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

    socket.on("online_users", (usersArray) => {
      if (Array.isArray(usersArray)) setOnlineUsersList(usersArray);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- SCROLL & LOAD MORE ---
  const handleScroll = (e) => {
      const { scrollTop, scrollHeight } = e.target;
      if (scrollTop === 0 && !isLoadingMore && hasMoreMessages && !loadingHistory && messageList.length > 0) {
          setIsLoadingMore(true);
          previousScrollHeightRef.current = scrollHeight;
          const oldestMsg = messageList[0];
          if (socketRef.current) {
             socketRef.current.emit("load_more_messages", { lastMsgTime: oldestMsg.createdAt || oldestMsg.time });
          }
      }
  };

  useLayoutEffect(() => {
      if (isLoadingMore && previousScrollHeightRef.current > 0) {
          const container = messagesContainerRef.current;
          if (container) {
              const diff = container.scrollHeight - previousScrollHeightRef.current;
              container.scrollTop = diff;
              previousScrollHeightRef.current = 0;
              setIsLoadingMore(false);
          }
      }
  }, [messageList, isLoadingMore]);

  const handleImageLoad = () => {
    if (!isLoadingMore && !loadingHistory && isUserNearBottom()) {
        setTimeout(() => { try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {} }, 80);
    }
  };

  // --- ACTIONS ---
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
      id, message: message.trim(), time: new Date().toISOString(),
      socketId: socketRef.current.id, displayName: clientDisplayName.current,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${clientDisplayName.current}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
      reactions: {}, replyTo: replyingTo ? { id: replyingTo.id, displayName: replyingTo.displayName, message: replyingTo.message } : null,
      images: []
    };

    pendingRef.current.set(id, msgData);
    setMessageList((prev) => {
        const map = new Map();
        prev.forEach((m) => map.set(m.id, m));
        map.set(id, msgData);
        return Array.from(map.values());
    });
    
    socketRef.current.emit("send_message", msgData, (ack) => { if (ack && ack.id) pendingRef.current.delete(ack.id); });
    socketRef.current.emit("typing", { typing: false });
    setMessage("");
    setReplyingTo(null);
    inputRef.current?.focus();
  };

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const limited = files.slice(0, 3);
    const tempId = generateId();
    const localPreviews = limited.map((f) => ({ url: URL.createObjectURL(f), name: f.name, local: true }));
    const optimisticMsg = {
      id: tempId, message: "", time: new Date().toISOString(),
      socketId: socketRef.current?.id, displayName: clientDisplayName.current,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${clientDisplayName.current}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
      reactions: {}, replyTo: replyingTo ? { id: replyingTo.id, displayName: replyingTo.displayName, message: replyingTo.message } : null,
      images: localPreviews, _localPreview: true, loading: true
    };

    pendingRef.current.set(tempId, optimisticMsg);
    setMessageList((prev) => {
        const map = new Map();
        prev.forEach((m) => map.set(m.id, m));
        map.set(tempId, optimisticMsg);
        return Array.from(map.values());
    });
    setTimeout(() => { try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {} }, 80);

    const form = new FormData();
    limited.forEach((f) => form.append("images", f));
    setIsUploading(true);

    try {
      const res = await fetch(`https://socketio-testing-chatbox.onrender.com/upload-image`, { method: "POST", body: form });
      const data = await res.json();
      if (!data.ok) throw new Error("Upload Failed");
      
      const images = data.images || [];
      setMessageList((prev) => prev.map((m) => m.id === tempId ? { ...m, images, _localPreview: false, loading: false } : m));
      pendingRef.current.delete(tempId);
      
      const msgData = { ...optimisticMsg, images, _localPreview: false, loading: false, id: tempId };
      socketRef.current?.emit("send_message", msgData, (ack) => { if (ack && ack.id) pendingRef.current.delete(ack.id); });
    } catch (err) {
      toast.error("Image upload failed");
      setMessageList((prev) => prev.filter((m) => m.id !== tempId));
      pendingRef.current.delete(tempId);
    } finally {
      e.target.value = "";
      setReplyingTo(null);
      setIsUploading(false);
    }
  };

  const handleReaction = (msgId, emoji) => {
    socketRef.current?.emit("message_reaction", { messageId: msgId, emoji });
    setActiveReactionId(null);
    setSelectedMsgId(null);
  };

  const typingArr = Object.values(typingUsers);

  return (
    <div className="app-layout">
      <StyleSheet />
      <Toaster />

      {/* --- SIDEBAR (Contacts/Users) --- */}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        {/* Header */}
        <div className="sidebar-header">
           <h2 className="brand-logo">Chat<span style={{color:'var(--primary)'}}>Box</span></h2>
           <button className="mobile-close-btn" onClick={() => setMobileMenuOpen(false)}>✕</button>
        </div>
        
        {/* Search */}
        <div className="search-wrapper">
            <input placeholder="Search users..." className="search-input" />
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>

        {/* User List */}
        <div className="user-list-container">
            <div className="list-label">ONLINE — {onlineUsersList.length}</div>
            <div className="user-list">
                {onlineUsersList.map(user => {
                    const isMe = user.socketId === socketRef.current?.id;
                    return (
                        <div key={user.socketId} className={`user-item ${isMe ? 'is-me' : ''}`}>
                             <div className="user-avatar-wrap">
                                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${user.displayName}&backgroundColor=b6e3f4,c0aede,d1d4f9`} alt="av" />
                                <span className="status-dot"></span>
                             </div>
                             <div className="user-info">
                                 <span className="user-name">{user.displayName} {isMe && "(You)"}</span>
                                 <span className="user-status">Online</span>
                             </div>
                        </div>
                    )
                })}
            </div>
        </div>

        {/* Footer: My Profile */}
        <div className="sidebar-footer">
            <div className="my-profile">
                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${username}&backgroundColor=b6e3f4,c0aede,d1d4f9`} alt="me" />
                <div className="my-info">
                    <span className="my-name">{username}</span>
                    <span className="my-id">#{socketRef.current?.id?.slice(0,4)}</span>
                </div>
            </div>
            <button className="logout-btn-icon" onClick={onLogout} title="Logout">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
        </div>
      </aside>

      {/* --- OVERLAY for Mobile --- */}
      {mobileMenuOpen && <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />}

      {/* --- MAIN CHAT AREA --- */}
      <main className="chat-main">
        {/* Chat Header */}
        <header className="chat-header">
            <div className="header-left">
                <button className="hamburger-btn" onClick={() => setMobileMenuOpen(true)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
                <div className="room-info">
                    <h3>Public Lounge</h3>
                    <span className="room-status">{connected ? "Connected" : "Reconnecting..."}</span>
                </div>
            </div>
            <div className="header-actions">
                <button className="icon-action-btn" onClick={toggleMute}>
                   {isMuted ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg> 
                            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>}
                </button>
            </div>
        </header>

        {/* Messages List */}
        <div 
            className="messages-wrapper" 
            ref={messagesContainerRef}
            onScroll={handleScroll}
            onClick={() => { setActiveReactionId(null); setSelectedMsgId(null); }}
        >
             {isLoadingMore && <div className="loader-spinner center"></div>}
             
             {loadingHistory ? (
                 <div className="full-loader">
                     <div className="loader-spinner large"></div>
                     <p>Loading History...</p>
                 </div>
             ) : (
                <>
                {messageList.length === 0 && (
                    <div className="empty-state">
                        <div className="empty-icon">👋</div>
                        <h3>Welcome to the Lounge</h3>
                        <p>No messages yet. Be the first to say hello!</p>
                    </div>
                )}
                {messageList.map((msg, idx) => {
                    const isMine = msg.socketId === socketRef.current?.id || msg.displayName === username;
                    const showHeader = idx === 0 || messageList[idx-1].socketId !== msg.socketId || (new Date(msg.time) - new Date(messageList[idx-1].time) > 60000);
                    const isPending = pendingRef.current.has(msg.id) || msg._localPreview;
                    const showPicker = activeReactionId === msg.id;

                    return (
                        <div key={msg.id} className={`msg-row ${isMine ? 'mine' : 'other'} ${showHeader ? 'has-header' : ''}`}>
                            {!isMine && showHeader && (
                                <img className="msg-avatar" src={msg.avatar} alt="avatar" />
                            )}
                            {!isMine && !showHeader && <div className="msg-avatar-spacer"></div>}

                            <div className="msg-content-block">
                                {!isMine && showHeader && <div className="msg-sender-name">{msg.displayName} <span className="msg-time">{formatTime(msg.time)}</span></div>}
                                
                                <div 
                                    className={`msg-bubble ${isPending ? 'pending' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); setSelectedMsgId(prev => prev === msg.id ? null : msg.id); }}
                                >
                                    {msg.replyTo && (
                                        <div className="reply-quote">
                                            <div className="reply-bar"></div>
                                            <div className="reply-content">
                                                <span className="reply-author">{msg.replyTo.displayName}</span>
                                                <span className="reply-text">{msg.replyTo.message}</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="msg-text">{renderMessageWithLinks(msg.message)}</div>
                                    
                                    {msg.images && msg.images.length > 0 && (
                                        <div className="msg-images">
                                            {msg.images.map((img, i) => (
                                                <div key={i} className="img-container">
                                                    <img src={img.url} alt="attachment" onClick={() => window.open(img.url, "_blank")} onLoad={handleImageLoad} />
                                                    {msg.loading && <div className="img-overlay"><div className="loader-spinner small"></div></div>}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="msg-meta-right">
                                        {formatTime(msg.time)}
                                        {isMine && <span className="sent-tick">✓</span>}
                                    </div>

                                    {/* Reactions Display */}
                                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                        <div className="reactions-display">
                                            {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                                                if(!userIds.length) return null;
                                                const iReacted = userIds.includes(socketRef.current?.id);
                                                return <span key={emoji} className={`reaction-pill ${iReacted ? 'active':''}`} onClick={(e)=>{e.stopPropagation(); handleReaction(msg.id, emoji)}}>{emoji} {userIds.length}</span>
                                            })}
                                        </div>
                                    )}

                                    {/* Hover/Click Actions */}
                                    <div className={`msg-actions ${selectedMsgId === msg.id ? 'show' : ''}`}>
                                        <button onClick={(e) => { e.stopPropagation(); setReplyingTo(msg); inputRef.current?.focus(); }}>↩</button>
                                        <button onClick={(e) => { e.stopPropagation(); setActiveReactionId(showPicker ? null : msg.id); }}>☺</button>
                                    </div>

                                    {/* Reaction Picker */}
                                    {showPicker && (
                                        <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
                                            {REACTION_EMOJIS.map(em => (
                                                <span key={em} onClick={() => handleReaction(msg.id, em)}>{em}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                </>
             )}
             
             {typingArr.length > 0 && (
                 <div className="typing-indicator">
                     <div className="dots"><span></span><span></span><span></span></div>
                     <span className="text">{typingArr.length > 2 ? "Several people are typing..." : `${typingArr.join(", ")} is typing...`}</span>
                 </div>
             )}
             
             <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="chat-input-area">
             {replyingTo && (
                 <div className="reply-preview">
                     <div className="reply-info">
                        <span className="reply-label">Replying to {replyingTo.displayName}</span>
                        <span className="reply-msg">{replyingTo.message}</span>
                     </div>
                     <button onClick={() => setReplyingTo(null)}>✕</button>
                 </div>
             )}

             <div className="input-bar-wrapper">
                 <input type="file" ref={fileInputRef} hidden multiple accept="image/*" onChange={handleFilesSelected} />
                 <button className="attach-btn" onClick={() => fileInputRef.current?.click()}>
                     {isUploading ? <div className="loader-spinner small"></div> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>}
                 </button>
                 
                 <textarea 
                    ref={inputRef}
                    rows={1}
                    className="main-input"
                    placeholder="Type a message..."
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); handleTyping(); }}
                    onKeyDown={(e) => { if(e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                 />
                 
                 <button className={`send-btn ${message.trim() ? 'active' : ''}`} onClick={sendMessage}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                 </button>
             </div>
        </div>

      </main>
    </div>
  );
}

// --- STYLES ---
const StyleSheet = () => (
  <style>{`
    :root {
      --bg-body: #0f172a;
      --bg-sidebar: #1e293b;
      --bg-chat: #0f172a; /* Main chat background */
      --bg-input: #1e293b;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --border: #334155;
      --bubble-mine: #4f46e5;
      --bubble-other: #1e293b;
      --success: #22c55e;
    }

    * { box-sizing: border-box; }
    body, html { 
        margin: 0; padding: 0; 
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
        background: var(--bg-body); 
        color: var(--text-main); 
        height: 100dvh; /* Dynamic Height for Mobile */
        overflow: hidden; 
        overscroll-behavior: none; /* Prevent rubber banding on mobile */
    }

    /* --- LAYOUT GRID --- */
    .app-layout {
      display: flex;
      height: 100dvh; /* Dynamic Height ensures correct mobile sizing */
      width: 100vw;
      background: var(--bg-body);
      overflow: hidden;
      position: relative;
    }

    /* --- SIDEBAR --- */
    .sidebar {
      width: 320px;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 50;
    }
    
    .sidebar-header {
      padding: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-logo { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    
    .search-wrapper { margin: 0 20px 20px; position: relative; }
    .search-input {
      width: 100%;
      background: #0f172a;
      border: 1px solid var(--border);
      padding: 10px 10px 10px 36px;
      border-radius: 8px;
      color: var(--text-main);
      font-size: 14px;
      outline: none;
    }
    .search-input:focus { border-color: var(--primary); }
    .search-icon { position: absolute; left: 10px; top: 10px; color: var(--text-muted); }

    .user-list-container { flex: 1; overflow-y: auto; padding: 0 10px; }
    .list-label { font-size: 11px; color: var(--text-muted); font-weight: 700; margin: 10px 10px; letter-spacing: 0.5px; }
    
    .user-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .user-item:hover { background: rgba(255,255,255,0.05); }
    .user-item.is-me { background: rgba(99, 102, 241, 0.1); }
    
    .user-avatar-wrap { position: relative; width: 40px; height: 40px; }
    .user-avatar-wrap img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; background: #334155; }
    .status-dot { position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; background: var(--success); border: 2px solid var(--bg-sidebar); border-radius: 50%; }
    
    .user-info { display: flex; flex-direction: column; }
    .user-name { font-size: 14px; font-weight: 600; color: var(--text-main); }
    .user-status { font-size: 12px; color: var(--text-muted); }

    .sidebar-footer {
      padding: 16px;
      border-top: 1px solid var(--border);
      background: rgba(0,0,0,0.1);
      display: flex; justify-content: space-between; align-items: center;
    }
    .my-profile { display: flex; align-items: center; gap: 10px; }
    .my-profile img { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border); }
    .my-info { display: flex; flex-direction: column; }
    .my-name { font-size: 14px; font-weight: 700; }
    .my-id { font-size: 11px; color: var(--text-muted); }

    .logout-btn-icon { background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 8px; border-radius: 6px; transition: background 0.2s; }
    .logout-btn-icon:hover { background: rgba(239, 68, 68, 0.1); }
    .mobile-close-btn { display: none; background: none; border: none; color: var(--text-main); font-size: 20px; cursor: pointer; }

    /* --- CHAT MAIN AREA --- */
    .chat-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
      background: var(--bg-chat);
      background-image: radial-gradient(#1e293b 1px, transparent 1px);
      background-size: 24px 24px;
      height: 100%;
    }

    .chat-header {
      height: 64px;
      flex-shrink: 0; /* Prevents shrinking */
      padding: 0 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.8);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      z-index: 10;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .hamburger-btn { display: none; background: none; border: none; color: var(--text-main); cursor: pointer; padding: 0; }
    .room-info h3 { margin: 0; font-size: 16px; font-weight: 700; }
    .room-status { font-size: 12px; color: var(--success); font-weight: 500; display: flex; align-items: center; gap: 5px; }
    .room-status::before { content: ""; display: block; width: 6px; height: 6px; background: var(--success); border-radius: 50%; box-shadow: 0 0 5px var(--success); }
    
    .icon-action-btn { background: var(--bg-input); border: 1px solid var(--border); color: var(--text-muted); width: 36px; height: 36px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .icon-action-btn:hover { color: var(--text-main); border-color: var(--text-muted); }

    /* --- MESSAGES --- */
    .messages-wrapper {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .msg-row { display: flex; margin-bottom: 2px; position: relative; }
    .msg-row.has-header { margin-top: 10px; }
    .msg-row.mine { justify-content: flex-end; }
    
    .msg-avatar { width: 32px; height: 32px; border-radius: 50%; margin-right: 10px; margin-top: 2px; }
    .msg-avatar-spacer { width: 42px; } /* 32 + 10 margin */
    
    .msg-content-block { display: flex; flex-direction: column; max-width: 60%; }
    .mine .msg-content-block { align-items: flex-end; }
    
    .msg-sender-name { font-size: 13px; color: var(--text-main); font-weight: 600; margin-bottom: 4px; margin-left: 2px; }
    .msg-time { font-size: 11px; color: var(--text-muted); font-weight: 400; margin-left: 6px; }

    .msg-bubble {
      padding: 8px 12px;
      border-radius: 4px 16px 16px 16px;
      position: relative;
      font-size: 15px;
      line-height: 1.5;
      color: #e2e8f0;
      background: var(--bubble-other);
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
      transition: background 0.2s;
      cursor: pointer;
    }
    .mine .msg-bubble {
      background: var(--bubble-mine);
      color: white;
      border-radius: 16px 4px 16px 16px;
    }
    .msg-bubble.pending { opacity: 0.7; }
    .msg-bubble:hover .msg-actions { opacity: 1; pointer-events: auto; }

    .msg-link { color: #60a5fa; text-decoration: underline; word-break: break-all; }
    
    .msg-images { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
    .img-container { position: relative; width: 120px; height: 90px; }
    .img-container img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; }
    .img-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }

    .msg-meta-right { font-size: 10px; text-align: right; opacity: 0.7; margin-top: 2px; display: flex; justify-content: flex-end; align-items: center; gap: 3px; }
    .sent-tick { font-size: 10px; }

    /* Reactions on Message */
    .reactions-display { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .reaction-pill { background: rgba(0,0,0,0.2); border-radius: 10px; padding: 2px 6px; font-size: 11px; cursor: pointer; border: 1px solid transparent; }
    .reaction-pill.active { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.4); }

    /* Hover Actions */
    .msg-actions {
      position: absolute; top: -14px; right: 0;
      background: var(--bg-body); border: 1px solid var(--border);
      border-radius: 20px; padding: 2px 6px;
      display: flex; gap: 2px;
      opacity: 0; pointer-events: none; transition: opacity 0.2s;
      z-index: 5;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    .mine .msg-actions { right: auto; left: 0; }
    .msg-actions.show { opacity: 1; pointer-events: auto; }
    .msg-actions button { background: none; border: none; font-size: 14px; cursor: pointer; padding: 4px; border-radius: 50%; color: var(--text-muted); }
    .msg-actions button:hover { background: rgba(255,255,255,0.1); color: var(--text-main); }

    /* Emoji Picker */
    .emoji-picker {
        position: absolute; bottom: 100%; right: 0;
        background: var(--bg-sidebar); border: 1px solid var(--border);
        padding: 6px; border-radius: 24px; display: flex; gap: 4px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3); z-index: 20;
        margin-bottom: 5px;
    }
    .emoji-picker span { font-size: 18px; cursor: pointer; padding: 4px; transition: transform 0.2s; }
    .emoji-picker span:hover { transform: scale(1.3); }

    /* Typing */
    .typing-indicator { font-size: 12px; color: var(--text-muted); margin-left: 20px; display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
    .dots { display: flex; gap: 2px; }
    .dots span { width: 3px; height: 3px; background: var(--text-muted); border-radius: 50%; animation: bounce 1.4s infinite ease-in-out both; }
    .dots span:nth-child(1) { animation-delay: -0.32s; }
    .dots span:nth-child(2) { animation-delay: -0.16s; }
    @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

    /* --- INPUT AREA --- */
    .chat-input-area {
        padding: 16px 20px;
        background: var(--bg-sidebar);
        border-top: 1px solid var(--border);
        display: flex; flex-direction: column; gap: 8px;
        flex-shrink: 0; /* Ensures input doesn't shrink when keyboard opens */
        padding-bottom: env(safe-area-inset-bottom, 16px); /* iPhone safe area */
    }
    
    .reply-preview {
        display: flex; justify-content: space-between; align-items: center;
        background: rgba(15, 23, 42, 0.5); border-left: 3px solid var(--primary);
        padding: 8px 12px; border-radius: 4px; font-size: 12px;
    }
    .reply-info { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
    .reply-label { color: var(--primary); font-weight: 700; }
    .reply-msg { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .reply-preview button { background: none; border: none; color: var(--text-muted); cursor: pointer; }

    .input-bar-wrapper { display: flex; align-items: flex-end; gap: 10px; }
    .main-input {
        flex: 1;
        background: #0f172a;
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 14px;
        color: var(--text-main);
        font-family: inherit;
        font-size: 15px;
        resize: none;
        outline: none;
        max-height: 120px;
        transition: border-color 0.2s;
    }
    .main-input:focus { border-color: var(--primary); }

    .attach-btn, .send-btn {
        width: 44px; height: 44px;
        border-radius: 10px;
        border: none;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
    }
    .attach-btn { background: transparent; color: var(--text-muted); border: 1px solid transparent; }
    .attach-btn:hover { background: rgba(255,255,255,0.05); color: var(--text-main); }
    
    .send-btn { background: var(--border); color: var(--text-muted); pointer-events: none; }
    .send-btn.active { background: var(--primary); color: white; pointer-events: auto; }
    .send-btn.active:hover { background: var(--primary-hover); }

    /* --- LOGIN SCREEN --- */
    .login-wrapper { width: 100vw; height: 100dvh; display: flex; justify-content: center; align-items: center; background: radial-gradient(circle at top left, #1e1b4b, #0f172a); overflow: hidden; position: relative; }
    .shape { position: absolute; border-radius: 50%; opacity: 0.4; filter: blur(80px); }
    .shape-1 { top: -10%; left: -10%; width: 50vw; height: 50vw; background: #4f46e5; animation: float 10s infinite alternate; }
    .shape-2 { bottom: -10%; right: -10%; width: 40vw; height: 40vw; background: #0ea5e9; animation: float 12s infinite alternate-reverse; }
    @keyframes float { from { transform: translate(0,0); } to { transform: translate(40px, 40px); } }
    
    .glass-card { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); padding: 40px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; z-index: 10; }
    .avatar-preview-container { width: 100px; height: 100px; margin: 0 auto 20px; position: relative; }
    .avatar-preview { width: 100%; height: 100%; border-radius: 50%; border: 4px solid var(--bg-body); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); background: #fff; }
    .online-badge { position: absolute; bottom: 5px; right: 5px; width: 20px; height: 20px; background: #22c55e; border: 3px solid var(--bg-body); border-radius: 50%; }
    
    .welcome-title { font-size: 24px; font-weight: 700; color: white; margin: 0; }
    .welcome-subtitle { color: var(--text-muted); margin: 8px 0 24px; font-size: 14px; }
    
    .input-group { margin-bottom: 24px; }
    .modern-input { width: 100%; padding: 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); color: white; font-size: 16px; outline: none; transition: all 0.3s; text-align: center; }
    .modern-input:focus { border-color: var(--primary); background: rgba(0,0,0,0.4); }
    
    .modern-btn { width: 100%; padding: 14px; border: none; border-radius: 12px; background: linear-gradient(135deg, var(--primary), #4338ca); color: white; font-weight: 600; cursor: pointer; display: flex; justify-content: center; align-items: center; font-size: 16px; transition: transform 0.2s; }
    .modern-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.4); }
    .shake-anim { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
    @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }

    /* --- UTILS --- */
    .loader-spinner { border: 3px solid rgba(255,255,255,0.1); border-top: 3px solid var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
    .loader-spinner.small { width: 16px; height: 16px; border-width: 2px; }
    .loader-spinner.large { width: 32px; height: 32px; margin-bottom: 10px; }
    .full-loader { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; }
    .loader-spinner.center { margin: 10px auto; width: 20px; height: 20px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    .empty-state { margin: auto; text-align: center; color: var(--text-muted); }
    .empty-icon { font-size: 40px; margin-bottom: 10px; }

    /* Custom Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

    /* --- MOBILE RESPONSIVE --- */
    @media (max-width: 768px) {
      .sidebar {
        position: fixed; top: 0; left: 0; bottom: 0;
        transform: translateX(-100%);
        width: 280px; box-shadow: 10px 0 30px rgba(0,0,0,0.5);
      }
      .sidebar.mobile-open { transform: translateX(0); }
      .mobile-close-btn { display: block; }
      .hamburger-btn { display: block; }
      .sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 40; backdrop-filter: blur(2px); animation: fadein 0.2s; }
      
      .msg-content-block { max-width: 85%; }
      .chat-header { padding: 0 15px; height: 60px; }
      .brand-logo { font-size: 20px; }

      /* Mobile Emoji Picker: Show 3 columns */
      .emoji-picker {
         display: grid;
         grid-template-columns: repeat(3, 1fr);
         width: auto;
         right: 0;
         bottom: 100%;
         z-index: 100;
         padding: 8px;
         max-width: 140px;
      }
      .emoji-picker span {
         padding: 8px;
         display: flex; justify-content: center; align-items: center;
      }

      /* Mobile Input Area */
      .chat-input-area {
        padding: 12px;
        padding-bottom: max(12px, env(safe-area-inset-bottom));
      }
    }
    @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
  `}</style>
);