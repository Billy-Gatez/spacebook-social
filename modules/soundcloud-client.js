// /public/modules/soundcloud-client.js

let playlists = [];
let currentPlaylist = null;
let currentTrackIndex = -1;
let isPlaying = false;
let socket = null;
let currentRoomId = null;
let currentUser = null;

async function init() {
  try {
    currentUser = await fetch('/api/session-user', { credentials: 'include' }).then(r => r.json());
  } catch(e) {}
  loadPlaylists();
}

async function loadPlaylists() {
  playlists = await fetch('/api/playlists', { credentials: 'include' }).then(r => r.json()).catch(() => []);
  renderPlaylists();
}

function renderPlaylists() {
  const el = document.getElementById('pl-list');
  if (!playlists.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;">No playlists yet.</p>';
    return;
  }
  el.innerHTML = playlists.map(pl =>
    '<div class="pl-item ' + (currentPlaylist && currentPlaylist._id === pl._id ? 'active' : '') + '" onclick="selectPlaylist(\'' + pl._id + '\')">' +
    '<div><div class="pl-name">' + pl.name + '</div>' +
    '<div class="pl-meta">' + (pl.tracks || []).length + ' tracks' + (pl.isCollaborative ? ' · Collab' : '') + '</div></div>' +
    '<button onclick="event.stopPropagation();deletePlaylist(\'' + pl._id + '\')" style="background:none;border:none;color:#555;cursor:pointer;font-size:14px;padding:0 4px;">🗑</button>' +
    '</div>'
  ).join('');
}

async function createPlaylist() {
  const name = document.getElementById('new-pl-name').value.trim();
  const isCollaborative = document.getElementById('new-pl-collab').checked;
  if (!name) return;
  await fetch('/api/playlists', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, isCollaborative })
  });
  document.getElementById('new-pl-name').value = '';
  document.getElementById('new-pl-collab').checked = false;
  loadPlaylists();
}

async function deletePlaylist(id) {
  if (!confirm('Delete this playlist?')) return;
  await fetch('/api/playlists/' + id, { method: 'DELETE', credentials: 'include' });
  if (currentPlaylist && currentPlaylist._id === id) {
    currentPlaylist = null;
    document.getElementById('player-area').style.display = 'none';
    document.getElementById('no-pl-msg').style.display = 'block';
  }
  loadPlaylists();
}

async function selectPlaylist(id) {
  const found = playlists.find(function(p) { return p._id === id; });
  if (!found) return;
  currentPlaylist = found;
  currentTrackIndex = -1;
  document.getElementById('player-area').style.display = 'block';
  document.getElementById('no-pl-msg').style.display = 'none';
  document.getElementById('pl-title').textContent = found.name;
  renderTracks();
  renderPlaylists();
}

function renderTracks() {
  const el = document.getElementById('track-list');
  const tracks = currentPlaylist ? (currentPlaylist.tracks || []) : [];
  if (!tracks.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;text-align:center;padding:20px 0;">No tracks yet. Add a SoundCloud URL above.</p>';
    return;
  }
  el.innerHTML = tracks.map(function(t, i) {
    return '<div class="track-item ' + (i === currentTrackIndex ? 'playing' : '') + '" onclick="playTrack(' + i + ')">' +
      '<span class="track-num">' + (i === currentTrackIndex ? '▶' : i + 1) + '</span>' +
      '<div style="flex:1;min-width:0;">' +
      '<div class="track-title">' + (t.title || t.soundcloudUrl) + '</div>' +
      '<div class="track-by">' + (t.addedByName ? 'Added by ' + t.addedByName : '') + '</div>' +
      '</div>' +
      '<button onclick="event.stopPropagation();removeTrack(' + i + ')" style="background:none;border:none;color:#555;cursor:pointer;font-size:14px;padding:0 4px;">🗑</button>' +
      '</div>';
  }).join('');
}

async function addTrack() {
  const soundcloudUrl = document.getElementById('track-url-input').value.trim();
  const title = document.getElementById('track-title-input').value.trim();
  if (!soundcloudUrl || !currentPlaylist) return;
  const updated = await fetch('/api/playlists/' + currentPlaylist._id + '/tracks', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soundcloudUrl: soundcloudUrl, title: title || soundcloudUrl })
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
  if (updated) currentPlaylist = updated;
  document.getElementById('track-url-input').value = '';
  document.getElementById('track-title-input').value = '';
  renderTracks();
  loadPlaylists();
}

async function removeTrack(index) {
  await fetch('/api/playlists/' + currentPlaylist._id + '/tracks/' + index, {
    method: 'DELETE', credentials: 'include'
  }).catch(function() {});
  playlists = await fetch('/api/playlists', { credentials: 'include' }).then(function(r) { return r.json(); }).catch(function() { return playlists; });
  currentPlaylist = playlists.find(function(p) { return p._id === currentPlaylist._id; }) || currentPlaylist;
  renderTracks();
  renderPlaylists();
}

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
  const embedUrl = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
    '&color=%23ff6a00&auto_play=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false';
  document.getElementById('sc-embed-wrap').innerHTML =
    '<iframe src="' + embedUrl + '" height="166" scrolling="no" allow="autoplay"></iframe>';
  renderTracks();
  if (socket && currentRoomId) {
    socket.emit('change_track', { roomId: currentRoomId, trackIndex: index });
  }
}

function togglePlay() {
  if (currentTrackIndex === -1 && currentPlaylist && (currentPlaylist.tracks || []).length > 0) {
    playTrack(0); return;
  }
  isPlaying = !isPlaying;
  document.getElementById('play-btn').textContent = isPlaying ? '⏸' : '▶';
  if (socket && currentRoomId) {
    socket.emit('play_pause', { roomId: currentRoomId, isPlaying: isPlaying, currentTime: 0 });
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

async function startListenRoom() {
  if (!currentPlaylist) return alert('Select a playlist first.');
  const room = await fetch('/api/listen-rooms', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistId: currentPlaylist._id })
  }).then(function(r) { return r.json(); }).catch(function() { return null; });
  if (!room || !room._id) return alert('Could not create room.');
  currentRoomId = room._id;
  try {
    socket = io({ path: '/listen-socket', auth: {
      userId: currentUser ? currentUser._id : '',
      userName: currentUser ? currentUser.name : 'Guest'
    }});
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
  socket.on('user_joined', function(data) { appendRoomChat('🟢 ' + data.userName + ' joined', true); });
  socket.on('sync_state', function(data) {
    if (data.trackIndex !== undefined && data.trackIndex !== currentTrackIndex) playTrack(data.trackIndex);
    if (data.isPlaying !== undefined) {
      isPlaying = data.isPlaying;
      document.getElementById('play-btn').textContent = isPlaying ? '⏸' : '▶';
    }
  });
  socket.on('track_changed', function(data) {
    if (data.trackIndex !== currentTrackIndex) playTrack(data.trackIndex);
  });
  socket.on('room_chat_message', function(data) {
    appendRoomChat('<span class="rc-name">' + data.userName + '</span> ' + data.message);
  });
  socket.on('room_reaction', function(data) { spawnReactionBurst(data.emoji); });
}

function appendRoomChat(html, system) {
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
    socket.emit('room_chat', { roomId: currentRoomId, message: message });
  } else {
    appendRoomChat('<span class="rc-name">' + (currentUser ? currentUser.name : 'You') + '</span> ' + message);
  }
  input.value = '';
}

function sendRoomReaction(emoji) {
  if (socket && currentRoomId) socket.emit('room_react', { roomId: currentRoomId, emoji: emoji });
  spawnReactionBurst(emoji);
}

function spawnReactionBurst(emoji) {
  const el = document.createElement('div');
  el.className = 'reaction-burst';
  el.textContent = emoji;
  el.style.left = (Math.random() * 80 + 10) + 'vw';
  el.style.top = '70vh';
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 950);
}

function copyRoomLink() {
  const url = window.location.origin + '/listen-together?room=' + currentRoomId;
  navigator.clipboard.writeText(url).then(function() { alert('Room link copied!'); }).catch(function() { prompt('Copy this link:', url); });
}

init();