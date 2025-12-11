// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
// allow json if needed later
app.use(express.json());

// For dev/testing: allow any origin OR set to your frontend origin
const CLIENT_URL = process.env.CLIENT_URL || "https://socketio-testing-chatbox.vercel.app";

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl, mobile apps)
    if (!origin) return callback(null, true);
    // allow the configured client or allow all for easier testing
    if (origin === CLIENT_URL || process.env.ALLOW_ALL_ORIGINS === "true") return callback(null, true);
    // otherwise block (change as necessary)
    return callback(null, true); // <-- change to callback(new Error('Not allowed')) to be strict
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

  // Send history immediately (best-effort)
  socket.emit("history", messageHistory);

  // broadcast user counts
  broadcastUserCounts();

  // optional identify (store displayName for typing broadcasts)
  socket.on("identify", (payload) => {
    socket.data.displayName = payload?.displayName || `User-${socket.id.slice(0,5)}`;
  });

  // handle incoming messages
  socket.on("send_message", (data, ack) => {
    try {
      if (!data || !data.message) {
        if (ack) ack({ ok: false, error: "invalid_payload" });
        return;
      }
      if (!data.id) data.id = Date.now().toString();

      // dedupe
      if (messageIds.has(data.id)) {
        if (ack) ack({ ok: true, id: data.id });
        // still broadcast so late joiners get it (but avoid double-storing)
        io.emit("receive_message", data);
        return;
      }

      // normalize minimal fields
      const msg = {
        id: data.id,
        message: data.message,
        time: data.time || new Date().toISOString(),
        socketId: data.socketId || socket.id,
        displayName: data.displayName || socket.data.displayName || `User-${socket.id.slice(0,5)}`,
        avatar: data.avatar || null,
      };

      // store
      messageHistory.push(msg);
      messageIds.add(msg.id);
      // keep size reasonable
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
    // payload: { typing: boolean, displayName? }
    const displayName = payload?.displayName || socket.data.displayName || `User-${socket.id.slice(0,5)}`;
    socket.broadcast.emit("user_typing", {
      socketId: socket.id,
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