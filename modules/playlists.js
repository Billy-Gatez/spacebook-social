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

    socket.on("join_room", async ({ roomId }) => {
      socket.join(roomId);
      await ListenRoom.updateOne(
        { _id: roomId },
        { $addToSet: { participants: userId } }
      ).catch(() => {});
      socket.to(roomId).emit("user_joined", { userId, userName });
      const room = await ListenRoom.findById(roomId).catch(() => null);
      if (room) {
        socket.emit("sync_state", {
          currentTrackIndex: room.currentTrackIndex,
          currentTime: room.currentTime,
          isPlaying: room.isPlaying
        });
      }
    });

    socket.on("play_pause", async ({ roomId, isPlaying, currentTime }) => {
      await ListenRoom.updateOne({ _id: roomId }, { isPlaying, currentTime }).catch(() => {});
      socket.to(roomId).emit("sync_state", { isPlaying, currentTime });
    });

    socket.on("seek", async ({ roomId, currentTime }) => {
      await ListenRoom.updateOne({ _id: roomId }, { currentTime }).catch(() => {});
      socket.to(roomId).emit("sync_state", { currentTime });
    });

    socket.on("change_track", async ({ roomId, trackIndex }) => {
      await ListenRoom.updateOne(
        { _id: roomId },
        { currentTrackIndex: trackIndex, currentTime: 0, isPlaying: true }
      ).catch(() => {});
      io.to(roomId).emit("track_changed", { trackIndex });
    });

    socket.on("room_chat", async ({ roomId, message }) => {
      const entry = { userId, userName, message, createdAt: new Date() };
      await ListenRoom.updateOne({ _id: roomId }, { $push: { chat: entry } }).catch(() => {});
      io.to(roomId).emit("room_chat_message", entry);
    });

    socket.on("room_react", ({ roomId, emoji }) => {
      io.to(roomId).emit("room_reaction", { userId, userName, emoji });
    });
  });

  app.get("/listen-together", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "listen-together.html"));
  });

  app.get("/api/playlists", requireLogin, async (req, res) => {
    const playlists = await Playlist.find({
      $or: [{ ownerId: req.session.userId }, { collaborators: req.session.userId }]
    }).populate("ownerId", "name");
    res.json(playlists);
  });

  app.get("/api/playlists/user/:userId", requireLogin, async (req, res) => {
    const playlists = await Playlist.find({ ownerId: req.params.userId });
    res.json(playlists);
  });

  app.post("/api/playlists", requireLogin, async (req, res) => {
    const pl = await Playlist.create({
      ownerId: req.session.userId,
      name: req.body.name,
      isCollaborative: !!req.body.isCollaborative
    });
    res.json(pl);
  });

  app.post("/api/playlists/:id/tracks", requireLogin, async (req, res) => {
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
  });

  app.delete("/api/playlists/:id/tracks/:trackIndex", requireLogin, async (req, res) => {
    const pl = await Playlist.findOne({ _id: req.params.id, ownerId: req.session.userId });
    if (!pl) return res.status(404).json({ error: "Not found" });
    pl.tracks.splice(Number(req.params.trackIndex), 1);
    await pl.save();
    res.json({ success: true });
  });

  app.post("/api/playlists/:id/collaborators", requireLogin, async (req, res) => {
    await Playlist.updateOne(
      { _id: req.params.id, ownerId: req.session.userId },
      { $addToSet: { collaborators: req.body.userId } }
    );
    res.json({ success: true });
  });

  app.post("/api/listen-rooms", requireLogin, async (req, res) => {
    const room = await ListenRoom.create({
      playlistId: req.body.playlistId,
      hostId: req.session.userId,
      participants: [req.session.userId]
    });
    res.json(room);
  });

  app.get("/api/listen-rooms/:id", requireLogin, async (req, res) => {
    const room = await ListenRoom.findById(req.params.id).populate("playlistId");
    if (!room) return res.status(404).json({ error: "Not found" });
    res.json(room);
  });

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
    } catch (e) { res.json([]); }
  });

  app.get("/api/session-user", requireLogin, async (req, res) => {
    try {
      const User = mongoose.model("User");
      const user = await User.findById(req.session.userId).select("-password");
      if (!user) return res.status(401).json({ error: "Not logged in" });
      res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/friends", requireLogin, async (req, res) => {
    try {
      const User = mongoose.model("User");
      const user = await User.findById(req.session.userId)
        .populate("friends", "name profilePic _id");
      res.json(user.friends || []);
    } catch (e) { res.json([]); }
  });
};
