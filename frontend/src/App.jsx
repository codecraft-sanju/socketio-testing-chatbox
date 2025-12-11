// frontend/src/App.jsx
import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";

const socket = io("https://socketio-testing-chatbox.onrender.com");

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function App() {
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [connected, setConnected] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageList]);

  useEffect(() => {
    socket.on("connect", () => {
      setConnected(true);
      console.log("Connected:", socket.id);
    });    

    socket.on("disconnect", () => {
      setConnected(false);
      console.log("Disconnected");
    });

    socket.on("receive_message", (data) => {
      // dedupe by id: agar woh id already list me hai toh ignore kar do
      setMessageList((prev) => {
        const exists = prev.some((m) => m.id && data.id && m.id === data.id);
        if (exists) return prev;
        return [...prev, data];
      });
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("receive_message");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = () => {
    const text = message.trim();
    if (!text) return;

    const now = new Date();
    const time =
      now.getHours().toString().padStart(2, "0") +
      ":" +
      now.getMinutes().toString().padStart(2, "0");

    const messageData = {
      id: generateId(),     // unique id for dedupe
      message: text,
      time,
      socketId: socket.id,
    };

    // optimistic add (snappy UX) — it's fine because receive_message will be deduped by id
    setMessageList((prev) => [...prev, messageData]);
    setMessage("");
    socket.emit("send_message", messageData);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") sendMessage();
  };

  return (
    <div style={{ fontFamily: "Inter, Arial, sans-serif", display: "flex", justifyContent: "center", padding: 30 }}>
      <div style={{
        width: 520,
        borderRadius: 12,
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ padding: "16px 20px", background: "#0f172a", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>TrimGo Live Chat</h3>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Socket.io test room</div>
          </div>
          <div style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: 10,
              background: connected ? "#22c55e" : "#ef4444",
              boxShadow: connected ? "0 0 8px rgba(34,197,94,0.3)" : "0 0 8px rgba(239,68,68,0.25)"
            }} />
            <div style={{ opacity: 0.9 }}>{connected ? "Connected" : "Disconnected"}</div>
          </div>
        </div>

        <div style={{ padding: 16, background: "#f8fafc", minHeight: 400, maxHeight: 400, overflowY: "auto" }}>
          {messageList.map((msg, idx) => {
            const isMine = msg.socketId === socket.id;
            return (
              <div key={msg.id ?? idx} style={{ display: "flex", marginBottom: 12, justifyContent: isMine ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "78%",
                  background: isMine ? "#0ea5e9" : "#e6eef8",
                  color: isMine ? "white" : "#0b3148",
                  padding: "10px 14px",
                  borderRadius: 14,
                  borderTopRightRadius: isMine ? 4 : 14,
                  borderTopLeftRadius: isMine ? 14 : 4,
                  boxShadow: "0 2px 6px rgba(2,6,23,0.06)",
                  wordBreak: "break-word",
                }}>
                  <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.9, fontWeight: 600 }}>
                    {isMine ? "Sender" : "Receiver"}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.4 }}>{msg.message}</div>
                  <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8, textAlign: "right" }}>{msg.time}</div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: 12, display: "flex", gap: 10, alignItems: "center", background: "white" }}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Message likho..."
            style={{
              flex: 1,
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #e6eef8",
              outline: "none",
              fontSize: 14
            }}
          />
          <button
            onClick={sendMessage}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              background: "#0ea5e9",
              color: "white",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
