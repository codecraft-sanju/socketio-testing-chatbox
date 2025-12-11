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

app.get("/", (req, res) => {
  res.send({ status: "Active", clients: io.engine.clientsCount });
});

// STATE
const connectedSockets = new Set();
const messageHistory = []; 
const messageIds = new Set(); 

function broadcastUserCounts() {
  io.emit("users_count", { total: connectedSockets.size });
}

io.on("connection", (socket) => {
  console.log(`[+] User Joined: ${socket.id}`);
  connectedSockets.add(socket.id);

  socket.emit("history", messageHistory);
  broadcastUserCounts();

  socket.on("identify", (payload) => {
    socket.data.displayName = payload?.displayName || `User-${socket.id.slice(0,5)}`;
  });

  // --- HANDLE REACTION ---
  socket.on("message_reaction", ({ messageId, emoji }) => {
    // Find the message
    const msg = messageHistory.find(m => m.id === messageId);
    if (msg) {
        // Init reactions object if missing
        if (!msg.reactions) msg.reactions = {};
        
        // Init array for specific emoji if missing
        if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
        
        const users = msg.reactions[emoji];
        const userIndex = users.indexOf(socket.id);

        // Toggle logic: If user already reacted, remove it. Else add it.
        if (userIndex === -1) {
            users.push(socket.id);
        } else {
            users.splice(userIndex, 1);
        }

        // Cleanup empty emoji keys to keep it clean
        if (users.length === 0) {
            delete msg.reactions[emoji];
        }

        // Broadcast updated reactions for this message to everyone
        io.emit("reaction_updated", { id: messageId, reactions: msg.reactions });
    }
  });
  // -----------------------

  socket.on("send_message", (data, ack) => {
    try {
      if (!data || !data.message) {
        if (ack) ack({ ok: false, error: "invalid_payload" });
        return;
      }
      if (!data.id) data.id = Date.now().toString();

      if (messageIds.has(data.id)) {
        if (ack) ack({ ok: true, id: data.id });
        io.emit("receive_message", data);
        return;
      }

      const msg = {
        id: data.id,
        message: data.message,
        time: data.time || new Date().toISOString(),
        socketId: data.socketId || socket.id,
        displayName: data.displayName || socket.data.displayName || `User-${socket.id.slice(0,5)}`,
        avatar: data.avatar || null,
        reactions: {} // New messages start with empty reactions
      };

      messageHistory.push(msg);
      messageIds.add(msg.id);
      
      if (messageHistory.length > 50) {
        const removed = messageHistory.shift();
        if (removed && removed.id) messageIds.delete(removed.id);
      }

      io.emit("receive_message", msg);

      if (ack) ack({ ok: true, id: msg.id });
    } catch (e) {
      console.error("send_message error:", e);
      if (ack) ack({ ok: false, error: "server_error" });
    }
  });

  socket.on("typing", (payload) => {
    const displayName = payload?.displayName || socket.data.displayName || `User-${socket.id.slice(0,5)}`;
    socket.broadcast.emit("user_typing", {
      socketId: socket.id,
      typing: !!payload?.typing,
      displayName,
    });
  });

  socket.on("disconnect", (reason) => {
    console.log(`[-] User Left: ${socket.id} (${reason})`);
    connectedSockets.delete(socket.id);
    socket.broadcast.emit("user_typing", { socketId: socket.id, typing: false });
    broadcastUserCounts();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});