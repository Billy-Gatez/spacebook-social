let currentUser = null;
let playlists = [];
let currentPlaylistId = null;
let currentTrackIndex = 0;
let isPlaying = false;
let currentRoomId = null;
let roomSocket = null;

async function init() {
  currentUser = await fetch('/api/session-user', { credentials: 'include' }).then(r => r.json());
  await loadPlaylists();

  const params = new URLSearchParams(location.search);
  const roomId = params.get('room');
  if (roomId) joinRoom(roomId);
}

async function loadPlaylists() {
  playlists = await fetch('/api/playlists', { credentials: 'include' }).then(r => r.json()).catch(() => []);
  renderPlaylists();
}

function renderPlaylists() {
  const el = document.getElementById('pl-list');
  if (!playlists.length) {
    el.innerHTML = '<div style="color:#888;font-size:13px;padding:8px 0">No playlists yet.</div>';
    return;
  }
  el.innerHTML = playlists.map(pl => `
    <div class="pl-item ${pl._id === currentPlaylistId ? 'active' : ''}" onclick="selectPlaylist('${pl._id}')" id="plitem-${pl._id}">
      <div style="font-size:22px">🎵</div>
      <div>
        <div class="pl-name">${pl.name}</div>
        <div class="pl-meta">${pl.tracks.length} track${pl.tracks.length !== 1 ? 's' : ''}${pl.isCollaborative ? ' · Collab' : ''}</div>
      </div>
    </div>`).join('');
}

function selectPlaylist(id) {
  currentPlaylistId = id;
  currentTrackIndex = 0;
  document.querySelectorAll('.pl-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById(`plitem-${id}`);
  if (item) item.classList.add('active');

  const pl = playlists.find(p => p._id === id);
  if (!pl) return;

  document.getElementById('player-area').style.display = 'block';
  document.getElementById('no-pl-msg').style.display = 'none';
  document.getElementById('pl-title').textContent = pl.name;

  renderTrackList(pl);
  if (pl.tracks.length) loadTrack(0);
}

function renderTrackList(pl) {
  const el = document.getElementById('track-list');
  if (!pl.tracks.length) {
    el.innerHTML = '<div style="color:#888;font-size:13px;padding:8px 0">No tracks yet. Add one above.</div>';
    return;
  }
  el.innerHTML = pl.tracks.map((t, i) => `
    <div class="track-item ${i === currentTrackIndex ? 'playing' : ''}" id="track-${i}" onclick="loadTrack(${i})">
      <div class="track-num">${i === currentTrackIndex ? '▶' : i + 1}</div>
      <div>
        <div class="track-title">${t.title || t.soundcloudUrl}</div>
        <div class="track-by">Added by ${t.addedByName || 'unknown'}</div>
      </div>
      <button onclick="removeTrack(${i},event)" style="background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:0 4px" title="Remove">✕</button>
    </div>`).join('');
}

function loadTrack(index) {
  const pl = playlists.find(p => p._id === currentPlaylistId);
  if (!pl || !pl.tracks[index]) return;
  currentTrackIndex = index;

  const track = pl.tracks[index];
  document.getElementById('now-playing-title').textContent = track.title || track.soundcloudUrl;

  const embedWrap = document.getElementById('sc-embed-wrap');
  const scUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(track.soundcloudUrl)}&color=%23ff6a00&auto_play=true&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`;
  embedWrap.innerHTML = `<iframe id="sc-iframe" width="100%" height="166" scrolling="no" frameborder="no" src="${scUrl}"></iframe>`;

  isPlaying = true;
  updatePlayBtn();
  renderTrackList(pl);

  if (currentRoomId && roomSocket) {
    roomSocket.emit('change_track', { roomId: currentRoomId, trackIndex: index });
  }
}

function togglePlay() {
  isPlaying = !isPlaying;
  updatePlayBtn();
  if (currentRoomId && roomSocket) {
    roomSocket.emit('play_pause', { roomId: currentRoomId, isPlaying, currentTime: 0 });
  }
}

function updatePlayBtn() {
  const btn = document.getElementById('play-btn');
  if (btn) btn.textContent = isPlaying ? '⏸' : '▶';
}

function prevTrack() {
  if (currentTrackIndex > 0) loadTrack(currentTrackIndex - 1);
}

function nextTrack() {
  const pl = playlists.find(p => p._id === currentPlaylistId);
  if (pl && currentTrackIndex < pl.tracks.length - 1) loadTrack(currentTrackIndex + 1);
}

async function createPlaylist() {
  const name = document.getElementById('new-pl-name').value.trim();
  if (!name) return alert('Enter a playlist name.');
  const isCollab = document.getElementById('new-pl-collab').checked;
  const pl = await fetch('/api/playlists', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, isCollaborative: isCollab })
  }).then(r => r.json());
  playlists.push(pl);
  document.getElementById('new-pl-name').value = '';
  document.getElementById('new-pl-collab').checked = false;
  renderPlaylists();
  selectPlaylist(pl._id);
}

async function addTrack() {
  if (!currentPlaylistId) return alert('Select a playlist first.');
  const url = document.getElementById('track-url-input').value.trim();
  const title = document.getElementById('track-title-input').value.trim();
  if (!url) return alert('Enter a SoundCloud URL.');
  const pl = await fetch(`/api/playlists/${currentPlaylistId}/tracks`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soundcloudUrl: url, title: title || url })
  }).then(r => r.json());
  const idx = playlists.findIndex(p => p._id === currentPlaylistId);
  if (idx !== -1) playlists[idx] = pl;
  document.getElementById('track-url-input').value = '';
  document.getElementById('track-title-input').value = '';
  renderTrackList(pl);
}

async function removeTrack(index, e) {
  e.stopPropagation();
  if (!currentPlaylistId) return;
  if (!confirm('Remove this track?')) return;
  await fetch(`/api/playlists/${currentPlaylistId}/tracks/${index}`, {
    method: 'DELETE', credentials: 'include'
  });
  const pl = playlists.find(p => p._id === currentPlaylistId);
  if (pl) {
    pl.tracks.splice(index, 1);
    renderTrackList(pl);
    if (index === currentTrackIndex && pl.tracks.length) loadTrack(0);
  }
}

async function startListenRoom() {
  if (!currentPlaylistId) return alert('Select a playlist first.');
  const room = await fetch('/api/listen-rooms', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistId: currentPlaylistId })
  }).then(r => r.json());
  currentRoomId = room._id;
  connectRoomSocket(room._id);
  showRoomPanel(room._id);
}

function connectRoomSocket(roomId) {
  roomSocket = io({ path: '/listen-socket', auth: { userId: currentUser._id, userName: currentUser.name } });

  roomSocket.emit('join_room', { roomId });

  roomSocket.on('sync_state', ({ currentTrackIndex: ti, isPlaying: ip }) => {
    if (ti !== undefined && ti !== currentTrackIndex) loadTrack(ti);
    isPlaying = ip !== undefined ? ip : isPlaying;
    updatePlayBtn();
  });

  roomSocket.on('track_changed', ({ trackIndex }) => {
    if (trackIndex !== currentTrackIndex) loadTrack(trackIndex);
  });

  roomSocket.on('user_joined', ({ userName }) => {
    appendRoomChat({ userName, message: `${userName} joined 🎧`, system: true });
    loadParticipants();
  });

  roomSocket.on('room_chat_message', (entry) => {
    appendRoomChat(entry);
  });

  roomSocket.on('room_reaction', ({ userName, emoji }) => {
    showReactionBurst(emoji);
  });
}

function showRoomPanel(roomId) {
  document.getElementById('room-panel').style.display = 'block';
  document.getElementById('room-id-display').textContent = roomId.slice(-6).toUpperCase();
  loadParticipants();
}

async function loadParticipants() {
  if (!currentRoomId) return;
  const room = await fetch(`/api/listen-rooms/${currentRoomId}`, { credentials: 'include' }).then(r => r.json()).catch(() => null);
  if (!room) return;
  const row = document.getElementById('participants-row');
  row.innerHTML = (room.participants || []).map(p =>
    `<img class="part-avatar" src="/default-avatar.png" title="${p}" />`).join('');
}

function appendRoomChat(entry) {
  const chat = document.getElementById('room-chat');
  const div = document.createElement('div');
  div.className = 'room-chat-msg';
  if (entry.system) {
    div.innerHTML = `<span style="color:#666;font-style:italic;font-size:12px">${entry.message}</span>`;
  } else {
    div.innerHTML = `<span class="rc-name">${entry.userName}:</span>${entry.message}`;
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function sendRoomChat() {
  if (!currentRoomId || !roomSocket) return;
  const input = document.getElementById('room-chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  roomSocket.emit('room_chat', { roomId: currentRoomId, message: msg });
  input.value = '';
}

function sendRoomReaction(emoji) {
  if (!currentRoomId || !roomSocket) return;
  roomSocket.emit('room_react', { roomId: currentRoomId, emoji });
  showReactionBurst(emoji);
}

function showReactionBurst(emoji) {
  const el = document.createElement('div');
  el.textContent = emoji;
  el.style.cssText = `position:fixed;left:${30+Math.random()*40}%;bottom:30%;font-size:32px;pointer-events:none;z-index:9999;animation:burst .9s ease-out forwards`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function copyRoomLink() {
  if (!currentRoomId) return;
  const url = `${location.origin}/listen-together?room=${currentRoomId}`;
  navigator.clipboard.writeText(url).then(() => alert('Room link copied!'));
}

async function joinRoom(roomId) {
  currentRoomId = roomId;
  const room = await fetch(`/api/listen-rooms/${roomId}`, { credentials: 'include' }).then(r => r.json()).catch(() => null);
  if (!room || !room.playlistId) return;
  const pl = room.playlistId;
  if (!playlists.find(p => p._id === pl._id)) playlists.push(pl);
  selectPlaylist(pl._id);
  connectRoomSocket(roomId);
  showRoomPanel(roomId);
}

if (!document.querySelector('style[data-burst]')) {
  const s = document.createElement('style');
  s.dataset.burst = '1';
  s.textContent = `@keyframes burst{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-120px) scale(1.6)}}`;
  document.head.appendChild(s);
}

init();
