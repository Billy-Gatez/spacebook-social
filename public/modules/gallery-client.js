let albums = [];
let currentAlbumId = null;
let overlayAlbumId = null;
let overlayPhotoIndex = null;

async function loadAlbums() {
  albums = await fetch('/api/albums', { credentials: 'include' }).then(r => r.json()).catch(() => []);
  renderAlbumGrid();
}

function renderAlbumGrid() {
  const grid = document.getElementById('album-grid');
  if (!albums.length) {
    grid.innerHTML = '<div style="color:#888;grid-column:1/-1;padding:60px;text-align:center;font-size:15px">🌌 No albums yet. Create one!</div>';
    return;
  }
  grid.innerHTML = albums.map(function(a) {
    return '<div class="album-card" onclick="openAlbum(\'' + a._id + '\')">' +
      '<img class="album-cover" src="' + (a.coverUrl || '/assets/img/default-avatar.png') + '" alt="' + a.name + '" onerror="this.src=\'/assets/img/default-avatar.png\'"/>' +
      '<div class="album-info">' +
        '<div class="album-name">' + a.name + '</div>' +
        '<div class="album-count">' + a.photos.length + ' photo' + (a.photos.length !== 1 ? 's' : '') + '</div>' +
      '</div></div>';
  }).join('');
}

function openAlbum(albumId) {
  currentAlbumId = albumId;
  const album = albums.find(function(a) { return a._id === albumId; });
  if (!album) return;
  document.getElementById('album-grid-view').style.display = 'none';
  document.getElementById('album-detail-view').style.display = 'block';
  document.getElementById('album-detail-name').textContent = album.name;
  renderPhotoGrid(album);
  setupDropZone();
}

function backToAlbums() {
  currentAlbumId = null;
  document.getElementById('album-detail-view').style.display = 'none';
  document.getElementById('album-grid-view').style.display = 'block';
}

function renderPhotoGrid(album) {
  const grid = document.getElementById('photo-grid');
  if (!album.photos.length) {
    grid.innerHTML = '<div style="color:#888;font-size:13px;padding:20px">No photos yet. Upload some!</div>';
    return;
  }
  grid.innerHTML = album.photos.map(function(p, i) {
    return '<div class="photo-thumb">' +
      '<img src="' + p.url + '" alt="" onclick="openMediaOverlay(\'' + album._id + '\',' + i + ',\'' + p.url + '\')" onerror="this.src=\'/assets/img/default-avatar.png\'"/>' +
      '<button class="photo-del" onclick="deletePhoto(' + i + ',event)" title="Delete">✕</button>' +
    '</div>';
  }).join('');
}

async function createAlbum() {
  const name = prompt('Album name:');
  if (!name) return;
  const album = await fetch('/api/albums', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name })
  }).then(r => r.json());
  albums.push(album);
  renderAlbumGrid();
  openAlbum(album._id);
}

async function deleteCurrentAlbum() {
  if (!currentAlbumId) return;
  if (!confirm('Delete this album and all its photos?')) return;
  await fetch('/api/albums/' + currentAlbumId, { method: 'DELETE', credentials: 'include' });
  albums = albums.filter(function(a) { return a._id !== currentAlbumId; });
  backToAlbums();
  renderAlbumGrid();
}

async function deletePhoto(index, e) {
  e.stopPropagation();
  if (!currentAlbumId) return;
  if (!confirm('Delete this photo?')) return;
  await fetch('/api/albums/' + currentAlbumId + '/photos/' + index, { method: 'DELETE', credentials: 'include' });
  const album = albums.find(function(a) { return a._id === currentAlbumId; });
  if (album) { album.photos.splice(index, 1); renderPhotoGrid(album); }
}

async function handlePhotoUpload(event) {
  if (!currentAlbumId) return;
  const files = event.target.files;
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('photos', f);
  const album = await fetch('/api/albums/' + currentAlbumId + '/photos', {
    method: 'POST', credentials: 'include', body: fd
  }).then(r => r.json());
  const idx = albums.findIndex(function(a) { return a._id === currentAlbumId; });
  if (idx !== -1) albums[idx] = album;
  renderPhotoGrid(album);
  event.target.value = '';
}

function setupDropZone() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', async function(e) {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (!currentAlbumId) return;
    const files = e.dataTransfer.files;
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('photos', f);
    const album = await fetch('/api/albums/' + currentAlbumId + '/photos', {
      method: 'POST', credentials: 'include', body: fd
    }).then(r => r.json());
    const idx = albums.findIndex(function(a) { return a._id === currentAlbumId; });
    if (idx !== -1) albums[idx] = album;
    renderPhotoGrid(album);
  });
}

async function openMediaOverlay(albumId, photoIndex, url) {
  overlayAlbumId = albumId;
  overlayPhotoIndex = photoIndex;

  const overlay = document.getElementById('media-overlay');
  const content = document.getElementById('media-overlay-content');
  const isVideo = url.match(/\.(mp4|webm|ogg)(\?|$)/i);

  if (isVideo) {
    content.innerHTML = '<video src="' + url + '" controls autoplay style="max-width:100%;max-height:65vh;border-radius:10px"></video>';
  } else {
    content.innerHTML = '<img src="' + url + '" style="max-width:100%;max-height:65vh;border-radius:10px" onerror="this.src=\'/assets/img/default-avatar.png\'"/>';
  }

  overlay.classList.add('open');
  await loadReactions();
  await loadComments();
}

function closeMediaOverlay() {
  document.getElementById('media-overlay').classList.remove('open');
  document.getElementById('media-overlay-content').innerHTML = '';
  document.getElementById('comment-list').innerHTML = '';
  overlayAlbumId = null;
  overlayPhotoIndex = null;
}

// ====== REACTIONS ======
async function loadReactions() {
  if (overlayAlbumId === null || overlayPhotoIndex === null) return;
  const data = await fetch('/api/albums/' + overlayAlbumId + '/photos/' + overlayPhotoIndex + '/reactions', { credentials: 'include' }).then(r => r.json()).catch(() => ({ counts: {}, myReaction: null }));
  const emojis = ['❤️','🔥','😂','🤝','🚀'];
  emojis.forEach(function(e) {
    const countEl = document.getElementById('rc-' + e);
    if (countEl) countEl.textContent = data.counts[e] || 0;
    const btn = countEl ? countEl.closest('.react-btn') : null;
    if (btn) btn.classList.toggle('mine', data.myReaction === e);
  });
}

async function reactPhoto(emoji) {
  if (overlayAlbumId === null || overlayPhotoIndex === null) return;
  await fetch('/api/albums/' + overlayAlbumId + '/photos/' + overlayPhotoIndex + '/react', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji: emoji })
  });
  await loadReactions();
}

// ====== COMMENTS ======
async function loadComments() {
  if (overlayAlbumId === null || overlayPhotoIndex === null) return;
  const comments = await fetch('/api/albums/' + overlayAlbumId + '/photos/' + overlayPhotoIndex + '/comments', { credentials: 'include' }).then(r => r.json()).catch(() => []);
  const list = document.getElementById('comment-list');
  if (!comments.length) {
    list.innerHTML = '<div style="color:#666;font-size:13px;padding:8px">No comments yet. Be the first!</div>';
    return;
  }
  list.innerHTML = comments.map(function(c) {
    return '<div class="comment-item">' +
      '<img class="comment-avatar" src="' + (c.userPic || '/assets/img/default-avatar.png') + '" onerror="this.src=\'/assets/img/default-avatar.png\'"/>' +
      '<div class="comment-body">' +
        '<div class="comment-name">' + c.userName + '</div>' +
        '<div class="comment-text">' + c.text + '</div>' +
        '<div class="comment-time">' + timeAgo(c.createdAt) + '</div>' +
      '</div>' +
      '<button class="comment-del" onclick="deleteComment(\'' + c._id + '\',this)" title="Delete">✕</button>' +
    '</div>';
  }).join('');
  list.scrollTop = list.scrollHeight;
}

async function submitComment() {
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text || overlayAlbumId === null || overlayPhotoIndex === null) return;
  await fetch('/api/albums/' + overlayAlbumId + '/photos/' + overlayPhotoIndex + '/comments', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text })
  });
  input.value = '';
  await loadComments();
}

async function deleteComment(commentId, btn) {
  const item = btn.closest('.comment-item');
  await fetch('/api/comments/' + commentId, { method: 'DELETE', credentials: 'include' });
  if (item) item.remove();
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeMediaOverlay(); });

loadAlbums();
