const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

// NOTE: Jab production pe daalo toh isse apna frontend URL replace karna
const CLIENT_URL = "https://socketio-testing-chatbox.vercel.app";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Testing ke liye '*' rakha hai, production mein CLIENT_URL use karein
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send({ status: "Active", clients: io.engine.clientsCount });
});

// STATE
const connectedSockets = new Set();
const messageHistory = []; // Last 50 messages store karega

function broadcastUserCounts() {
  io.emit("users_count", { total: connectedSockets.size });
}

io.on("connection", (socket) => {
  connectedSockets.add(socket.id);
  console.log(`[+] User Joined: ${socket.id}`);

  // 1. Send Old Messages to new user immediately
  socket.emit("history", messageHistory);

  // 2. Send User Count
  broadcastUserCounts();

  // 3. Handle New Messages
  socket.on("send_message", (data, ack) => {
    try {
      if (!data.id) data.id = Date.now().toString();
      
      // Store in history (Keep only last 50)
      messageHistory.push(data);
      if (messageHistory.length > 50) messageHistory.shift();

      // Broadcast to everyone else
      socket.broadcast.emit("receive_message", data);

      if (ack) ack({ ok: true, id: data.id });
    } catch (e) {
      console.error(e);
    }
  });

  // 4. Handle Typing
  socket.on("typing", (payload) => {
    socket.broadcast.emit("user_typing", {
      socketId: socket.id,
      typing: payload.typing,
      displayName: payload.displayName,
    });
  });

  // 5. Disconnect
  socket.on("disconnect", () => {
    connectedSockets.delete(socket.id);
    socket.broadcast.emit("user_typing", { socketId: socket.id, typing: false });
    broadcastUserCounts();
    console.log(`[-] User Left: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});