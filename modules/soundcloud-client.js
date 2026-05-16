// /public/modules/soundcloud-client.js

let playlists = [];
let currentPlaylist = null;
let currentTrackIndex = -1;
let isPlaying = false;
let socket = null;
let currentRoomId = null;
let currentUser = null;

// ========================
// INIT
// ========================
async function init() {
  try {
    currentUser = await fetch('/api/session-user', { credentials: 'include' }).then(r => r.json());
  } catch(e) {}
  loadPlaylists();
}

async function loadPlaylists() {
  playlists = await fetch('/api/playlists', { credentials: 'include' })
    .then(r => r.json())
    .catch(() => []);
  renderPlaylists();
}

// ========================
// CREATE PLAYLIST (was missing!)
// ========================
async function createPlaylist() {
  const name = document.getElementById('new-pl-name').value.trim();
  const collaborative = document.getElementById('new-pl-collab').checked;

  if (!name) return alert('Enter a playlist name first.');

  const pl = await fetch('/api/playlists', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, collaborative })
  }).then(r => r.json()).catch(() => null);

  if (!pl || !pl._id) return alert('Could not create playlist. Make sure you are logged in.');

  document.getElementById('new-pl-name').value = '';
  document.getElementById('new-pl-collab').checked = false;

  await loadPlaylists();
  selectPlaylist(pl._id);
}

// ========================
// RENDER PLAYLISTS
// ========================
function renderPlaylists() {
  const el = document.getElementById('pl-list');
  if (!playlists.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;">No playlists yet.</p>';
    return;
  }
  el.innerHTML = playlists.map(pl => `
    <div class="pl-item ${currentPlaylist && currentPlaylist._id === pl._id ? 'active' : ''}"
         onclick="selectPlaylist('${pl._id}')">
      <div style="flex:1;">
        <div class="pl-name">${pl.name}</div>
        <div class="pl-meta">${(pl.tracks || []).length} track${(pl.tracks || []).length !== 1 ? 's' : ''}${pl.collaborative ? ' · Collab' : ''}</div>
      </div>
      <button class="btn-secondary" style="padding:3px 8px;font-size:11px;"
        onclick="event.stopPropagation(); deletePlaylist('${pl._id}')">✕</button>
    </div>
  `).join('');
}

// ========================
// SELECT PLAYLIST
// ========================
function selectPlaylist(id) {
  currentPlaylist = playlists.find(p => p._id === id) || null;
  if (!currentPlaylist) return;

  document.getElementById('player-area').style.display = 'block';
  document.getElementById('no-pl-msg').style.display = 'none';
  document.getElementById('pl-title').textContent = currentPlaylist.name;

  currentTrackIndex = -1;
  isPlaying = false;
  document.getElementById('play-btn').textContent = '▶';
  document.getElementById('now-playing-title').textContent = '—';
  document.getElementById('sc-embed-wrap').innerHTML =
    '<div style="color:#888;text-align:center;padding:40px;font-size:13px;">Select a track to play 🎧</div>';

  renderTracks();
  renderPlaylists();
}

// ========================
// DELETE PLAYLIST
// ========================
async function deletePlaylist(id) {
  if (!confirm('Delete this playlist?')) return;
  await fetch('/api/playlists/' + id, { method: 'DELETE', credentials: 'include' }).catch(() => {});
  if (currentPlaylist && currentPlaylist._id === id) {
    currentPlaylist = null;
    document.getElementById('player-area').style.display = 'none';
    document.getElementById('no-pl-msg').style.display = 'block';
  }
  await loadPlaylists();
}

// ========================
// RENDER TRACKS
// ========================
function renderTracks() {
  const el = document.getElementById('track-list');
  const tracks = currentPlaylist ? (currentPlaylist.tracks || []) : [];
  if (!tracks.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;">No tracks yet. Add a SoundCloud URL above.</p>';
    return;
  }
  el.innerHTML = tracks.map((t, i) => `
    <div class="track-item ${i === currentTrackIndex ? 'playing' : ''}" onclick="playTrack(${i})">
      <div class="track-num">${i === currentTrackIndex ? '▶' : i + 1}</div>
      <div style="flex:1;overflow:hidden;">
        <div class="track-title">${t.title || t.soundcloudUrl}</div>
        <div class="track-by">${t.soundcloudUrl}</div>
      </div>
      <button class="btn-secondary" style="padding:3px 8px;font-size:11px;"
        onclick="event.stopPropagation(); removeTrack(${i})">✕</button>
    </div>
  `).join('');
}

// ========================
// ADD TRACK
// ========================
async function addTrack() {
  const soundcloudUrl = document.getElementById('track-url-input').value.trim();
  const title = document.getElementById('track-title-input').value.trim();
  if (!soundcloudUrl) return alert('Paste a SoundCloud URL first.');
  if (!currentPlaylist) return alert('Select a playlist first.');

  const updated = await fetch('/api/playlists/' + currentPlaylist._id + '/tracks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soundcloudUrl, title: title || soundcloudUrl })
  }).then(r => r.json()).catch(() => null);

  if (!updated) return alert('Could not add track.');
  currentPlaylist = updated;
  document.getElementById('track-url-input').value = '';
  document.getElementById('track-title-input').value = '';
  renderTracks();
  loadPlaylists();
}

// ========================
// REMOVE TRACK
// ========================
async function removeTrack(index) {
  await fetch('/api/playlists/' + currentPlaylist._id + '/tracks/' + index, {
    method: 'DELETE',
    credentials: 'include'
  }).catch(() => {});
  playlists = await fetch('/api/playlists', { credentials: 'include' })
    .then(r => r.json()).catch(() => playlists);
  currentPlaylist = playlists.find(p => p._id === currentPlaylist._id) || currentPlaylist;
  renderTracks();
  renderPlaylists();
}

// ========================
// PLAYBACK
// ========================
function playTrack(index) {
  if (!currentPlaylist) return;
  const tracks = currentPlaylist.tracks || [];
  if (index < 0 || index >= tracks.length) return;

  currentTrackIndex = index;
  isPlaying = true;
  const track = tracks[index];
  const url = track.soundcloudUrl;

  document.getElementById('now-playing-title').textContent = track.title || url;
  document.getElementById('play-btn').textContent = '⏸';

  const embedUrl = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url)
    + '&color=%23ff6a00&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false';
  document.getElementById('sc-embed-wrap').innerHTML =
    `<iframe src="${embedUrl}" height="166" scrolling="no" allow="autoplay"></iframe>`;

  renderTracks();

  if (socket && currentRoomId) {
    socket.emit('change_track', { roomId: currentRoomId, trackIndex: index });
  }
}

function togglePlay() {
  if (currentTrackIndex === -1 && currentPlaylist && (currentPlaylist.tracks || []).length > 0) {
    playTrack(0);
    return;
  }
  isPlaying = !isPlaying;
  document.getElementById('play-btn').textContent = isPlaying ? '⏸' : '▶';
  if (socket && currentRoomId) {
    socket.emit('play_pause', { roomId: currentRoomId, isPlaying, currentTime: 0 });
  }
}

function nextTrack() {
  if (!currentPlaylist) return;
  const len = (currentPlaylist.tracks || []).length;
  if (!len) return;
  playTrack((currentTrackIndex + 1) % len);
}

function prevTrack() {
  if (!currentPlaylist) return;
  const len = (currentPlaylist.tracks || []).length;
  if (!len) return;
  playTrack(currentTrackIndex <= 0 ? len - 1 : currentTrackIndex - 1);
}

// ========================
// LISTEN ROOM
// ========================
async function startListenRoom() {
  if (!currentPlaylist) return alert('Select a playlist first.');

  const room = await fetch('/api/listen-rooms', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistId: currentPlaylist._id })
  }).then(r => r.json()).catch(() => null);

  if (!room || !room._id) return alert('Could not create room.');

  currentRoomId = room._id;

  try {
    socket = io({
      path: '/listen-socket',
      auth: {
        userId: currentUser ? currentUser._id : '',
        userName: currentUser ? currentUser.name : 'Guest'
      }
    });
    setupSocketListeners();
    socket.emit('join_room', { roomId: currentRoomId });
  } catch(e) {
    alert('Real-time sync unavailable. You can still use the player solo.');
    return;
  }

  document.getElementById('room-panel').style.display = 'block';
  document.getElementById('room-id-display').textContent = currentRoomId;
}

function setupSocketListeners() {
  socket.on('user_joined', data => {
    appendRoomChat('🟢 ' + data.userName + ' joined', true);
  });
  socket.on('sync_state', data => {
    if (data.trackIndex !== undefined && data.trackIndex !== currentTrackIndex) playTrack(data.trackIndex);
    if (data.isPlaying !== undefined) {
      isPlaying = data.isPlaying;
      document.getElementById('play-btn').textContent = isPlaying ? '⏸' : '▶';
    }
  });
  socket.on('track_changed', data => {
    if (data.trackIndex !== currentTrackIndex) playTrack(data.trackIndex);
  });
  socket.on('room_chat_message', data => {
    appendRoomChat(`<span class="rc-name">${data.userName}</span>${data.message}`);
  });
  socket.on('room_reaction', data => {
    spawnReactionBurst(data.emoji);
  });
}

// ========================
// ROOM CHAT
// ========================
function appendRoomChat(html, system = false) {
  const chat = document.getElementById('room-chat');
  const msg = document.createElement('div');
  msg.className = 'room-chat-msg';
  if (system) msg.style.color = '#666';
  msg.innerHTML = html;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

function sendRoomChat() {
  const input = document.getElementById('room-chat-input');
  const message = input.value.trim();
  if (!message) return;
  if (socket && currentRoomId) {
    socket.emit('room_chat', { roomId: currentRoomId, message });
  } else {
    appendRoomChat(`<span class="rc-name">${currentUser ? currentUser.name : 'You'}</span>${message}`);
  }
  input.value = '';
}

// ========================
// REACTIONS
// ========================
function sendRoomReaction(emoji) {
  if (socket && currentRoomId) socket.emit('room_react', { roomId: currentRoomId, emoji });
  spawnReactionBurst(emoji);
}

function spawnReactionBurst(emoji) {
  const el = document.createElement('div');
  el.className = 'reaction-burst';
  el.textContent = emoji;
  el.style.left = (Math.random() * 80 + 10) + 'vw';
  el.style.top = '70vh';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// ========================
// COPY ROOM LINK
// ========================
function copyRoomLink() {
  const url = window.location.origin + '/listen-together?room=' + currentRoomId;
  navigator.clipboard.writeText(url)
    .then(() => alert('Room link copied!'))
    .catch(() => prompt('Copy this link:', url));
}

// ========================
// START
// ========================
init();