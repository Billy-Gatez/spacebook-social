let albums = [];
let currentAlbumId = null;

async function loadAlbums() {
  albums = await fetch('/api/albums', { credentials: 'include' }).then(r => r.json());
  renderAlbumGrid();
}

function renderAlbumGrid() {
  const grid = document.getElementById('album-grid');
  if (!albums.length) {
    grid.innerHTML = '<div style="color:#888;grid-column:1/-1;padding:40px;text-align:center">No albums yet. Create one!</div>';
    return;
  }
  grid.innerHTML = albums.map(a => `
    <div class="album-card" onclick="openAlbum('${a._id}')">
      <img class="album-cover"
        src="${a.coverUrl || '/default-avatar.png'}"
        alt="${a.name}"
        onerror="this.src='/default-avatar.png'"
      />
      <div class="album-info">
        <div class="album-name">${a.name}</div>
        <div class="album-count">${a.photos.length} photo${a.photos.length !== 1 ? 's' : ''}</div>
      </div>
    </div>`).join('');
}

function openAlbum(albumId) {
  currentAlbumId = albumId;
  const album = albums.find(a => a._id === albumId);
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
  grid.innerHTML = album.photos.map((p, i) => `
    <div class="photo-thumb">
      <img src="${p.url}" alt="" onclick="openMediaOverlay('${p.url}')" onerror="this.src='/default-avatar.png'"/>
      <button class="photo-del" onclick="deletePhoto(${i}, event)" title="Delete">✕</button>
    </div>`).join('');
}

async function createAlbum() {
  const name = prompt('Album name:');
  if (!name) return;
  const album = await fetch('/api/albums', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  }).then(r => r.json());
  albums.push(album);
  renderAlbumGrid();
  openAlbum(album._id);
}

async function deleteCurrentAlbum() {
  if (!currentAlbumId) return;
  if (!confirm('Delete this album and all its photos?')) return;
  await fetch(`/api/albums/${currentAlbumId}`, { method: 'DELETE', credentials: 'include' });
  albums = albums.filter(a => a._id !== currentAlbumId);
  backToAlbums();
  renderAlbumGrid();
}

async function deletePhoto(index, e) {
  e.stopPropagation();
  if (!currentAlbumId) return;
  if (!confirm('Delete this photo?')) return;
  await fetch(`/api/albums/${currentAlbumId}/photos/${index}`, {
    method: 'DELETE', credentials: 'include'
  });
  const album = albums.find(a => a._id === currentAlbumId);
  if (album) {
    album.photos.splice(index, 1);
    renderPhotoGrid(album);
  }
}

async function handlePhotoUpload(event) {
  if (!currentAlbumId) return;
  const files = event.target.files;
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('photos', f);
  const album = await fetch(`/api/albums/${currentAlbumId}/photos`, {
    method: 'POST', credentials: 'include', body: fd
  }).then(r => r.json());
  const idx = albums.findIndex(a => a._id === currentAlbumId);
  if (idx !== -1) albums[idx] = album;
  renderPhotoGrid(album);
  event.target.value = '';
}

function setupDropZone() {
  const zone = document.getElementById('drop-zone');
  if (!zone) return;

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (!currentAlbumId) return;
    const files = e.dataTransfer.files;
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) fd.append('photos', f);
    const album = await fetch(`/api/albums/${currentAlbumId}/photos`, {
      method: 'POST', credentials: 'include', body: fd
    }).then(r => r.json());
    const idx = albums.findIndex(a => a._id === currentAlbumId);
    if (idx !== -1) albums[idx] = album;
    renderPhotoGrid(album);
  });
}

function openMediaOverlay(url) {
  const overlay = document.getElementById('media-overlay');
  const content = document.getElementById('media-overlay-content');
  const isVideo = url.match(/\.(mp4|webm|ogg)(\?|$)/i);
  if (isVideo) {
    content.innerHTML = `<video src="${url}" controls autoplay style="max-width:90vw;max-height:84vh;border-radius:8px"></video>`;
  } else {
    content.innerHTML = `<img src="${url}" style="max-width:90vw;max-height:84vh;border-radius:8px" />`;
  }
  overlay.classList.add('open');
}

function closeMediaOverlay() {
  const overlay = document.getElementById('media-overlay');
  overlay.classList.remove('open');
  document.getElementById('media-overlay-content').innerHTML = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMediaOverlay();
});

loadAlbums();
