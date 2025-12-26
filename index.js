const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require("jsonwebtoken");
require('dotenv').config();
const connectDB = require('./config/db');
const authRoutes = require("./routes/authRoutes");
const friendRoutes = require("./routes/friendRoutes");
const Message = require("./models/Message");

connectDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/friends", friendRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  }
});

// Socket.io authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error("Socket auth error:", err);
        return next(new Error("Authentication error"));
      }
      socket.user = decoded;
      next();
    });
  } else {
    console.error("No token provided for socket");
    next(new Error("Authentication error"));
  }
});

// Store connected users
const users = {};

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}, User: ${socket.user.username}`);
  users[socket.id] = { socket, username: socket.user.username };

  socket.emit('your-id', socket.id);
  io.emit('users-online', Object.keys(users).map(id => ({ id, username: users[id].username })));

  socket.on('send-friend-request', async (data) => {
    console.log(`Friend request from ${socket.user.username} to ${data.recipientUsername}`);
    const recipient = Object.values(users).find(u => u.username === data.recipientUsername);
    if (recipient) {
      recipient.socket.emit('friend-request', {
        from: socket.user.username,
        requestId: data.requestId,
      });
    } else {
      console.log(`Recipient ${data.recipientUsername} not online`);
    }
  });

  socket.on('accept-friend-request', async (data) => {
    console.log(`Friend request accepted by ${socket.user.username} from ${data.requesterUsername}`);
    const requester = Object.values(users).find(u => u.username === data.requesterUsername);
    if (requester) {
      requester.socket.emit('friend-request-accepted', {
        from: socket.user.username,
      });
    }
  });

  socket.on('call-user', (data) => {
    console.log(`Call from ${socket.id} (${socket.user.username}) to ${data.userToCall}`);
    if (users[data.userToCall]) {
      users[data.userToCall].socket.emit('incoming-call', {
        signalData: data.signalData,
        from: data.from,
        name: socket.user.username,
      });
    } else {
      console.log(`User ${data.userToCall} not found for call`);
      socket.emit('call-error', { message: 'User not online' });
    }
  });

  socket.on('accept-call', (data) => {
    console.log(`Call accepted by ${socket.id} to ${data.to}`);
    if (users[data.to]) {
      users[data.to].socket.emit('call-accepted', { signalData: data.signalData });
    } else {
      console.log(`User ${data.to} not found for call acceptance`);
    }
  });

  socket.on('reject-call', (data) => {
    console.log(`Call rejected by ${socket.id} to ${data.to}`);
    if (users[data.to]) {
      users[data.to].socket.emit('call-rejected');
    }
  });

  socket.on('send-message', async (data) => {
    console.log(`Message from ${socket.user.username} to ${data.to}: ${data.text}`);
    if (users[data.to]) {
      const message = await Message.create({
        sender: socket.user.id,
        recipient: data.recipientId,
        text: data.text,
      });
      users[data.to].socket.emit('receive-message', {
        from: socket.user.username,
        text: data.text,
        createdAt: message.createdAt,
      });
    } else {
      console.log(`User ${data.to} not online for message`);
    }
  });

  socket.on('watch-together', (data) => {
    console.log(`Watch-together from ${socket.user.username} to ${data.to}: ${data.videoUrl}, Mode: ${data.mode}`);
    if (users[data.to]) {
      users[data.to].socket.emit('watch-together', {
        mode: data.mode,
        videoUrl: data.videoUrl,
        timestamp: data.timestamp,
        isPlaying: data.isPlaying,
      });
    } else {
      console.log(`User ${data.to} not online for watch-together`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id} (${socket.user.username})`);
    delete users[socket.id];
    io.emit('users-online', Object.keys(users).map(id => ({ id, username: users[id].username })));
  });

  socket.on('error', (error) => {
    console.error(`Socket error from ${socket.id}:`, error);
  });
});

server.listen(5000, () => {
  console.log('🚀 Server running on port 5000');
});