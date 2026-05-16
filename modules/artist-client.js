async function loadDashboard() {
  const res = await fetch('/api/artist/me', { credentials: 'include' });
  const artist = await res.json();

  // Not an artist yet
  if (!artist || !artist.isArtist) {
    document.getElementById('enable-panel').style.display = 'block';
    document.getElementById('artist-dashboard').style.display = 'none';
    return;
  }

  // Show dashboard
  document.getElementById('enable-panel').style.display = 'none';
  document.getElementById('artist-dashboard').style.display = 'block';

  // Header
  document.getElementById('dash-name').textContent = artist.bio?.split(" ")[0] || "Artist Dashboard";
  document.getElementById('dash-genre').textContent = artist.genre || "";

  // Verified badge
  document.getElementById('dash-verified').style.display = artist.isVerified ? "inline-block" : "none";

  // Stats
  document.getElementById('stat-tracks').textContent = (artist.importedTracks || []).length;
  document.getElementById('stat-shows').textContent = (artist.upcomingShows || []).length;
  document.getElementById('stat-msgs').textContent = (artist.fanMessages || []).length;

  // Settings fields
  document.getElementById('edit-genre').value = artist.genre || '';
  document.getElementById('edit-bio').value = artist.bio || '';
  document.getElementById('edit-sc').value = artist.soundcloudProfile || '';
  document.getElementById('edit-sp').value = artist.spotifyProfile || '';
  document.getElementById('edit-tip').value = artist.tipUrl || '';

  // Tip link
  if (artist.tipUrl) {
    const link = document.getElementById('tip-link-display');
    link.href = artist.tipUrl;
    link.style.display = "inline-block";
  } else {
    document.getElementById('tip-link-display').style.display = "none";
  }

  // Render lists
  renderTracks(artist.importedTracks || []);
  renderShows(artist.upcomingShows || []);
  renderMessages(artist.fanMessages || []);
}

// =========================
// RENDER FUNCTIONS
// =========================

function renderTracks(tracks) {
  tracks = tracks || [];
  const el = document.getElementById('tracks-list');
  el.innerHTML = tracks.length ? tracks.map((t, i) => `
    <div class="track-item">
      <span class="t-title">${t.title}</span>
      <span class="t-platform">${t.platform || ''}</span>
      <a href="${t.url}" target="_blank" style="color:#ff6a00;font-size:12px;">▶ Play</a>
      <button class="del-btn" onclick="deleteTrack(${i})">🗑</button>
    </div>`).join('') : '<p style="color:#666;font-size:13px;">No tracks yet.</p>';
}

function renderShows(shows) {
  shows = shows || [];
  const el = document.getElementById('shows-list');
  el.innerHTML = shows.length ? shows.map((s, i) => `
    <div class="show-item">
      <div class="show-info">
        <div class="venue">${s.venue}</div>
        <div class="city">${s.city}</div>
        <div class="date">${new Date(s.date).toLocaleDateString()}</div>
      </div>
      <button class="del-btn" onclick="deleteShow(${i})">🗑</button>
    </div>`).join('') : '<p style="color:#666;font-size:13px;">No shows yet.</p>';
}

function renderMessages(msgs) {
  msgs = msgs || [];
  const el = document.getElementById('fan-msgs-list');
  el.innerHTML = msgs.length ? msgs.map(m => `
    <div class="fan-msg-item">
      <div class="fm-from">${m.fromName}</div>
      <div class="fm-text">${m.message}</div>
      <div class="fm-time">${new Date(m.createdAt).toLocaleDateString()}</div>
    </div>`).join('') : '<p style="color:#666;font-size:13px;">No messages yet.</p>';
}

async function loadDashboard() {
  const res = await fetch('/api/artist/me', { credentials: 'include' });
  const artist = await res.json();

  if (!artist || !artist.isArtist) {
    document.getElementById('enable-panel').style.display = 'block';
    document.getElementById('artist-dashboard').style.display = 'none';
    return;
  }

  document.getElementById('enable-panel').style.display = 'none';
  document.getElementById('artist-dashboard').style.display = 'block';

  document.getElementById('dash-name').textContent = artist.bio?.split(" ")[0] || "Artist Dashboard";
  document.getElementById('dash-genre').textContent = artist.genre || "";
  document.getElementById('dash-verified').style.display = artist.isVerified ? "inline-block" : "none";

  document.getElementById('stat-tracks').textContent = (artist.importedTracks || []).length;
  document.getElementById('stat-shows').textContent = (artist.upcomingShows || []).length;
  document.getElementById('stat-msgs').textContent = (artist.fanMessages || []).length;

  document.getElementById('edit-genre').value = artist.genre || '';
  document.getElementById('edit-bio').value = artist.bio || '';
  document.getElementById('edit-sc').value = artist.soundcloudProfile || '';
  document.getElementById('edit-sp').value = artist.spotifyProfile || '';
  document.getElementById('edit-tip').value = artist.tipUrl || '';

  if (artist.tipUrl) {
    const link = document.getElementById('tip-link-display');
    link.href = artist.tipUrl;
    link.style.display = "inline-block";
  } else {
    document.getElementById('tip-link-display').style.display = "none";
  }

  renderTracks(artist.importedTracks || []);
  renderShows(artist.upcomingShows || []);
  renderMessages(artist.fanMessages || []);
}

function renderTracks(tracks) {
  const el = document.getElementById('tracks-list');
  el.innerHTML = tracks.length
    ? tracks.map((t, i) => `
        <div class="track-item">
          <a href="${t.url}" target="_blank">${t.title}</a>
          <button onclick="deleteTrack(${i})">Remove</button>
        </div>`).join('')
    : '<p>No tracks yet.</p>';
}

function renderShows(shows) {
  const el = document.getElementById('shows-list');
  el.innerHTML = shows.length
    ? shows.map((s, i) => `
        <div class="show-item">
          <strong>${s.venue}</strong> — ${s.city} on ${new Date(s.date).toLocaleDateString()}
          ${s.ticketUrl ? `<a href="${s.ticketUrl}" target="_blank">Tickets</a>` : ''}
          <button onclick="deleteShow(${i})">Remove</button>
        </div>`).join('')
    : '<p>No shows yet.</p>';
}

function renderMessages(msgs) {
  const el = document.getElementById('fan-msgs-list');
  el.innerHTML = msgs.length
    ? msgs.map(m => `
        <div class="msg-item">
          <strong>${m.fromName}</strong>: ${m.message}
        </div>`).join('')
    : '<p>No messages yet.</p>';
}

// ✅ FIXED: added await before loadDashboard()
async function enableArtistMode() {
  const body = {
    genre: document.getElementById('en-genre').value,
    bio: document.getElementById('en-bio').value,
    soundcloudProfile: document.getElementById('en-sc').value,
    spotifyProfile: document.getElementById('en-sp').value,
    tipUrl: document.getElementById('en-tip').value
  };
  await fetch('/api/artist/enable', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  await loadDashboard(); // ✅ was missing await
}

async function saveSettings() {
  const body = {
    genre: document.getElementById('edit-genre').value,
    bio: document.getElementById('edit-bio').value,
    soundcloudProfile: document.getElementById('edit-sc').value,
    spotifyProfile: document.getElementById('edit-sp').value,
    tipUrl: document.getElementById('edit-tip').value
  };
  await fetch('/api/artist', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  await loadDashboard();
}

async function importTrack() {
  const url = document.getElementById('import-url').value.trim();
  if (!url) return;
  await fetch('/api/artist/import-tracks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [url], platform: 'soundcloud' })
  });
  document.getElementById('import-url').value = '';
  await loadDashboard();
}

async function deleteTrack(index) {
  await fetch('/api/artist/tracks/' + index, { method: 'DELETE', credentials: 'include' });
  await loadDashboard();
}

async function addShow() {
  const body = {
    venue: document.getElementById('show-venue').value,
    city: document.getElementById('show-city').value,
    date: document.getElementById('show-date').value,
    ticketUrl: document.getElementById('show-ticket').value
  };
  await fetch('/api/artist/shows', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  await loadDashboard();
}

async function deleteShow(index) {
  await fetch('/api/artist/shows/' + index, { method: 'DELETE', credentials: 'include' });
  await loadDashboard();
}

// ✅ NEW: Search artists by name
async function searchArtists(query) {
  const resultsEl = document.getElementById('artist-search-results');
  if (!query.trim()) {
    resultsEl.innerHTML = '';
    return;
  }
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
  const users = await res.json();
  if (!users.length) {
    resultsEl.innerHTML = '<p>No users found.</p>';
    return;
  }
  resultsEl.innerHTML = users.map(u =>
    `<div><a href="/profile/${u._id}">${u.name}</a></div>`
  ).join('');
}

loadDashboard();