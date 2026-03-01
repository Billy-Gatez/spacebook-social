let artistData = null;

async function loadArtistDashboard() {
  const user = await fetch('/api/session-user', { credentials: 'include' }).then(r => r.json());
  document.getElementById('dash-name').textContent = user.name;

  artistData = await fetch(`/api/artist/${user._id}`, { credentials: 'include' })
    .then(r => r.json()).catch(() => null);

  if (!artistData || !artistData.isArtist) {
    document.getElementById('enable-panel').style.display = 'block';
    document.getElementById('artist-dashboard').style.display = 'none';
    return;
  }

  document.getElementById('enable-panel').style.display = 'none';
  document.getElementById('artist-dashboard').style.display = 'block';

  document.getElementById('dash-genre').textContent = artistData.genre || '';
  if (artistData.isVerified) {
    document.getElementById('dash-verified').style.display = 'inline-block';
  }

  document.getElementById('stat-tracks').textContent = (artistData.importedTracks || []).length;
  document.getElementById('stat-shows').textContent  = (artistData.upcomingShows || []).length;
  document.getElementById('stat-msgs').textContent   = (artistData.fanMessages || []).length;

  renderTracks();
  renderShows();
  renderFanMessages();
  populateSettings();
}

function renderTracks() {
  const el = document.getElementById('tracks-list');
  if (!artistData.importedTracks || !artistData.importedTracks.length) {
    el.innerHTML = '<div style="color:#888;font-size:13px">No tracks yet. Import one below.</div>';
    return;
  }
  el.innerHTML = artistData.importedTracks.map((t, i) => `
    <div class="track-item">
      <div class="t-title" title="${t.url}">
        <a href="${t.url}" target="_blank" style="color:#f2f2f2">${t.title || t.url}</a>
      </div>
      <div class="t-platform">${t.platform || 'soundcloud'}</div>
      <button class="del-btn" onclick="deleteTrack(${i})" title="Remove">✕</button>
    </div>`).join('');
}

function renderShows() {
  const el = document.getElementById('shows-list');
  if (!artistData.upcomingShows || !artistData.upcomingShows.length) {
    el.innerHTML = '<div style="color:#888;font-size:13px">No shows yet.</div>';
    return;
  }
  el.innerHTML = artistData.upcomingShows.map((s, i) => `
    <div class="show-item">
      <div class="show-info">
        <div class="venue">${s.venue}</div>
        <div class="city">${s.city || ''}</div>
        <div class="date">${s.date ? new Date(s.date).toLocaleDateString() : ''}</div>
        ${s.ticketUrl
          ? `<a href="${s.ticketUrl}" target="_blank"
              style="font-size:12px;color:#ff6a00;margin-top:2px;display:block">🎟 Get Tickets</a>`
          : ''}
      </div>
      <button class="del-btn" onclick="deleteShow(${i})" title="Remove">✕</button>
    </div>`).join('');
}

function renderFanMessages() {
  const el = document.getElementById('fan-msgs-list');
  if (!artistData.fanMessages || !artistData.fanMessages.length) {
    el.innerHTML = '<div style="color:#888;font-size:13px">No fan messages yet.</div>';
    return;
  }
  el.innerHTML = [...artistData.fanMessages].reverse().slice(0, 20).map(m => `
    <div class="fan-msg-item">
      <div class="fm-from">${m.fromName}</div>
      <div class="fm-text">${m.message}</div>
      <div class="fm-time">${timeAgoArtist(m.createdAt)}</div>
    </div>`).join('');
}

function populateSettings() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('edit-genre', artistData.genre);
  set('edit-bio',   artistData.bio);
  set('edit-sc',    artistData.soundcloudProfile);
  set('edit-sp',    artistData.spotifyProfile);
  set('edit-tip',   artistData.tipUrl);

  const tipLink = document.getElementById('tip-link-display');
  if (tipLink && artistData.tipUrl) {
    tipLink.href = artistData.tipUrl;
    tipLink.style.display = 'inline-block';
  } else if (tipLink) {
    tipLink.style.display = 'none';
  }
}

async function enableArtistMode() {
  const genre = document.getElementById('en-genre').value.trim();
  const bio   = document.getElementById('en-bio').value.trim();
  const sc    = document.getElementById('en-sc').value.trim();
  const sp    = document.getElementById('en-sp').value.trim();
  const tip   = document.getElementById('en-tip').value.trim();

  if (!genre) return alert('Please enter your genre.');

  artistData = await fetch('/api/artist/enable', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ genre, bio, soundcloudProfile: sc, spotifyProfile: sp, tipUrl: tip })
  }).then(r => r.json());

  document.getElementById('enable-panel').style.display = 'none';
  document.getElementById('artist-dashboard').style.display = 'block';
  document.getElementById('dash-genre').textContent = genre;
  document.getElementById('stat-tracks').textContent = '0';
  document.getElementById('stat-shows').textContent  = '0';
  document.getElementById('stat-msgs').textContent   = '0';
  renderTracks();
  renderShows();
  renderFanMessages();
  populateSettings();
}

async function saveSettings() {
  const genre = document.getElementById('edit-genre').value.trim();
  const bio   = document.getElementById('edit-bio').value.trim();
  const sc    = document.getElementById('edit-sc').value.trim();
  const sp    = document.getElementById('edit-sp').value.trim();
  const tip   = document.getElementById('edit-tip').value.trim();

  await fetch('/api/artist', {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ genre, bio, soundcloudProfile: sc, spotifyProfile: sp, tipUrl: tip })
  });

  artistData.genre = genre;
  artistData.bio   = bio;
  artistData.soundcloudProfile = sc;
  artistData.spotifyProfile    = sp;
  artistData.tipUrl = tip;

  document.getElementById('dash-genre').textContent = genre;

  const tipLink = document.getElementById('tip-link-display');
  if (tipLink && tip) {
    tipLink.href = tip;
    tipLink.style.display = 'inline-block';
  }

  showToast('Settings saved ✓');
}

async function importTrack() {
  const url = document.getElementById('import-url').value.trim();
  if (!url) return alert('Enter a SoundCloud URL.');
  const res = await fetch('/api/artist/import-tracks', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [url], platform: 'soundcloud' })
  }).then(r => r.json());
  document.getElementById('import-url').value = '';
  if (res.tracks && res.tracks.length) {
    artistData.importedTracks.push(...res.tracks);
    document.getElementById('stat-tracks').textContent = artistData.importedTracks.length;
    renderTracks();
    showToast('Track imported ✓');
  }
}

async function deleteTrack(index) {
  if (!confirm('Remove this track?')) return;
  await fetch(`/api/artist/tracks/${index}`, { method: 'DELETE', credentials: 'include' });
  artistData.importedTracks.splice(index, 1);
  document.getElementById('stat-tracks').textContent = artistData.importedTracks.length;
  renderTracks();
}

async function addShow() {
  const venue  = document.getElementById('show-venue').value.trim();
  const city   = document.getElementById('show-city').value.trim();
  const date   = document.getElementById('show-date').value;
  const ticket = document.getElementById('show-ticket').value.trim();
  if (!venue || !date) return alert('Enter venue and date.');

  await fetch('/api/artist/shows', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ venue, city, date, ticketUrl: ticket })
  });

  artistData.upcomingShows.push({ venue, city, date, ticketUrl: ticket });
  document.getElementById('show-venue').value  = '';
  document.getElementById('show-city').value   = '';
  document.getElementById('show-date').value   = '';
  document.getElementById('show-ticket').value = '';
  document.getElementById('stat-shows').textContent = artistData.upcomingShows.length;
  renderShows();
  showToast('Show added ✓');
}

async function deleteShow(index) {
  if (!confirm('Remove this show?')) return;
  await fetch(`/api/artist/shows/${index}`, { method: 'DELETE', credentials: 'include' });
  artistData.upcomingShows.splice(index, 1);
  document.getElementById('stat-shows').textContent = artistData.upcomingShows.length;
  renderShows();
}

function renderArtistTab(data, isOwn) {
  const el = document.getElementById('p-artist-content');
  if (!el) return;

  const shows = (data.upcomingShows || []).map(s => `
    <div class="show-item" style="margin-bottom:8px">
      <div>
        <div style="font-weight:700;color:#ff6a00">${s.venue}</div>
        <div style="font-size:12px;color:#888">${s.city || ''} · ${s.date ? new Date(s.date).toLocaleDateString() : ''}</div>
        ${s.ticketUrl
          ? `<a href="${s.ticketUrl}" target="_blank" style="font-size:12px;color:#ff6a00">🎟 Tickets</a>`
          : ''}
      </div>
    </div>`).join('') || '<div style="color:#888;font-size:13px">No upcoming shows.</div>';

  const tracks = (data.importedTracks || []).map(t => `
    <div style="background:#0d0d0d;border:1px solid #222;border-radius:6px;padding:8px 12px;margin-bottom:6px">
      <a href="${t.url}" target="_blank" style="color:#f2f2f2;font-size:13px">${t.title || t.url}</a>
      <div style="font-size:11px;color:#888;margin-top:2px">${t.platform || 'soundcloud'}</div>
    </div>`).join('') || '<div style="color:#888;font-size:13px">No tracks.</div>';

  const tipBtn = !isOwn && data.tipUrl
    ? `<a href="${data.tipUrl}" target="_blank"
        style="display:inline-block;background:linear-gradient(135deg,#ff6a00,#ee0979);
               color:#fff;padding:10px 24px;border-radius:6px;font-weight:700;
               font-size:14px;margin-top:10px;text-decoration:none">
        💸 Support This Artist
       </a>` : '';

  el.innerHTML = `
    <div style="padding-bottom:20px">
      ${data.bio ? `<p style="color:#ccc;font-size:14px;margin-bottom:16px;line-height:1.6">${data.bio}</p>` : ''}
      ${data.soundcloudProfile
        ? `<a href="${data.soundcloudProfile}" target="_blank"
            style="color:#ff6a00;font-size:13px;margin-right:16px">🎵 SoundCloud</a>`
        : ''}
      ${data.spotifyProfile
        ? `<a href="${data.spotifyProfile}" target="_blank"
            style="color:#1db954;font-size:13px">🟢 Spotify</a>`
        : ''}
      ${tipBtn}
      <h3 style="color:#ff6a00;margin:20px 0 10px">🎵 Tracks</h3>
      ${tracks}
      <h3 style="color:#ff6a00;margin:20px 0 10px">🎤 Upcoming Shows</h3>
      ${shows}
      ${isOwn
        ? `<div style="margin-top:16px">
            <a href="/artist-dashboard" class="btn-secondary"
              style="display:inline-block;padding:8px 18px;font-size:13px">
              ⚙️ Manage Artist Dashboard
            </a>
           </div>`
        : ''}
    </div>`;
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:#ff6a00;color:#000;
    font-weight:700;padding:10px 20px;border-radius:8px;font-size:14px;z-index:9999;
    box-shadow:0 4px 20px rgba(255,106,0,.4);animation:fadeInUp .3s ease`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function timeAgoArtist(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

if (document.getElementById('enable-panel') !== null) {
  loadArtistDashboard();
}
