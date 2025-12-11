// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(express.json());

// Adjust origin
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

  // --- REACTION TOGGLE LOGIC ---
  socket.on("message_reaction", ({ messageId, emoji }) => {
    const msg = messageHistory.find(m => m.id === messageId);
    if (msg) {
        if (!msg.reactions) msg.reactions = {};

        // 1. Find if user already reacted with something
        let previousEmoji = null;
        Object.keys(msg.reactions).forEach(key => {
            if (msg.reactions[key].includes(socket.id)) {
                previousEmoji = key;
            }
        });

        // 2. Remove the previous reaction (Always step 1)
        if (previousEmoji) {
             const idx = msg.reactions[previousEmoji].indexOf(socket.id);
             msg.reactions[previousEmoji].splice(idx, 1);
             // Cleanup empty key
             if (msg.reactions[previousEmoji].length === 0) {
                 delete msg.reactions[previousEmoji];
             }
        }

        // 3. Add new reaction ONLY if it is DIFFERENT from previous
        // (If previousEmoji === emoji, we just removed it above and we stop there -> Toggle OFF)
        if (previousEmoji !== emoji) {
             if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
             msg.reactions[emoji].push(socket.id);
        }

        // 4. Broadcast
        io.emit("reaction_updated", { id: messageId, reactions: msg.reactions });
    }
  });

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
        reactions: {} 
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