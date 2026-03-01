const mongoose = require("mongoose");
const path = require("path");

const profileSongSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  mood: { type: String, default: "default" },
  soundcloudUrl: String,
  isFeatured: { type: Boolean, default: false },
  weekOf: String,
  createdAt: { type: Date, default: Date.now }
});

const ProfileSong = mongoose.models.ProfileSong || mongoose.model("ProfileSong", profileSongSchema);

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

module.exports = function attachSoundCloud(app, mongoose, requireLogin) {

  app.get("/api/profile-songs/:userId", requireLogin, async (req, res) => {
    const songs = await ProfileSong.find({ userId: req.params.userId });
    res.json(songs);
  });

  app.post("/api/profile-songs", requireLogin, async (req, res) => {
    const { mood, soundcloudUrl, isFeatured } = req.body;
    const weekOf = getISOWeek(new Date());
    await ProfileSong.findOneAndUpdate(
      { userId: req.session.userId, mood },
      { soundcloudUrl, isFeatured: !!isFeatured, weekOf, createdAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  });

  app.get("/api/profile-songs/:userId/featured", requireLogin, async (req, res) => {
    const song = await ProfileSong.findOne({ userId: req.params.userId, isFeatured: true });
    res.json(song || null);
  });

  app.get("/api/soundcloud/oembed", requireLogin, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing url" });
    try {
      const r = await fetch(
        `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}&color=%23ff6a00`
      );
      const data = await r.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
