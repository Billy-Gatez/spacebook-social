const { Server: SocketIOServer } = require("socket.io");
const mongoose = require("mongoose");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const cloudinaryLib = require("cloudinary").v2;
const path = require("path");

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ["dm", "group"], default: "dm" },
  name: String,
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  senderName: String,
  type: { type: String, enum: ["text", "image", "video", "voice", "soundcloud"], default: "text" },
  content: String,
  mediaUrl: String,
  reactions: [{ userId: mongoose.Schema.Types.ObjectId, emoji: String }],
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
const Message = mongoose.models.Message || mongoose.model("Message", messageSchema);

const msgMediaStorage = new CloudinaryStorage({
  cloudinary: cloudinaryLib,
  params: {
    folder: "spacebook_messages",
    resource_type: "auto",
    allowed_formats: ["jpg","jpeg","png","gif","mp4","webm","ogg","wav","mp3"]
  }
});
const msgUpload = multer({ storage: msgMediaStorage });

const onlineUsers = new Map();

module.exports = function attachMessaging(app, server, _mongoose, requireLogin, cloudinary) {

  const io = new SocketIOServer(server, {
    path: "/msg-socket",
    cors: { origin: "*", credentials: true }
  });

  io.on("connection", (socket) => {
    const userId = socket.handshake.auth.userId;
    if (!userId) return;

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    io.emit("presence_update", { userId, online: true });

    Conversation.find({ participants: userId }).then(convs => {
      convs.forEach(c => socket.join(c._id.toString()));
    }).catch(() => {});

    socket.on("send_message", async (data) => {
      try {
        const msg = await Message.create({
          conversationId: data.conversationId,
          senderId: userId,
          senderName: data.senderName,
          type: data.type || "text",
          content: data.content,
          mediaUrl: data.mediaUrl,
          readBy: [userId]
        });
        io.to(data.conversationId).emit("new_message", msg);
      } catch (e) { socket.emit("error", e.message); }
    });

    socket.on("typing", ({ conversationId, senderName, typing }) => {
      socket.to(conversationId).emit("typing_indicator", { userId, senderName, typing });
    });

    socket.on("mark_read", async ({ conversationId }) => {
      await Message.updateMany(
        { conversationId, readBy: { $ne: userId } },
        { $push: { readBy: userId } }
      ).catch(() => {});
      io.to(conversationId).emit("messages_read", { conversationId, userId });
    });

    socket.on("react", async ({ messageId, emoji }) => {
      try {
        const msg = await Message.findById(messageId);
        if (!msg) return;
        const existing = msg.reactions.find(r => r.userId.toString() === userId.toString());
        if (existing) { existing.emoji = emoji; } else { msg.reactions.push({ userId, emoji }); }
        await msg.save();
        io.to(msg.conversationId.toString()).emit("reaction_update", { messageId, reactions: msg.reactions });
      } catch {}
    });

    socket.on("disconnect", () => {
      const sids = onlineUsers.get(userId);
      if (sids) {
        sids.delete(socket.id);
        if (sids.size === 0) {
          onlineUsers.delete(userId);
          io.emit("presence_update", { userId, online: false });
        }
      }
    });
  });

  // ── REST API ──────────────────────────────────────────────

  app.get("/api/session-user", requireLogin, async (req, res) => {
    const User = _mongoose.models.User;
    const user = await User.findById(req.session.userId).lean();
    if (!user) return res.status(401).json({ error: "Not logged in" });
    res.json({ id: user._id, name: user.name, profilePic: user.profilePic || "/assets/img/default-avatar.png" });
  });

  app.get("/api/friends", requireLogin, async (req, res) => {
    const User = _mongoose.models.User;
    const user = await User.findById(req.session.userId).populate("friends", "name profilePic").lean();
    if (!user) return res.status(401).json({ error: "Not logged in" });
    res.json(user.friends);
  });

  app.post("/api/conversations/dm", requireLogin, async (req, res) => {
    const me = req.session.userId;
    const { targetId } = req.body;
    let conv = await Conversation.findOne({
      type: "dm",
      participants: { $all: [me, targetId], $size: 2 }
    });
    if (!conv) conv = await Conversation.create({ type: "dm", participants: [me, targetId] });
    res.json(conv);
  });

  app.post("/api/conversations/group", requireLogin, async (req, res) => {
    const me = req.session.userId;
    const { name, participantIds } = req.body;
    const all = [...new Set([me.toString(), ...(participantIds || [])])];
    const conv = await Conversation.create({ type: "group", name, participants: all });
    res.json(conv);
  });

  app.get("/api/conversations", requireLogin, async (req, res) => {
    const me = req.session.userId;
    const convs = await Conversation.find({ participants: me })
      .populate("participants", "name profilePic");
    res.json(convs);
  });

  app.get("/api/conversations/:id/messages", requireLogin, async (req, res) => {
    const msgs = await Message.find({ conversationId: req.params.id })
      .sort({ createdAt: 1 }).limit(100);
    res.json(msgs);
  });

  app.post("/api/messages/upload", requireLogin, msgUpload.single("media"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file" });
    res.json({ url: req.file.path, resourceType: req.file.mimetype });
  });

  app.get("/api/presence/:userId", requireLogin, (req, res) => {
    res.json({ online: onlineUsers.has(req.params.userId) });
  });

  app.get("/api/soundcloud/preview", requireLogin, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing url" });
    try {
      const r = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      const data = await r.json();
      res.json({ title: data.title, html: data.html, thumbnail: data.thumbnail_url });
    } catch { res.json({ title: url, html: "", thumbnail: "" }); }
  });

  // ── DELETE conversation + all its messages ──
  app.delete("/api/conversations/:id", requireLogin, async (req, res) => {
    const me = req.session.userId.toString();
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: "Not found" });
    if (!conv.participants.map(p => p.toString()).includes(me))
      return res.status(403).json({ error: "Not authorized" });
    await Message.deleteMany({ conversationId: conv._id });
    await conv.deleteOne();
    io.to(req.params.id).emit("conversation_deleted", { conversationId: req.params.id });
    res.json({ success: true });
  });

  // ── DELETE a single message ──
  app.delete("/api/messages/:id", requireLogin, async (req, res) => {
    const me = req.session.userId.toString();
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: "Not found" });
    if (msg.senderId.toString() !== me)
      return res.status(403).json({ error: "Not authorized" });
    const convId = msg.conversationId.toString();
    await msg.deleteOne();
    io.to(convId).emit("message_deleted", { messageId: req.params.id });
    res.json({ success: true });
  });

  app.get("/messages", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "messaging.html"));
  });

};
