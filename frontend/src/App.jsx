import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
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
          style={{ color: '#60a5fa', textDecoration: 'underline', wordBreak: 'break-all' }}
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
              <svg style={{ marginLeft: 8 }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
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
  // STATE
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});

  // Loading states
  const [loadingHistory, setLoadingHistory] = useState(true); // Initial load
  const [isUploading, setIsUploading] = useState(false); 
  
  // --- NEW: Load More / Infinite Scroll States ---
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const previousScrollHeightRef = useRef(0); // To restore scroll position

  // --- User List Logic ---
  const [onlineUsersList, setOnlineUsersList] = useState([]); 
  const [showUserListModal, setShowUserListModal] = useState(false); 

  const [showMenu, setShowMenu] = useState(false);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("chat_muted") === "true");

  // Track active reaction picker (Message ID)
  const [activeReactionId, setActiveReactionId] = useState(null);

  // --- Track which message is selected to show buttons ---
  const [selectedMsgId, setSelectedMsgId] = useState(null);

  // REPLY STATE
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

  // --- HELPER: Check if user is scrolled near bottom ---
  const isUserNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return false;
    // If the distance from bottom is less than 150px, consider it "bottom"
    return container.scrollHeight - container.scrollTop - container.clientHeight < 150;
  };

  // --- SOCKET CONNECTION ---
  useEffect(() => {
    // IMPORTANT: Make sure this matches your deployed backend or localhost
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
      setOnlineUsersList([]);
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

    // --- INITIAL HISTORY LOAD ---
    socket.on("history", (history = []) => {
      setMessageList((prev) => {
        const merged = new Map();
        history.forEach((m) => { if (m && m.id) merged.set(m.id, m); });
        prev.forEach((m) => { if (m && m.id && !merged.has(m.id)) merged.set(m.id, m); });
        pendingRef.current.forEach((m, id) => { if (!merged.has(id)) merged.set(id, m); });
        return Array.from(merged.values());
      });
      
      // Auto scroll to bottom only on initial load
      setTimeout(() => {
        try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {}
      }, 80);
      setLoadingHistory(false);
    });

    // --- HANDLE OLDER MESSAGES (Load More) ---
    socket.on("more_messages_loaded", (olderMessages) => {
        if (!olderMessages || olderMessages.length === 0) {
            setHasMoreMessages(false);
            setIsLoadingMore(false);
            return;
        }

        setMessageList((prev) => {
            const merged = new Map();
            // Add older messages first
            olderMessages.forEach((m) => { if (m && m.id) merged.set(m.id, m); });
            // Then add existing messages
            prev.forEach((m) => { if (m && m.id && !merged.has(m.id)) merged.set(m.id, m); });
            return Array.from(merged.values());
        });
        
        // Note: isLoadingMore is set to false in the useLayoutEffect below after scroll adjustment
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
      
      // --- SMART SCROLL LOGIC ---
      // Only scroll if it's my message OR if I'm already at the bottom.
      // If I'm reading old history, do NOT scroll me down.
      const isMine = data.socketId === socketRef.current?.id;
      if (isMine || isUserNearBottom()) {
          setTimeout(() => { try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {} }, 40);
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

    socket.on("online_users", (usersArray) => {
      if (Array.isArray(usersArray)) {
        setOnlineUsersList(usersArray);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- SCROLL HANDLER (Load More Logic) ---
  const handleScroll = (e) => {
      const { scrollTop, scrollHeight } = e.target;
      
      // Check if scrolled to top, not loading, and has more to load
      if (scrollTop === 0 && !isLoadingMore && hasMoreMessages && !loadingHistory && messageList.length > 0) {
          setIsLoadingMore(true);
          previousScrollHeightRef.current = scrollHeight; // Capture current height
          
          // Get the oldest message time
          const oldestMsg = messageList[0];
          
          // Emit event to backend
          if (socketRef.current) {
             socketRef.current.emit("load_more_messages", { 
                 lastMsgTime: oldestMsg.createdAt || oldestMsg.time 
             });
          }
      }
  };

  // --- RESTORE SCROLL POSITION AFTER LOADING MORE ---
  useLayoutEffect(() => {
      if (isLoadingMore && previousScrollHeightRef.current > 0) {
          const container = messagesContainerRef.current;
          if (container) {
              const newScrollHeight = container.scrollHeight;
              const scrollDiff = newScrollHeight - previousScrollHeightRef.current;
              
              // Jump scroll position to maintain visual continuity
              container.scrollTop = scrollDiff;
              
              // Reset
              previousScrollHeightRef.current = 0;
              setIsLoadingMore(false);
          }
      }
  }, [messageList, isLoadingMore]);


  // --- SMART AUTO SCROLL FOR IMAGES ---
  const handleImageLoad = () => {
    // 1. If we are currently fetching history (loadingMore), DO NOT SCROLL.
    // 2. If the user is viewing old messages (not near bottom), DO NOT SCROLL.
    if (!isLoadingMore && !loadingHistory) {
         if (isUserNearBottom()) {
             setTimeout(() => {
                try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {}
             }, 80);
         }
    }
  };

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

    // --- FIX: Logic to handle replies to images (no text) ---
    const replyPayload = replyingTo ? {
      id: replyingTo.id,
      displayName: replyingTo.displayName,
      // If message text exists, use it. If not, but images exist, say "📷 Photo"
      message: replyingTo.message || (replyingTo.images && replyingTo.images.length > 0 ? "📷 Photo" : "Attachment")
    } : null;

    const msgData = {
      id,
      message: message.trim(),
      time: new Date().toISOString(),
      socketId: socketRef.current.id,
      displayName: clientDisplayName.current,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${clientDisplayName.current}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
      reactions: {},
      replyTo: replyPayload,
      images: []
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

  // --- IMAGE FLOW: trigger file picker ---
  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  // Helper to update message images after upload
  const replaceMessageImages = (id, images) => {
    setMessageList((prev) => prev.map((m) => m.id === id ? { ...m, images, _localPreview: false, loading: false } : m));
    if (pendingRef.current.has(id)) pendingRef.current.delete(id);
  };

  // Upload images
  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const limited = files.slice(0, 3);

    const tempId = generateId();
    const localPreviews = limited.map((f) => ({ url: URL.createObjectURL(f), name: f.name, local: true }));

    // --- FIX: Logic to handle replies to images inside Upload Flow ---
    const replyPayload = replyingTo ? {
        id: replyingTo.id,
        displayName: replyingTo.displayName,
        message: replyingTo.message || (replyingTo.images && replyingTo.images.length > 0 ? "📷 Photo" : "Attachment")
    } : null;

    const optimisticMsg = {
      id: tempId,
      message: "",
      time: new Date().toISOString(),
      socketId: socketRef.current?.id,
      displayName: clientDisplayName.current,
      avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${clientDisplayName.current}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
      reactions: {},
      replyTo: replyPayload,
      images: localPreviews,
      _localPreview: true,
      loading: true
    };

    pendingRef.current.set(tempId, optimisticMsg);
    setMessageList((prev) => {
      const map = new Map();
      prev.forEach((m) => map.set(m.id, m));
      map.set(tempId, optimisticMsg);
      return Array.from(map.values());
    });

    setTimeout(() => { try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {} }, 80);

    const SOCKET_URL = "https://socketio-testing-chatbox.onrender.com"; 
    const form = new FormData();
    limited.forEach((f) => form.append("images", f));

    setIsUploading(true);
    try {
      const res = await fetch(`${SOCKET_URL}/upload-image`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error("Upload failed");
        setMessageList((prev) => prev.filter((m) => m.id !== tempId));
        pendingRef.current.delete(tempId);
        setIsUploading(false);
        return;
      }
      const images = data.images || [];

      replaceMessageImages(tempId, images);

      const msgData = {
        id: tempId,
        message: "",
        time: new Date().toISOString(),
        socketId: socketRef.current?.id,
        displayName: clientDisplayName.current,
        avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${clientDisplayName.current}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
        reactions: {},
        replyTo: replyPayload,
        images: images 
      };

      socketRef.current?.emit("send_message", msgData, (ack) => {
        if (ack && ack.id) pendingRef.current.delete(ack.id);
      });

      setTimeout(() => { try { messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); } catch (e) {} }, 80);

    } catch (err) {
      console.error("image upload error:", err);
      toast.error("Image upload failed");
      setMessageList((prev) => prev.filter((m) => m.id !== tempId));
      pendingRef.current.delete(tempId);
    } finally {
      e.target.value = "";
      setReplyingTo(null);
      setIsUploading(false);
      localPreviews.forEach(p => { try { URL.revokeObjectURL(p.url); } catch (e) {} });
    }
  };

  const handleReaction = (msgId, emoji) => {
    if (!socketRef.current) return;
    socketRef.current.emit("message_reaction", { messageId: msgId, emoji });
    setActiveReactionId(null);
    setSelectedMsgId(null);
  };

  const initReply = (msg) => {
    setReplyingTo(msg);
    inputRef.current?.focus();
    setSelectedMsgId(null);
  };

  const handleMessageClick = (e, msgId) => {
    e.stopPropagation();
    setSelectedMsgId(prev => prev === msgId ? null : msgId);
    if (activeReactionId && activeReactionId !== msgId) {
      setActiveReactionId(null);
    }
  };

  const typingArr = Object.values(typingUsers);
  const totalUsersCount = onlineUsersList.length;
  const otherUsersCount = Math.max(0, totalUsersCount - 1);

  return (
    <div className="app-container">
      <StyleSheet />
      <Toaster />

      {/* Initial Chat loading overlay */}
      {loadingHistory && (
        <div className="loading-overlay">
          <div className="loader-box">
            <div className="spinner large" />
            <div style={{ marginTop: 12, color: "var(--text-sub)" }}>Loading chats...</div>
          </div>
        </div>
      )}

      {/* USER LIST MODAL */}
      {showUserListModal && (
        <div className="modal-backdrop" onClick={() => setShowUserListModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Online Users ({totalUsersCount})</h3>
              <button className="close-modal-btn" onClick={() => setShowUserListModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {onlineUsersList.map(user => {
                const isMe = user.socketId === socketRef.current?.id;
                return (
                  <div key={user.socketId} className={`user-list-item ${isMe ? 'is-me' : ''}`}>
                    <div className="user-info-row">
                      <div className="user-avatar-wrapper">
                        <img
                          src={`https://api.dicebear.com/7.x/notionists/svg?seed=${user.displayName}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                          alt="avatar"
                          className="user-list-avatar"
                        />
                        <span className="user-online-dot"></span>
                      </div>
                      <span className="user-list-name">
                        {user.displayName} {isMe && <span className="me-tag">(You)</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="chat-card">
        {/* HEADER */}
        <div className="chat-header">
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text-main)" }}>Public Lounge</h2>
            <div
              className="status-clickable"
              onClick={() => setShowUserListModal(true)}
              title="Click to see who is online"
            >
              <span className={`status-dot ${connected ? "online" : "offline"}`} />
              <span style={{ marginRight: 4 }}>
                {connected ? `${otherUsersCount} others online` : "Connecting..."}
              </span>
              {connected && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><polyline points="6 9 12 15 18 9"></polyline></svg>
              )}
            </div>
          </div>

          <div className="header-controls">
            <button className="icon-btn" onClick={toggleMute}>
              {isMuted ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
              )}
            </button>

            <div style={{ position: 'relative' }}>
              <img
                src={`https://api.dicebear.com/7.x/notionists/svg?seed=${username}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
                alt="My Avatar"
                className="avatar"
                onClick={() => setShowMenu(!showMenu)}
                style={{ cursor: "pointer", border: showMenu ? "2px solid #ef4444" : "2px solid var(--chat-bg)", boxShadow: '0 0 0 2px var(--border)' }}
              />

              {showMenu && (
                <div className="dropdown-menu">
                  <div className="menu-item danger" onClick={onLogout}>
                    <span style={{ fontSize: 16 }}>↪</span>
                    <span>Logout</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MESSAGES */}
        <div
          className="messages-area"
          ref={messagesContainerRef}
          onScroll={handleScroll}
          onClick={() => {
            setShowMenu(false);
            setActiveReactionId(null);
            setSelectedMsgId(null);
          }}
        >
          {/* LOAD MORE SPINNER */}
          {isLoadingMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                  <div className="spinner small" style={{ borderColor: 'var(--text-sub)', borderTopColor: 'var(--primary)' }}></div>
              </div>
          )}

          {messageList.length === 0 && !loadingHistory && (
            <div style={{ textAlign: "center", marginTop: 40, color: "var(--text-sub)", fontSize: 14 }}>
              Welcome, {username}! Say Hi! 👋
            </div>
          )}

          {messageList.map((msg) => {
            const isMine = msg.socketId === socketRef.current?.id || msg.displayName === username;
            const seed = msg.displayName || msg.socketId;
            const avatarUrl = msg.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
            const isPending = pendingRef.current.has(msg.id) || msg._localPreview;
            const showPicker = activeReactionId === msg.id;
            const showActions = selectedMsgId === msg.id;

            return (
              <div key={msg.id} className={`message-group ${isMine ? "mine" : "other"}`}>
                {!isMine && <img src={avatarUrl} className="avatar" alt="User avatar" />}

                <div
                  className={`bubble ${isPending ? "pending" : ""}`}
                  onClick={(e) => handleMessageClick(e, msg.id)}
                  style={{ cursor: "pointer", position: "relative" }}
                >

                  {isPending && (
                    <div className="pending-badge">
                      <div className="spinner" />
                    </div>
                  )}

                  {msg.replyTo && (
                    <div className="reply-quote-in-bubble">
                      <span className="reply-to-name">{msg.replyTo.displayName}</span>
                      <div className="reply-to-text">{msg.replyTo.message}</div>
                    </div>
                  )}

                  <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.9em' }}>
                    {isMine ? "You" : (msg.displayName || "Anon")}
                  </div>

                  <div>{renderMessageWithLinks(msg.message)}</div>

                  {msg.images && msg.images.length > 0 && (
                    <div className="images-grid" onClick={(e) => e.stopPropagation()}>
                      {msg.images.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative' }}>
                          <img
                            src={img.url}
                            alt={`img-${idx}`}
                            className="inline-image"
                            onClick={() => window.open(img.url, "_blank")}
                            onLoad={handleImageLoad}
                          />
                          {(msg._localPreview || img.local || msg.loading) && (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(2,6,23,0.45)', borderRadius: 10 }}>
                              <div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="meta">{formatTime(msg.time)}</div>

                  <div className={`action-btns-group ${showActions ? "visible" : ""}`}>
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
                        if (!userIds || userIds.length === 0) return null;
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
        <div style={{ background: 'var(--chat-bg)', borderTop: '1px solid var(--border)', transition: 'background 0.3s' }}>
          {replyingTo && (
            <div className="reply-preview-bar">
              <div className="reply-info">
                <span className="reply-title">Replying to {replyingTo.displayName}</span>
                {/* --- FIX: Display "📷 Photo" if message is empty but has images --- */}
                <span className="reply-subtitle">
                    {replyingTo.message || (replyingTo.images && replyingTo.images.length > 0 ? "📷 Photo" : "")}
                </span>
              </div>
              <button className="close-reply-btn" onClick={() => setReplyingTo(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          )}

          <div className="input-area">
            <input
              type="file"
              accept="image/*"
              multiple
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFilesSelected}
            />

            <button className="icon-btn attach-btn" onClick={handleAttachClick} title="Attach images">
              {isUploading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div className="spinner small" />
                </div>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="3"></circle></svg>
              )}
            </button>

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

// --- STYLES (STRICTLY DARK MODE) ---
const StyleSheet = () => (
  <style>{`
    /* --- CSS VARIABLES FOR DARK MODE ONLY --- */
    :root {
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
      --modal-overlay: rgba(0, 0, 0, 0.7);
      --modal-bg: #1e293b;
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

    /* Loading overlay */
    .loading-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(2,6,23,0.6);
      z-index: 1100;
    }
    .loader-box {
      background: rgba(17,24,39,0.9);
      padding: 18px 28px;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.04);
      display: flex;
      flex-direction: column;
      align-items: center;
      box-shadow: 0 10px 30px rgba(2,6,23,0.6);
    }
    .spinner {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.08);
      border-top-color: var(--primary);
      animation: spin 0.9s linear infinite;
    }
    .spinner.small { width: 16px; height: 16px; border-width: 2px; }
    .spinner.large { width: 36px; height: 36px; border-width: 3px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* pending badge overlay in bubble */
    .pending-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.25);
      border-radius: 50%;
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255,255,255,0.04);
      z-index: 40;
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
    .shake-anim { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
    @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
    @media (max-width: 600px) { .glass-card { margin: 20px; padding: 30px 20px; } .welcome-title { font-size: 24px; } }

    /* --- CHAT STYLES --- */
    .chat-header { padding:16px 20px; background: var(--dropdown-bg); backdrop-filter: blur(10px); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; z-index:10; transition: background 0.3s, border-color 0.3s; }
    .header-controls { display: flex; align-items: center; gap: 12px; }
    .icon-btn { background: transparent; border: none; cursor: pointer; color: var(--text-sub); padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background 0.2s, color 0.2s; }
    .icon-btn:hover { background: var(--bg); color: var(--text-main); }
    .status-clickable { cursor: pointer; display: flex; align-items: center; font-size: 12px; color: var(--text-sub); margin-top: 2px; transition: color 0.2s; user-select: none; }
    .status-clickable:hover { color: var(--primary); }
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
    .bubble.pending { opacity:0.9; filter: brightness(0.98); }

    /* --- ACTION BUTTONS (REPLY & REACT) --- */
    .action-btns-group {
      position: absolute; top: -12px; right: -5px;
      display: flex; gap: 4px;
      opacity: 0;
      pointer-events: none; /* Prevent clicking when invisible */
      transition: opacity 0.2s;
      z-index: 5;
    }

    .action-btns-group.visible {
      opacity: 1;
      pointer-events: auto;
    }

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

    /* Attach button style */
    .attach-btn { width:46px; height:46px; border-radius:50%; background: transparent; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; cursor:pointer; }
    .attach-btn:hover { background: rgba(255,255,255,0.02); }

    /* Inline images grid */
    .images-grid { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
    .inline-image { width: 120px; height: 90px; object-fit: cover; border-radius: 10px; border: 1px solid var(--border); cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.4); }

    /* --- DROPDOWN MENU STYLES --- */
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
    .menu-item.danger { color: #ef4444; }
    .menu-item.danger:hover { background: rgba(239, 68, 68, 0.1); }

    @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes slideIn { from { opacity:0; transform:translateY(10px);} to { opacity:1; transform:translateY(0);} }
    @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

    /* --- NEW: USER LIST MODAL CSS --- */
    .modal-backdrop {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: var(--modal-overlay);
      backdrop-filter: blur(3px);
      display: flex; justify-content: center; align-items: center;
      z-index: 999;
      animation: fadeIn 0.2s ease-out;
    }

    .modal-content {
      background: var(--modal-bg);
      width: 100%; max-width: 400px; max-height: 80vh;
      border-radius: 20px;
      border: 1px solid var(--border);
      box-shadow: 0 20px 40px var(--shadow-color);
      display: flex; flex-direction: column;
      overflow: hidden;
      animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(255, 255, 255, 0.03);
    }
    .modal-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-main); }
    .close-modal-btn {
      background: none; border: none; cursor: pointer; color: var(--text-sub);
      font-size: 18px; padding: 4px; border-radius: 50%;
      transition: all 0.2s; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;
    }
    .close-modal-btn:hover { background: rgba(255,255,255,0.1); color: var(--text-main); }

    .modal-body {
      padding: 10px;
      overflow-y: auto;
    }

    .user-list-item {
      padding: 10px;
      margin-bottom: 4px;
      border-radius: 12px;
      transition: background 0.2s;
    }
    .user-list-item:hover { background: rgba(255,255,255,0.05); }
    .user-list-item.is-me { background: rgba(79, 70, 229, 0.15); border: 1px solid rgba(79, 70, 229, 0.3); }

    .user-info-row { display: flex; align-items: center; gap: 12px; }

    .user-avatar-wrapper { position: relative; width: 36px; height: 36px; }
    .user-list-avatar { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid var(--bg); }
    .user-online-dot {
      position: absolute; bottom: 0; right: 0; width: 10px; height: 10px;
      background: #22c55e; border-radius: 50%; border: 2px solid var(--modal-bg);
    }

    .user-list-name { font-size: 14px; font-weight: 500; color: var(--text-main); }
    .me-tag { margin-left: 6px; font-size: 11px; color: var(--primary); font-weight: 700; background: rgba(79, 70, 229, 0.2); padding: 2px 6px; border-radius: 6px; }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes scaleUp { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }

    @media (max-width: 600px) {
      .app-container { padding: 0; height: 100dvh; }
      .chat-card { height: 100%; max-width: 100%; border-radius: 0; box-shadow: none; border: none; }
      .avatar { width: 32px; height: 32px; }
      .bubble { max-width: 85%; font-size: 15px; }
      .chat-header h2 { font-size: 16px; }
      .action-btn { width: 30px; height: 30px; font-size: 16px; }
      .reaction-picker-popup { grid-template-columns: repeat(3, 1fr); width: 140px; top: -90px; }
      .reply-subtitle { max-width: 250px; }
      .modal-content { max-width: 90%; max-height: 70vh; }
    }
  `}</style>
);