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

const Album = mongoose.models.Album || mongoose.model("Album", albumSchema);

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
};
