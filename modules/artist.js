const mongoose = require("mongoose");
const path = require("path");

const artistProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  artistName: String,
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
    plays: { type: Number, default: 0 },
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
    reply: String,
    repliedAt: Date,
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const ArtistProfile =
  mongoose.models.ArtistProfile || mongoose.model("ArtistProfile", artistProfileSchema);

module.exports = function attachArtist(app, mongoose, requireLogin, cloudinary, upload) {

  function uid(req) {
    return new mongoose.Types.ObjectId(req.session.userId);
  }

  // PAGE ROUTES
  app.get("/artist-dashboard", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "artist-dashboard.html"));
  });

  app.get("/artist/:userId", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "artist-profile.html"));
  });

  // GET MY ARTIST PROFILE
  app.get("/api/artist/me", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: uid(req) });
      res.json(artist || null);
    } catch (e) {
      res.json(null);
    }
  });

  // GET ANY ARTIST BY USERID (Mongo)
  app.get("/api/artist/:userId", async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({
        userId: new mongoose.Types.ObjectId(req.params.userId)
      });
      if (!artist) return res.status(404).json(null);

      const User = mongoose.model("User");
      const user = await User.findById(req.params.userId)
        .select("name profilePic")
        .lean();

      res.json({
        ...artist.toObject(),
        userName: user?.name || "Artist",
        profilePic: user?.profilePic || null
      });
    } catch (e) {
      res.json(null);
    }
  });

  // ENABLE ARTIST MODE
  app.post("/api/artist/enable", requireLogin, async (req, res) => {
    try {
      const { artistName, genre, bio, soundcloudProfile, spotifyProfile, tipUrl } = req.body;
      const artist = await ArtistProfile.findOneAndUpdate(
        { userId: uid(req) },
        { isArtist: true, artistName, genre, bio, soundcloudProfile, spotifyProfile, tipUrl },
        { upsert: true, new: true }
      );
      res.json(artist);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // UPDATE ARTIST PROFILE
  app.put("/api/artist", requireLogin, async (req, res) => {
    try {
      const { artistName, genre, bio, soundcloudProfile, spotifyProfile, tipUrl } = req.body;
      const artist = await ArtistProfile.findOneAndUpdate(
        { userId: uid(req) },
        { artistName, genre, bio, soundcloudProfile, spotifyProfile, tipUrl },
        { new: true }
      );
      res.json(artist);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // IMPORT TRACKS
  app.post("/api/artist/import-tracks", requireLogin, async (req, res) => {
    try {
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
        tracks.push({ title, url, platform: platform || "soundcloud", plays: 0 });
      }
      await ArtistProfile.updateOne(
        { userId: uid(req) },
        { $push: { importedTracks: { $each: tracks } } }
      );
      res.json({ success: true, tracks });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // INCREMENT TRACK PLAY
  app.post("/api/artist/:userId/tracks/:index/play", async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({
        userId: new mongoose.Types.ObjectId(req.params.userId)
      });
      if (!artist) return res.status(404).json({ error: "Not found" });
      const idx = Number(req.params.index);
      if (artist.importedTracks[idx] !== undefined) {
        artist.importedTracks[idx].plays = (artist.importedTracks[idx].plays || 0) + 1;
        await artist.save();
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE TRACK
  app.delete("/api/artist/tracks/:index", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: uid(req) });
      if (!artist) return res.status(404).json({ error: "Not found" });
      artist.importedTracks.splice(Number(req.params.index), 1);
      await artist.save();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ADD SHOW
  app.post("/api/artist/shows", requireLogin, async (req, res) => {
    try {
      const { venue, city, date, ticketUrl } = req.body;
      await ArtistProfile.updateOne(
        { userId: uid(req) },
        { $push: { upcomingShows: { venue, city, date, ticketUrl } } }
      );
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE SHOW
  app.delete("/api/artist/shows/:index", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: uid(req) });
      if (!artist) return res.status(404).json({ error: "Not found" });
      artist.upcomingShows.splice(Number(req.params.index), 1);
      await artist.save();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // SEND FAN MESSAGE
  app.post("/api/artist/:userId/fan-message", requireLogin, async (req, res) => {
    try {
      const User = mongoose.model("User");
      const from = await User.findById(req.session.userId);
      await ArtistProfile.updateOne(
        { userId: new mongoose.Types.ObjectId(req.params.userId) },
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
      res.status(500).json({ error: e.message });
    }
  });

  // GET FAN MESSAGE INBOX (for artist)
  app.get("/api/artist/fan-messages/inbox", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: uid(req) });
      if (!artist) return res.status(404).json({ error: "Not found" });
      res.json(artist.fanMessages || []);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // REPLY TO FAN MESSAGE (artist)
  app.post("/api/artist/fan-messages/:msgId/reply", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: uid(req) });
      if (!artist) return res.status(404).json({ error: "Not found" });
      const msg = artist.fanMessages.id(req.params.msgId);
      if (!msg) return res.status(404).json({ error: "Message not found" });
      msg.reply = req.body.reply;
      msg.repliedAt = new Date();
      await artist.save();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE FAN MESSAGE (artist)
  app.delete("/api/artist/fan-messages/:msgId", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({ userId: uid(req) });
      if (!artist) return res.status(404).json({ error: "Not found" });
      artist.fanMessages = artist.fanMessages.filter(
        m => m._id.toString() !== req.params.msgId
      );
      await artist.save();
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET current user's fan messages with this artist (for fans)
  app.get("/api/artist/:userId/fan-messages/me", requireLogin, async (req, res) => {
    try {
      const artist = await ArtistProfile.findOne({
        userId: new mongoose.Types.ObjectId(req.params.userId)
      }).lean();
      if (!artist) return res.status(404).json([]);

      const me = String(req.session.userId);
      const mine = (artist.fanMessages || [])
        .filter(m => String(m.fromUserId) === me)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      res.json(mine);
    } catch (e) {
      res.status(500).json([]);
    }
  });

  // SEARCH ARTISTS (all + by name/genre/bio)
  app.get("/api/artists/search", requireLogin, async (req, res) => {
    try {
      const rawQ = (req.query.q || "").trim();
      const q = rawQ.toLowerCase();

      const artists = await ArtistProfile.find({ isArtist: true }).lean();

      const User = mongoose.model("User");
      const users = await User.find({}).select("name _id profilePic").lean();

      const userMap = {};
      users.forEach(u => { userMap[String(u._id)] = u; });

      const filtered = q
        ? artists.filter(a => {
            const user = userMap[String(a.userId)];
            const name = (user?.name || "").toLowerCase();
            const artistName = (a.artistName || "").toLowerCase();
            const genre = (a.genre || "").toLowerCase();
            const bio = (a.bio || "").toLowerCase();
            return (
              name.includes(q) ||
              artistName.includes(q) ||
              genre.includes(q) ||
              bio.includes(q)
            );
          })
        : artists;

      res.json(
        filtered.map(a => {
          const user = userMap[String(a.userId)];
          return {
            userId: a.userId,
            artistName: a.artistName || user?.name || "Artist",
            userName: user?.name || "Artist",
            profilePic: user?.profilePic || null,
            genre: a.genre || "",
            bio: a.bio || "",
            isVerified: !!a.isVerified,
            trackCount: (a.importedTracks || []).length,
            showCount: (a.upcomingShows || []).length
          };
        })
      );
    } catch (e) {
      console.error("artist search error:", e);
      res.json([]);
    }
  });

};