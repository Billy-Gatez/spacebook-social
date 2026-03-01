const mongoose = require("mongoose");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");
const cloudinaryLib = require("cloudinary").v2;
const path = require("path");

const postReactionSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  emoji: String
});
const PostReaction = mongoose.models.PostReaction || mongoose.model("PostReaction", postReactionSchema);

const commentSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userName: String,
  userPic: String,
  text: String,
  mediaUrl: String,
  mediaType: String,
  reactions: [{ userId: mongoose.Schema.Types.ObjectId, emoji: String }],
  createdAt: { type: Date, default: Date.now }
});
const Comment = mongoose.models.Comment || mongoose.model("Comment", commentSchema);

const activitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, enum: ["post","photo","playlist","song","friend","story","comment"] },
  targetId: mongoose.Schema.Types.ObjectId,
  targetModel: String,
  description: String,
  createdAt: { type: Date, default: Date.now }
});
const Activity = mongoose.models.Activity || mongoose.model("Activity", activitySchema);

const commentMediaStorage = new CloudinaryStorage({
  cloudinary: cloudinaryLib,
  params: {
    folder: "spacebook_comments",
    resource_type: "auto",
    allowed_formats: ["jpg","jpeg","png","gif","ogg","wav","mp3"]
  }
});
const commentUpload = multer({ storage: commentMediaStorage });

module.exports = function attachSocial(app, mongoose, requireLogin, cloudinary, upload) {

  const ALLOWED_EMOJIS = ["🔥","💫","😭","🤝","🚀","❤️","😂"];

  app.post("/api/posts/:postId/react", requireLogin, async (req, res) => {
    const { emoji } = req.body;
    if (!ALLOWED_EMOJIS.includes(emoji)) return res.status(400).json({ error: "Invalid emoji" });
    await PostReaction.findOneAndUpdate(
      { postId: req.params.postId, userId: req.session.userId },
      { emoji },
      { upsert: true }
    );
    const reactions = await PostReaction.find({ postId: req.params.postId });
    res.json(reactions);
  });

  app.get("/api/posts/:postId/reactions", requireLogin, async (req, res) => {
    const reactions = await PostReaction.find({ postId: req.params.postId });
    res.json(reactions);
  });

  app.delete("/api/posts/:postId/react", requireLogin, async (req, res) => {
    await PostReaction.deleteOne({ postId: req.params.postId, userId: req.session.userId });
    res.json({ success: true });
  });

  app.get("/api/posts/:postId/comments", requireLogin, async (req, res) => {
    const comments = await Comment.find({ postId: req.params.postId }).sort({ createdAt: 1 });
    res.json(comments);
  });

  app.post("/api/posts/:postId/comments", requireLogin, commentUpload.single("media"), async (req, res) => {
    const User = mongoose.model("User");
    const user = await User.findById(req.session.userId);
    const comment = await Comment.create({
      postId: req.params.postId,
      userId: req.session.userId,
      userName: user.name,
      userPic: user.profilePic,
      text: req.body.text,
      mediaUrl: req.file ? req.file.path : undefined,
      mediaType: req.body.mediaType
    });
    await Activity.create({
      userId: req.session.userId,
      type: "comment",
      targetId: req.params.postId,
      targetModel: "Post",
      description: `${user.name} commented on a post`
    }).catch(() => {});
    res.json(comment);
  });

  app.delete("/api/comments/:commentId", requireLogin, async (req, res) => {
    await Comment.deleteOne({ _id: req.params.commentId, userId: req.session.userId });
    res.json({ success: true });
  });

  app.post("/api/comments/:commentId/react", requireLogin, async (req, res) => {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: "Not found" });
    const ex = comment.reactions.find(r => r.userId.toString() === req.session.userId.toString());
    if (ex) { ex.emoji = req.body.emoji; } else { comment.reactions.push({ userId: req.session.userId, emoji: req.body.emoji }); }
    await comment.save();
    res.json(comment.reactions);
  });

  app.get("/api/friend-suggestions", requireLogin, async (req, res) => {
    const User = mongoose.model("User");
    const me = await User.findById(req.session.userId).populate("friends");
    const myFriendIds = (me.friends || []).map(f => f._id.toString());
    const myFriendSet = new Set(myFriendIds);
    const candidates = await User.find({
      _id: { $ne: me._id, $nin: myFriendIds }
    }).populate("friends").limit(100);
    const scored = candidates.map(u => {
      const mutuals = (u.friends || []).filter(f => myFriendSet.has(f.toString())).length;
      return { user: u, mutuals };
    }).sort((a, b) => b.mutuals - a.mutuals).slice(0, 10);
    res.json(scored.map(s => ({ ...s.user.toObject(), mutuals: s.mutuals })));
  });

  app.get("/api/activity-feed", requireLogin, async (req, res) => {
    const User = mongoose.model("User");
    const me = await User.findById(req.session.userId);
    const ids = [...(me.friends || []), me._id];
    const feed = await Activity.find({ userId: { $in: ids } })
      .sort({ createdAt: -1 }).limit(50);
    res.json(feed);
  });

  app.get("/activity", requireLogin, (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "activity.html"));
  });

  app.get("/api/profile", requireLogin, async (req, res) => {
    try {
      const User = mongoose.model("User");
      const Post = mongoose.model("Post");
      const targetId = req.query.id || req.session.userId;
      const user = await User.findById(targetId)
        .populate("friends", "name profilePic _id")
        .populate("topFriends", "name profilePic _id");
      if (!user) return res.status(404).json({ error: "User not found" });
      const posts = await Post.find({ userId: targetId }).sort({ createdAt: -1 });
      const isOwn = targetId.toString() === req.session.userId.toString();
      const isFriend = (user.friends || []).some(f => f._id.toString() === req.session.userId.toString());
      res.json({ user, posts, isOwn, isFriend });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
