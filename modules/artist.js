const mongoose = require("mongoose");
const path = require("path");

const artistProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  isArtist: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  genre: String,
  bio: String,
  soundcloudProfile: String,
  spotifyProfile: String,
  importedTracks: [{
    title: String,
    url: String,
    platform: String,
    importedAt: { type: Date, default: Date.now }
  }],
  upcomingShows: [{
    venue: String,
    city: String,
    date: Date,
    ticketUrl: String
  }],
  tipUrl: String,
  totalTips: { type: Number, default: 0 },
  fanMessages: [{
    fromUserId: mongoose.Schema.Types.ObjectId,
    fromName: String,
    message: String,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const ArtistProfile = mongoose.models.ArtistProfile || mongoose.model("ArtistProfile", artistProfileSchema);

module.exports = function attachArtist(app, mongoose, requireLogin, cloudinary, upload) {

  app.get("/artist-dashboard", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "artist-dashboard.html"));
  });

  // ✅ MUST be before /api/artist/:userId
  app.get("/api/artist/me", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: req.session.userId });
      res.json(artist || null);
    } catch (e) { res.json(null); }
  });

  app.get("/api/artist/:userId", async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: req.params.userId });
      res.json(artist || null);
    } catch (e) { res.json(null); }
  });

  app.post("/api/artist/enable", requireLogin, async (req, res) => {
    const { genre, bio, soundcloudProfile, spotifyProfile, tipUrl } = req.body;
    const artist = await ArtistProfile.findOneAndUpdate(
      { userId: req.session.userId },
      { isArtist: true, genre, bio, soundcloudProfile, spotifyProfile, tipUrl },
      { upsert: true, new: true }
    );
    res.json(artist);
  });

  app.put("/api/artist", requireLogin, async (req, res) => {
    const { genre, bio, soundcloudProfile, spotifyProfile, tipUrl } = req.body;
    const artist = await ArtistProfile.findOneAndUpdate(
      { userId: req.session.userId },
      { genre, bio, soundcloudProfile, spotifyProfile, tipUrl },
      { new: true }
    );
    res.json(artist);
  });

  app.post("/api/artist/shows", requireLogin, async (req, res) => {
    const { venue, city, date, ticketUrl } = req.body;
    await ArtistProfile.updateOne(
      { userId: req.session.userId },
      { $push: { upcomingShows: { venue, city, date, ticketUrl } } }
    );
    res.json({ success: true });
  });

  app.delete("/api/artist/shows/:index", requireLogin, async (req, res) => {
    const artist = await ArtistProfile.findOne({ userId: req.session.userId });
    if (!artist) return res.status(404).json({ error: "Not found" });
    artist.upcomingShows.splice(Number(req.params.index), 1);
    await artist.save();
    res.json({ success: true });
  });

  app.post("/api/artist/import-tracks", requireLogin, async (req, res) => {
    const { urls, platform } = req.body;
    const tracks = [];
    for (const url of (urls || [])) {
      let title = url;
      try {
        const r = await fetch(
          `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
        );
        const d = await r.json();
        title = d.title || url;
      } catch {}
      tracks.push({ title, url, platform: platform || "soundcloud" });
    }
    await ArtistProfile.updateOne(
      { userId: req.session.userId },
      { $push: { importedTracks: { $each: tracks } } }
    );
    res.json({ success: true, tracks });
  });

  app.delete("/api/artist/tracks/:index", requireLogin, async (req, res) => {
    const artist = await ArtistProfile.findOne({ userId: req.session.userId });
    if (!artist) return res.status(404).json({ error: "Not found" });
    artist.importedTracks.splice(Number(req.params.index), 1);
    await artist.save();
    res.json({ success: true });
  });

  app.post("/api/artist/:userId/fan-message", requireLogin, async (req, res) => {
    const User = mongoose.model("User");
    const from = await User.findById(req.session.userId);
    await ArtistProfile.updateOne(
      { userId: req.params.userId },
      {
        $push: {
          fanMessages: {
            fromUserId: req.session.userId,
            fromName: from.name,
            message: req.body.message,
            createdAt: new Date()
          }
        }
      }
    );
    res.json({ success: true });
  });

  app.get("/api/artist/fan-messages/inbox", requireLogin, async (req, res) => {
    const artist = await ArtistProfile.findOne({ userId: req.session.userId });
    if (!artist) return res.status(404).json({ error: "Not found" });
    res.json(artist.fanMessages || []);
  });

};
