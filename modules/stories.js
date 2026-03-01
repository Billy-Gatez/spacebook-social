const mongoose = require("mongoose");
const path = require("path");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const cloudinaryLib = require("cloudinary").v2;

const storySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userName: String,
  userPic: String,
  type: { type: String, enum: ["photo", "video", "text"], default: "text" },
  content: String,
  mediaUrl: String,
  bgColor: { type: String, default: "#1a1a1a" },
  fontColor: { type: String, default: "#f2f2f2" },
  reactions: [{
    userId: mongoose.Schema.Types.ObjectId,
    emoji: String,
    userName: String
  }],
  viewers: [{
    userId: mongoose.Schema.Types.ObjectId,
    viewedAt: Date
  }],
  archived: { type: Boolean, default: false },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  createdAt: { type: Date, default: Date.now }
});

const Story = mongoose.models.Story || mongoose.model("Story", storySchema);

module.exports = function attachStories(app, server, mongoose, requireLogin, cloudinary, upload) {

  const storyStorage = new CloudinaryStorage({
    cloudinary: cloudinaryLib,
    params: {
      folder: "spacebook_stories",
      resource_type: "auto",
      allowed_formats: ["jpg","jpeg","png","gif","mp4","webm"]
    }
  });
  const storyUpload = multer({ storage: storyStorage });

  app.get("/stories", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "stories.html"));
  });

  app.get("/api/stories", requireLogin, async (req, res) => {
    const User = mongoose.model("User");
    const me = await User.findById(req.session.userId);
    const ids = [...(me.friends || []), me._id];
    const stories = await Story.find({
      userId: { $in: ids },
      archived: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });
    res.json(stories);
  });

  app.post("/api/stories", requireLogin, storyUpload.single("media"), async (req, res) => {
    const User = mongoose.model("User");
    const user = await User.findById(req.session.userId);
    const story = await Story.create({
      userId: req.session.userId,
      userName: user.name,
      userPic: user.profilePic,
      type: req.body.type || "text",
      content: req.body.content,
      mediaUrl: req.file ? req.file.path : undefined,
      bgColor: req.body.bgColor || "#1a1a1a",
      fontColor: req.body.fontColor || "#f2f2f2"
    });
    res.json(story);
  });

  app.post("/api/stories/:id/view", requireLogin, async (req, res) => {
    const me = req.session.userId;
    await Story.updateOne(
      { _id: req.params.id, "viewers.userId": { $ne: me } },
      { $push: { viewers: { userId: me, viewedAt: new Date() } } }
    );
    res.json({ success: true });
  });

  app.post("/api/stories/:id/react", requireLogin, async (req, res) => {
    const User = mongoose.model("User");
    const user = await User.findById(req.session.userId);
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ error: "Not found" });
    const existing = story.reactions.find(r => r.userId.toString() === req.session.userId.toString());
    if (existing) {
      existing.emoji = req.body.emoji;
    } else {
      story.reactions.push({ userId: req.session.userId, emoji: req.body.emoji, userName: user.name });
    }
    await story.save();
    res.json({ success: true });
  });

  app.get("/api/stories/archive", requireLogin, async (req, res) => {
    const stories = await Story.find({
      userId: req.session.userId,
      $or: [{ archived: true }, { expiresAt: { $lt: new Date() } }]
    }).sort({ createdAt: -1 });
    res.json(stories);
  });

  app.delete("/api/stories/:id", requireLogin, async (req, res) => {
    await Story.deleteOne({ _id: req.params.id, userId: req.session.userId });
    res.json({ success: true });
  });
};
