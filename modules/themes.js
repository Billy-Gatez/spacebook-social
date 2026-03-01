const mongoose = require("mongoose");

const themeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true },
  background: { type: String, default: "#0d0d0d" },
  accentColor: { type: String, default: "#ff6a00" },
  fontFamily: { type: String, default: "Inter" },
  layoutPreset: { type: String, enum: ["default","compact","wide","centered"], default: "default" },
  backgroundType: { type: String, enum: ["color","gradient","image"], default: "color" },
  backgroundValue: { type: String, default: "#0d0d0d" },
  updatedAt: { type: Date, default: Date.now }
});

const Theme = mongoose.models.Theme || mongoose.model("Theme", themeSchema);

const DEFAULT_THEME = {
  background: "#0d0d0d",
  accentColor: "#ff6a00",
  fontFamily: "Inter",
  layoutPreset: "default",
  backgroundType: "color",
  backgroundValue: "#0d0d0d"
};

module.exports = function attachThemes(app, mongoose, requireLogin) {

  app.get("/api/themes/me", requireLogin, async (req, res) => {
    const theme = await Theme.findOne({ userId: req.session.userId });
    if (!theme) return res.json(DEFAULT_THEME);
    res.json(theme);
  });

  app.get("/api/themes/:userId", async (req, res) => {
    const theme = await Theme.findOne({ userId: req.params.userId });
    if (!theme) return res.json(DEFAULT_THEME);
    res.json(theme);
  });

  app.post("/api/themes", requireLogin, async (req, res) => {
    const { background, accentColor, fontFamily, layoutPreset, backgroundType, backgroundValue } = req.body;
    const theme = await Theme.findOneAndUpdate(
      { userId: req.session.userId },
      {
        background,
        accentColor,
        fontFamily,
        layoutPreset,
        backgroundType,
        backgroundValue,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    res.json(theme);
  });
};
