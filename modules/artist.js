const mongoose = require("mongoose");
const path = require("path");

// =========================
// ARTIST PROFILE SCHEMA
// =========================
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

  // =========================
  // DASHBOARD PAGE
  // =========================
  app.get("/artist-dashboard", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "artist-dashboard.html"));
  });

  // =========================
  // GET MY ARTIST PROFILE
  // =========================
  app.get("/api/artist/me", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: req.session.userId });
      res.json(artist || null);
    } catch (e) {
      console.error("Artist load error:", e);
      res.json(null);
    }
  });

  // =========================
  // GET ARTIST BY USER ID
  // =========================
  app.get("/api/artist/:userId", async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: req.params.userId });
      res.json(artist || null);
    } catch (e) {
      console.error("Artist fetch error:", e);
      res.json(null);
    }
  });

  // =========================
  // ENABLE ARTIST MODE
  // =========================
  app.post("/api/artist/enable", requireLogin, async (req, res) => {
    const { genre, bio, soundcloudProfile, spotifyProfile, tipUrl } = req.body;

    try {
      const artist = await ArtistProfile.findOneAndUpdate(
        { userId: req.session.userId },
        {
          isArtist: true,
          genre,
          bio,
          soundcloudProfile,
          spotifyProfile,
          tipUrl
        },
        { upsert: true, new: true }
      );

      res.json(artist);
    } catch (e) {
      console.error("Enable artist error:", e);
      res.json({ error: true });
    }
  });

  // =========================
  // UPDATE ARTIST SETTINGS
  // =========================
  app.put("/api/artist", requireLogin, async (req, res) => {
    const { genre, bio, soundcloudProfile, spotifyProfile, tipUrl } = req.body;

    try {
      const artist = await ArtistProfile.findOneAndUpdate(
        { userId: req.session.userId },
        { genre, bio, soundcloudProfile, spotifyProfile, tipUrl },
        { new: true }
      );

      res.json(artist);
    } catch (e) {
      console.error("Artist update error:", e);
      res.json({ error: true });
    }
  });

  // =========================
  // ADD SHOW
  // =========================
  app.post("/api/artist/shows", requireLogin, async (req, res) => {
    const { venue, city, date, ticketUrl } = req.body;

    try {
      await ArtistProfile.updateOne(
        { userId: req.session.userId },
        { $push: { upcomingShows: { venue, city, date, ticketUrl } } }
      );

      res.json({ success: true });
    } catch (e) {
      console.error("Add show error:", e);
      res.json({ success: false });
    }
  });

  // =========================
  // DELETE SHOW
  // =========================
  app.delete("/api/artist/shows/:index", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: req.session.userId });
      if (!artist) return res.status(404).json({ error: "Not found" });

      artist.upcomingShows.splice(Number(req.params.index), 1);
      await artist.save();

      res.json({ success: true });
    } catch (e) {
      console.error("Delete show error:", e);
      res.json({ success: false });
    }
  });

  // =========================
  // IMPORT TRACKS
  // =========================
  app.post("/api/artist/import-tracks", requireLogin, async (req, res) => {
    const { urls, platform } = req.body;
    const tracks = [];

    try {
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
    } catch (e) {
      console.error("Import tracks error:", e);
      res.json({ success: false });
    }
  });

  // =========================
  // DELETE TRACK
  // =========================
  app.delete("/api/artist/tracks/:index", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: req.session.userId });
      if (!artist) return res.status(404).json({ error: "Not found" });

      artist.importedTracks.splice(Number(req.params.index), 1);
      await artist.save();

      res.json({ success: true });
    } catch (e) {
      console.error("Delete track error:", e);
      res.json({ success: false });
    }
  });

  // =========================
  // SEND FAN MESSAGE
  // =========================
  app.post("/api/artist/:userId/fan-message", requireLogin, async (req, res) => {
    try {
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
    } catch (e) {
      console.error("Fan message error:", e);
      res.json({ success: false });
    }
  });

  // =========================
  // FAN MESSAGE INBOX
  // =========================
  app.get("/api/artist/fan-messages/inbox", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: req.session.userId });
      if (!artist) return res.status(404).json({ error: "Not found" });

      res.json(artist.fanMessages || []);
    } catch (e) {
      console.error("Fan inbox error:", e);
      res.json([]);
    }
  });

  // =========================
  // ARTIST SEARCH
  // =========================
  app.get("/api/artist-search", async (req, res) => {
    const q = (req.query.q || "").toLowerCase();

    try {
      const artists = await ArtistProfile.find({
        isArtist: true,
        $or: [
          { genre: { $regex: q, $options: "i" } },
          { bio: { $regex: q, $options: "i" } }
        ]
      }).limit(20);

      res.json(artists);
    } catch (e) {
      console.error("Artist search error:", e);
      res.json([]);
    }
  });

  // =========================
  // PUBLIC ARTIST PAGE
  // =========================
  app.get("/artist/:userId", async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: req.params.userId });
      if (!artist) return res.status(404).send("Artist not found");

      res.send(`
        <html>
        <head><title>${artist.genre || "Artist"}</title></head>
        <body>
          <h1>${artist.genre || "Artist"}</h1>
          <p>${artist.bio || ""}</p>
          <p>SoundCloud: ${artist.soundcloudProfile || "N/A"}</p>
          <p>Spotify: ${artist.spotifyProfile || "N/A"}</p>
        </body>
        </html>
      `);
    } catch (e) {
      console.error("Public artist page error:", e);
      res.status(500).send("Error");
    }
  });

};
