const mongoose = require("mongoose");
const path = require("path");

const albumSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: { type: String, default: "My Album" },
  coverUrl: String,
  photos: [{
    url: String,
    caption: String,
    addedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const photoCommentSchema = new mongoose.Schema({
  albumId: mongoose.Schema.Types.ObjectId,
  photoIndex: Number,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userName: String,
  userPic: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
});

const photoReactionSchema = new mongoose.Schema({
  albumId: mongoose.Schema.Types.ObjectId,
  photoIndex: Number,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  emoji: String
});

const Album = mongoose.models.Album || mongoose.model("Album", albumSchema);
const PhotoComment = mongoose.models.PhotoComment || mongoose.model("PhotoComment", photoCommentSchema);
const PhotoReaction = mongoose.models.PhotoReaction || mongoose.model("PhotoReaction", photoReactionSchema);

module.exports = function attachGallery(app, mongoose, requireLogin, cloudinary, upload) {

  app.get("/gallery", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "gallery.html"));
  });

  app.get("/api/albums", requireLogin, async (req, res) => {
    const albums = await Album.find({ userId: req.session.userId });
    res.json(albums);
  });

  app.get("/api/albums/user/:userId", requireLogin, async (req, res) => {
    const albums = await Album.find({ userId: req.params.userId });
    res.json(albums);
  });

  app.post("/api/albums", requireLogin, async (req, res) => {
    const album = await Album.create({
      userId: req.session.userId,
      name: req.body.name || "New Album"
    });
    res.json(album);
  });

  app.post("/api/albums/:albumId/photos", requireLogin, upload.array("photos", 20), async (req, res) => {
    const album = await Album.findOne({ _id: req.params.albumId, userId: req.session.userId });
    if (!album) return res.status(404).json({ error: "Album not found" });
    const newPhotos = (req.files || []).map(f => ({ url: f.path, caption: "" }));
    album.photos.push(...newPhotos);
    if (!album.coverUrl && newPhotos.length) album.coverUrl = newPhotos[0].url;
    await album.save();
    res.json(album);
  });

  app.delete("/api/albums/:albumId/photos/:photoIndex", requireLogin, async (req, res) => {
    const album = await Album.findOne({ _id: req.params.albumId, userId: req.session.userId });
    if (!album) return res.status(404).json({ error: "Not found" });
    album.photos.splice(Number(req.params.photoIndex), 1);
    await album.save();
    res.json({ success: true });
  });

  app.delete("/api/albums/:albumId", requireLogin, async (req, res) => {
    await Album.deleteOne({ _id: req.params.albumId, userId: req.session.userId });
    await PhotoComment.deleteMany({ albumId: req.params.albumId });
    await PhotoReaction.deleteMany({ albumId: req.params.albumId });
    res.json({ success: true });
  });

  app.get("/api/gallery/top9/:userId", requireLogin, async (req, res) => {
    const albums = await Album.find({ userId: req.params.userId });
    const all = [];
    albums.forEach(a => a.photos.forEach(p => all.push({ url: p.url, addedAt: p.addedAt })));
    all.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    res.json(all.slice(0, 9));
  });

  app.get("/api/gallery/collage/:userId", requireLogin, async (req, res) => {
    const albums = await Album.find({ userId: req.params.userId });
    const all = [];
    albums.forEach(a => a.photos.forEach(p => all.push(p.url)));
    const shuffled = all.sort(() => 0.5 - Math.random()).slice(0, 4);
    res.json(shuffled);
  });

  // ====== COMMENTS ======
  app.get("/api/albums/:albumId/photos/:photoIndex/comments", requireLogin, async (req, res) => {
    const comments = await PhotoComment.find({
      albumId: req.params.albumId,
      photoIndex: Number(req.params.photoIndex)
    }).sort({ createdAt: 1 });
    res.json(comments);
  });

  app.post("/api/albums/:albumId/photos/:photoIndex/comments", requireLogin, async (req, res) => {
    const User = mongoose.model("User");
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(401).json({ error: "Not logged in" });
    const comment = await PhotoComment.create({
      albumId: req.params.albumId,
      photoIndex: Number(req.params.photoIndex),
      userId: user._id,
      userName: user.name,
      userPic: user.profilePic || "",
      text: req.body.text
    });
    res.json(comment);
  });

  app.delete("/api/comments/:commentId", requireLogin, async (req, res) => {
    const comment = await PhotoComment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: "Not found" });
    if (comment.userId.toString() !== req.session.userId.toString())
      return res.status(403).json({ error: "Not yours" });
    await PhotoComment.deleteOne({ _id: req.params.commentId });
    res.json({ success: true });
  });

  // ====== REACTIONS ======
  app.post("/api/albums/:albumId/photos/:photoIndex/react", requireLogin, async (req, res) => {
    const { emoji } = req.body;
    const filter = {
      albumId: req.params.albumId,
      photoIndex: Number(req.params.photoIndex),
      userId: req.session.userId
    };
    const existing = await PhotoReaction.findOne(filter);
    if (existing) {
      if (existing.emoji === emoji) {
        await PhotoReaction.deleteOne({ _id: existing._id });
        return res.json({ action: "removed", emoji });
      } else {
        existing.emoji = emoji;
        await existing.save();
        return res.json({ action: "updated", emoji });
      }
    }
    await PhotoReaction.create({ ...filter, emoji });
    res.json({ action: "added", emoji });
  });

  app.get("/api/albums/:albumId/photos/:photoIndex/reactions", requireLogin, async (req, res) => {
    const reactions = await PhotoReaction.find({
      albumId: req.params.albumId,
      photoIndex: Number(req.params.photoIndex)
    });
    // Group by emoji with counts
    const counts = {};
    let myReaction = null;
    reactions.forEach(r => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      if (r.userId.toString() === req.session.userId.toString()) myReaction = r.emoji;
    });
    res.json({ counts, myReaction });
  });
};
