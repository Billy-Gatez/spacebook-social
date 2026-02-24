const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const attachChessServer = require("./chess-ws");

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
    "null" // allow local file:// editor
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

const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);

// GLOBAL LEADERBOARD
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

const Player = mongoose.model("Player", playerSchema);

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





// SAVE PAGE TO GITHUB
app.post("/createPage", async (req, res) => {
  const { filename, content } = req.body;

  if (!filename || !content) {
    return res.json({ success: false, error: "Missing filename or content" });
  }

  // sanitize filename
  const safeName = filename.replace(/[^a-zA-Z0-9._]/g, "");
  const path = `pages/${safeName}`;

  const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${path}`;

  const encoded = Buffer.from(content).toString("base64");

  try {
    // CHECK IF FILE EXISTS ON GITHUB
    const check = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json"
      }
    });

    if (check.status === 200) {
      return res.json({
        success: false,
        error: "exists"
      });
    }

    // CREATE FILE ON GITHUB
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/vnd.github+json"
      },
      body: JSON.stringify({
        message: `Create ${path}`,
        content: encoded
      })
    });

    const data = await response.json();

    return res.json({
      success: true,
      url: `https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/${path}`
    });

  } catch (err) {
    console.error("GitHub Save Error:", err);
    return res.json({ success: false, error: err.message });
  }
});



// ====== CLOUDINARY MULTER STORAGE ======
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "spacebook",
    allowed_formats: ["jpg", "jpeg", "png", "gif"]
  }
});

const upload = multer({ storage });

// ====== AUTH GUARD ======
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect("/");
  next();
}

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


// =============================
// SAVE PAGE TO GITHUB (PERMANENT)
// =============================
app.post("/createPage", async (req, res) => {
  const { filename, content } = req.body;

  if (!filename || !content) {
    return res.json({ success: false, error: "Missing filename or content" });
  }

  // sanitize filename
  const safeName = filename.replace(/[^a-zA-Z0-9._]/g, "");
  const path = `pages/${safeName}`;

  const url = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${path}`;

  const encoded = Buffer.from(content).toString("base64");

  try {
    // CHECK IF FILE EXISTS ON GITHUB
    const check = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json"
      }
    });

    if (check.status === 200) {
      return res.json({
        success: false,
        error: "exists"
      });
    }

    // CREATE FILE ON GITHUB
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/vnd.github+json"
      },
      body: JSON.stringify({
        message: `Create ${path}`,
        content: encoded
      })
    });

    const data = await response.json();

    return res.json({
      success: true,
      url: `https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/${path}`
    });

  } catch (err) {
    console.error("GitHub Save Error:", err);
    return res.json({ success: false, error: err.message });
  }
});


// =============================
// VIEW PAGE (RENDERS THE HTML)
// =============================
app.get("/view", async (req, res) => {
  const page = req.query.page;
  if (!page) return res.send("Missing ?page=name");

  const url = `https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/pages/${page}.html`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.send("Page not found on GitHub.");
    }

    const html = await response.text();

    // Serve the HTML directly so the browser renders it normally
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
      <title>Home – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        html, body {
          background: transparent !important;
          margin: 0;
          padding: 0;
          color: #fff;
          font-family: Arial, sans-serif;
        }
        .navbar {
          width: 100%;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: transparent !important;
        }
        .navbar a {
          color: #ff6a00;
          text-decoration: none;
          font-weight: bold;
        }
        .page {
          width: 100%;
          min-height: 100vh;
          display: flex;
          gap: 30px;
          padding: 40px;
          background: transparent !important;
        }
        .sidebar .card, .feed .card {
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          padding: 20px;
        }
        .profile-summary {
          display:flex;
          align-items:center;
          gap:16px;
        }
        .profile-summary-avatar {
          width:64px;
          height:64px;
          border-radius:50%;
          background:#111 url('${pic}') center/cover no-repeat;
          border:2px solid #ff6a00;
        }
        .friend-grid {
          display:flex;
          flex-wrap:wrap;
          gap:10px;
        }
        .friend-tile {
          width:80px;
          text-align:center;
        }
        .btn-primary {
          display:inline-block;
          padding:8px 14px;
          background:#ff6a00;
          color:#000;
          border-radius:6px;
          text-decoration:none;
          font-weight:bold;
          border:none;
          cursor:pointer;
          transition:0.2s;
        }
        .btn-primary:hover {
          background:#ff8c32;
        }
      </style>
    </head>
    <body>
      <div class="navbar">
        <div class="logo">
          <a href="/feed" style="color:#ff6a00;">Spacebook</a>
        </div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/profile">Profile</a>
          <a href="/feed">Feed</a>
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
              <li><a href="#">Messages</a></li>
              <li><a href="#">Friends</a></li>
              <li><a href="#">Groups</a></li>
            </ul>
          </div>

          <div class="card" style="margin-top:20px;">
            <strong style="color:#ff6a00;">Suggested Friends</strong>
            <div class="friend-grid" style="margin-top:10px;">
              ${suggestedHtml || "<p style='color:#ccc; font-size:13px;'>No suggestions right now.</p>"}
            </div>
          </div>
        </aside>

        <main class="feed">
          <div class="card">
            <h2 style="color:#ff6a00; margin-bottom:10px;">Welcome back, ${user.name}</h2>
            <p style="color:#ccc; font-size:14px;">
              Share what's happening in your universe.
            </p>
            <form action="/post" method="post" enctype="multipart/form-data" style="margin-top:10px;">
              <textarea name="content" placeholder="What’s happening in your universe?" style="width:100%; min-height:80px;"></textarea>
              <label style="color:#ccc; font-size:14px; margin-top:6px; display:block;">
                Upload an image (optional)
              </label>
              <input type="file" name="image" accept="image/*">
              <button class="btn-primary" style="margin-top:10px;">Post</button>
            </form>
          </div>

          <div class="card" style="margin-top:20px;">
            <h3 style="color:#ff6a00; margin-bottom:10px;">Latest from your universe</h3>
            ${latestPostsHtml || "<p style='color:#ccc; font-size:13px;'>No posts yet.</p>"}
          </div>
        </main>
      </div>
    </body>
    </html>
  `);
});

// Create post
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

// ⭐⭐ GLOBAL LEADERBOARD ROUTES ⭐⭐

// Register or update a player
app.post("/api/chess/registerPlayer", async (req, res) => {
  try {
    const { username, emoji, color } = req.body;
    if (!username) return res.status(400).json({ error: "username required" });

    const update = {
      username,
      emoji: emoji || "♟️",
      color: color || "#22c55e",
      updatedAt: new Date()
    };

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

// Submit result of an online game
app.post("/api/chess/submitResult", async (req, res) => {
  try {
    const { winner, loser, result } = req.body;
    if (!winner || !loser || !result) {
      return res.status(400).json({ error: "winner, loser, result required" });
    }

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

    pA.rating = newRa;
    pB.rating = newRb;

    if (result === "win") { pA.wins++; pB.losses++; }
    else if (result === "loss") { pA.losses++; pB.wins++; }
    else { pA.draws++; pB.draws++; }

    pA.updatedAt = new Date();
    pB.updatedAt = new Date();

    await Promise.all([pA.save(), pB.save()]);

    res.json({ ok: true, winner: pA, loser: pB });
  } catch (err) {
    console.error("submitResult error", err);
    res.status(500).json({ error: "server error" });
  }
});

// Get global leaderboard
app.get("/api/chess/leaderboard", async (req, res) => {
  try {
    const players = await Player.find({})
      .sort({ rating: -1, updatedAt: -1 })
      .limit(100)
      .lean();

    res.json({ ok: true, players });
  } catch (err) {
    console.error("leaderboard error", err);
    res.status(500).json({ error: "server error" });
  }
});


// ====== EDIT / DELETE POST API ======

// Edit post (text + image control)
app.post("/edit-post/:id", requireLogin, upload.single("image"), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.json({ success: false, error: "Post not found" });
    if (post.userId.toString() !== req.session.userId.toString()) {
      return res.json({ success: false, error: "Not authorized" });
    }

    const { content, deleteImage } = req.body;

    post.content = content || "";

    if (deleteImage === "true") {
      post.imagePath = null;
    }

    if (req.file) {
      post.imagePath = req.file.path;
    }

    await post.save();

    res.json({
      success: true,
      content: post.content,
      imagePath: post.imagePath || null
    });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Server error" });
  }
});

// Delete post
app.post("/delete-post/:id", requireLogin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.json({ success: false, error: "Post not found" });
    if (post.userId.toString() !== req.session.userId.toString()) {
      return res.json({ success: false, error: "Not authorized" });
    }

    await Post.deleteOne({ _id: post._id });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Server error" });
  }
});

// Delete photo only
app.post("/delete-photo/:id", requireLogin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.json({ success: false, error: "Post not found" });
    if (post.userId.toString() !== req.session.userId.toString()) {
      return res.json({ success: false, error: "Not authorized" });
    }

    post.imagePath = null;
    await post.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: "Server error" });
  }
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
          <a href="/profile/${p.userId}" style="color:#ff6a00; text-decoration:none;">${p.userName}</a>
        </div>
        <div class="meta">${p.createdAt.toLocaleString()}</div>
        <p class="post-content" style="margin-top:6px;">${p.content || ""}</p>
        <div class="post-image-wrapper">
          ${p.imagePath ? `<img class="post-image" src="${p.imagePath}" style="max-width:100%; margin-top:8px; border-radius:6px;">` : ""}
        </div>
        ${isOwner ? `
          <div class="post-actions" style="margin-top:8px; font-size:13px;">
            <button class="btn-secondary edit-post-btn" type="button">Edit</button>
            <button class="btn-secondary delete-post-btn" type="button" style="margin-left:6px;">Delete</button>
          </div>
        ` : ""}
      </div>

      ${isOwner ? `
      <div class="post-editor" id="editor-${p._id}">
        <form class="post-editor-form" data-post-id="${p._id}">
          <label style="font-size:13px; color:#ccc;">Edit your post</label>
          <textarea name="content" class="post-editor-text" style="width:100%; min-height:80px; margin-top:4px;">${p.content || ""}</textarea>

          <div class="editor-image-section" style="margin-top:8px;">
            <div class="current-image-preview">
              ${p.imagePath ? `<img src="${p.imagePath}" class="editor-image" style="max-width:100%; border-radius:6px; margin-bottom:6px;">` : "<p style='font-size:12px; color:#777;'>No image attached.</p>"}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:4px;">
              <button type="button" class="btn-secondary delete-image-btn" style="font-size:12px;">Delete Image</button>
              <label class="btn-secondary" style="font-size:12px; cursor:pointer;">
                Replace Image
                <input type="file" name="image" accept="image/*" style="display:none;">
              </label>
              <input type="hidden" name="deleteImage" value="false">
            </div>
          </div>

          <div style="margin-top:10px; display:flex; gap:8px;">
            <button type="submit" class="btn-primary" style="flex:0 0 auto;">Save Changes</button>
            <button type="button" class="btn-secondary cancel-edit-btn" style="flex:0 0 auto;">Cancel</button>
          </div>
        </form>
      </div>
      ` : ""}
    </div>
  `;
  }).join("");

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Feed – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        .post-card {
          margin-bottom:16px;
        }
        .post-editor {
          margin-top:8px;
          border-radius:12px;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 106, 0, 0.6);
          padding: 12px;
          max-height:0;
          opacity:0;
          overflow:hidden;
          transition:max-height 0.25s ease, opacity 0.2s ease;
        }
        .post-editor.open {
          max-height:500px;
          opacity:1;
        }
        .btn-secondary {
          padding:6px 10px;
          background:rgba(255,255,255,0.08);
          border-radius:6px;
          border:none;
          color:#ff6a00;
          cursor:pointer;
          font-weight:bold;
          text-decoration:none;
          transition:0.2s;
        }
        .btn-secondary:hover {
          background:rgba(255,255,255,0.18);
        }
      </style>
    </head>
    <body>
      <div class="navbar">
        <div class="logo"><a href="/feed" style="color:#ff6a00;">Spacebook</a></div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/profile">Profile</a>
          <a href="/logout">Log Out</a>
        </div>
      </div>

      <div class="page">
        <aside class="sidebar">
          <div class="card">
            <strong style="color:#ff6a00;">Navigation</strong>
            <ul style="list-style:none; margin-top:10px; font-size:14px;">
              <li><a href="/profile">Your Profile</a></li>
              <li><a href="/feed">Feed</a></li>
              <li><a href="#">Messages</a></li>
              <li><a href="#">Friends</a></li>
              <li><a href="#">Groups</a></li>
            </ul>
          </div>
        </aside>

        <main class="feed">
          <div class="card">
            <form action="/post" method="post" enctype="multipart/form-data">
              <textarea name="content" placeholder="What’s happening in your universe?"></textarea>
              <label style="color:#ccc; font-size:14px; margin-top:6px; display:block;">
                Upload an image (optional)
              </label>
              <input type="file" name="image" accept="image/*">
              <button class="btn-primary" style="margin-top:10px;">Post</button>
            </form>
          </div>

          <div class="card" style="margin-top:20px;">
            ${htmlPosts || "<p>No posts yet.</p>"}
          </div>
        </main>
      </div>

      <script>
        document.addEventListener("click", function(e) {
          const editBtn = e.target.closest(".edit-post-btn");
          const deleteBtn = e.target.closest(".delete-post-btn");
          const cancelBtn = e.target.closest(".cancel-edit-btn");
          const deleteImageBtn = e.target.closest(".delete-image-btn");

          if (editBtn) {
            const card = editBtn.closest(".post-card");
            const editor = card.querySelector(".post-editor");
            if (editor) {
              editor.classList.toggle("open");
            }
          }

          if (cancelBtn) {
            const editor = cancelBtn.closest(".post-editor");
            editor.classList.remove("open");
          }

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
              if (data.success) {
                card.remove();
              } else {
                alert("Error deleting post");
              }
            }).catch(() => alert("Error deleting post"));
          }

          if (deleteImageBtn) {
            const form = deleteImageBtn.closest(".post-editor-form");
            const deleteInput = form.querySelector("input[name='deleteImage']");
            const preview = form.querySelector(".current-image-preview");
            deleteInput.value = "true";
            if (preview) {
              preview.innerHTML = "<p style='font-size:12px; color:#777;'>Image will be removed.</p>";
            }
          }
        });

        document.addEventListener("change", function(e) {
          const fileInput = e.target.closest("input[type='file'][name='image']");
          if (fileInput) {
            const form = fileInput.closest(".post-editor-form");
            const deleteInput = form.querySelector("input[name='deleteImage']");
            deleteInput.value = "false";
            const preview = form.querySelector(".current-image-preview");
            if (fileInput.files && fileInput.files[0]) {
              const reader = new FileReader();
              reader.onload = function(ev) {
                if (preview) {
                  preview.innerHTML = "<img src='" + ev.target.result + "' style='max-width:100%; border-radius:6px; margin-bottom:6px;'>";
                }
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

          fetch("/edit-post/" + postId, {
            method: "POST",
            body: formData
          }).then(r => r.json()).then(data => {
            if (!data.success) {
              alert("Error saving changes");
              return;
            }
            if (contentEl) contentEl.textContent = data.content || "";
            if (imageWrapper) {
              if (data.imagePath) {
                imageWrapper.innerHTML = "<img class='post-image' src='" + data.imagePath + "' style='max-width:100%; margin-top:8px; border-radius:6px;'>";
              } else {
                imageWrapper.innerHTML = "";
              }
            }
            const editor = card.querySelector(".post-editor");
            if (editor) editor.classList.remove("open");
          }).catch(() => alert("Error saving changes"));
        });
      </script>
    </body>
    </html>
  `);
});

// Upload profile picture
app.post("/upload-profile-pic", requireLogin, upload.single("profilePic"), async (req, res) => {
  if (!req.file) return res.redirect("/profile");

  const user = await User.findById(req.session.userId);
  user.profilePic = req.file.path;
  await user.save();

  res.redirect("/profile");
});

// Set top friends
app.post("/set-top-friends", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  let selected = req.body.topFriends || [];
  if (!Array.isArray(selected)) selected = [selected];

  user.topFriends = selected.slice(0, 8);
  await user.save();
  res.redirect("/profile");
});

// Add friend (Hybrid: instant)
app.post("/add-friend/:id", requireLogin, async (req, res) => {
  const viewer = await User.findById(req.session.userId);
  const target = await User.findById(req.params.id);
  if (!viewer || !target) return res.redirect("/feed");

  if (!viewer.friends.some(f => f.toString() === target._id.toString())) {
    viewer.friends.push(target._id);
    await viewer.save();
  }

  res.redirect("/profile/" + target._id);
});

// Remove friend
app.post("/remove-friend/:id", requireLogin, async (req, res) => {
  const viewer = await User.findById(req.session.userId);
  if (!viewer) return res.redirect("/feed");

  viewer.friends = viewer.friends.filter(f => f.toString() !== req.params.id);
  viewer.topFriends = viewer.topFriends.filter(f => f.toString() !== req.params.id);
  await viewer.save();

  res.redirect("/profile/" + req.params.id);
});

// Your own profile
app.get("/profile", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId)
    .populate("friends")
    .populate("topFriends");

  const posts = await Post.find({ userId: user._id }).sort({ createdAt: -1 });

  const topFriendsHtml = (user.topFriends || []).map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="
        width:60px; height:60px; border-radius:8px;
        background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;
        margin-bottom:4px;
      "></div>
      <div style="font-size:12px;">${f.name}</div>
    </div>
  `).join("");

  const friendsGridHtml = (user.friends || []).map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="
        width:60px; height:60px; border-radius:8px;
        background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;
        margin-bottom:4px;
      "></div>
      <div style="font-size:12px;"><a href="/profile/${f._id}" style="color:#ff6a00;">${f.name}</a></div>
    </div>
  `).join("");

  const postsHtml = posts.map(p => `
    <div class="post-card" data-post-id="${p._id}">
      <div class="post">
        <div class="author">${p.userName}</div>
        <div class="meta">${p.createdAt.toLocaleString()}</div>
        <p class="post-content" style="margin-top:6px;">${p.content || ""}</p>
        <div class="post-image-wrapper">
          ${p.imagePath ? `<img class="post-image" src="${p.imagePath}" style="max-width:100%; margin-top:8px; border-radius:6px;">` : ""}
        </div>
        <div class="post-actions" style="margin-top:8px; font-size:13px;">
          <button class="btn-secondary edit-post-btn" type="button">Edit</button>
          <button class="btn-secondary delete-post-btn" type="button" style="margin-left:6px;">Delete</button>
        </div>
      </div>

      <div class="post-editor" id="editor-${p._id}">
        <form class="post-editor-form" data-post-id="${p._id}">
          <label style="font-size:13px; color:#ccc;">Edit your post</label>
          <textarea name="content" class="post-editor-text" style="width:100%; min-height:80px; margin-top:4px;">${p.content || ""}</textarea>

          <div class="editor-image-section" style="margin-top:8px;">
            <div class="current-image-preview">
              ${p.imagePath ? `<img src="${p.imagePath}" class="editor-image" style="max-width:100%; border-radius:6px; margin-bottom:6px;">` : "<p style='font-size:12px; color:#777;'>No image attached.</p>"}
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:4px;">
              <button type="button" class="btn-secondary delete-image-btn" style="font-size:12px;">Delete Image</button>
              <label class="btn-secondary" style="font-size:12px; cursor:pointer;">
                Replace Image
                <input type="file" name="image" accept="image/*" style="display:none;">
              </label>
              <input type="hidden" name="deleteImage" value="false">
            </div>
          </div>

          <div style="margin-top:10px; display:flex; gap:8px;">
            <button type="submit" class="btn-primary" style="flex:0 0 auto;">Save Changes</button>
            <button type="button" class="btn-secondary cancel-edit-btn" style="flex:0 0 auto;">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `).join("");

  const topFriendsSelector = (user.friends || []).map(f => `
    <label style="display:block; font-size:13px; margin-bottom:4px;">
      <input type="checkbox" name="topFriends" value="${f._id}"
        ${user.topFriends.some(tf => tf._id.toString() === f._id.toString()) ? "checked" : ""}>
      ${f.name}
    </label>
  `).join("");

  const pic = user.profilePic || "/assets/img/default-avatar.png";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Profile – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        .top-friends-bar {
          display:flex;
          flex-wrap:wrap;
          gap:10px;
        }
        .friend-tile {
          width:70px;
          text-align:center;
        }
        .post-card {
          margin-bottom:16px;
        }
        .post-editor {
          margin-top:8px;
          border-radius:12px;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 106, 0, 0.6);
          padding: 12px;
          max-height:0;
          opacity:0;
          overflow:hidden;
          transition:max-height 0.25s ease, opacity 0.2s ease;
        }
        .post-editor.open {
          max-height:500px;
          opacity:1;
        }
        .btn-secondary {
          padding:6px 10px;
          background:rgba(255,255,255,0.08);
          border-radius:6px;
          border:none;
          color:#ff6a00;
          cursor:pointer;
          font-weight:bold;
          text-decoration:none;
          transition:0.2s;
        }
        .btn-secondary:hover {
          background:rgba(255,255,255,0.18);
        }
      </style>
    </head>
    <body>
      <div class="navbar">
        <div class="logo">
          <a href="/feed" style="color:#ff6a00; text-decoration:none;">Spacebook</a>
        </div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/feed">Feed</a>
          <a href="/logout">Log Out</a>
        </div>
      </div>

      <div class="page">
        <div class="card" style="width:100%;">

          <div class="profile-header">
            <div class="profile-avatar"
                 style="background-image:url('${pic}'); background-size:cover; background-position:center;">
            </div>

            <div class="profile-info">
              <h2>${user.name}</h2>
              <p>${user.network || "Unknown network"}</p>
              <p style="margin-top:6px; color:#ccc;">
                “Exploring the universe via Spacebook.”
              </p>
            </div>
          </div>

          <form action="/upload-profile-pic" method="post" enctype="multipart/form-data" style="margin-top:20px;">
            <label style="color:#ccc; font-size:14px;">Update profile picture</label>
            <input type="file" name="profilePic" accept="image/*">
            <button class="btn-primary" style="margin-top:10px;">Upload</button>
          </form>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Top Friends</h3>
          <div class="top-friends-bar">
            ${topFriendsHtml || "<p style='color:#ccc; font-size:13px;'>No top friends yet. Pick some below.</p>"}
          </div>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Your Friends</h3>
          <div style="display:flex; flex-wrap:wrap; gap:10px;">
            ${friendsGridHtml || "<p style='color:#ccc; font-size:13px;'>No friends yet.</p>"}
          </div>

          <form action="/set-top-friends" method="post" style="margin-top:20px;">
            <h4 style="color:#ff6a00; margin-bottom:8px;">Select Top 8 Friends</h4>
            <div style="max-height:200px; overflow-y:auto; border:1px solid #333; padding:10px; border-radius:6px;">
              ${topFriendsSelector || "<p style='color:#ccc; font-size:13px;'>Add some friends first.</p>"}
            </div>
            <button class="btn-primary" style="margin-top:10px;">Save Top Friends</button>
          </form>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Your Posts</h3>
          ${postsHtml || "<p style='color:#ccc; font-size:13px;'>You haven't posted yet.</p>"}

        </div>
      </div>

      <script>
        document.addEventListener("click", function(e) {
          const editBtn = e.target.closest(".edit-post-btn");
          const deleteBtn = e.target.closest(".delete-post-btn");
          const cancelBtn = e.target.closest(".cancel-edit-btn");
          const deleteImageBtn = e.target.closest(".delete-image-btn");

          if (editBtn) {
            const card = editBtn.closest(".post-card");
            const editor = card.querySelector(".post-editor");
            if (editor) {
              editor.classList.toggle("open");
            }
          }

          if (cancelBtn) {
            const editor = cancelBtn.closest(".post-editor");
            editor.classList.remove("open");
          }

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
              if (data.success) {
                card.remove();
              } else {
                alert("Error deleting post");
              }
            }).catch(() => alert("Error deleting post"));
          }

          if (deleteImageBtn) {
            const form = deleteImageBtn.closest(".post-editor-form");
            const deleteInput = form.querySelector("input[name='deleteImage']");
            const preview = form.querySelector(".current-image-preview");
            deleteInput.value = "true";
            if (preview) {
              preview.innerHTML = "<p style='font-size:12px; color:#777;'>Image will be removed.</p>";
            }
          }
        });

        document.addEventListener("change", function(e) {
          const fileInput = e.target.closest("input[type='file'][name='image']");
          if (fileInput) {
            const form = fileInput.closest(".post-editor-form");
            const deleteInput = form.querySelector("input[name='deleteImage']");
            deleteInput.value = "false";
            const preview = form.querySelector(".current-image-preview");
            if (fileInput.files && fileInput.files[0]) {
              const reader = new FileReader();
              reader.onload = function(ev) {
                if (preview) {
                  preview.innerHTML = "<img src='" + ev.target.result + "' style='max-width:100%; border-radius:6px; margin-bottom:6px;'>";
                }
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

          fetch("/edit-post/" + postId, {
            method: "POST",
            body: formData
          }).then(r => r.json()).then(data => {
            if (!data.success) {
              alert("Error saving changes");
              return;
            }
            if (contentEl) contentEl.textContent = data.content || "";
            if (imageWrapper) {
              if (data.imagePath) {
                imageWrapper.innerHTML = "<img class='post-image' src='" + data.imagePath + "' style='max-width:100%; margin-top:8px; border-radius:6px;'>";
              } else {
                imageWrapper.innerHTML = "";
              }
            }
            const editor = card.querySelector(".post-editor");
            if (editor) editor.classList.remove("open");
          }).catch(() => alert("Error saving changes"));
        });
      </script>
    </body>
    </html>
  `);
});

// Other user's profile
app.get("/profile/:id", requireLogin, async (req, res) => {
  const viewer = await User.findById(req.session.userId)
    .populate("friends")
    .populate("topFriends");
  const target = await User.findById(req.params.id)
    .populate("friends")
    .populate("topFriends");

  if (!target) return res.redirect("/feed");

  const posts = await Post.find({ userId: target._id }).sort({ createdAt: -1 });

  const isFriend = viewer.friends.some(f => f._id.toString() === target._id.toString());

  const topFriendsHtml = (target.topFriends || []).map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="
        width:60px; height:60px; border-radius:8px;
        background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;
        margin-bottom:4px;
      "></div>
      <div style="font-size:12px;">${f.name}</div>
    </div>
  `).join("");

  const friendsGridHtml = (target.friends || []).map(f => `
    <div class="friend-tile">
      <div class="friend-avatar" style="
        width:60px; height:60px; border-radius:8px;
        background:#111 url('${f.profilePic || "/assets/img/default-avatar.png"}') center/cover no-repeat;
        margin-bottom:4px;
      "></div>
      <div style="font-size:12px;"><a href="/profile/${f._id}" style="color:#ff6a00;">${f.name}</a></div>
    </div>
  `).join("");

  const postsHtml = posts.map(p => `
    <div class="post-card" data-post-id="${p._id}">
      <div class="post">
        <div class="author">${p.userName}</div>
        <div class="meta">${p.createdAt.toLocaleString()}</div>
        <p class="post-content" style="margin-top:6px;">${p.content || ""}</p>
        <div class="post-image-wrapper">
          ${p.imagePath ? `<img class="post-image" src="${p.imagePath}" style="max-width:100%; margin-top:8px; border-radius:6px;">` : ""}
        </div>
      </div>
    </div>
  `).join("");

  const pic = target.profilePic || "/assets/img/default-avatar.png";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${target.name} – Spacebook</title>
      <link rel="stylesheet" href="/assets/css/styles.css">
      <style>
        .top-friends-bar {
          display:flex;
          flex-wrap:wrap;
          gap:10px;
        }
        .friend-tile {
          width:70px;
          text-align:center;
        }
      </style>
    </head>
    <body>
      <div class="navbar">
        <div class="logo">
          <a href="/feed" style="color:#ff6a00; text-decoration:none;">Spacebook</a>
        </div>
        <div class="nav-links">
          <a href="/home">Home</a>
          <a href="/profile">Your Profile</a>
          <a href="/logout">Log Out</a>
        </div>
      </div>

      <div class="page">
        <div class="card" style="width:100%;">

          <div class="profile-header">
            <div class="profile-avatar"
                 style="background-image:url('${pic}'); background-size:cover; background-position:center;">
            </div>

            <div class="profile-info">
              <h2>${target.name}</h2>
              <p>${target.network || "Unknown network"}</p>
              <p style="margin-top:6px; color:#ccc;">
                “Exploring the universe via Spacebook.”
              </p>
            </div>
          </div>

          <div style="margin-top:16px;">
            ${isFriend ? `
              <form action="/remove-friend/${target._id}" method="post">
                <button class="btn-primary" style="background:#222; color:#ff6a00; border:1px solid #ff6a00;">Remove Friend</button>
              </form>
            ` : `
              <form action="/add-friend/${target._id}" method="post">
                <button class="btn-primary">Add Friend</button>
              </form>
            `}
          </div>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Top Friends</h3>
          <div class="top-friends-bar">
            ${topFriendsHtml || "<p style='color:#ccc; font-size:13px;'>No top friends yet.</p>"}
          </div>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Friends</h3>
          <div style="display:flex; flex-wrap:wrap; gap:10px;">
            ${friendsGridHtml || "<p style='color:#ccc; font-size:13px;'>No friends yet.</p>"}
          </div>

          <hr style="margin:20px 0; border:none; border-top:1px solid #333;">

          <h3 style="color:#ff6a00; margin-bottom:10px;">Posts</h3>
          ${postsHtml || "<p style='color:#ccc; font-size:13px;'>No posts yet.</p>"}

        </div>
      </div>
    </body>
    </html>
  `);
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});


// ====== START SERVER (ONLY ONE VERSION) ======
const server = app.listen(PORT, () => {
  console.log("Spacebook running on port", PORT);
});

// Attach chess WebSocket to the same server
attachChessServer(server);

