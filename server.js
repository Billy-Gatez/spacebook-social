const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const attachChessServer = require("./chess-ws");
const attachStories = require("./modules/stories"); // adjust path if folder is different

// ====== CLOUDINARY ======
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

// FS FOR PAGE CREATION
const fs = require("fs");

// ====== APP ======
const app = express();

// REQUIRED FOR RENDER TO SEND COOKIES
app.set("trust proxy", 1);

const cors = require("cors");
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://spacebook.world",
    "https://spacebook.netlify.app",
    "https://spacebook-app.onrender.com",
    "null"
  ],
  credentials: true
}));

// ====== CONFIG ======
const MONGO_URI = "mongodb+srv://jercahill:Spacebook2026@spacebook.mpqjbcv.mongodb.net/spacebook?retryWrites=true&w=majority";
const PORT = process.env.PORT || 3000;

// ====== CLOUDINARY CONFIG ======
cloudinary.config({
  cloud_name: "dswjf3yeo",
  api_key: "623674686576159",
  api_secret: "sPxP8lqOyPn_FU6o1Be20BrBdfM"
});

// ====== DB SETUP ======
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("Mongo error", err));

// ====== SCHEMAS ======
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  birthday: String,
  network: String,
  profilePic: String,
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  topFriends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
});

const postSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  userName: String,
  content: String,
  imagePath: String,
  createdAt: { type: Date, default: Date.now }
});

const postCommentSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userName: String,
  userPic: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
});

const postReactionSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  emoji: String
});

const notificationSchema = new mongoose.Schema({
  toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  fromUserName: String,
  type: String,
  postId: mongoose.Schema.Types.ObjectId,
  text: String,
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const playerSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  emoji: { type: String, default: "♟️" },
  color: { type: String, default: "#22c55e" },
  rating: { type: Number, default: 1200 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

// ====== MODELS ======
const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);
const PostComment = mongoose.model("PostComment", postCommentSchema);
const PostReaction = mongoose.model("PostReaction", postReactionSchema);
const Notification = mongoose.model("Notification", notificationSchema);
const Player = mongoose.model("Player", playerSchema);

// ====== ELO ======
function updateElo(rA, rB, scoreA, k = 32) {
  const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const newA = rA + k * (scoreA - expectedA);
  return Math.round(newA);
}

// ====== MIDDLEWARE ======
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const isProduction = process.env.NODE_ENV === "production";
app.use(session({
  secret: "spacebook-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction ? true : false
  }
}));

app.use(express.static(path.join(__dirname, "public")));

// ====== AUTH GUARD ======
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect("/");
  next();
}

// ====== CLOUDINARY MULTER STORAGE ======
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "spacebook",
    allowed_formats: ["jpg", "jpeg", "png", "gif"]
  }
});
const upload = multer({ storage });

// Attach stories routes (must be after requireLogin, cloudinary, upload)
attachStories(app, null, mongoose, requireLogin, cloudinary, upload);


// ====== ROUTES ======

// Landing
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Signup page
app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "signup.html"));
});

// Signup handler
app.post("/signup", async (req, res) => {
  const { name, email, password, birthday, network } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.send("User already exists. <a href='/'>Log in</a>");
    const user = await User.create({ name, email, password, birthday, network });
    req.session.userId = user._id;
    res.redirect("/feed");
  } catch (err) {
    console.error(err);
    res.send("Error creating user.");
  }
});

// Login handler
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, password });
  if (!user) return res.send("Invalid credentials. <a href='/'>Try again</a>");
  req.session.userId = user._id;
  res.redirect("/feed");
});

// ====== SAVE PAGE TO GITHUB (PERMANENT) ======
app.post("/createPage", async (req, res) => {
  const { filename, content } = req.body;
  if (!filename || !content) {
    return res.json({ success: false, error: "Missing filename or content" });
  }
  const safeName = filename.replace(/[^a-zA-Z0-9._]/g, "");
  const filePath = "pages/" + safeName;
  const url = "https://api.github.com/repos/" + process.env.GITHUB_OWNER + "/" + process.env.GITHUB_REPO + "/contents/" + filePath;
  const encoded = Buffer.from(content).toString("base64");
  try {
    const check = await fetch(url, {
      headers: {
        "Authorization": "Bearer " + process.env.GITHUB_TOKEN,
        "Accept": "application/vnd.github+json"
      }
    });
    if (check.status === 200) {
      return res.json({ success: false, error: "exists" });
    }
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + process.env.GITHUB_TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/vnd.github+json"
      },
      body: JSON.stringify({ message: "Create " + filePath, content: encoded })
    });
    await response.json();
    return res.json({
      success: true,
      url: "https://spacebook-app.onrender.com/view?page=" + safeName.replace(".html", "")
    });
  } catch (err) {
    console.error("GitHub Save Error:", err);
    return res.json({ success: false, error: err.message });
  }
});

// ====== VIEW PAGE (RENDERS THE HTML) ======
app.get("/view", async (req, res) => {
  const page = req.query.page;
  if (!page) return res.send("Missing ?page=name");
  const url = "https://raw.githubusercontent.com/" + process.env.GITHUB_OWNER + "/" + process.env.GITHUB_REPO + "/main/pages/" + page + ".html";
  try {
    const response = await fetch(url);
    if (!response.ok) return res.send("Page not found on GitHub.");
    const html = await response.text();
    res.send(html);
  } catch (err) {
    console.error("VIEW ERROR:", err);
    res.send("Error loading page.");
  }
});

// ====== HOME (DASHBOARD) ======
app.get("/home", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId).populate("friends").populate("topFriends");
  if (!user) return res.redirect("/");

  const friendIds = user.friends.map(f => f._id);
  friendIds.push(user._id);

  const latestPosts = await Post.find({ userId: { $in: friendIds } })
    .sort({ createdAt: -1 })
    .limit(5);

  const suggestedFriends = await User.find({
    _id: { $ne: user._id, $nin: friendIds }
  }).limit(8);

  const latestPostsHtml = latestPosts.map(p => `
    <div class="post">
      <div class="author">${p.userName}</div>
      <div class="meta">${p.createdAt.toLocaleString()}</div>
      <p style="margin-top:6px;">${p.content || ""}</p>
      ${p.imagePath ? `<img src="${p.imagePath}" style="max-width:100%; margin-top:8px; border-radius:6px;">` : ""}
    </div>
  `).join("");

  const suggestedHtml = suggestedFriends.map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="
        width:50px; height:50px; border-radius:8px;
        background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;
        margin-bottom:4px;
      "></div>
      <div style="font-size:12px;">
        <a href="/profile/${f._id}" style="color:#ff6a00; text-decoration:none;">${f.name}</a>
      </div>
      <form action="/add-friend/${f._id}" method="post" style="margin-top:4px;">
        <button class="btn-primary" style="padding:4px 8px; font-size:11px;">Add Friend</button>
      </form>
    </div>
  `).join("");

  const pic = user.profilePic || "/assets/img/default-avatar.png";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Home – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        html, body { background: #000 !important; margin: 0; padding: 0; color: #fff; font-family: Arial, sans-serif; overflow-x: hidden; }
        #starfield { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: #000; }
        .navbar { width: 100%; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.65); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 100; box-sizing: border-box; }
        .navbar a { color: #ff6a00; text-decoration: none; font-weight: bold; }
        .nav-links { display: flex; flex-wrap: wrap; gap: 10px; }
        .nav-links a { color: #ccc; font-size: 13px; font-weight: normal; }
        .nav-links a:hover { color: #ff6a00; }
        .page { width: 100%; min-height: 100vh; display: flex; gap: 30px; padding: 40px; background: transparent !important; box-sizing: border-box; }
        .sidebar .card, .feed .card { border-radius: 12px; background: rgba(0,0,0,0.45); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.15); padding: 20px; margin-bottom: 20px; }
        .profile-summary { display: flex; align-items: center; gap: 16px; }
        .profile-summary-avatar { width: 64px; height: 64px; border-radius: 50%; background: #111 url('${pic}') center/cover no-repeat; border: 2px solid #ff6a00; }
        .friend-grid { display: flex; flex-wrap: wrap; gap: 10px; }
        .friend-tile { width: 80px; text-align: center; }
        .btn-primary { display: inline-block; padding: 8px 14px; background: #ff6a00; color: #000; border-radius: 6px; text-decoration: none; font-weight: bold; border: none; cursor: pointer; transition: 0.2s; }
        .btn-primary:hover { background: #ff8c32; }
        @media (max-width: 600px) { .page { flex-direction: column; padding: 16px; } .sidebar { width: 100%; } }
      </style>
    </head>
    <body>
      <canvas id="starfield"></canvas>
      <script>
        const canvas = document.getElementById("starfield");
        const ctx = canvas.getContext("2d");
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        window.addEventListener("resize", () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
        const stars = Array.from({ length: 200 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.5 + 0.3, alpha: Math.random(), speed: Math.random() * 0.3 + 0.1 }));
        const shootingStars = [];
        function spawnShootingStar() { shootingStars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.5, len: Math.random() * 120 + 80, speed: Math.random() * 8 + 6, angle: Math.PI / 4, alpha: 1 }); }
        setInterval(spawnShootingStar, 2500);
        function draw() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          stars.forEach(s => { s.alpha += s.speed * 0.02 * (Math.random() > 0.5 ? 1 : -1); s.alpha = Math.max(0.1, Math.min(1, s.alpha)); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255," + s.alpha + ")"; ctx.fill(); });
          for (let i = shootingStars.length - 1; i >= 0; i--) { const s = shootingStars[i]; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len); const grad = ctx.createLinearGradient(s.x, s.y, s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len); grad.addColorStop(0, "rgba(255,150,50," + s.alpha + ")"); grad.addColorStop(1, "rgba(255,150,50,0)"); ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.stroke(); s.x += Math.cos(s.angle) * s.speed; s.y += Math.sin(s.angle) * s.speed; s.alpha -= 0.015; if (s.alpha <= 0) shootingStars.splice(i, 1); }
          requestAnimationFrame(draw);
        }
        draw();
      <\/script>

      <div class="navbar">
        <div class="logo"><a href="/feed" style="color:#ff6a00;">Spacebook</a></div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/feed">Feed</a>
          <a href="/profile">Profile</a>
          <a href="/messages">Messages</a>
          <a href="/gallery">Gallery</a>
          <a href="/stories">Stories</a>
          <a href="/listen-together">Listen Together</a>
          <a href="/artist-dashboard">Artist</a>
          <a href="/activity">Activity</a>
          <a href="/logout">Log Out</a>
        </div>
      </div>

      <div class="page">
        <aside class="sidebar">
          <div class="card">
            <div class="profile-summary">
              <div class="profile-summary-avatar"></div>
              <div>
                <div style="font-size:18px; color:#ff6a00;">${user.name}</div>
                <div style="font-size:13px; color:#ccc;">${user.network || "Unknown network"}</div>
              </div>
            </div>
            <hr style="margin:16px 0; border:none; border-top:1px solid rgba(255,255,255,0.2);">
            <strong style="color:#ff6a00;">Navigation</strong>
            <ul style="list-style:none; margin-top:10px; font-size:14px; padding-left:0;">
              <li><a href="/profile" style="color:#ff6a00;">Your Profile</a></li>
              <li><a href="/feed" style="color:#ff6a00;">Feed</a></li>
              <li><a href="/messages" style="color:#ff6a00;">Messages</a></li>
              <li><a href="/gallery" style="color:#ff6a00;">Gallery</a></li>
              <li><a href="/stories" style="color:#ff6a00;">Stories</a></li>
              <li><a href="/listen-together" style="color:#ff6a00;">Listen Together</a></li>
              <li><a href="/artist-dashboard" style="color:#ff6a00;">Artist</a></li>
              <li><a href="/activity" style="color:#ff6a00;">Activity</a></li>
            </ul>
          </div>
          <div class="card">
            <strong style="color:#ff6a00;">Suggested Friends</strong>
            <div class="friend-grid" style="margin-top:10px;">
              ${suggestedHtml || "<p style='color:#ccc; font-size:13px;'>No suggestions right now.</p>"}
            </div>
          </div>
        </aside>

        <main class="feed">
          <div class="card">
            <h2 style="color:#ff6a00; margin-bottom:10px;">Welcome back, ${user.name} 👋</h2>
            <p style="color:#ccc; font-size:14px;">Share what's happening in your universe.</p>
            <form action="/post" method="post" enctype="multipart/form-data" style="margin-top:10px;">
              <textarea name="content" placeholder="What's happening in your universe?" style="width:100%; min-height:80px;"></textarea>
              <label style="color:#ccc; font-size:14px; margin-top:6px; display:block;">Upload an image (optional)</label>
              <input type="file" name="image" accept="image/*">
              <button class="btn-primary" style="margin-top:10px;">Post</button>
            </form>
          </div>
          <div class="card">
            <h3 style="color:#ff6a00; margin-bottom:10px;">Latest from your universe</h3>
            ${latestPostsHtml || "<p style='color:#ccc; font-size:13px;'>No posts yet.</p>"}
          </div>
        </main>
      </div>
    </body>
    </html>
  `);
});


// ====== FEED ======
app.get("/feed", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId).populate("friends");
  const friendIds = user.friends.map(f => f._id);
  friendIds.push(user._id);
  const posts = await Post.find({ userId: { $in: friendIds } }).sort({ createdAt: -1 });

  const htmlPosts = posts.map(p => {
    const isOwner = p.userId.toString() === user._id.toString();
    return `
    <div class="post-card" data-post-id="${p._id}">
      <div class="post">
        <div class="author">
          <a href="/profile/${p.userId}" style="color:#ff6a00;text-decoration:none;">${p.userName}</a>
        </div>
        <div class="meta">${p.createdAt.toLocaleString()}</div>
        <p class="post-content" style="margin-top:6px;">${p.content || ""}</p>
        <div class="post-image-wrapper">
          ${p.imagePath ? `<img class="post-image" src="${p.imagePath}" style="max-width:100%;margin-top:8px;border-radius:6px;">` : ""}
        </div>
        ${isOwner ? `
        <div class="post-actions" style="margin-top:8px;font-size:13px;">
          <button class="btn-secondary edit-post-btn" type="button">Edit</button>
          <button class="btn-secondary delete-post-btn" type="button" style="margin-left:6px;">Delete</button>
        </div>` : ""}
      </div>

      <div class="post-reactions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
        ${["❤️","🔥","😂","🤝","🚀"].map(e => `
          <button class="react-pill" data-emoji="${e}" data-post-id="${p._id}">${e}
            <span class="rpill-count" id="rp-${p._id}-${e.codePointAt(0)}">0</span>
          </button>`).join("")}
      </div>

      <div style="margin-top:8px;">
        <button class="btn-secondary comment-toggle-btn" data-post-id="${p._id}"
          style="font-size:12px;padding:4px 10px;">💬 Comments</button>
      </div>

      <div class="comment-section" id="cs-${p._id}" style="display:none;margin-top:10px;">
        <div class="comment-list" id="cl-${p._id}"
          style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;max-height:200px;overflow-y:auto;"></div>
        <div style="display:flex;gap:8px;">
          <input class="comment-input" data-post-id="${p._id}" type="text"
            placeholder="Write a comment..." maxlength="300"
            style="flex:1;background:rgba(255,255,255,0.07);border:1px solid #444;border-radius:8px;color:#fff;padding:6px 10px;font-size:13px;"
            onkeydown="if(event.key==='Enter') submitPostComment('${p._id}', this)"/>
          <button class="btn-primary" style="font-size:12px;padding:6px 10px;"
            onclick="submitPostComment('${p._id}', document.querySelector('.comment-input[data-post-id=\\'${p._id}\\']'))">Post</button>
        </div>
      </div>

      ${isOwner ? `
      <div class="post-editor" id="editor-${p._id}">
        <form class="post-editor-form" data-post-id="${p._id}">
          <label style="font-size:13px;color:#ccc;">Edit your post</label>
          <textarea name="content" class="post-editor-text"
            style="width:100%;min-height:80px;margin-top:4px;">${p.content || ""}</textarea>
          <div class="editor-image-section" style="margin-top:8px;">
            <div class="current-image-preview">
              ${p.imagePath
                ? `<img src="${p.imagePath}" class="editor-image" style="max-width:100%;border-radius:6px;margin-bottom:6px;">`
                : `<p style="font-size:12px;color:#777;">No image attached.</p>`}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px;">
              <button type="button" class="btn-secondary delete-image-btn" style="font-size:12px;">Delete Image</button>
              <label class="btn-secondary" style="font-size:12px;cursor:pointer;">Replace Image
                <input type="file" name="image" accept="image/*" style="display:none;">
              </label>
              <input type="hidden" name="deleteImage" value="false">
            </div>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px;">
            <button type="submit" class="btn-primary" style="flex:0 0 auto;">Save Changes</button>
            <button type="button" class="btn-secondary cancel-edit-btn" style="flex:0 0 auto;">Cancel</button>
          </div>
        </form>
      </div>` : ""}
    </div>`;
  }).join("");

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Feed – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        html, body { background: #000 !important; margin: 0; padding: 0; color: #fff; font-family: Arial, sans-serif; overflow-x: hidden; }
        #starfield { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: #000; }
        .navbar { width: 100%; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.65); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 100; box-sizing: border-box; }
        .navbar .logo a { color: #ff6a00; text-decoration: none; font-size: 20px; font-weight: bold; }
        .nav-links { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .nav-links a { color: #ccc; text-decoration: none; font-size: 13px; }
        .nav-links a:hover { color: #ff6a00; }
        .page { width: 100%; min-height: 100vh; display: flex; gap: 30px; padding: 30px 40px; background: transparent !important; box-sizing: border-box; }
        .sidebar { width: 240px; flex-shrink: 0; }
        .feed { flex: 1; min-width: 0; }
        .card { border-radius: 12px; background: rgba(0,0,0,0.45); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.15); padding: 20px; margin-bottom: 20px; }
        .post-card { margin-bottom: 16px; }
        .post-editor { margin-top: 8px; border-radius: 12px; background: rgba(0,0,0,0.55); backdrop-filter: blur(10px); border: 1px solid rgba(255,106,0,0.6); padding: 12px; max-height: 0; opacity: 0; overflow: hidden; transition: max-height 0.25s ease, opacity 0.2s ease; }
        .post-editor.open { max-height: 500px; opacity: 1; }
        .btn-primary { display: inline-block; padding: 8px 14px; background: #ff6a00; color: #000; border-radius: 6px; text-decoration: none; font-weight: bold; border: none; cursor: pointer; transition: 0.2s; font-size: 14px; }
        .btn-primary:hover { background: #ff8c32; }
        .btn-secondary { padding: 6px 10px; background: rgba(255,255,255,0.08); border-radius: 6px; border: none; color: #ff6a00; cursor: pointer; font-weight: bold; text-decoration: none; transition: 0.2s; }
        .btn-secondary:hover { background: rgba(255,255,255,0.18); }
        .react-pill { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 4px 12px; font-size: 16px; cursor: pointer; color: #fff; transition: all .15s; display: inline-flex; align-items: center; gap: 5px; }
        .react-pill:hover { border-color: #ff6a00; background: rgba(255,106,0,0.15); }
        .react-pill.mine { border-color: #ff6a00; background: rgba(255,106,0,0.2); }
        .rpill-count { font-size: 12px; color: #ccc; }
        .comment-item { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 12px; display: flex; gap: 10px; align-items: flex-start; }
        .comment-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(255,106,0,0.3); }
        .comment-name { font-size: 12px; color: #ff6a00; font-weight: bold; }
        .comment-text { font-size: 13px; color: #f0f0f0; word-break: break-word; margin-top: 2px; }
        .comment-time { font-size: 11px; color: #555; margin-top: 2px; }
        textarea { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid #444; border-radius: 8px; color: #fff; padding: 10px; font-size: 14px; resize: vertical; box-sizing: border-box; }
        textarea:focus { border-color: #ff6a00; outline: none; }
        input[type=text]:focus { border-color: #ff6a00; outline: none; }
        .notif-panel { position: absolute; right: 0; top: 36px; width: 300px; background: rgba(10,10,10,0.97); border: 1px solid rgba(255,106,0,0.3); border-radius: 12px; backdrop-filter: blur(12px); z-index: 500; max-height: 400px; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.6); }
        @media (max-width: 600px) {
          .page { flex-direction: column; padding: 16px; }
          .sidebar { width: 100%; }
          .nav-links a { font-size: 12px; }
        }
      </style>
    </head>
    <body>
      <canvas id="starfield"></canvas>
      <script>
        const canvas = document.getElementById("starfield");
        const ctx = canvas.getContext("2d");
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        window.addEventListener("resize", () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
        const stars = Array.from({ length: 200 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.5 + 0.3, alpha: Math.random(), speed: Math.random() * 0.3 + 0.1 }));
        const shootingStars = [];
        function spawnShootingStar() { shootingStars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.5, len: Math.random() * 120 + 80, speed: Math.random() * 8 + 6, angle: Math.PI / 4, alpha: 1 }); }
        setInterval(spawnShootingStar, 2500);
        function draw() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          stars.forEach(s => { s.alpha += s.speed * 0.02 * (Math.random() > 0.5 ? 1 : -1); s.alpha = Math.max(0.1, Math.min(1, s.alpha)); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255," + s.alpha + ")"; ctx.fill(); });
          for (let i = shootingStars.length - 1; i >= 0; i--) { const s = shootingStars[i]; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len); const grad = ctx.createLinearGradient(s.x, s.y, s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len); grad.addColorStop(0, "rgba(255,150,50," + s.alpha + ")"); grad.addColorStop(1, "rgba(255,150,50,0)"); ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.stroke(); s.x += Math.cos(s.angle) * s.speed; s.y += Math.sin(s.angle) * s.speed; s.alpha -= 0.015; if (s.alpha <= 0) shootingStars.splice(i, 1); }
          requestAnimationFrame(draw);
        }
        draw();
      <\/script>

      <div class="navbar">
        <div class="logo"><a href="/feed">Spacebook</a></div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/feed">Feed</a>
          <a href="/profile">Profile</a>
          <a href="/messages">Messages</a>
          <a href="/gallery">Gallery</a>
          <a href="/stories">Stories</a>
          <a href="/listen-together">Listen Together</a>
          <a href="/artist-dashboard">Artist</a>
          <a href="/activity">Activity</a>
          <a href="/logout">Log Out</a>
          <div style="position:relative;display:inline-block;">
            <button onclick="toggleNotifPanel()"
              style="background:none;border:none;cursor:pointer;font-size:20px;color:#ccc;padding:0 4px;"
              title="Notifications">🔔</button>
            <span id="notif-badge"
              style="display:none;position:absolute;top:-4px;right:-4px;background:#ff6a00;color:#000;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:bold;align-items:center;justify-content:center;">0</span>
            <div id="notif-panel" class="notif-panel" style="display:none;"></div>
          </div>
        </div>
      </div>

      <div class="page">
        <aside class="sidebar">
          <div class="card">
            <strong style="color:#ff6a00;">Navigation</strong>
            <ul style="list-style:none; margin-top:10px; font-size:14px; padding-left:0;">
              <li><a href="/profile" style="color:#ff6a00;">Your Profile</a></li>
              <li><a href="/feed" style="color:#ff6a00;">Feed</a></li>
              <li><a href="/messages" style="color:#ff6a00;">Messages</a></li>
              <li><a href="/gallery" style="color:#ff6a00;">Gallery</a></li>
              <li><a href="/stories" style="color:#ff6a00;">Stories</a></li>
              <li><a href="/listen-together" style="color:#ff6a00;">Listen Together</a></li>
              <li><a href="/artist-dashboard" style="color:#ff6a00;">Artist</a></li>
              <li><a href="/activity" style="color:#ff6a00;">Activity</a></li>
            </ul>
          </div>
        </aside>

        <main class="feed">
          <div class="card">
            <form action="/post" method="post" enctype="multipart/form-data">
              <textarea name="content" placeholder="What's happening in your universe?"></textarea>
              <label style="color:#ccc; font-size:14px; margin-top:6px; display:block;">Upload an image (optional)</label>
              <input type="file" name="image" accept="image/*">
              <button class="btn-primary" style="margin-top:10px;">Post</button>
            </form>
          </div>

          <div class="card" style="margin-top:20px;">
            ${htmlPosts || "<p style='color:#ccc;font-size:13px;'>No posts yet.</p>"}
          </div>
        </main>
      </div>

      <script>
        // ====== REACTIONS ======
        async function loadPostReactions(postId) {
          const data = await fetch("/api/posts/" + postId + "/reactions", { credentials: "include" })
            .then(r => r.json()).catch(() => ({ counts: {}, myReaction: null }));
          ["❤️","🔥","😂","🤝","🚀"].forEach(function(e) {
            const el = document.getElementById("rp-" + postId + "-" + e.codePointAt(0));
            if (el) el.textContent = data.counts[e] || 0;
            const btn = document.querySelector(".react-pill[data-post-id='" + postId + "'][data-emoji='" + e + "']");
            if (btn) btn.classList.toggle("mine", data.myReaction === e);
          });
        }

        document.addEventListener("click", async function(e) {
          const pill = e.target.closest(".react-pill");
          if (pill) {
            const postId = pill.dataset.postId;
            const emoji = pill.dataset.emoji;
            await fetch("/api/posts/" + postId + "/react", {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emoji: emoji })
            });
            loadPostReactions(postId);
          }

          const toggleBtn = e.target.closest(".comment-toggle-btn");
          if (toggleBtn) {
            const postId = toggleBtn.dataset.postId;
            const section = document.getElementById("cs-" + postId);
            if (section.style.display === "none") {
              section.style.display = "block";
              loadPostComments(postId);
            } else {
              section.style.display = "none";
            }
          }

          const editBtn = e.target.closest(".edit-post-btn");
          if (editBtn) {
            const card = editBtn.closest(".post-card");
            const editor = card.querySelector(".post-editor");
            if (editor) editor.classList.toggle("open");
          }

          const cancelBtn = e.target.closest(".cancel-edit-btn");
          if (cancelBtn) {
            const editor = cancelBtn.closest(".post-editor");
            if (editor) editor.classList.remove("open");
          }

          const deleteBtn = e.target.closest(".delete-post-btn");
          if (deleteBtn) {
            const card = deleteBtn.closest(".post-card");
            const postId = card.getAttribute("data-post-id");
            if (!postId) return;
            if (!confirm("Delete this post?")) return;
            fetch("/delete-post/" + postId, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({})
            }).then(r => r.json()).then(data => {
              if (data.success) card.remove();
              else alert("Error deleting post");
            }).catch(() => alert("Error deleting post"));
          }

          const deleteImageBtn = e.target.closest(".delete-image-btn");
          if (deleteImageBtn) {
            const form = deleteImageBtn.closest(".post-editor-form");
            const deleteInput = form.querySelector("input[name=deleteImage]");
            const preview = form.querySelector(".current-image-preview");
            deleteInput.value = "true";
            if (preview) preview.innerHTML = "<p style='font-size:12px;color:#777;'>Image will be removed.</p>";
          }
        });

        document.addEventListener("change", function(e) {
          const fileInput = e.target.closest("input[type=file][name=image]");
          if (fileInput) {
            const form = fileInput.closest(".post-editor-form");
            const deleteInput = form.querySelector("input[name=deleteImage]");
            deleteInput.value = "false";
            const preview = form.querySelector(".current-image-preview");
            if (fileInput.files && fileInput.files[0]) {
              const reader = new FileReader();
              reader.onload = function(ev) {
                if (preview) preview.innerHTML = "<img src='" + ev.target.result + "' style='max-width:100%;border-radius:6px;margin-bottom:6px;'>";
              };
              reader.readAsDataURL(fileInput.files[0]);
            }
          }
        });

        document.addEventListener("submit", function(e) {
          const form = e.target.closest(".post-editor-form");
          if (!form) return;
          e.preventDefault();
          const postId = form.getAttribute("data-post-id");
          const card = form.closest(".post-card");
          const contentEl = card.querySelector(".post-content");
          const imageWrapper = card.querySelector(".post-image-wrapper");
          const formData = new FormData(form);
          fetch("/edit-post/" + postId, { method: "POST", body: formData })
            .then(r => r.json()).then(data => {
              if (!data.success) { alert("Error saving changes"); return; }
              if (contentEl) contentEl.textContent = data.content;
              if (imageWrapper) {
                if (data.imagePath) imageWrapper.innerHTML = "<img class='post-image' src='" + data.imagePath + "' style='max-width:100%;margin-top:8px;border-radius:6px;'>";
                else imageWrapper.innerHTML = "";
              }
              const editor = card.querySelector(".post-editor");
              if (editor) editor.classList.remove("open");
            }).catch(() => alert("Error saving changes"));
        });

        // ====== COMMENTS ======
        async function loadPostComments(postId) {
          const comments = await fetch("/api/posts/" + postId + "/comments", { credentials: "include" })
            .then(r => r.json()).catch(() => []);
          const list = document.getElementById("cl-" + postId);
          if (!list) return;
          if (!comments.length) {
            list.innerHTML = "<div style='color:#666;font-size:13px;padding:6px;'>No comments yet. Be first!</div>";
            return;
          }
          list.innerHTML = comments.map(function(c) {
            return "<div class='comment-item'>" +
              "<img class='comment-avatar' src='" + (c.userPic || "/assets/img/default-avatar.png") + "' onerror=\"this.src='/assets/img/default-avatar.png'\"/>" +
              "<div style='flex:1;min-width:0;'>" +
                "<div class='comment-name'>" + c.userName + "</div>" +
                "<div class='comment-text'>" + c.text + "</div>" +
                "<div class='comment-time'>" + timeAgo(c.createdAt) + "</div>" +
              "</div></div>";
          }).join("");
          list.scrollTop = list.scrollHeight;
        }

        async function submitPostComment(postId, inputEl) {
          const text = inputEl.value.trim();
          if (!text) return;
          await fetch("/api/posts/" + postId + "/comments", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text })
          });
          inputEl.value = "";
          loadPostComments(postId);
        }

        function timeAgo(date) {
          const diff = Date.now() - new Date(date).getTime();
          const mins = Math.floor(diff / 60000);
          if (mins < 1) return "just now";
          if (mins < 60) return mins + "m ago";
          const hrs = Math.floor(mins / 60);
          if (hrs < 24) return hrs + "h ago";
          return Math.floor(hrs / 24) + "d ago";
        }

        // ====== NOTIFICATIONS ======
        async function loadNotifCount() {
          const data = await fetch("/api/notifications/unread-count", { credentials: "include" })
            .then(r => r.json()).catch(() => ({ count: 0 }));
          const badge = document.getElementById("notif-badge");
          if (badge) {
            badge.textContent = data.count > 0 ? data.count : "";
            badge.style.display = data.count > 0 ? "flex" : "none";
          }
        }

        async function toggleNotifPanel() {
          const panel = document.getElementById("notif-panel");
          if (panel.style.display === "none" || !panel.style.display) {
            panel.style.display = "block";
            await fetch("/api/notifications/mark-read", { method: "POST", credentials: "include" });
            const notes = await fetch("/api/notifications", { credentials: "include" })
              .then(r => r.json()).catch(() => []);
            panel.innerHTML = notes.length
              ? notes.map(function(n) {
                  return "<div style='padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;color:#f0f0f0;'>" +
                    "<div>" + n.text + "</div>" +
                    "<div style='font-size:11px;color:#555;margin-top:3px;'>" + timeAgo(n.createdAt) + "</div>" +
                  "</div>";
                }).join("")
              : "<div style='padding:20px;text-align:center;color:#666;'>No notifications yet. 🌌</div>";
            document.getElementById("notif-badge").style.display = "none";
          } else {
            panel.style.display = "none";
          }
        }

        // Load reactions for all posts on page load
        document.querySelectorAll(".post-card").forEach(function(card) {
          const id = card.dataset.postId;
          if (id) loadPostReactions(id);
        });

        loadNotifCount();
        setInterval(loadNotifCount, 30000);
      <\/script>
    </body>
    </html>
  `);
});

// ====== CREATE POST ======
app.post("/post", requireLogin, upload.single("image"), async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) return res.redirect("/");
  const imagePath = req.file ? req.file.path : null;
  await Post.create({
    userId: user._id,
    userName: user.name,
    content: req.body.content,
    imagePath
  });
  res.redirect("/feed");
});

// ====== EDIT POST ======
app.post("/edit-post/:id", requireLogin, upload.single("image"), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.json({ success: false, error: "Post not found" });
    if (post.userId.toString() !== req.session.userId.toString())
      return res.json({ success: false, error: "Not authorized" });
    const { content, deleteImage } = req.body;
    post.content = content;
    if (deleteImage === "true") post.imagePath = null;
    if (req.file) post.imagePath = req.file.path;
    await post.save();
    res.json({ success: true, content: post.content, imagePath: post.imagePath || null });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Server error" });
  }
});

// ====== DELETE POST ======
app.post("/delete-post/:id", requireLogin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.json({ success: false, error: "Post not found" });
    if (post.userId.toString() !== req.session.userId.toString())
      return res.json({ success: false, error: "Not authorized" });
    await Post.deleteOne({ _id: post._id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Server error" });
  }
});

// ====== DELETE PHOTO ONLY ======
app.post("/delete-photo/:id", requireLogin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.json({ success: false, error: "Post not found" });
    if (post.userId.toString() !== req.session.userId.toString())
      return res.json({ success: false, error: "Not authorized" });
    post.imagePath = null;
    await post.save();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Server error" });
  }
});

// ====== POST COMMENTS API ======
app.get("/api/posts/:postId/comments", requireLogin, async (req, res) => {
  const comments = await PostComment.find({ postId: req.params.postId }).sort({ createdAt: 1 });
  res.json(comments);
});

app.post("/api/posts/:postId/comments", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const post = await Post.findById(req.params.postId);
  const comment = await PostComment.create({
    postId: req.params.postId,
    userId: user._id,
    userName: user.name,
    userPic: user.profilePic || "",
    text: req.body.text
  });
  if (post && post.userId.toString() !== user._id.toString()) {
    await Notification.create({
      toUserId: post.userId,
      fromUserId: user._id,
      fromUserName: user.name,
      type: "comment",
      postId: post._id,
      text: user.name + " commented: \"" + req.body.text.slice(0, 60) + "\""
    });
  }
  res.json(comment);
});

app.delete("/api/post-comments/:commentId", requireLogin, async (req, res) => {
  const comment = await PostComment.findById(req.params.commentId);
  if (!comment) return res.status(404).json({ error: "Not found" });
  if (comment.userId.toString() !== req.session.userId.toString())
    return res.status(403).json({ error: "Not yours" });
  await PostComment.deleteOne({ _id: req.params.commentId });
  res.json({ success: true });
});

// ====== POST REACTIONS API ======
app.post("/api/posts/:postId/react", requireLogin, async (req, res) => {
  const { emoji } = req.body;
  const filter = { postId: req.params.postId, userId: req.session.userId };
  const existing = await PostReaction.findOne(filter);
  const post = await Post.findById(req.params.postId);
  const user = await User.findById(req.session.userId);
  if (existing) {
    if (existing.emoji === emoji) {
      await PostReaction.deleteOne({ _id: existing._id });
      return res.json({ action: "removed", emoji });
    }
    existing.emoji = emoji;
    await existing.save();
    return res.json({ action: "updated", emoji });
  }
  await PostReaction.create({ ...filter, emoji });
  if (post && user && post.userId.toString() !== user._id.toString()) {
    await Notification.create({
      toUserId: post.userId,
      fromUserId: user._id,
      fromUserName: user.name,
      type: "reaction",
      postId: post._id,
      text: user.name + " reacted " + emoji + " to your post"
    });
  }
  res.json({ action: "added", emoji });
});

app.get("/api/posts/:postId/reactions", requireLogin, async (req, res) => {
  const reactions = await PostReaction.find({ postId: req.params.postId });
  const counts = {};
  let myReaction = null;
  reactions.forEach(r => {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
    if (r.userId.toString() === req.session.userId.toString()) myReaction = r.emoji;
  });
  res.json({ counts, myReaction });
});

// ====== NOTIFICATIONS API ======
app.get("/api/notifications", requireLogin, async (req, res) => {
  const notes = await Notification.find({ toUserId: req.session.userId })
    .sort({ createdAt: -1 }).limit(30);
  res.json(notes);
});

app.get("/api/notifications/unread-count", requireLogin, async (req, res) => {
  const count = await Notification.countDocuments({ toUserId: req.session.userId, read: false });
  res.json({ count });
});

app.post("/api/notifications/mark-read", requireLogin, async (req, res) => {
  await Notification.updateMany({ toUserId: req.session.userId, read: false }, { read: true });
  res.json({ success: true });
});


// ====== UPLOAD PROFILE PIC ======
app.post("/upload-profile-pic", requireLogin, upload.single("profilePic"), async (req, res) => {
  if (!req.file) return res.redirect("/profile");
  const user = await User.findById(req.session.userId);
  user.profilePic = req.file.path;
  await user.save();
  res.redirect("/profile");
});

// ====== SET TOP FRIENDS ======
app.post("/set-top-friends", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  let selected = req.body.topFriends;
  if (!Array.isArray(selected)) selected = selected ? [selected] : [];
  user.topFriends = selected.slice(0, 8);
  await user.save();
  res.redirect("/profile");
});

// ====== ADD FRIEND ======
app.post("/add-friend/:id", requireLogin, async (req, res) => {
  const viewer = await User.findById(req.session.userId);
  const target = await User.findById(req.params.id);
  if (!viewer || !target) return res.redirect("/feed");
  if (!viewer.friends.some(f => f.toString() === target._id.toString())) {
    viewer.friends.push(target._id);
    await viewer.save();
    await Notification.create({
      toUserId: target._id,
      fromUserId: viewer._id,
      fromUserName: viewer.name,
      type: "friend",
      text: viewer.name + " added you as a friend!"
    });
  }
  res.redirect("/profile/" + target._id);
});

// ====== REMOVE FRIEND ======
app.post("/remove-friend/:id", requireLogin, async (req, res) => {
  const viewer = await User.findById(req.session.userId);
  if (!viewer) return res.redirect("/feed");
  viewer.friends = viewer.friends.filter(f => f.toString() !== req.params.id);
  viewer.topFriends = viewer.topFriends.filter(f => f.toString() !== req.params.id);
  await viewer.save();
  res.redirect("/profile/" + req.params.id);
});

// ====== YOUR OWN PROFILE ======
app.get("/profile", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId)
    .populate("friends")
    .populate("topFriends");
  const posts = await Post.find({ userId: user._id }).sort({ createdAt: -1 });

  const topFriendsHtml = user.topFriends.map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="width:60px;height:60px;border-radius:8px;background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;margin-bottom:4px;border:1px solid rgba(255,106,0,0.3);"></div>
      <div style="font-size:12px;"><a href="/profile/${f._id}" style="color:#ff6a00;">${f.name}</a></div>
    </div>`).join("");

  const friendsGridHtml = user.friends.map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="width:60px;height:60px;border-radius:8px;background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;margin-bottom:4px;border:1px solid rgba(255,106,0,0.3);"></div>
      <div style="font-size:12px;"><a href="/profile/${f._id}" style="color:#ff6a00;">${f.name}</a></div>
    </div>`).join("");

  const postsHtml = posts.map(p => `
    <div class="post-card" data-post-id="${p._id}">
      <div class="post">
        <div class="author">${p.userName}</div>
        <div class="meta">${p.createdAt.toLocaleString()}</div>
        <p class="post-content" style="margin-top:6px;">${p.content || ""}</p>
        <div class="post-image-wrapper">
          ${p.imagePath ? `<img class="post-image" src="${p.imagePath}" style="max-width:100%;margin-top:8px;border-radius:6px;">` : ""}
        </div>
        <div class="post-actions" style="margin-top:8px;font-size:13px;">
          <button class="btn-secondary edit-post-btn" type="button">Edit</button>
          <button class="btn-secondary delete-post-btn" type="button" style="margin-left:6px;">Delete</button>
        </div>
      </div>
      <div class="post-reactions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
        ${["❤️","🔥","😂","🤝","🚀"].map(e => `
          <button class="react-pill" data-emoji="${e}" data-post-id="${p._id}">${e}
            <span class="rpill-count" id="rp-${p._id}-${e.codePointAt(0)}">0</span>
          </button>`).join("")}
      </div>
      <div style="margin-top:8px;">
        <button class="btn-secondary comment-toggle-btn" data-post-id="${p._id}" style="font-size:12px;padding:4px 10px;">💬 Comments</button>
      </div>
      <div class="comment-section" id="cs-${p._id}" style="display:none;margin-top:10px;">
        <div class="comment-list" id="cl-${p._id}" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;max-height:200px;overflow-y:auto;"></div>
        <div style="display:flex;gap:8px;">
          <input class="comment-input" data-post-id="${p._id}" type="text" placeholder="Write a comment..." maxlength="300"
            style="flex:1;background:rgba(255,255,255,0.07);border:1px solid #444;border-radius:8px;color:#fff;padding:6px 10px;font-size:13px;"
            onkeydown="if(event.key==='Enter') submitPostComment('${p._id}', this)"/>
          <button class="btn-primary" style="font-size:12px;padding:6px 10px;"
            onclick="submitPostComment('${p._id}', document.querySelector('.comment-input[data-post-id=\\'${p._id}\\']'))">Post</button>
        </div>
      </div>
      <div class="post-editor" id="editor-${p._id}">
        <form class="post-editor-form" data-post-id="${p._id}">
          <label style="font-size:13px;color:#ccc;">Edit your post</label>
          <textarea name="content" class="post-editor-text" style="width:100%;min-height:80px;margin-top:4px;">${p.content || ""}</textarea>
          <div class="editor-image-section" style="margin-top:8px;">
            <div class="current-image-preview">
              ${p.imagePath ? `<img src="${p.imagePath}" class="editor-image" style="max-width:100%;border-radius:6px;margin-bottom:6px;">` : `<p style="font-size:12px;color:#777;">No image attached.</p>`}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px;">
              <button type="button" class="btn-secondary delete-image-btn" style="font-size:12px;">Delete Image</button>
              <label class="btn-secondary" style="font-size:12px;cursor:pointer;">Replace Image
                <input type="file" name="image" accept="image/*" style="display:none;">
              </label>
              <input type="hidden" name="deleteImage" value="false">
            </div>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px;">
            <button type="submit" class="btn-primary" style="flex:0 0 auto;">Save Changes</button>
            <button type="button" class="btn-secondary cancel-edit-btn" style="flex:0 0 auto;">Cancel</button>
          </div>
        </form>
      </div>
    </div>`).join("");

  const topFriendsSelector = user.friends.map(f => `
    <label style="display:block;font-size:13px;margin-bottom:4px;">
      <input type="checkbox" name="topFriends" value="${f._id}"
        ${user.topFriends.some(tf => tf._id.toString() === f._id.toString()) ? "checked" : ""}>
      ${f.name}
    </label>`).join("");

  const pic = user.profilePic || "/assets/img/default-avatar.png";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${user.name} – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        html, body { background: #000 !important; margin: 0; padding: 0; color: #fff; font-family: Arial, sans-serif; overflow-x: hidden; }
        #starfield { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: #000; }
        .navbar { width: 100%; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.65); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 100; box-sizing: border-box; }
        .navbar .logo a { color: #ff6a00; text-decoration: none; font-size: 20px; font-weight: bold; }
        .nav-links { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .nav-links a { color: #ccc; text-decoration: none; font-size: 13px; }
        .nav-links a:hover { color: #ff6a00; }
        .page { max-width: 860px; margin: 30px auto; padding: 0 16px; box-sizing: border-box; }
        .card { border-radius: 12px; background: rgba(0,0,0,0.45); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.15); padding: 20px; margin-bottom: 20px; }
        .profile-header { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
        .profile-avatar { width: 100px; height: 100px; border-radius: 50%; background: #111 url('${pic}') center/cover no-repeat; border: 3px solid #ff6a00; flex-shrink: 0; }
        .friend-tile { width: 70px; text-align: center; }
        .top-friends-bar { display: flex; flex-wrap: wrap; gap: 10px; }
        .post-card { margin-bottom: 16px; }
        .post-editor { margin-top: 8px; border-radius: 12px; background: rgba(0,0,0,0.55); backdrop-filter: blur(10px); border: 1px solid rgba(255,106,0,0.6); padding: 12px; max-height: 0; opacity: 0; overflow: hidden; transition: max-height 0.25s ease, opacity 0.2s ease; }
        .post-editor.open { max-height: 500px; opacity: 1; }
        .btn-primary { display: inline-block; padding: 8px 14px; background: #ff6a00; color: #000; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; transition: 0.2s; font-size: 14px; }
        .btn-primary:hover { background: #ff8c32; }
        .btn-secondary { padding: 6px 10px; background: rgba(255,255,255,0.08); border-radius: 6px; border: none; color: #ff6a00; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-secondary:hover { background: rgba(255,255,255,0.18); }
        .react-pill { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 4px 12px; font-size: 16px; cursor: pointer; color: #fff; transition: all .15s; display: inline-flex; align-items: center; gap: 5px; }
        .react-pill:hover { border-color: #ff6a00; background: rgba(255,106,0,0.15); }
        .react-pill.mine { border-color: #ff6a00; background: rgba(255,106,0,0.2); }
        .rpill-count { font-size: 12px; color: #ccc; }
        .comment-item { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 12px; display: flex; gap: 10px; align-items: flex-start; }
        .comment-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(255,106,0,0.3); }
        .comment-name { font-size: 12px; color: #ff6a00; font-weight: bold; }
        .comment-text { font-size: 13px; color: #f0f0f0; word-break: break-word; margin-top: 2px; }
        .comment-time { font-size: 11px; color: #555; margin-top: 2px; }
        textarea { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid #444; border-radius: 8px; color: #fff; padding: 10px; font-size: 14px; resize: vertical; box-sizing: border-box; }
        textarea:focus { border-color: #ff6a00; outline: none; }
        .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px,1fr)); gap: 8px; }
        .gallery-thumb { aspect-ratio: 1; border-radius: 10px; overflow: hidden; cursor: pointer; border: 1px solid rgba(255,106,0,0.2); transition: border-color .15s; }
        .gallery-thumb:hover { border-color: #ff6a00; }
        .gallery-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .react-btn { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 6px 14px; font-size: 18px; cursor: pointer; color: #fff; transition: all .15s; display: inline-flex; align-items: center; gap: 5px; }
        .react-btn:hover { border-color: #ff6a00; background: rgba(255,106,0,0.15); }
        .react-btn.mine { border-color: #ff6a00; background: rgba(255,106,0,0.2); }
        @media (max-width: 600px) { .profile-header { flex-direction: column; align-items: flex-start; } .nav-links a { font-size: 12px; } }
      </style>
    </head>
    <body>
      <canvas id="starfield"></canvas>
      <script>
        const canvas = document.getElementById("starfield");
        const ctx = canvas.getContext("2d");
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        window.addEventListener("resize", () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
        const stars = Array.from({ length: 200 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.5 + 0.3, alpha: Math.random(), speed: Math.random() * 0.3 + 0.1 }));
        const shootingStars = [];
        function spawnShootingStar() { shootingStars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.5, len: Math.random() * 120 + 80, speed: Math.random() * 8 + 6, angle: Math.PI / 4, alpha: 1 }); }
        setInterval(spawnShootingStar, 2500);
        function draw() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          stars.forEach(s => { s.alpha += s.speed * 0.02 * (Math.random() > 0.5 ? 1 : -1); s.alpha = Math.max(0.1, Math.min(1, s.alpha)); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255," + s.alpha + ")"; ctx.fill(); });
          for (let i = shootingStars.length - 1; i >= 0; i--) { const s = shootingStars[i]; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len); const grad = ctx.createLinearGradient(s.x, s.y, s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len); grad.addColorStop(0, "rgba(255,150,50," + s.alpha + ")"); grad.addColorStop(1, "rgba(255,150,50,0)"); ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.stroke(); s.x += Math.cos(s.angle) * s.speed; s.y += Math.sin(s.angle) * s.speed; s.alpha -= 0.015; if (s.alpha <= 0) shootingStars.splice(i, 1); }
          requestAnimationFrame(draw);
        }
        draw();
      <\/script>

      <div class="navbar">
        <div class="logo"><a href="/feed">Spacebook</a></div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/feed">Feed</a>
          <a href="/profile">Profile</a>
          <a href="/messages">Messages</a>
          <a href="/gallery">Gallery</a>
          <a href="/stories">Stories</a>
          <a href="/listen-together">Listen Together</a>
          <a href="/artist-dashboard">Artist</a>
          <a href="/activity">Activity</a>
          <a href="/logout">Log Out</a>
        </div>
      </div>

      <div class="page">
        <div class="card">
          <div class="profile-header">
            <div class="profile-avatar"></div>
            <div>
              <h2 style="margin:0;color:#ff6a00;">${user.name}</h2>
              <p style="margin:4px 0;color:#aaa;">${user.network || "Unknown network"}</p>
              <p style="margin:4px 0;color:#ccc;font-size:13px;">"Exploring the universe via Spacebook."</p>
            </div>
          </div>
          <form action="/upload-profile-pic" method="post" enctype="multipart/form-data" style="margin-top:16px;">
            <label style="color:#ccc;font-size:14px;">Update profile picture</label><br>
            <input type="file" name="profilePic" accept="image/*" style="margin-top:6px;">
            <button class="btn-primary" style="margin-top:10px;">Upload</button>
          </form>
        </div>

        <div class="card">
          <h3 style="color:#ff6a00;margin-bottom:10px;">⭐ Top Friends</h3>
          <div class="top-friends-bar">
            ${topFriendsHtml || "<p style='color:#ccc;font-size:13px;'>No top friends yet. Pick some below.</p>"}
          </div>
          <hr style="margin:16px 0;border:none;border-top:1px solid #333;">
          <h3 style="color:#ff6a00;margin-bottom:10px;">👥 Friends</h3>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            ${friendsGridHtml || "<p style='color:#ccc;font-size:13px;'>No friends yet.</p>"}
          </div>
          <form action="/set-top-friends" method="post" style="margin-top:20px;">
            <h4 style="color:#ff6a00;margin-bottom:8px;">Select Top 8 Friends</h4>
            <div style="max-height:200px;overflow-y:auto;border:1px solid #333;padding:10px;border-radius:6px;">
              ${topFriendsSelector || "<p style='color:#ccc;font-size:13px;'>Add some friends first.</p>"}
            </div>
            <button class="btn-primary" style="margin-top:10px;">Save Top Friends</button>
          </form>
        </div>

        <div class="card">
          <h3 style="color:#ff6a00;margin-bottom:10px;">📷 Gallery</h3>
          <div id="profile-own-gallery" class="gallery-grid">
            <p style="color:#888;font-size:13px;">Loading...</p>
          </div>
          <a href="/gallery" style="display:inline-block;margin-top:12px;color:#ff6a00;font-size:13px;">View full gallery →</a>
        </div>

        <div class="card">
          <h3 style="color:#ff6a00;margin-bottom:10px;">📝 Your Posts</h3>
          ${postsHtml || "<p style='color:#ccc;font-size:13px;'>You haven't posted yet.</p>"}
        </div>
      </div>

      <!-- Gallery overlay -->
      <div id="profile-media-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:1000;align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px 0;">
        <div style="max-width:860px;width:100%;padding:0 16px;box-sizing:border-box;">
          <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
            <div onclick="closeProfileGallery()" style="font-size:28px;cursor:pointer;color:#fff;background:rgba(255,255,255,0.1);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">✕</div>
          </div>
          <div id="profile-overlay-media"></div>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center;">
            <button onclick="reactProfilePhoto('❤️')" class="react-btn" id="prb-❤️">❤️ <span id="prc-❤️">0</span></button>
            <button onclick="reactProfilePhoto('🔥')" class="react-btn" id="prb-🔥">🔥 <span id="prc-🔥">0</span></button>
            <button onclick="reactProfilePhoto('😂')" class="react-btn" id="prb-😂">😂 <span id="prc-😂">0</span></button>
            <button onclick="reactProfilePhoto('🤝')" class="react-btn" id="prb-🤝">🤝 <span id="prc-🤝">0</span></button>
            <button onclick="reactProfilePhoto('🚀')" class="react-btn" id="prb-🚀">🚀 <span id="prc-🚀">0</span></button>
          </div>
          <div style="margin-top:16px;">
            <h4 style="color:#ff6a00;margin:0 0 10px;">💬 Comments</h4>
            <div id="profile-comment-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;max-height:220px;overflow-y:auto;"></div>
            <div style="display:flex;gap:8px;">
              <input id="profile-comment-input" type="text" placeholder="Add a comment..." maxlength="300"
                style="flex:1;background:rgba(255,255,255,0.07);border:1px solid #444;border-radius:8px;color:#fff;padding:8px 12px;font-size:13px;"
                onkeydown="if(event.key==='Enter') submitProfileComment()"/>
              <button class="btn-primary" onclick="submitProfileComment()">Post</button>
            </div>
          </div>
        </div>
      </div>

      <script>
        let profileGalleryAlbumId = null;
        let profileGalleryPhotoIndex = null;

        async function loadOwnGallery() {
          const albums = await fetch("/api/albums", { credentials: "include" }).then(r => r.json()).catch(() => []);
          const grid = document.getElementById("profile-own-gallery");
          const allPhotos = [];
          albums.forEach(function(a) { a.photos.forEach(function(p, i) { allPhotos.push({ url: p.url, albumId: a._id, photoIndex: i }); }); });
          if (!allPhotos.length) { grid.innerHTML = "<p style='color:#888;font-size:13px;'>No photos yet.</p>"; return; }
          grid.innerHTML = allPhotos.slice(0, 9).map(function(p) {
            return "<div class='gallery-thumb' onclick=\"openProfileGallery('" + p.albumId + "'," + p.photoIndex + ",'" + p.url + "')\">" +
              "<img src='" + p.url + "' onerror=\"this.src='/assets/img/default-avatar.png'\"/></div>";
          }).join("");
        }

        async function openProfileGallery(albumId, photoIndex, url) {
          profileGalleryAlbumId = albumId;
          profileGalleryPhotoIndex = photoIndex;
          const overlay = document.getElementById("profile-media-overlay");
          const media = document.getElementById("profile-overlay-media");
          const isVideo = url.match(/\.(mp4|webm|ogg)(\?|$)/i);
          media.innerHTML = isVideo
            ? "<video src='" + url + "' controls autoplay style='max-width:100%;max-height:65vh;border-radius:10px;display:block;margin:0 auto;'></video>"
            : "<img src='" + url + "' style='max-width:100%;max-height:65vh;border-radius:10px;display:block;margin:0 auto;' onerror=\"this.src='/assets/img/default-avatar.png'\"/>";
          overlay.style.display = "flex";
          await loadProfileReactions();
          await loadProfileComments();
        }

        function closeProfileGallery() {
          document.getElementById("profile-media-overlay").style.display = "none";
          document.getElementById("profile-overlay-media").innerHTML = "";
          document.getElementById("profile-comment-list").innerHTML = "";
          profileGalleryAlbumId = null; profileGalleryPhotoIndex = null;
        }

        async function loadProfileReactions() {
          const data = await fetch("/api/albums/" + profileGalleryAlbumId + "/photos/" + profileGalleryPhotoIndex + "/reactions", { credentials: "include" })
            .then(r => r.json()).catch(() => ({ counts: {}, myReaction: null }));
          ["❤️","🔥","😂","🤝","🚀"].forEach(function(e) {
            const el = document.getElementById("prc-" + e);
            const btn = document.getElementById("prb-" + e);
            if (el) el.textContent = data.counts[e] || 0;
            if (btn) btn.classList.toggle("mine", data.myReaction === e);
          });
        }

        async function reactProfilePhoto(emoji) {
          if (!profileGalleryAlbumId && profileGalleryPhotoIndex === null) return;
          await fetch("/api/albums/" + profileGalleryAlbumId + "/photos/" + profileGalleryPhotoIndex + "/react", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emoji: emoji })
          });
          await loadProfileReactions();
        }

        async function loadProfileComments() {
          const comments = await fetch("/api/albums/" + profileGalleryAlbumId + "/photos/" + profileGalleryPhotoIndex + "/comments", { credentials: "include" })
            .then(r => r.json()).catch(() => []);
          const list = document.getElementById("profile-comment-list");
          if (!comments.length) { list.innerHTML = "<div style='color:#666;font-size:13px;padding:8px;'>No comments yet.</div>"; return; }
          list.innerHTML = comments.map(function(c) {
            return "<div class='comment-item'>" +
              "<img class='comment-avatar' src='" + (c.userPic || "/assets/img/default-avatar.png") + "' onerror=\"this.src='/assets/img/default-avatar.png'\"/>" +
              "<div style='flex:1;min-width:0;'><div class='comment-name'>" + c.userName + "</div><div class='comment-text'>" + c.text + "</div><div class='comment-time'>" + timeAgo(c.createdAt) + "</div></div>" +
            "</div>";
          }).join("");
          list.scrollTop = list.scrollHeight;
        }

        async function submitProfileComment() {
          const input = document.getElementById("profile-comment-input");
          const text = input.value.trim();
          if (!text || !profileGalleryAlbumId) return;
          await fetch("/api/albums/" + profileGalleryAlbumId + "/photos/" + profileGalleryPhotoIndex + "/comments", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text })
          });
          input.value = "";
          await loadProfileComments();
        }

        // Post interactions
        document.addEventListener("click", async function(e) {
          const pill = e.target.closest(".react-pill");
          if (pill) {
            await fetch("/api/posts/" + pill.dataset.postId + "/react", {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emoji: pill.dataset.emoji })
            });
            loadPostReactions(pill.dataset.postId);
          }
          const toggleBtn = e.target.closest(".comment-toggle-btn");
          if (toggleBtn) {
            const postId = toggleBtn.dataset.postId;
            const section = document.getElementById("cs-" + postId);
            if (section.style.display === "none") { section.style.display = "block"; loadPostComments(postId); }
            else section.style.display = "none";
          }
          const editBtn = e.target.closest(".edit-post-btn");
          if (editBtn) { const editor = editBtn.closest(".post-card").querySelector(".post-editor"); if (editor) editor.classList.toggle("open"); }
          const cancelBtn = e.target.closest(".cancel-edit-btn");
          if (cancelBtn) { const editor = cancelBtn.closest(".post-editor"); if (editor) editor.classList.remove("open"); }
          const deleteBtn = e.target.closest(".delete-post-btn");
          if (deleteBtn) {
            const card = deleteBtn.closest(".post-card");
            if (!confirm("Delete this post?")) return;
            fetch("/delete-post/" + card.dataset.postId, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
              .then(r => r.json()).then(d => { if (d.success) card.remove(); });
          }
          const deleteImageBtn = e.target.closest(".delete-image-btn");
          if (deleteImageBtn) {
            const form = deleteImageBtn.closest(".post-editor-form");
            form.querySelector("input[name=deleteImage]").value = "true";
            const preview = form.querySelector(".current-image-preview");
            if (preview) preview.innerHTML = "<p style='font-size:12px;color:#777;'>Image will be removed.</p>";
          }
        });

        document.addEventListener("change", function(e) {
          const fileInput = e.target.closest("input[type=file][name=image]");
          if (fileInput) {
            const form = fileInput.closest(".post-editor-form");
            form.querySelector("input[name=deleteImage]").value = "false";
            const preview = form.querySelector(".current-image-preview");
            if (fileInput.files && fileInput.files[0]) {
              const reader = new FileReader();
              reader.onload = function(ev) { if (preview) preview.innerHTML = "<img src='" + ev.target.result + "' style='max-width:100%;border-radius:6px;margin-bottom:6px;'>"; };
              reader.readAsDataURL(fileInput.files[0]);
            }
          }
        });

        document.addEventListener("submit", function(e) {
          const form = e.target.closest(".post-editor-form");
          if (!form) return;
          e.preventDefault();
          const postId = form.getAttribute("data-post-id");
          const card = form.closest(".post-card");
          fetch("/edit-post/" + postId, { method: "POST", body: new FormData(form) })
            .then(r => r.json()).then(data => {
              if (!data.success) { alert("Error saving"); return; }
              const contentEl = card.querySelector(".post-content");
              const imageWrapper = card.querySelector(".post-image-wrapper");
              if (contentEl) contentEl.textContent = data.content;
              if (imageWrapper) imageWrapper.innerHTML = data.imagePath ? "<img class='post-image' src='" + data.imagePath + "' style='max-width:100%;margin-top:8px;border-radius:6px;'>" : "";
              card.querySelector(".post-editor").classList.remove("open");
            });
        });

        async function loadPostReactions(postId) {
          const data = await fetch("/api/posts/" + postId + "/reactions", { credentials: "include" }).then(r => r.json()).catch(() => ({ counts: {}, myReaction: null }));
          ["❤️","🔥","😂","🤝","🚀"].forEach(function(e) {
            const el = document.getElementById("rp-" + postId + "-" + e.codePointAt(0));
            if (el) el.textContent = data.counts[e] || 0;
            const btn = document.querySelector(".react-pill[data-post-id='" + postId + "'][data-emoji='" + e + "']");
            if (btn) btn.classList.toggle("mine", data.myReaction === e);
          });
        }

        async function loadPostComments(postId) {
          const comments = await fetch("/api/posts/" + postId + "/comments", { credentials: "include" }).then(r => r.json()).catch(() => []);
          const list = document.getElementById("cl-" + postId);
          if (!list) return;
          list.innerHTML = !comments.length
            ? "<div style='color:#666;font-size:13px;padding:6px;'>No comments yet.</div>"
            : comments.map(function(c) {
                return "<div class='comment-item'><img class='comment-avatar' src='" + (c.userPic || "/assets/img/default-avatar.png") + "' onerror=\"this.src='/assets/img/default-avatar.png'\"/><div style='flex:1;min-width:0;'><div class='comment-name'>" + c.userName + "</div><div class='comment-text'>" + c.text + "</div><div class='comment-time'>" + timeAgo(c.createdAt) + "</div></div></div>";
              }).join("");
          list.scrollTop = list.scrollHeight;
        }

        async function submitPostComment(postId, inputEl) {
          const text = inputEl.value.trim();
          if (!text) return;
          await fetch("/api/posts/" + postId + "/comments", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text }) });
          inputEl.value = "";
          loadPostComments(postId);
        }

        function timeAgo(date) {
          const diff = Date.now() - new Date(date).getTime();
          const mins = Math.floor(diff / 60000);
          if (mins < 1) return "just now";
          if (mins < 60) return mins + "m ago";
          const hrs = Math.floor(mins / 60);
          if (hrs < 24) return hrs + "h ago";
          return Math.floor(hrs / 24) + "d ago";
        }

        document.addEventListener("keydown", function(e) { if (e.key === "Escape") closeProfileGallery(); });
        document.querySelectorAll(".post-card").forEach(function(card) { const id = card.dataset.postId; if (id) loadPostReactions(id); });
        loadOwnGallery();
      <\/script>
    </body>
    </html>
  `);
});

// ====== OTHER USER'S PROFILE ======
app.get("/profile/:id", requireLogin, async (req, res) => {
  const viewer = await User.findById(req.session.userId).populate("friends").populate("topFriends");
  const target = await User.findById(req.params.id).populate("friends").populate("topFriends");
  if (!target) return res.redirect("/feed");
  if (target._id.toString() === viewer._id.toString()) return res.redirect("/profile");

  const posts = await Post.find({ userId: target._id }).sort({ createdAt: -1 });
  const isFriend = viewer.friends.some(f => f._id.toString() === target._id.toString());

  const topFriendsHtml = target.topFriends.map(f => `
    <div class="friend-tile">
      <div style="width:60px;height:60px;border-radius:8px;background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;margin-bottom:4px;border:1px solid rgba(255,106,0,0.3);"></div>
      <div style="font-size:12px;"><a href="/profile/${f._id}" style="color:#ff6a00;">${f.name}</a></div>
    </div>`).join("");

  const friendsGridHtml = target.friends.map(f => `
    <div class="friend-tile">
      <div style="width:60px;height:60px;border-radius:8px;background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;margin-bottom:4px;border:1px solid rgba(255,106,0,0.3);"></div>
      <div style="font-size:12px;"><a href="/profile/${f._id}" style="color:#ff6a00;">${f.name}</a></div>
    </div>`).join("");

  const postsHtml = posts.map(p => `
    <div class="post-card" data-post-id="${p._id}">
      <div class="post">
        <div class="author" style="color:#ff6a00;">${p.userName}</div>
        <div class="meta">${p.createdAt.toLocaleString()}</div>
        <p class="post-content" style="margin-top:6px;">${p.content || ""}</p>
        <div class="post-image-wrapper">
          ${p.imagePath ? `<img class="post-image" src="${p.imagePath}" style="max-width:100%;margin-top:8px;border-radius:6px;">` : ""}
        </div>
      </div>
      <div class="post-reactions" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
        ${["❤️","🔥","😂","🤝","🚀"].map(e => `
          <button class="react-pill" data-emoji="${e}" data-post-id="${p._id}">${e}
            <span class="rpill-count" id="rp-${p._id}-${e.codePointAt(0)}">0</span>
          </button>`).join("")}
      </div>
      <div style="margin-top:8px;">
        <button class="btn-secondary comment-toggle-btn" data-post-id="${p._id}" style="font-size:12px;padding:4px 10px;">💬 Comments</button>
      </div>
      <div class="comment-section" id="cs-${p._id}" style="display:none;margin-top:10px;">
        <div class="comment-list" id="cl-${p._id}" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;max-height:200px;overflow-y:auto;"></div>
        <div style="display:flex;gap:8px;">
          <input class="comment-input" data-post-id="${p._id}" type="text" placeholder="Write a comment..." maxlength="300"
            style="flex:1;background:rgba(255,255,255,0.07);border:1px solid #444;border-radius:8px;color:#fff;padding:6px 10px;font-size:13px;"
            onkeydown="if(event.key==='Enter') submitPostComment('${p._id}', this)"/>
          <button class="btn-primary" style="font-size:12px;padding:6px 10px;"
            onclick="submitPostComment('${p._id}', document.querySelector('.comment-input[data-post-id=\\'${p._id}\\']'))">Post</button>
        </div>
      </div>
    </div>`).join("");

  const pic = target.profilePic || "/assets/img/default-avatar.png";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${target.name} – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        html, body { background: #000 !important; margin: 0; padding: 0; color: #fff; font-family: Arial, sans-serif; overflow-x: hidden; }
        #starfield { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: #000; }
        .navbar { width: 100%; padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.65); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 100; box-sizing: border-box; }
        .navbar .logo a { color: #ff6a00; text-decoration: none; font-size: 20px; font-weight: bold; }
        .nav-links { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .nav-links a { color: #ccc; text-decoration: none; font-size: 13px; }
        .nav-links a:hover { color: #ff6a00; }
        .page { max-width: 860px; margin: 30px auto; padding: 0 16px; box-sizing: border-box; }
        .card { border-radius: 12px; background: rgba(0,0,0,0.45); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.15); padding: 20px; margin-bottom: 20px; }
        .profile-header { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
        .profile-avatar { width: 100px; height: 100px; border-radius: 50%; background: #111 url('${pic}') center/cover no-repeat; border: 3px solid #ff6a00; flex-shrink: 0; }
        .friend-tile { width: 70px; text-align: center; }
        .top-friends-bar { display: flex; flex-wrap: wrap; gap: 10px; }
        .post-card { margin-bottom: 16px; }
        .btn-primary { display: inline-block; padding: 8px 14px; background: #ff6a00; color: #000; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; transition: 0.2s; font-size: 14px; }
        .btn-primary:hover { background: #ff8c32; }
        .btn-secondary { padding: 6px 10px; background: rgba(255,255,255,0.08); border-radius: 6px; border: none; color: #ff6a00; cursor: pointer; font-weight: bold; transition: 0.2s; }
        .btn-secondary:hover { background: rgba(255,255,255,0.18); }
        .react-pill { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 4px 12px; font-size: 16px; cursor: pointer; color: #fff; transition: all .15s; display: inline-flex; align-items: center; gap: 5px; }
        .react-pill:hover { border-color: #ff6a00; background: rgba(255,106,0,0.15); }
        .react-pill.mine { border-color: #ff6a00; background: rgba(255,106,0,0.2); }
        .rpill-count { font-size: 12px; color: #ccc; }
        .comment-item { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 12px; display: flex; gap: 10px; align-items: flex-start; }
        .comment-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1px solid rgba(255,106,0,0.3); }
        .comment-name { font-size: 12px; color: #ff6a00; font-weight: bold; }
        .comment-text { font-size: 13px; color: #f0f0f0; word-break: break-word; margin-top: 2px; }
        .comment-time { font-size: 11px; color: #555; margin-top: 2px; }
        .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px,1fr)); gap: 8px; }
        .gallery-thumb { aspect-ratio: 1; border-radius: 10px; overflow: hidden; cursor: pointer; border: 1px solid rgba(255,106,0,0.2); transition: border-color .15s; }
        .gallery-thumb:hover { border-color: #ff6a00; }
        .gallery-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .react-btn { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 6px 14px; font-size: 18px; cursor: pointer; color: #fff; transition: all .15s; display: inline-flex; align-items: center; gap: 5px; }
        .react-btn:hover { border-color: #ff6a00; background: rgba(255,106,0,0.15); }
        .react-btn.mine { border-color: #ff6a00; background: rgba(255,106,0,0.2); }
        @media (max-width: 600px) { .profile-header { flex-direction: column; align-items: flex-start; } .nav-links a { font-size: 12px; } }
      </style>
    </head>
    <body>
      <canvas id="starfield"></canvas>
      <script>
        const canvas = document.getElementById("starfield");
        const ctx = canvas.getContext("2d");
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        window.addEventListener("resize", () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
        const stars = Array.from({ length: 200 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 1.5 + 0.3, alpha: Math.random(), speed: Math.random() * 0.3 + 0.1 }));
        const shootingStars = [];
        function spawnShootingStar() { shootingStars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * 0.5, len: Math.random() * 120 + 80, speed: Math.random() * 8 + 6, angle: Math.PI / 4, alpha: 1 }); }
        setInterval(spawnShootingStar, 2500);
        function draw() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          stars.forEach(s => { s.alpha += s.speed * 0.02 * (Math.random() > 0.5 ? 1 : -1); s.alpha = Math.max(0.1, Math.min(1, s.alpha)); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255," + s.alpha + ")"; ctx.fill(); });
          for (let i = shootingStars.length - 1; i >= 0; i--) { const s = shootingStars[i]; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len); const grad = ctx.createLinearGradient(s.x, s.y, s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len); grad.addColorStop(0, "rgba(255,150,50," + s.alpha + ")"); grad.addColorStop(1, "rgba(255,150,50,0)"); ctx.strokeStyle = grad; ctx.lineWidth = 2; ctx.stroke(); s.x += Math.cos(s.angle) * s.speed; s.y += Math.sin(s.angle) * s.speed; s.alpha -= 0.015; if (s.alpha <= 0) shootingStars.splice(i, 1); }
          requestAnimationFrame(draw);
        }
        draw();
      <\/script>

      <div class="navbar">
        <div class="logo"><a href="/feed">Spacebook</a></div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/feed">Feed</a>
          <a href="/profile">Profile</a>
          <a href="/messages">Messages</a>
          <a href="/gallery">Gallery</a>
          <a href="/stories">Stories</a>
          <a href="/listen-together">Listen Together</a>
          <a href="/artist-dashboard">Artist</a>
          <a href="/activity">Activity</a>
          <a href="/logout">Log Out</a>
        </div>
      </div>

      <div class="page">
        <div class="card">
          <div class="profile-header">
            <div class="profile-avatar"></div>
            <div>
              <h2 style="margin:0;color:#ff6a00;">${target.name}</h2>
              <p style="margin:4px 0;color:#aaa;">${target.network || "Unknown network"}</p>
              <p style="margin:4px 0;color:#ccc;font-size:13px;">"Exploring the universe via Spacebook."</p>
            </div>
          </div>
          <div style="margin-top:16px;">
            ${isFriend
              ? `<form action="/remove-friend/${target._id}" method="post" style="display:inline;">
                   <button class="btn-primary" style="background:#222;color:#ff6a00;border:1px solid #ff6a00;">Remove Friend</button>
                 </form>`
              : `<form action="/add-friend/${target._id}" method="post" style="display:inline;">
                   <button class="btn-primary">+ Add Friend</button>
                 </form>`}
          </div>
        </div>

        <div class="card">
          <h3 style="color:#ff6a00;margin-bottom:10px;">⭐ Top Friends</h3>
          <div class="top-friends-bar">
            ${topFriendsHtml || "<p style='color:#ccc;font-size:13px;'>No top friends yet.</p>"}
          </div>
          <hr style="margin:16px 0;border:none;border-top:1px solid #333;">
          <h3 style="color:#ff6a00;margin-bottom:10px;">👥 Friends</h3>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            ${friendsGridHtml || "<p style='color:#ccc;font-size:13px;'>No friends yet.</p>"}
          </div>
        </div>

        <div class="card">
          <h3 style="color:#ff6a00;margin-bottom:10px;">📷 Gallery</h3>
          <div id="target-gallery-grid" class="gallery-grid">
            <p style="color:#888;font-size:13px;">Loading...</p>
          </div>
        </div>

        <div class="card">
          <h3 style="color:#ff6a00;margin-bottom:10px;">📝 Posts</h3>
          ${postsHtml || "<p style='color:#ccc;font-size:13px;'>No posts yet.</p>"}
        </div>
      </div>

      <!-- Gallery overlay -->
      <div id="profile-media-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.95);z-index:1000;align-items:flex-start;justify-content:center;overflow-y:auto;padding:20px 0;">
        <div style="max-width:860px;width:100%;padding:0 16px;box-sizing:border-box;">
          <div style="display:flex;justify-content:flex-end;margin-bottom:10px;">
            <div onclick="closeProfileGallery()" style="font-size:28px;cursor:pointer;color:#fff;background:rgba(255,255,255,0.1);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">✕</div>
          </div>
          <div id="profile-overlay-media"></div>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center;">
            <button onclick="reactProfilePhoto('❤️')" class="react-btn" id="prb-❤️">❤️ <span id="prc-❤️">0</span></button>
            <button onclick="reactProfilePhoto('🔥')" class="react-btn" id="prb-🔥">🔥 <span id="prc-🔥">0</span></button>
            <button onclick="reactProfilePhoto('😂')" class="react-btn" id="prb-😂">😂 <span id="prc-😂">0</span></button>
            <button onclick="reactProfilePhoto('🤝')" class="react-btn" id="prb-🤝">🤝 <span id="prc-🤝">0</span></button>
            <button onclick="reactProfilePhoto('🚀')" class="react-btn" id="prb-🚀">🚀 <span id="prc-🚀">0</span></button>
          </div>
          <div style="margin-top:16px;">
            <h4 style="color:#ff6a00;margin:0 0 10px;">💬 Comments</h4>
            <div id="profile-comment-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;max-height:220px;overflow-y:auto;"></div>
            <div style="display:flex;gap:8px;">
              <input id="profile-comment-input" type="text" placeholder="Add a comment..." maxlength="300"
                style="flex:1;background:rgba(255,255,255,0.07);border:1px solid #444;border-radius:8px;color:#fff;padding:8px 12px;font-size:13px;"
                onkeydown="if(event.key==='Enter') submitProfileComment()"/>
              <button class="btn-primary" onclick="submitProfileComment()">Post</button>
            </div>
          </div>
        </div>
      </div>

      <script>
        let profileGalleryAlbumId = null;
        let profileGalleryPhotoIndex = null;

        async function loadTargetGallery() {
          const albums = await fetch("/api/albums/user/${target._id}", { credentials: "include" }).then(r => r.json()).catch(() => []);
          const grid = document.getElementById("target-gallery-grid");
          const allPhotos = [];
          albums.forEach(function(a) { a.photos.forEach(function(p, i) { allPhotos.push({ url: p.url, albumId: a._id, photoIndex: i }); }); });
          if (!allPhotos.length) { grid.innerHTML = "<p style='color:#888;font-size:13px;'>No photos yet.</p>"; return; }
          grid.innerHTML = allPhotos.slice(0, 9).map(function(p) {
            return "<div class='gallery-thumb' onclick=\"openProfileGallery('" + p.albumId + "'," + p.photoIndex + ",'" + p.url + "')\">" +
              "<img src='" + p.url + "' onerror=\"this.src='/assets/img/default-avatar.png'\"/></div>";
          }).join("");
        }

        async function openProfileGallery(albumId, photoIndex, url) {
          profileGalleryAlbumId = albumId;
          profileGalleryPhotoIndex = photoIndex;
          const overlay = document.getElementById("profile-media-overlay");
          const media = document.getElementById("profile-overlay-media");
          const isVideo = url.match(/\.(mp4|webm|ogg)(\?|$)/i);
          media.innerHTML = isVideo
            ? "<video src='" + url + "' controls autoplay style='max-width:100%;max-height:65vh;border-radius:10px;display:block;margin:0 auto;'></video>"
            : "<img src='" + url + "' style='max-width:100%;max-height:65vh;border-radius:10px;display:block;margin:0 auto;' onerror=\"this.src='/assets/img/default-avatar.png'\"/>";
          overlay.style.display = "flex";
          await loadProfileReactions();
          await loadProfileComments();
        }

        function closeProfileGallery() {
          document.getElementById("profile-media-overlay").style.display = "none";
          document.getElementById("profile-overlay-media").innerHTML = "";
          document.getElementById("profile-comment-list").innerHTML = "";
          profileGalleryAlbumId = null; profileGalleryPhotoIndex = null;
        }

        async function loadProfileReactions() {
          const data = await fetch("/api/albums/" + profileGalleryAlbumId + "/photos/" + profileGalleryPhotoIndex + "/reactions", { credentials: "include" })
            .then(r => r.json()).catch(() => ({ counts: {}, myReaction: null }));
          ["❤️","🔥","😂","🤝","🚀"].forEach(function(e) {
            const el = document.getElementById("prc-" + e);
            const btn = document.getElementById("prb-" + e);
            if (el) el.textContent = data.counts[e] || 0;
            if (btn) btn.classList.toggle("mine", data.myReaction === e);
          });
        }

        async function reactProfilePhoto(emoji) {
          if (!profileGalleryAlbumId && profileGalleryPhotoIndex === null) return;
          await fetch("/api/albums/" + profileGalleryAlbumId + "/photos/" + profileGalleryPhotoIndex + "/react", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emoji: emoji })
          });
          await loadProfileReactions();
        }

        async function loadProfileComments() {
          const comments = await fetch("/api/albums/" + profileGalleryAlbumId + "/photos/" + profileGalleryPhotoIndex + "/comments", { credentials: "include" })
            .then(r => r.json()).catch(() => []);
          const list = document.getElementById("profile-comment-list");
          if (!comments.length) { list.innerHTML = "<div style='color:#666;font-size:13px;padding:8px;'>No comments yet.</div>"; return; }
          list.innerHTML = comments.map(function(c) {
            return "<div class='comment-item'>" +
              "<img class='comment-avatar' src='" + (c.userPic || "/assets/img/default-avatar.png") + "' onerror=\"this.src='/assets/img/default-avatar.png'\"/>" +
              "<div style='flex:1;min-width:0;'><div class='comment-name'>" + c.userName + "</div><div class='comment-text'>" + c.text + "</div><div class='comment-time'>" + timeAgo(c.createdAt) + "</div></div>" +
            "</div>";
          }).join("");
          list.scrollTop = list.scrollHeight;
        }

        async function submitProfileComment() {
          const input = document.getElementById("profile-comment-input");
          const text = input.value.trim();
          if (!text || !profileGalleryAlbumId) return;
          await fetch("/api/albums/" + profileGalleryAlbumId + "/photos/" + profileGalleryPhotoIndex + "/comments", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text })
          });
          input.value = "";
          await loadProfileComments();
        }

        document.addEventListener("click", async function(e) {
          const pill = e.target.closest(".react-pill");
          if (pill) {
            await fetch("/api/posts/" + pill.dataset.postId + "/react", {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emoji: pill.dataset.emoji })
            });
            loadPostReactions(pill.dataset.postId);
          }
          const toggleBtn = e.target.closest(".comment-toggle-btn");
          if (toggleBtn) {
            const postId = toggleBtn.dataset.postId;
            const section = document.getElementById("cs-" + postId);
            if (section.style.display === "none") { section.style.display = "block"; loadPostComments(postId); }
            else section.style.display = "none";
          }
        });

        async function loadPostReactions(postId) {
          const data = await fetch("/api/posts/" + postId + "/reactions", { credentials: "include" }).then(r => r.json()).catch(() => ({ counts: {}, myReaction: null }));
          ["❤️","🔥","😂","🤝","🚀"].forEach(function(e) {
            const el = document.getElementById("rp-" + postId + "-" + e.codePointAt(0));
            if (el) el.textContent = data.counts[e] || 0;
            const btn = document.querySelector(".react-pill[data-post-id='" + postId + "'][data-emoji='" + e + "']");
            if (btn) btn.classList.toggle("mine", data.myReaction === e);
          });
        }

        async function loadPostComments(postId) {
          const comments = await fetch("/api/posts/" + postId + "/comments", { credentials: "include" }).then(r => r.json()).catch(() => []);
          const list = document.getElementById("cl-" + postId);
          if (!list) return;
          list.innerHTML = !comments.length
            ? "<div style='color:#666;font-size:13px;padding:6px;'>No comments yet.</div>"
            : comments.map(function(c) {
                return "<div class='comment-item'><img class='comment-avatar' src='" + (c.userPic || "/assets/img/default-avatar.png") + "' onerror=\"this.src='/assets/img/default-avatar.png'\"/><div style='flex:1;min-width:0;'><div class='comment-name'>" + c.userName + "</div><div class='comment-text'>" + c.text + "</div><div class='comment-time'>" + timeAgo(c.createdAt) + "</div></div></div>";
              }).join("");
          list.scrollTop = list.scrollHeight;
        }

        async function submitPostComment(postId, inputEl) {
          const text = inputEl.value.trim();
          if (!text) return;
          await fetch("/api/posts/" + postId + "/comments", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text }) });
          inputEl.value = "";
          loadPostComments(postId);
        }

        function timeAgo(date) {
          const diff = Date.now() - new Date(date).getTime();
          const mins = Math.floor(diff / 60000);
          if (mins < 1) return "just now";
          if (mins < 60) return mins + "m ago";
          const hrs = Math.floor(mins / 60);
          if (hrs < 24) return hrs + "h ago";
          return Math.floor(hrs / 24) + "d ago";
        }

        document.addEventListener("keydown", function(e) { if (e.key === "Escape") closeProfileGallery(); });
        document.querySelectorAll(".post-card").forEach(function(card) { const id = card.dataset.postId; if (id) loadPostReactions(id); });
        loadTargetGallery();
      <\/script>
    </body>
    </html>
  `);
});

// ====== CHESS LEADERBOARD ROUTES ======
app.post("/api/chess/registerPlayer", async (req, res) => {
  try {
    const { username, emoji, color } = req.body;
    if (!username) return res.status(400).json({ error: "username required" });
    const update = { username, emoji: emoji || "♟️", color: color || "#22c55e", updatedAt: new Date() };
    const player = await Player.findOneAndUpdate(
      { username },
      { $setOnInsert: { rating: 1200, wins: 0, losses: 0, draws: 0 }, $set: update },
      { new: true, upsert: true }
    );
    res.json({ ok: true, player });
  } catch (err) {
    console.error("registerPlayer error", err);
    res.status(500).json({ error: "server error" });
  }
});

app.post("/api/chess/submitResult", async (req, res) => {
  try {
    const { winner, loser, result } = req.body;
    if (!winner || !loser || !result) return res.status(400).json({ error: "winner, loser, result required" });
    const [pA, pB] = await Promise.all([
      Player.findOne({ username: winner }) || new Player({ username: winner }),
      Player.findOne({ username: loser }) || new Player({ username: loser })
    ]);
    if (!pA.rating) pA.rating = 1200;
    if (!pB.rating) pB.rating = 1200;
    let scoreA, scoreB;
    if (result === "win") { scoreA = 1; scoreB = 0; }
    else if (result === "loss") { scoreA = 0; scoreB = 1; }
    else { scoreA = 0.5; scoreB = 0.5; }
    const newRa = updateElo(pA.rating, pB.rating, scoreA);
    const newRb = updateElo(pB.rating, pA.rating, scoreB);
    pA.rating = newRa; pB.rating = newRb;
    if (result === "win") { pA.wins++; pB.losses++; }
    else if (result === "loss") { pA.losses++; pB.wins++; }
    else { pA.draws++; pB.draws++; }
    pA.updatedAt = new Date(); pB.updatedAt = new Date();
    await Promise.all([pA.save(), pB.save()]);
    res.json({ ok: true, winner: pA, loser: pB });
  } catch (err) {
    console.error("submitResult error", err);
    res.status(500).json({ error: "server error" });
  }
});

app.get("/api/chess/leaderboard", async (req, res) => {
  try {
    const players = await Player.find().sort({ rating: -1, updatedAt: -1 }).limit(100).lean();
    res.json({ ok: true, players });
  } catch (err) {
    console.error("leaderboard error", err);
    res.status(500).json({ error: "server error" });
  }
});

// ====== ACTIVITY FEED API ======
app.get("/api/activity-feed", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).populate("friends");
    if (!user) return res.status(401).json([]);
    const friendIds = user.friends.map(f => f._id);
    const allUserIds = [user._id, ...friendIds];
    const posts = await Post.find({ userId: { $in: allUserIds } }).sort({ createdAt: -1 }).limit(50);
    const activity = posts.map(p => ({
      type: p.imagePath ? "photo" : "post",
      description: p.userId.toString() === user._id.toString()
        ? "You " + (p.imagePath ? "shared a photo" : "posted") + ": \"" + (p.content || "").slice(0, 80) + "\""
        : "<strong>" + p.userName + "</strong> " + (p.imagePath ? "shared a photo" : "posted") + ": \"" + (p.content || "").slice(0, 80) + "\"",
      createdAt: p.createdAt
    }));
    user.friends.forEach(f => {
      activity.push({ type: "friend", description: "You are friends with <strong>" + f.name + "</strong>", createdAt: new Date() });
    });
    activity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(activity.slice(0, 100));
  } catch (err) {
    console.error("activity-feed error", err);
    res.json([]);
  }
});

// ====== STORY REACTION ======
app.post("/api/story-react", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(401).json({ ok: false });
    console.log("Story reaction:", user.name, req.body.emoji, req.body.storyId);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false });
  }
});



// ====== STORIES ======
app.get("/stories", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "stories.html"));
});

// ====== GALLERY ======
app.get("/gallery", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "gallery.html"));
});

// ====== ACTIVITY ======
app.get("/activity", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "activity.html"));
});

// ====== LISTEN TOGETHER ======
app.get("/listen-together", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "listen-together.html"));
});

// ====== ARTIST DASHBOARD ======
app.get("/artist-dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "artist-dashboard.html"));
});

// ====== CHESS ======
app.get("/chess", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chess.html"));
});

// ====== LOGOUT ======
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ====== SESSION CHECK API ======
app.get("/api/me", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select("name profilePic network");
    if (!user) return res.status(401).json({ error: "Not logged in" });
    res.json({ _id: user._id, name: user.name, profilePic: user.profilePic || "", network: user.network || "" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ====== SEARCH USERS API ======
app.get("/api/users/search", requireLogin, async (req, res) => {
  try {
    const q = req.query.q || "";
    if (!q.trim()) return res.json([]);
    const users = await User.find({
      _id: { $ne: req.session.userId },
      name: { $regex: q, $options: "i" }
    }).select("name profilePic network").limit(10);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ====== GET USER BY ID API ======
app.get("/api/users/:userId", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("name profilePic network friends");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ====== GET FRIENDS LIST API ======
app.get("/api/friends", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).populate("friends", "name profilePic network");
    if (!user) return res.status(401).json({ error: "Not logged in" });
    res.json(user.friends);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


// ====== START SERVER ======
const server = app.listen(PORT, () => {
  console.log("Spacebook running on port " + PORT);
});

// ====== ATTACH CHESS WEBSOCKET ======
attachChessServer(server);

// ====== ATTACH MODULES ======
const attachGallery = require("./modules/gallery");
attachGallery(app, mongoose, requireLogin, cloudinary, upload);

try {
  const attachMessages = require("./modules/messaging");
  attachMessages(app, server, mongoose, requireLogin, cloudinary);
} catch(e) { console.warn("messaging module not found, skipping"); }

try {
  const attachStories = require("./modules/stories");
  attachStories(app, mongoose, requireLogin, cloudinary, upload);
} catch(e) { console.warn("stories module not found, skipping"); }

try {
  const attachArtist = require("./modules/artist");
  attachArtist(app, mongoose, requireLogin, cloudinary, upload);
} catch(e) { console.warn("artist module not found, skipping"); }

try {
  const attachListenTogether = require("./modules/listen-together");
  attachListenTogether(app, mongoose, requireLogin);
} catch(e) { console.warn("listen-together module not found, skipping"); }