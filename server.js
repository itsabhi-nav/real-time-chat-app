// server.js
const express = require("express");
const http = require("http");
const next = require("next");
const socketIo = require("socket.io");
const multer = require("multer");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("dotenv").config();

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const JWT_SECRET = process.env.JWT_SECRET || "your-default-secret";
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/futuristic-chat";

// ---------------- Mongoose Models ----------------
// Connect to MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  avatar: { type: String, default: "/default-avatar.png" },
  displayName: { type: String, default: "" },
});
const User = mongoose.model("User", userSchema);

const messageSchema = new mongoose.Schema({
  from: String,
  to: String,
  message: String,
  attachment: { type: String, default: "" },
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", messageSchema);

// ---------------- Multer Setup ----------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "public/uploads"));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  const io = socketIo(httpServer);

  // Define onlineUsers to track connected clients
  const onlineUsers = {};

  // Middleware
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));
  server.use(
    "/uploads",
    express.static(path.join(__dirname, "public/uploads"))
  );

  // ------------------ AUTH ROUTES ------------------

  // Register
  server.post("/api/register", async (req, res) => {
    const { username, password } = req.body;
    try {
      const existing = await User.findOne({ username });
      if (existing) {
        return res.status(400).json({ message: "User already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = new User({ username, password: hashedPassword });
      await user.save();
      console.log("[REGISTER] User created:", username);
      return res.status(200).json({ message: "User registered successfully" });
    } catch (err) {
      console.error("[REGISTER] Error:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Login
  server.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const user = await User.findOne({ username });
      if (!user)
        return res.status(400).json({ message: "Invalid credentials" });
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res.status(400).json({ message: "Invalid credentials" });
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "1h" });
      console.log("[LOGIN] User logged in:", username);
      return res.status(200).json({
        token,
        username: user.username,
        avatar: user.avatar,
        displayName: user.displayName,
      });
    } catch (err) {
      console.error("[LOGIN] Error:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Upload Profile Picture (optional, e.g. during registration)
  server.post(
    "/api/upload-profile",
    upload.single("avatar"),
    async (req, res) => {
      const { username } = req.body;
      try {
        const updated = await User.findOneAndUpdate(
          { username },
          { avatar: "/uploads/" + req.file.filename },
          { new: true }
        );
        if (!updated)
          return res.status(400).json({ message: "User not found" });
        console.log("[UPLOAD] Updated avatar for:", username);
        return res.status(200).json({ avatar: updated.avatar });
      } catch (err) {
        console.error("[UPLOAD] Error:", err);
        return res.status(500).json({ message: "Internal Server Error" });
      }
    }
  );

  // Update Profile (update displayName and optionally avatar)
  server.post(
    "/api/update-profile",
    upload.single("avatar"),
    async (req, res) => {
      const { username, displayName } = req.body;
      try {
        const update = { displayName };
        if (req.file) {
          update.avatar = "/uploads/" + req.file.filename;
        }
        const updated = await User.findOneAndUpdate({ username }, update, {
          new: true,
        });
        if (!updated)
          return res.status(400).json({ message: "User not found" });

        // Emit event to all clients so updated profile info is visible to everyone
        io.emit("profileUpdated", {
          username: updated.username,
          avatar: updated.avatar,
          displayName: updated.displayName,
        });

        return res.status(200).json({
          username: updated.username,
          avatar: updated.avatar,
          displayName: updated.displayName,
        });
      } catch (err) {
        console.error("[UPDATE PROFILE] Error:", err);
        return res.status(500).json({ message: "Internal Server Error" });
      }
    }
  );

  // Get all registered users
  server.get("/api/users", async (req, res) => {
    try {
      const users = await User.find({}, "username avatar displayName");
      return res.status(200).json(users);
    } catch (err) {
      console.error("[GET USERS] Error:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Get chat history for two users
  server.get("/api/messages", async (req, res) => {
    const { user1, user2 } = req.query;
    if (!user1 || !user2) {
      return res.status(400).json({ message: "Missing user1 or user2" });
    }
    try {
      const messages = await Message.find({
        $or: [
          { from: user1, to: user2 },
          { from: user2, to: user1 },
        ],
      }).sort({ timestamp: 1 });
      return res.status(200).json(messages);
    } catch (err) {
      console.error("[GET MESSAGES] Error:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Upload attachment for chat
  server.post(
    "/api/upload-attachment",
    upload.single("attachment"),
    (req, res) => {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const fileUrl = "/uploads/" + req.file.filename;
      return res.status(200).json({ fileUrl });
    }
  );

  // Socket.IO for real-time messaging
  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    socket.on("join", (data) => {
      const { username, avatar } = data;
      socket.username = username;
      socket.avatar = avatar || "/default-avatar.png";
      onlineUsers[username] = socket.id;
      io.emit("onlineUsers", Object.keys(onlineUsers));
      io.emit("notification", { message: `${username} joined the chat` });
    });

    socket.on("privateMessage", async (data) => {
      const { from, to, message, attachment } = data;
      try {
        const newMsg = new Message({ from, to, message, attachment });
        await newMsg.save();
      } catch (err) {
        console.error("[SOCKET] Error saving message:", err);
      }
      const toSocketId = onlineUsers[to];
      if (toSocketId) {
        io.to(toSocketId).emit("privateMessage", { from, message, attachment });
      }
      socket.emit("privateMessage", { from, message, attachment });
    });

    socket.on("disconnect", () => {
      if (socket.username) {
        delete onlineUsers[socket.username];
        io.emit("onlineUsers", Object.keys(onlineUsers));
        io.emit("notification", {
          message: `${socket.username} left the chat`,
        });
      }
      console.log("Client disconnected:", socket.id);
    });
  });

  // Next.js catch-all handler
  server.all("*", (req, res) => {
    return handle(req, res);
  });

  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Server listening on http://localhost:${PORT}`);
  });
});
