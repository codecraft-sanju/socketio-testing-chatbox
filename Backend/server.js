const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors());

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3001;

// 1. FRONTEND URL (Vercel)
const CLIENT_URL = "https://socketio-testing-chatbox.vercel.app";

// 2. YOUR MONGODB URI
const MONGO_URI = "mongodb+srv://sanjaychoudhary01818_db_user:Sanju098@cluster0.em6lur1.mongodb.net/StartupHub?retryWrites=true&w=majority&appName=Cluster0";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL, // Only allow your Vercel App
    methods: ["GET", "POST"],
  },
});

// --- DATABASE CONNECTION ---
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected: StartupHub Ready"))
  .catch((err) => console.error("❌ DB Connection Error:", err));

// --- SCHEMA ---
const messageSchema = new mongoose.Schema({
  text: String,
  senderName: String,
  senderRole: String, // Founder, CTO, etc.
  time: String,       
  socketId: String,
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model("Message", messageSchema);

// --- SOCKET LOGIC ---
let activeSockets = new Set();

io.on("connection", async (socket) => {
  console.log(`[+] New Connection: ${socket.id}`);
  activeSockets.add(socket.id);

  // 1. Send History (Last 100 Messages)
  try {
    const history = await Message.find().sort({ createdAt: 1 }).limit(100);
    socket.emit("history", history);
  } catch (e) {
    console.error("History Error:", e);
  }

  // 2. Broadcast User Count
  io.emit("users_count", { total: activeSockets.size });

  // 3. Handle Message
  socket.on("send_message", async (data, ack) => {
    try {
      const newMessage = new Message({
        text: data.text,
        senderName: data.senderName,
        senderRole: data.senderRole,
        time: new Date().toISOString(),
        socketId: socket.id
      });
      
      const savedMsg = await newMessage.save();

      // Broadcast to everyone
      io.emit("receive_message", savedMsg);

      if (ack) ack({ ok: true });
    } catch (e) {
      console.error("Message Save Error:", e);
    }
  });

  // 4. Typing
  socket.on("typing", (data) => {
    socket.broadcast.emit("user_typing", data);
  });

  // 5. Disconnect
  socket.on("disconnect", () => {
    activeSockets.delete(socket.id);
    io.emit("users_count", { total: activeSockets.size });
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});