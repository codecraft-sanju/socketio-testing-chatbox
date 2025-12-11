import React, { useEffect, useRef, useState } from "react";
import { io as ioClient } from "socket.io-client";

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatTime(date = new Date()) {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export default function App() {
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState({}); // { socketId: { displayName?, ts } }
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  // Scroll to latest
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageList, typingUsers]);

  useEffect(() => {
    // FIXED BACKEND URL
    const SOCKET_URL = "https://socketio-testing-chatbox.onrender.com";

    const socket = ioClient(SOCKET_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected:", socket.id);
      setConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected");
      setConnected(false);
      setTypingUsers({}); // clear typing on disconnect
    });

    socket.on("receive_message", (data) => {
      setMessageList((prev) => {
        if (!data?.id) data.id = generateId();
        const exists = prev.some((m) => m.id === data.id);
        if (exists) return prev;
        return [...prev, data];
      });
      console.log("Received:", data);
    });

    // HANDLE TYPING EVENTS FROM OTHERS
    socket.on("user_typing", (data) => {
      // data: { socketId, typing, displayName?, ts }
      if (!data || !data.socketId) return;
      // ignore own typing events if any
      if (data.socketId === socketRef.current?.id) return;

      setTypingUsers((prev) => {
        const next = { ...prev };
        if (data.typing) {
          next[data.socketId] = { displayName: data.displayName, ts: data.ts || Date.now() };
        } else {
          delete next[data.socketId];
        }
        return next;
      });
    });

    socket.on("connect_error", (err) => console.error("connect_error:", err));
    socket.on("error", (err) => console.error("socket error:", err));

    return () => {
      socket.disconnect();
      console.log("Socket cleaned up");
    };
  }, []);

  // TYPING EMIT LOGIC (debounced)
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  const emitTyping = (typing) => {
    const socket = socketRef.current;
    if (!socket || socket.connected === false) return;
    // include displayName if you want to show name on other side
    socket.emit("typing", { typing, displayName: "Sender" });
  };

  const startTyping = () => {
    if (isTypingRef.current) {
      // reset stop timeout only
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        emitTyping(false);
      }, 1100);
      return;
    }

    // emit typing true
    isTypingRef.current = true;
    emitTyping(true);

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      emitTyping(false);
    }, 1100); // 1.1s of idle -> stop typing
  };

  const sendMessage = () => {
    const text = message.trim();
    if (!text) return;

    const messageData = {
      id: generateId(),
      message: text,
      time: formatTime(),
      socketId: socketRef.current?.id,
    };

    // Optimistic UI
    setMessageList((prev) => [...prev, messageData]);
    setMessage("");

    // if user was typing, emit stop
    if (isTypingRef.current) {
      isTypingRef.current = false;
      clearTimeout(typingTimeoutRef.current);
      emitTyping(false);
    }

    socketRef.current.emit("send_message", messageData, (ack) => {
      if (!ack?.ok) console.error("Message failed:", ack);
      else console.log("Delivered:", ack.id);
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      sendMessage();
    } else {
      // any other key -> user is typing
      startTyping();
    }
  };

  // compute a friendly typing message
  const typingNames = Object.values(typingUsers)
    .map((u) => (u.displayName ? u.displayName : "Someone"))
    .slice(0, 3); // cap to 3 names

  const typingText = typingNames.length === 0
    ? ""
    : typingNames.length === 1
      ? `${typingNames[0]} typing...`
      : typingNames.length === 2
        ? `${typingNames[0]} and ${typingNames[1]} typing...`
        : `${typingNames[0]}, ${typingNames[1]} and others typing...`;

  return (
    <div style={{ fontFamily: "Inter, Arial", display: "flex", justifyContent: "center", padding: 30 }}>
      <div style={{
        width: 520,
        borderRadius: 12,
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{
          padding: "16px 20px",
          background: "#0f172a",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
        }}>
          <div>
            <h3 style={{ margin: 0 }}>TrimGo Live Chat</h3>
            <span style={{ fontSize: 12, opacity: 0.75 }}>Socket.io test room</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: connected ? "#22c55e" : "#ef4444"
            }} />
            <span>{connected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>

        <div style={{ padding: 16, background: "#f8fafc", minHeight: 400, maxHeight: 400, overflowY: "auto" }}>
          {messageList.map((msg) => {
            const isMine = msg.socketId === socketRef.current?.id;
            return (
              <div key={msg.id} style={{
                display: "flex",
                justifyContent: isMine ? "flex-end" : "flex-start",
                marginBottom: 12,
              }}>
                <div style={{
                  maxWidth: "78%",
                  background: isMine ? "#0ea5e9" : "#e6eef8",
                  color: isMine ? "white" : "#0b3148",
                  padding: "10px 14px",
                  borderRadius: 14,
                }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                    {isMine ? "Sender" : "Receiver"}
                  </div>
                  <div>{msg.message}</div>
                  <div style={{ fontSize: 11, textAlign: "right", opacity: 0.7 }}>{msg.time}</div>
                </div>
              </div>
            );
          })}

          {/* TYPING INDICATOR */}
          {typingText && (
            <div style={{ marginTop: 6, marginBottom: 6, fontSize: 13, color: "#334155", opacity: 0.9 }}>
              <em>{typingText}</em>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: 12, display: "flex", gap: 10, background: "white" }}>
          <input
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              startTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message likho..."
            style={{
              flex: 1,
              padding: "12px 14px",
              border: "1px solid #e6eef8",
              borderRadius: 10,
            }}
          />
          <button
            onClick={sendMessage}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              background: "#0ea5e9",
              border: "none",
              color: "white",
              fontWeight: 600,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
