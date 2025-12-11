// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config(); // Ensure you have installed 'dotenv'

const app = express();
app.use(express.json());

// CONFIG
const PORT = process.env.PORT || 3001;
// In production, set CLIENT_URL to your frontend domain (e.g., "https://myapp.vercel.app")
const CLIENT_URL = "https://socketio-testing-chatbox.vercel.app"; 

app.use(cors({
  origin: CLIENT_URL, 
  methods: ["GET", "POST"],
  credentials: true
}));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
  },
  connectionStateRecovery: {
    // Helps recover state if connection is briefly lost
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

// --- STATE MANAGEMENT (In-Memory) ---
const MAX_HISTORY = 50;
const messageHistory = []; 
const messageIds = new Set();
const connectedSockets = new Map(); // Map<socketId, { displayName, ... }>

// --- ROUTES ---
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    clients: io.engine.clientsCount, 
    uptime: process.uptime() 
  });
});

// --- SOCKET LOGIC ---
io.on("connection", (socket) => {
  // 1. Initialize User
  const defaultName = `User-${socket.id.slice(0, 4)}`;
  connectedSockets.set(socket.id, { displayName: defaultName });
  
  // Broadcast user count update
  io.emit("users_count", { total: connectedSockets.size });

  // Send existing history to the NEW user only
  socket.emit("history", messageHistory);

  // 2. Handle Identification (Name Change)
  socket.on("identify", ({ displayName }) => {
    if (displayName && displayName.trim().length < 20) {
      const userData = connectedSockets.get(socket.id) || {};
      userData.displayName = displayName;
      connectedSockets.set(socket.id, userData);
    }
  });

  // 3. Handle Messaging
  socket.on("send_message", (data, ack) => {
    try {
      // Basic Validation
      if (!data || !data.message || typeof data.message !== 'string') return;
      if (data.message.length > 500) { // Limit message length
        if (ack) ack({ ok: false, error: "Message too long" });
        return;
      }

      const msgId = data.id || Date.now().toString();

      // Deduplication
      if (messageIds.has(msgId)) {
        if (ack) ack({ ok: true, id: msgId });
        return;
      }

      const senderData = connectedSockets.get(socket.id);
      const cleanMessage = {
        id: msgId,
        message: data.message.trim(), // simple sanitization
        time: new Date().toISOString(),
        socketId: socket.id,
        displayName: senderData?.displayName || defaultName,
        avatar: `https://api.dicebear.com/7.x/notionists/svg?seed=${socket.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`
      };

      // Update State
      messageHistory.push(cleanMessage);
      messageIds.add(msgId);
      
      if (messageHistory.length > MAX_HISTORY) {
        const removed = messageHistory.shift();
        messageIds.delete(removed.id);
      }

      // Broadcast to ALL clients
      io.emit("receive_message", cleanMessage);
      
      if (ack) ack({ ok: true, id: msgId });

    } catch (err) {
      console.error("Message Error:", err);
    }
  });

  // 4. Handle Typing
  socket.on("typing", (isTyping) => {
    const userData = connectedSockets.get(socket.id);
    socket.broadcast.emit("user_typing", {
      socketId: socket.id,
      typing: !!isTyping,
      displayName: userData?.displayName || defaultName
    });
  });

  // 5. Disconnect
  socket.on("disconnect", () => {
    connectedSockets.delete(socket.id);
    io.emit("users_count", { total: connectedSockets.size });
    socket.broadcast.emit("user_typing", { socketId: socket.id, typing: false });
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});