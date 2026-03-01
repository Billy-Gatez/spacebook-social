let currentUser = null;
let currentConvId = null;
let socket = null;
let typingTimer = null;
let mediaRecorder = null;
let audioChunks = [];
let allConversations = [];
let convToDelete = null;

async function init() {
  currentUser = await fetch("/api/session-user", { credentials: "include" }).then(r => r.json());
  socket = io({ path: "/msg-socket", auth: { userId: currentUser.id } });

  socket.on("new_message", (msg) => {
    if (msg.conversationId === currentConvId) appendMessage(msg);
    updateConvLastMsg(msg.conversationId, msg.content);
  });

  socket.on("typing_indicator", ({ userId, senderName, typing }) => {
    const bar = document.getElementById("typing-bar");
    if (typing) bar.textContent = `${senderName} is typing…`;
    else bar.textContent = "";
  });

  socket.on("messages_read", ({ conversationId, userId }) => {
    if (conversationId === currentConvId) markMessagesRead();
  });

  socket.on("reaction_update", ({ messageId, reactions }) => {
    updateMessageReactions(messageId, reactions);
  });

  socket.on("presence_update", ({ userId, online }) => {
    const dot = document.querySelector(`.online-dot[data-uid="${userId}"]`);
    if (dot) dot.style.display = online ? "inline-block" : "none";
  });

  socket.on("message_deleted", ({ messageId }) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) el.remove();
  });

  socket.on("conversation_deleted", ({ conversationId }) => {
    const item = document.getElementById(`conv-${conversationId}`);
    if (item) item.remove();
    if (currentConvId === conversationId) {
      currentConvId = null;
      document.getElementById("chat-header").innerHTML = `<div class="chat-header-left"><span style="color:#444;font-weight:400">Select a conversation</span></div>`;
      document.getElementById("chat-messages").innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><div>Pick a conversation to start messaging</div></div>`;
    }
  });

  await loadConversations();
}

async function loadConversations() {
  const convs = await fetch("/api/conversations", { credentials: "include" }).then(r => r.json());
  allConversations = convs;
  renderConvList(convs);
}

function filterConvs(query) {
  const q = query.toLowerCase();
  const filtered = allConversations.filter(c => {
    const others = c.participants.filter(p => p._id !== currentUser.id);
    const name = c.type === "group" ? c.name : (others[0]?.name || "");
    return name.toLowerCase().includes(q);
  });
  renderConvList(filtered);
}

function renderConvList(convs) {
  const el = document.getElementById("conv-list-items");
  if (!convs.length) {
    el.innerHTML = `<div style="padding:20px;color:#666;font-size:13px;text-align:center">No conversations yet.<br>Go to a profile and hit Message.</div>`;
    return;
  }
  el.innerHTML = convs.map(c => {
    const others = c.participants.filter(p => p._id !== currentUser.id);
    const name = c.type === "group" ? (c.name || "Group") : (others[0]?.name || "Unknown");
    const pic = others[0]?.profilePic || "/assets/img/default-avatar.png";
    const otherId = others[0]?._id;
    return `
      <div class="conv-item ${c._id === currentConvId ? "active" : ""}" onclick="openConv('${c._id}','${name}','${pic}')" id="conv-${c._id}">
        <img class="conv-avatar" src="${pic}" alt="">
        <div class="conv-info">
          <div class="conv-name">${name}${otherId ? `<span class="online-dot" data-uid="${otherId}" style="display:none"></span>` : ""}</div>
          <div class="conv-last" id="last-${c._id}"></div>
        </div>
        <button class="conv-delete-btn" onclick="promptDeleteConv(event,'${c._id}')" title="Delete conversation">🗑</button>
      </div>`;
  }).join("");
  convs.forEach(c => checkPresence(c));
}

async function checkPresence(conv) {
  const others = conv.participants.filter(p => p._id !== currentUser.id);
  for (const p of others) {
    const data = await fetch(`/api/presence/${p._id}`, { credentials: "include" }).then(r => r.json()).catch(() => ({ online: false }));
    const dot = document.querySelector(`.online-dot[data-uid="${p._id}"]`);
    if (dot) dot.style.display = data.online ? "inline-block" : "none";
  }
}

async function openConv(convId, name, pic) {
  currentConvId = convId;
  document.querySelectorAll(".conv-item").forEach(el => el.classList.remove("active"));
  const item = document.getElementById(`conv-${convId}`);
  if (item) item.classList.add("active");

  const header = document.getElementById("chat-header");
  header.innerHTML = `
    <div class="chat-header-left">
      <img src="${pic}" style="width:36px;height:36px;border-radius:50%;border:2px solid #ff6a00;object-fit:cover;">
      <span>${name}</span>
    </div>
    <div class="chat-header-actions">
      <button class="icon-btn" style="font-size:13px;border-radius:8px;padding:5px 12px" onclick="promptDeleteConv(event,'${convId}')">🗑 Delete Chat</button>
    </div>`;

  const msgs = await fetch(`/api/conversations/${convId}/messages`, { credentials: "include" }).then(r => r.json());
  const feed = document.getElementById("chat-messages");
  feed.innerHTML = "";
  if (!msgs.length) {
    feed.innerHTML = `<div class="empty-state"><div class="empty-icon">👋</div><div>No messages yet. Say hello!</div></div>`;
  } else {
    msgs.forEach(m => appendMessage(m));
  }
  feed.scrollTop = feed.scrollHeight;
  socket.emit("mark_read", { conversationId: convId });
}

function appendMessage(msg) {
  const feed = document.getElementById("chat-messages");
  // Remove empty state if present
  const empty = feed.querySelector(".empty-state");
  if (empty) empty.remove();

  const isMine = msg.senderId === currentUser.id || msg.senderId?.toString() === currentUser.id?.toString();
  const row = document.createElement("div");
  row.id = `msg-${msg._id}`;
  row.className = `msg-row ${isMine ? "mine" : "theirs"}`;

  let mediaHtml = "";
  if (msg.mediaUrl) {
    if (msg.type === "image") mediaHtml = `<img src="${msg.mediaUrl}" class="msg-media" onclick="window.open('${msg.mediaUrl}','_blank')">`;
    else if (msg.type === "video") mediaHtml = `<video src="${msg.mediaUrl}" class="msg-media" controls></video>`;
    else if (msg.type === "voice") mediaHtml = `<audio src="${msg.mediaUrl}" controls style="margin-top:6px;max-width:220px;"></audio>`;
    else if (msg.type === "soundcloud") mediaHtml = `
      <div class="sc-preview">
        <div style="color:#ff6a00;font-size:12px;margin-bottom:4px;">🎵 SoundCloud</div>
        <iframe width="100%" height="80" scrolling="no" frameborder="no"
          src="https://w.soundcloud.com/player/?url=${encodeURIComponent(msg.mediaUrl)}&color=%23ff6a00&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false"></iframe>
      </div>`;
  }

  const rxns = buildReactionHtml(msg._id, msg.reactions || []);
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  row.innerHTML = `
    ${!isMine ? `<div class="msg-sender">${msg.senderName}</div>` : ""}
    <div class="msg-bubble ${isMine ? "mine" : "theirs"}">
      ${msg.content ? `<div>${msg.content}</div>` : ""}
      ${mediaHtml}
      <div class="react-picker-row">
        ${["❤️","😂","😮","😢","👍","🔥"].map(e => `<span style="cursor:pointer;font-size:17px;" onclick="sendReaction('${msg._id}','${e}')">${e}</span>`).join("")}
      </div>
      <div class="msg-time">${time}</div>
    </div>
    <div class="msg-reactions-row" id="rxn-row-${msg._id}">${rxns}</div>
    ${isMine ? `<button class="msg-delete-btn" onclick="deleteMessage('${msg._id}')">🗑 Delete</button>` : ""}`;

  feed.appendChild(row);
  feed.scrollTop = feed.scrollHeight;
}

function buildReactionHtml(msgId, reactions) {
  const counts = {};
  reactions.forEach(r => counts[r.emoji] = (counts[r.emoji] || 0) + 1);
  return Object.entries(counts).map(([e, c]) =>
    `<span class="rxn-chip" onclick="sendReaction('${msgId}','${e}')">${e} <span class="rxn-count">${c}</span></span>`
  ).join("");
}

function updateMessageReactions(messageId, reactions) {
  const el = document.getElementById(`rxn-row-${messageId}`);
  if (el) el.innerHTML = buildReactionHtml(messageId, reactions);
}

function markMessagesRead() {}

function updateConvLastMsg(convId, text) {
  const el = document.getElementById(`last-${convId}`);
  if (el) el.textContent = text;
}

function sendReaction(messageId, emoji) {
  socket.emit("react", { messageId, emoji });
}

async function deleteMessage(messageId) {
  if (!confirm("Delete this message?")) return;
  await fetch(`/api/messages/${messageId}`, { method: "DELETE", credentials: "include" });
}

function promptDeleteConv(e, convId) {
  e.stopPropagation();
  convToDelete = convId;
  document.getElementById("delete-conv-overlay").classList.add("open");
}

function closeDeleteConvModal() {
  convToDelete = null;
  document.getElementById("delete-conv-overlay").classList.remove("open");
}

async function confirmDeleteConv() {
  if (!convToDelete) return;
  await fetch(`/api/conversations/${convToDelete}`, { method: "DELETE", credentials: "include" });
  closeDeleteConvModal();
}

function handleTypingInput() {
  if (!currentConvId) return;
  socket.emit("typing", { conversationId: currentConvId, senderName: currentUser.name, typing: true });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit("typing", { conversationId: currentConvId, senderName: currentUser.name, typing: false });
  }, 1500);

  const input = document.getElementById("msg-input");
  const val = input.value.trim();
  if (val.includes("soundcloud.com")) showSCPreview(val);
}

function handleMsgKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
}

async function sendTextMessage() {
  if (!currentConvId) return;
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if (!text) return;
  if (text.includes("soundcloud.com")) {
    socket.emit("send_message", { conversationId: currentConvId, senderName: currentUser.name, type: "soundcloud", content: "", mediaUrl: text });
  } else {
    socket.emit("send_message", { conversationId: currentConvId, senderName: currentUser.name, type: "text", content: text });
  }
  input.value = "";
  socket.emit("typing", { conversationId: currentConvId, senderName: currentUser.name, typing: false });
}

async function handleFileAttach(event) {
  if (!currentConvId) return;
  const file = event.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("media", file);
  const res = await fetch("/api/messages/upload", { method: "POST", credentials: "include", body: fd }).then(r => r.json());
  const type = file.type.startsWith("video") ? "video" : "image";
  socket.emit("send_message", { conversationId: currentConvId, senderName: currentUser.name, type, content: "", mediaUrl: res.url });
  event.target.value = "";
}

const voiceBtn = document.getElementById("voice-btn");
voiceBtn.addEventListener("mousedown", startVoiceRecord);
voiceBtn.addEventListener("mouseup", stopVoiceRecord);
voiceBtn.addEventListener("touchstart", startVoiceRecord);
voiceBtn.addEventListener("touchend", stopVoiceRecord);

async function startVoiceRecord() {
  if (!currentConvId) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.start();
    voiceBtn.classList.add("recording");
  } catch {}
}

async function stopVoiceRecord() {
  if (!mediaRecorder) return;
  voiceBtn.classList.remove("recording");
  mediaRecorder.stop();
  mediaRecorder.onstop = async () => {
    const blob = new Blob(audioChunks, { type: "audio/ogg; codecs=opus" });
    const fd = new FormData();
    fd.append("media", blob, "voice-note.ogg");
    const res = await fetch("/api/messages/upload", { method: "POST", credentials: "include", body: fd }).then(r => r.json());
    socket.emit("send_message", { conversationId: currentConvId, senderName: currentUser.name, type: "voice", content: "", mediaUrl: res.url });
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    mediaRecorder = null;
  };
}

async function openGroupModal() {
  const friends = await fetch("/api/friends", { credentials: "include" }).then(r => r.json());
  const list = document.getElementById("friend-check-list");
  list.innerHTML = friends.map(f => `
    <label class="friend-check-item">
      <input type="checkbox" value="${f._id}" style="width:auto;margin:0;">
      <img src="${f.profilePic || '/assets/img/default-avatar.png'}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid #ff6a00;">
      ${f.name}
    </label>`).join("");
  document.getElementById("group-overlay").classList.add("open");
}

function closeGroupModal() {
  document.getElementById("group-overlay").classList.remove("open");
}

async function submitGroupCreate() {
  const name = document.getElementById("group-name-input").value.trim();
  const checked = [...document.querySelectorAll("#friend-check-list input:checked")].map(i => i.value);
  if (!name || !checked.length) return alert("Enter a name and select at least one friend.");
  const conv = await fetch("/api/conversations/group", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, participantIds: checked })
  }).then(r => r.json());
  closeGroupModal();
  await loadConversations();
  openConv(conv._id, conv.name, "/assets/img/default-avatar.png");
}

function showSCPreview(url) {}

init();
