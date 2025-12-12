// backend/server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/chat-app")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// --- MONGOOSE SCHEMA ---
const messageSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  message: String,
  time: String,
  socketId: String,
  displayName: String,
  avatar: String,
  replyTo: { type: Object, default: null },
  reactions: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

// --- SERVER SETUP ---
const CLIENT_URL ="https://socketio-testing-chatbox.vercel.app";

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
  res.send({ status: "Active", clients: io.engine.clientsCount, db: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected" });
});

// STATE
const connectedSockets = new Set();
const messageIds = new Set(); 

// --- UPDATED FUNCTION: Broadcast Full User List ---
async function broadcastOnlineUsers() {
  // Fetch all connected sockets to get their data
  const sockets = await io.fetchSockets();
  
  // Map them to a clean array of objects
  const usersList = sockets.map(s => ({
    socketId: s.id,
    displayName: s.data.displayName || `User-${s.id.slice(0,5)}`
  }));

  // Emit the list to everyone
  io.emit("online_users", usersList);
}

io.on("connection", async (socket) => {
  console.log(`[+] User Joined: ${socket.id}`);
  connectedSockets.add(socket.id);

  socket.data.displayName = `User-${socket.id.slice(0,5)}`;

  // --- 1. LOAD HISTORY FROM DB ---
  try {
    const history = await Message.find().sort({ createdAt: -1 }).limit(50);
    socket.emit("history", history.reverse());
    history.forEach(m => messageIds.add(m.id));
  } catch (err) {
    console.error("Error loading history:", err);
  }

  // Initial Broadcast
  broadcastOnlineUsers();

  // --- HANDLE IDENTIFY ---
  socket.on("identify", (payload) => {
    const name = payload?.displayName || `User-${socket.id.slice(0,5)}`;
    socket.data.displayName = name;
    socket.broadcast.emit("user_joined", { displayName: name });
    
    // Update list whenever someone identifies with a new name
    broadcastOnlineUsers();
  });

  // --- REACTION TOGGLE LOGIC ---
  socket.on("message_reaction", async ({ messageId, emoji }) => {
    try {
      const msg = await Message.findOne({ id: messageId });
      if (msg) {
        let reactions = { ...msg.reactions }; 
        if (!reactions) reactions = {};

        let previousEmoji = null;
        Object.keys(reactions).forEach(key => {
          if (reactions[key].includes(socket.id)) {
            previousEmoji = key;
          }
        });

        let changed = false;

        if (previousEmoji) {
           const idx = reactions[previousEmoji].indexOf(socket.id);
           if (idx > -1) {
             reactions[previousEmoji].splice(idx, 1);
             if (reactions[previousEmoji].length === 0) {
               delete reactions[previousEmoji];
             }
             changed = true;
           }
        }

        if (previousEmoji !== emoji) {
           if (!reactions[emoji]) reactions[emoji] = [];
           reactions[emoji].push(socket.id);
           changed = true;
        }

        if (changed) {
          msg.reactions = reactions;
          msg.markModified('reactions'); 
          await msg.save();
          io.emit("reaction_updated", { id: messageId, reactions: msg.reactions });
        }
      }
    } catch (e) {
      console.error("Reaction error:", e);
    }
  });

  // --- SEND MESSAGE ---
  socket.on("send_message", async (data, ack) => {
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

      const msgData = {
        id: data.id,
        message: data.message,
        time: data.time || new Date().toISOString(),
        socketId: data.socketId || socket.id,
        displayName: data.displayName || socket.data.displayName || `User-${socket.id.slice(0,5)}`,
        avatar: data.avatar || null,
        reactions: {},
        replyTo: data.replyTo || null 
      };

      const newMsg = new Message(msgData);
      await newMsg.save();
      messageIds.add(msgData.id);

      io.emit("receive_message", msgData);
      if (ack) ack({ ok: true, id: msgData.id });

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

  // --- HANDLE DISCONNECT ---
  socket.on("disconnect", (reason) => {
    console.log(`[-] User Left: ${socket.id} (${reason})`);
    connectedSockets.delete(socket.id);
    
    socket.broadcast.emit("user_typing", { socketId: socket.id, typing: false });
    // Update user list on disconnect
    broadcastOnlineUsers();
    socket.broadcast.emit("user_left", { displayName: socket.data.displayName });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});