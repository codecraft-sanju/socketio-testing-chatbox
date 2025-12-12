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
mongoose.connect("mongodb+srv://sanjaychoudhary01818_db_user:sanju098@cluster0.otatmnk.mongodb.net/?appName=Cluster0")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// --- MONGOOSE SCHEMA ---
const messageSchema = new mongoose.Schema({
  id: { type: String, unique: true }, // Custom ID from frontend
  message: String,
  time: String,
  socketId: String,
  displayName: String,
  avatar: String,
  replyTo: { type: Object, default: null }, // Stores the reply object
  reactions: { type: Object, default: {} }, // Flexible object for reactions { "emoji": ["user_id"] }
  createdAt: { type: Date, default: Date.now } // For sorting
});

const Message = mongoose.model("Message", messageSchema);


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
  res.send({ status: "Active", clients: io.engine.clientsCount, db: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected" });
});

// STATE (In-memory for active connections only)
const connectedSockets = new Set();
// Note: messageHistory array remove kar diya hai, ab DB use hoga.
const messageIds = new Set(); // To prevent duplicate rapid processing (optional cache)

function broadcastUserCounts() {
  io.emit("users_count", { total: connectedSockets.size });
}

io.on("connection", async (socket) => {
  console.log(`[+] User Joined: ${socket.id}`);
  connectedSockets.add(socket.id);

  socket.data.displayName = `User-${socket.id.slice(0,5)}`;

  // --- 1. LOAD HISTORY FROM DB ---
  try {
    // Last 50 messages fetch karein
    const history = await Message.find().sort({ createdAt: -1 }).limit(50);
    // Reverse taaki purane upar aur naye neeche dikhein
    socket.emit("history", history.reverse());
    
    // Sync local ID cache (optional optimization)
    history.forEach(m => messageIds.add(m.id));
  } catch (err) {
    console.error("Error loading history:", err);
  }

  broadcastUserCounts();

  // --- HANDLE IDENTIFY ---
  socket.on("identify", (payload) => {
    const name = payload?.displayName || `User-${socket.id.slice(0,5)}`;
    socket.data.displayName = name;
    socket.broadcast.emit("user_joined", { displayName: name });
  });

  // --- REACTION TOGGLE LOGIC (PERSISTED) ---
  socket.on("message_reaction", async ({ messageId, emoji }) => {
    try {
      // DB se message dhundho
      const msg = await Message.findOne({ id: messageId });
      
      if (msg) {
        // Mongoose Mixed type ke saath direct object modify karna tricky ho sakta hai
        // isliye hum object copy karke modify karenge
        let reactions = { ...msg.reactions }; 
        if (!reactions) reactions = {};

        // 1. Find if user already reacted
        let previousEmoji = null;
        Object.keys(reactions).forEach(key => {
          if (reactions[key].includes(socket.id)) {
            previousEmoji = key;
          }
        });

        let changed = false;

        // 2. Remove previous reaction
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

        // 3. Add new reaction (if different)
        if (previousEmoji !== emoji) {
           if (!reactions[emoji]) reactions[emoji] = [];
           reactions[emoji].push(socket.id);
           changed = true;
        }

        if (changed) {
          // Update DB
          // Note: markModified is crucial for Mixed types in Mongoose
          msg.reactions = reactions;
          msg.markModified('reactions'); 
          await msg.save();

          // Broadcast updated reactions
          io.emit("reaction_updated", { id: messageId, reactions: msg.reactions });
        }
      }
    } catch (e) {
      console.error("Reaction error:", e);
    }
  });

  // --- SEND MESSAGE (PERSISTED) ---
  socket.on("send_message", async (data, ack) => {
    try {
      if (!data || !data.message) {
        if (ack) ack({ ok: false, error: "invalid_payload" });
        return;
      }
      if (!data.id) data.id = Date.now().toString();

      // Duplicate check in memory (optional but good for safety)
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

      // SAVE TO DB
      const newMsg = new Message(msgData);
      await newMsg.save();

      // Update in-memory cache
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
    broadcastUserCounts();
    socket.broadcast.emit("user_left", { displayName: socket.data.displayName });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});


