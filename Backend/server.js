require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const streamifier = require("streamifier");
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(express.json());

// --- CLOUDINARY CONFIG ---
cloudinary.config({
  cloud_name: "dj7mqj1nv",
  api_key: "117674112654154",
  api_secret: "oldxiBt3QHm3RwIoCeGhfpWLdMk",
});

// Multer memory storage for direct streaming to Cloudinary
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit per file

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://sanjaychoudhary01818_db_user:sanju098@cluster0.otatmnk.mongodb.net/?appName=Cluster0")
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
  images: { type: Array, default: [] }, 
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

// --- SERVER SETUP ---
const CLIENT_URL = "https://socketio-testing-chatbox.vercel.app";

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

app.post("/upload-image", upload.array("images", 6), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, error: "no_files" });
    }

    // Only keep first 3 images (user asked max 3)
    const files = req.files.slice(0, 3);

    const uploadPromises = files.map(file => new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: process.env.CLOUDINARY_FOLDER || "chat_images", resource_type: "image" },
        (err, result) => {
          if (err) return reject(err);
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
          });
        }
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    }));

    const uploaded = await Promise.all(uploadPromises);

    return res.json({ ok: true, images: uploaded });
  } catch (e) {
    console.error("upload-image error:", e);
    return res.status(500).json({ ok: false, error: "upload_failed" });
  }
});

// STATE
const connectedSockets = new Set();

// --- FUNCTION: Broadcast Full User List ---
async function broadcastOnlineUsers() {
  const sockets = await io.fetchSockets();
  const usersList = sockets.map(s => ({
    socketId: s.id,
    displayName: s.data.displayName || `User-${s.id.slice(0, 5)}`
  }));
  io.emit("online_users", usersList);
}

io.on("connection", async (socket) => {
  console.log(`[+] User Joined: ${socket.id}`);
  connectedSockets.add(socket.id);

  socket.data.displayName = `User-${socket.id.slice(0, 5)}`;

  // --- 1. LOAD HISTORY FROM DB (UPDATED LIMIT: 30) ---
  try {
    // UPDATED: Changed limit(50) to limit(30) for faster loading
    const history = await Message.find().sort({ createdAt: -1 }).limit(30);
    socket.emit("history", history.reverse());
  } catch (err) {
    console.error("Error loading history:", err);
  }

  // Initial Broadcast
  broadcastOnlineUsers();

  // --- HANDLE IDENTIFY ---
  socket.on("identify", (payload) => {
    const name = payload?.displayName || `User-${socket.id.slice(0, 5)}`;
    socket.data.displayName = name;
    socket.broadcast.emit("user_joined", { displayName: name });
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

        // Remove previous reaction if exists
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

        // Add new reaction (toggle logic)
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

  // --- SEND MESSAGE (UPDATED & OPTIMIZED) ---
  socket.on("send_message", async (data, ack) => {
    try {
      if (!data || (!data.message && !(Array.isArray(data.images) && data.images.length > 0))) {
        if (ack) ack({ ok: false, error: "invalid_payload" });
        return;
      }
      if (!data.id) data.id = Date.now().toString();

      // Message Object
      const msgData = {
        id: data.id,
        message: data.message || "",
        time: data.time || new Date().toISOString(),
        socketId: data.socketId || socket.id,
        displayName: data.displayName || socket.data.displayName || `User-${socket.id.slice(0, 5)}`,
        avatar: data.avatar || null,
        reactions: data.reactions || {},
        replyTo: data.replyTo || null,
        images: Array.isArray(data.images) ? data.images : []
      };

      // 1. Try to Save to DB directly
      const newMsg = new Message(msgData);
      await newMsg.save();

      // 2. If saved successfully, Broadcast to everyone
      io.emit("receive_message", msgData);
      
      // 3. Send success acknowledgement to sender
      if (ack) ack({ ok: true, id: msgData.id });

    } catch (e) {
      
      if (e.code === 11000) {
        if (ack) ack({ ok: true, id: data.id });
      } else {
        console.error("send_message error:", e);
        if (ack) ack({ ok: false, error: "server_error" });
      }
    }
  });

  socket.on("typing", (payload) => {
    const displayName = payload?.displayName || socket.data.displayName || `User-${socket.id.slice(0, 5)}`;
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
    broadcastOnlineUsers();
    socket.broadcast.emit("user_left", { displayName: socket.data.displayName });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});