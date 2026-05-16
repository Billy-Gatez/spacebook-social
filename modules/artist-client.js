// /public/modules/artist-client.js

let _msgTargetUserId = null;

async function loadDashboard() {
  const res = await fetch('/api/artist/me', { credentials: 'include' });
  if (!res.ok) {
    document.getElementById('enable-panel').style.display = 'block';
    document.getElementById('artist-dashboard').style.display = 'none';
    return;
  }
  const artist = await res.json();

  if (!artist || !artist.isArtist) {
    document.getElementById('enable-panel').style.display = 'block';
    document.getElementById('artist-dashboard').style.display = 'none';
    return;
  }

  document.getElementById('enable-panel').style.display = 'none';
  document.getElementById('artist-dashboard').style.display = 'block';

  var dashName = document.getElementById('dash-name');
  var dashVerified = document.getElementById('dash-verified');
  var statTracks = document.getElementById('stat-tracks');
  var statShows = document.getElementById('stat-shows');
  var statMsgs = document.getElementById('stat-msgs');
  var editGenre = document.getElementById('edit-genre');
  var editBio = document.getElementById('edit-bio');
  var editSc = document.getElementById('edit-sc');
  var editSp = document.getElementById('edit-sp');
  var editTip = document.getElementById('edit-tip');

  if (dashName) dashName.textContent = artist.genre ? artist.genre + ' Artist' : 'Artist Dashboard';
  if (dashVerified && artist.isVerified) dashVerified.style.display = 'inline-block';
  if (statTracks) statTracks.textContent = (artist.importedTracks || []).length;
  if (statShows) statShows.textContent = (artist.upcomingShows || []).length;
  if (statMsgs) statMsgs.textContent = (artist.fanMessages || []).length;
  if (editGenre) editGenre.value = artist.genre || '';
  if (editBio) editBio.value = artist.bio || '';
  if (editSc) editSc.value = artist.soundcloudProfile || '';
  if (editSp) editSp.value = artist.spotifyProfile || '';
  if (editTip) editTip.value = artist.tipUrl || '';

  renderTracks(artist.importedTracks || []);
  renderShows(artist.upcomingShows || []);
  renderMessages(artist.fanMessages || []);
}

function renderTracks(tracks) {
  var el = document.getElementById('tracks-list');
  if (!el) return;
  if (!tracks.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;">No tracks yet. Import a SoundCloud URL above.</p>';
    return;
  }
  el.innerHTML = tracks.map(function(t, i) {
    return '<div class="track-item">' +
      '<span style="flex:1;font-size:13px;">' + (t.title || t.url || 'Untitled') + '</span>' +
      '<a href="' + (t.url || '#') + '" target="_blank" style="color:#ff6a00;font-size:12px;margin-right:10px;">&#9654; Play</a>' +
      '<button class="del-btn" onclick="deleteTrack(' + i + ')">&#128465;</button>' +
      '</div>';
  }).join('');
}

function renderShows(shows) {
  var el = document.getElementById('shows-list');
  if (!el) return;
  if (!shows.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;">No shows yet.</p>';
    return;
  }
  el.innerHTML = shows.map(function(s, i) {
    return '<div class="show-item">' +
      '<div>' +
      '<div style="font-weight:700;">' + (s.venue || '') + '</div>' +
      '<div style="font-size:12px;color:#888;">' + (s.city || '') + ' &mdash; ' + (s.date ? new Date(s.date).toLocaleDateString() : '') + '</div>' +
      '</div>' +
      '<button class="del-btn" onclick="deleteShow(' + i + ')">&#128465;</button>' +
      '</div>';
  }).join('');
}

function renderMessages(msgs) {
  var el = document.getElementById('fan-msgs-list');
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;">No fan messages yet.</p>';
    return;
  }
  el.innerHTML = msgs.map(function(m) {
    return '<div class="fan-msg-item">' +
      '<div>' +
      '<div style="color:#ff6a00;font-weight:700;font-size:13px;">' + (m.fromName || 'Fan') + '</div>' +
      '<div style="font-size:13px;color:#ccc;margin-top:4px;">' + (m.message || '') + '</div>' +
      '<div style="font-size:11px;color:#666;margin-top:4px;">' + (m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '') + '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

async function enableArtistMode() {
  var body = {
    genre: document.getElementById('en-genre').value,
    bio: document.getElementById('en-bio').value,
    soundcloudProfile: document.getElementById('en-sc').value,
    spotifyProfile: document.getElementById('en-sp').value,
    tipUrl: document.getElementById('en-tip').value
  };
  var res = await fetch('/api/artist/enable', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.ok) {
    loadDashboard();
  } else {
    alert('Could not enable artist mode. Make sure you are logged in.');
  }
}

async function saveSettings() {
  var body = {
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
  loadDashboard();
}

async function importTrack() {
  var urlInput = document.getElementById('import-url');
  var url = urlInput ? urlInput.value.trim() : '';
  if (!url) return alert('Paste a SoundCloud track URL first.');
  var res = await fetch('/api/artist/import-tracks', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [url], platform: 'soundcloud' })
  });
  if (res.ok) {
    if (urlInput) urlInput.value = '';
    loadDashboard();
  } else {
    alert('Could not import track.');
  }
}

async function deleteTrack(index) {
  await fetch('/api/artist/tracks/' + index, { method: 'DELETE', credentials: 'include' });
  loadDashboard();
}

async function addShow() {
  var body = {
    venue: document.getElementById('show-venue').value,
    city: document.getElementById('show-city').value,
    date: document.getElementById('show-date').value,
    ticketUrl: document.getElementById('show-ticket').value
  };
  if (!body.venue || !body.date) return alert('Venue and date are required.');
  await fetch('/api/artist/shows', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  document.getElementById('show-venue').value = '';
  document.getElementById('show-city').value = '';
  document.getElementById('show-date').value = '';
  document.getElementById('show-ticket').value = '';
  loadDashboard();
}

async function deleteShow(index) {
  await fetch('/api/artist/shows/' + index, { method: 'DELETE', credentials: 'include' });
  loadDashboard();
}

// ============================
// ARTIST SEARCH
// ============================
async function searchArtists() {
  var input = document.getElementById('artist-search-input');
  var el = document.getElementById('artist-search-results');
  if (!input || !el) return;
  var q = input.value.trim();
  if (!q) { el.innerHTML = ''; return; }
  el.innerHTML = '<p style="color:#888;font-size:13px;margin-top:10px;">Searching...</p>';
  var results = await fetch('/api/artists/search?q=' + encodeURIComponent(q), { credentials: 'include' })
    .then(function(r) { return r.json(); })
    .catch(function() { return []; });
  if (!results.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;margin-top:10px;">No artists found for "' + q + '".</p>';
    return;
  }
  el.innerHTML = results.map(function(a) {
    return '<div class="artist-result">' +
      '<div class="artist-result-info">' +
      '<div class="ar-name">' + (a.userName || 'Artist') +
      (a.isVerified ? ' <span style="background:linear-gradient(135deg,#ff6a00,#ee0979);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;">VERIFIED</span>' : '') +
      '</div>' +
      '<div class="ar-genre">' + (a.genre || 'No genre listed') + '</div>' +
      '<div class="ar-bio">' + (a.bio ? a.bio.substring(0, 100) + (a.bio.length > 100 ? '...' : '') : '') + '</div>' +
      '</div>' +
      '<div class="artist-result-btns">' +
      '<button class="btn-sm btn-sm-ghost" onclick="openMsgModal(\'' + a.userId + '\')">&#9993; Message</button>' +
      '<a href="/profile/' + a.userId + '" class="btn-sm btn-sm-orange" style="text-decoration:none;display:inline-block;">View Profile</a>' +
      '</div>' +
      '</div>';
  }).join('');
}

function openMsgModal(userId) {
  _msgTargetUserId = userId;
  var text = document.getElementById('msg-modal-text');
  var modal = document.getElementById('msg-modal');
  if (text) text.value = '';
  if (modal) modal.classList.add('open');
}

function closeMsgModal() {
  _msgTargetUserId = null;
  var modal = document.getElementById('msg-modal');
  if (modal) modal.classList.remove('open');
}

async function submitFanMessage() {
  var textEl = document.getElementById('msg-modal-text');
  var message = textEl ? textEl.value.trim() : '';
  if (!message || !_msgTargetUserId) return;
  var res = await fetch('/api/artist/' + _msgTargetUserId + '/fan-message', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message })
  });
  closeMsgModal();
  if (res.ok) {
    alert('Message sent!');
  } else {
    alert('Could not send message.');
  }
}

// ============================
// BOOT
// ============================
loadDashboard();