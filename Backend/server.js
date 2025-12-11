// backend/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// FIXED FRONTEND URL
const CLIENT_URL = "https://socketio-testing-chatbox.vercel.app";

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL, // no trailing slash
    methods: ["GET", "POST"],
  },
});

// Health check route
app.get("/", (req, res) => {
  res.send({ status: "ok", ts: Date.now() });
});

io.on("connection", (socket) => {
  console.log(`[io] User Connected: ${socket.id}`);

  socket.on("send_message", (data, ack) => {
    try {
      if (!data || typeof data !== "object") {
        if (typeof ack === "function") ack({ ok: false, error: "invalid_payload" });
        return;
      }

      if (!data.id)
        data.id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      data.serverReceivedAt = new Date().toISOString();

      // broadcast ONLY to others (optimistic UI handles sender)
      socket.broadcast.emit("receive_message", data);

      if (typeof ack === "function") ack({ ok: true, id: data.id });

      console.log(`[io] message broadcasted id=${data.id}`);
    } catch (e) {
      console.error("[io] send_message error:", e);
      if (typeof ack === "function") ack({ ok: false, error: "server_error" });
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[io] Disconnected: ${socket.id}, reason=${reason}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING on PORT ${PORT}`);
  console.log(`Allowed Client: ${CLIENT_URL}`);
});
