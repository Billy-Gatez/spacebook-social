const mongoose = require("mongoose");
const path = require("path");
const { Server: SocketIOServer } = require("socket.io");

const playlistSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  isCollaborative: { type: Boolean, default: false },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  tracks: [{
    soundcloudUrl: String,
    title: String,
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    addedByName: String,
    addedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const listenRoomSchema = new mongoose.Schema({
  playlistId: { type: mongoose.Schema.Types.ObjectId, ref: "Playlist" },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  currentTrackIndex: { type: Number, default: 0 },
  currentTime: { type: Number, default: 0 },
  isPlaying: { type: Boolean, default: false },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  chat: [{
    userId: mongoose.Schema.Types.ObjectId,
    userName: String,
    message: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const Playlist   = mongoose.models.Playlist   || mongoose.model("Playlist", playlistSchema);
const ListenRoom = mongoose.models.ListenRoom || mongoose.model("ListenRoom", listenRoomSchema);

module.exports = function attachPlaylists(app, server, mongoose, requireLogin) {

  const io = new SocketIOServer(server, {
    path: "/listen-socket",
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    const { userId, userName } = socket.handshake.auth;

    socket.on("joinroom", async ({ roomId }) => {
      socket.join(roomId);
      await ListenRoom.updateOne(
        { _id: roomId },
        { $addToSet: { participants: userId } }
      ).catch(() => {});
      socket.to(roomId).emit("userjoined", { userId, userName });
      const room = await ListenRoom.findById(roomId).catch(() => null);
      if (room) {
        socket.emit("syncstate", {
          currentTrackIndex: room.currentTrackIndex,
          currentTime: room.currentTime,
          isPlaying: room.isPlaying
        });
      }
    });

    socket.on("playpause", async ({ roomId, isPlaying, currentTime }) => {
      await ListenRoom.updateOne({ _id: roomId }, { isPlaying, currentTime }).catch(() => {});
      socket.to(roomId).emit("syncstate", { isPlaying, currentTime });
    });

    socket.on("seek", async ({ roomId, currentTime }) => {
      await ListenRoom.updateOne({ _id: roomId }, { currentTime }).catch(() => {});
      socket.to(roomId).emit("syncstate", { currentTime });
    });

    socket.on("changetrack", async ({ roomId, trackIndex }) => {
      await ListenRoom.updateOne(
        { _id: roomId },
        { currentTrackIndex: trackIndex, currentTime: 0, isPlaying: true }
      ).catch(() => {});
      io.to(roomId).emit("trackchanged", { trackIndex });
    });

    socket.on("roomchat", async ({ roomId, message }) => {
      const entry = { userId, userName, message, createdAt: new Date() };
      await ListenRoom.updateOne({ _id: roomId }, { $push: { chat: entry } }).catch(() => {});
      io.to(roomId).emit("roomchatmessage", entry);
    });

    // broadcasts to ALL in room including sender
    socket.on("roomreact", ({ roomId, emoji }) => {
      io.to(roomId).emit("roomreaction", { userId, userName, emoji });
    });

    // broadcasts playlist update to everyone else in the room
    socket.on("playlistupdated", ({ roomId }) => {
      socket.to(roomId).emit("playlistupdated", { roomId });
    });
  });

  // PAGE ROUTE
  app.get("/listen-together", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "listen-together.html"));
  });

  // PLAYLIST ROUTES
  app.get("/api/playlists", requireLogin, async (req, res) => {
    try {
      const playlists = await Playlist.find({
        $or: [{ ownerId: req.session.userId }, { collaborators: req.session.userId }]
      }).populate("ownerId", "name");
      res.json(playlists);
    } catch(e) { res.status(500).json([]); }
  });

  app.get("/api/playlists/user/:userId", requireLogin, async (req, res) => {
    try {
      const playlists = await Playlist.find({ ownerId: req.params.userId });
      res.json(playlists);
    } catch(e) { res.status(500).json([]); }
  });

  app.post("/api/playlists", requireLogin, async (req, res) => {
    try {
      const pl = await Playlist.create({
        ownerId: req.session.userId,
        name: req.body.name,
        isCollaborative: !!req.body.isCollaborative
      });
      res.json(pl);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/playlists/:id/tracks", requireLogin, async (req, res) => {
    try {
      const pl = await Playlist.findById(req.params.id);
      if (!pl) return res.status(404).json({ error: "Not found" });
      const isOwner = pl.ownerId.toString() === req.session.userId.toString();
      const isCollab = pl.collaborators.map(c => c.toString()).includes(req.session.userId.toString());
      if (!isOwner && !isCollab && !pl.isCollaborative) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const User = mongoose.model("User");
      const user = await User.findById(req.session.userId);
      pl.tracks.push({
        soundcloudUrl: req.body.soundcloudUrl,
        title: req.body.title,
        addedBy: req.session.userId,
        addedByName: user.name
      });
      await pl.save();
      res.json(pl);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/playlists/:id/tracks/:trackIndex", requireLogin, async (req, res) => {
    try {
      const pl = await Playlist.findOne({ _id: req.params.id, ownerId: req.session.userId });
      if (!pl) return res.status(404).json({ error: "Not found" });
      pl.tracks.splice(Number(req.params.trackIndex), 1);
      await pl.save();
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/playlists/:id", requireLogin, async (req, res) => {
    try {
      await Playlist.deleteOne({ _id: req.params.id, ownerId: req.session.userId });
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/playlists/:id/collaborators", requireLogin, async (req, res) => {
    try {
      await Playlist.updateOne(
        { _id: req.params.id, ownerId: req.session.userId },
        { $addToSet: { collaborators: req.body.userId } }
      );
      res.json({ success: true });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // LISTEN ROOM ROUTES — active MUST come before /:id
  app.post("/api/listen-rooms", requireLogin, async (req, res) => {
    try {
      const room = await ListenRoom.create({
        playlistId: req.body.playlistId,
        hostId: req.session.userId,
        participants: [req.session.userId]
      });
      res.json(room);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/listen-rooms/active", requireLogin, async (req, res) => {
    try {
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const rooms = await ListenRoom.find({ createdAt: { $gte: cutoff } })
        .populate("playlistId", "name tracks")
        .populate("hostId", "name")
        .sort({ createdAt: -1 })
        .limit(20);
      res.json(rooms);
    } catch(e) { res.json([]); }
  });

  app.get("/api/listen-rooms/:id", requireLogin, async (req, res) => {
    try {
      const room = await ListenRoom.findById(req.params.id).populate("playlistId");
      if (!room) return res.status(404).json({ error: "Not found" });
      res.json(room);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  // MISC ROUTES
  app.get("/api/feed-posts", requireLogin, async (req, res) => {
    try {
      const User = mongoose.model("User");
      const Post = mongoose.model("Post");
      const me = await User.findById(req.session.userId);
      const friendIds = [...(me.friends || []), me._id];
      const posts = await Post.find({ userId: { $in: friendIds } })
        .sort({ createdAt: -1 }).limit(20);
      const postsWithPic = await Promise.all(posts.map(async p => {
        const author = await User.findById(p.userId).select("profilePic").catch(() => null);
        return { ...p.toObject(), authorPic: author?.profilePic || null };
      }));
      res.json(postsWithPic);
    } catch(e) { res.json([]); }
  });

  app.get("/api/session-user", requireLogin, async (req, res) => {
    try {
      const User = mongoose.model("User");
      const user = await User.findById(req.session.userId).select("-password");
      if (!user) return res.status(401).json({ error: "Not logged in" });
      res.json(user);
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/friends", requireLogin, async (req, res) => {
    try {
      const User = mongoose.model("User");
      const user = await User.findById(req.session.userId)
        .populate("friends", "name profilePic _id");
      res.json(user.friends || []);
    } catch(e) { res.json([]); }
  });

};