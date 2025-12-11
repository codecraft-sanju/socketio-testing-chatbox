// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(express.json());

const CLIENT_URL = process.env.CLIENT_URL || "https://socketio-testing-chatbox.vercel.app";

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin === CLIENT_URL || process.env.ALLOW_ALL_ORIGINS === "true") return callback(null, true);
    return callback(null, true);
  },
  methods: ["GET", "POST"],
}));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

// Simple health route
app.get("/", (req, res) => {
  res.send({ status: "Active", clients: io.engine.clientsCount });
});

// STATE
const connectedSockets = new Set();
const messageHistory = []; // array of messages, last 50
const messageIds = new Set(); // dedupe by id

function broadcastUserCounts() {
  io.emit("users_count", { total: connectedSockets.size });
}

io.on("connection", (socket) => {
  console.log(`[+] User Joined: ${socket.id}`);
  connectedSockets.add(socket.id);

  // Send history immediately
  socket.emit("history", messageHistory);

  // broadcast user counts
  broadcastUserCounts();

  // identify: client can send { displayName?, clientId? }
  socket.on("identify", (payload) => {
    socket.data.displayName = payload?.displayName || `User-${socket.id.slice(0,5)}`;
    // store clientId on socket so server can fallback if messages don't include it
    if (payload?.clientId) socket.data.clientId = payload.clientId;
  });

  // handle incoming messages
  socket.on("send_message", (data, ack) => {
    try {
      if (!data || !data.message) {
        if (ack) ack({ ok: false, error: "invalid_payload" });
        return;
      }
      if (!data.id) data.id = Date.now().toString();

      // dedupe by id
      if (messageIds.has(data.id)) {
        if (ack) ack({ ok: true, id: data.id });
        // still broadcast (safe)
        io.emit("receive_message", data);
        return;
      }

      // choose clientId: prefer data.clientId, then socket.data.clientId, else socket.id
      const clientId = data.clientId || socket.data.clientId || socket.id;

      const msg = {
        id: data.id,
        message: data.message,
        time: data.time || new Date().toISOString(),
        socketId: socket.id, // store current socket that delivered (useful but not for "isMine")
        clientId, // persistent id to identify sender across reconnects
        displayName: data.displayName || socket.data.displayName || `User-${socket.id.slice(0,5)}`,
        avatar: data.avatar || null,
      };

      // store
      messageHistory.push(msg);
      messageIds.add(msg.id);
      if (messageHistory.length > 50) {
        const removed = messageHistory.shift();
        if (removed && removed.id) messageIds.delete(removed.id);
      }

      // broadcast to everyone (includes sender)
      io.emit("receive_message", msg);

      if (ack) ack({ ok: true, id: msg.id });
    } catch (e) {
      console.error("send_message error:", e);
      if (ack) ack({ ok: false, error: "server_error" });
    }
  });

  // typing
  socket.on("typing", (payload) => {
    const displayName = payload?.displayName || socket.data.displayName || `User-${socket.id.slice(0,5)}`;
    const clientId = payload?.clientId || socket.data.clientId || socket.id;
    // broadcast typing with both socketId and clientId + displayName
    socket.broadcast.emit("user_typing", {
      socketId: socket.id,
      clientId,
      typing: !!payload?.typing,
      displayName,
    });
  });

  // disconnect
  socket.on("disconnect", (reason) => {
    console.log(`[-] User Left: ${socket.id} (${reason})`);
    connectedSockets.delete(socket.id);
    // ensure typing cleared
    socket.broadcast.emit("user_typing", { socketId: socket.id, typing: false });
    broadcastUserCounts();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});
