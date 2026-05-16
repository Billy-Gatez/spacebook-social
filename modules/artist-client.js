let _msgTargetUserId = null;
let _msgTargetName = null;
let _currentArtist = null;

async function init() {
  await loadDashboard();
}

async function loadDashboard() {
  try {
    const res = await fetch('/api/artist/me', { credentials: 'include' });
    const artist = await res.json();

    if (!artist || !artist.isArtist) {
      document.getElementById('enable-panel').style.display = 'block';
      document.getElementById('artist-dashboard').style.display = 'none';
      return;
    }

    _currentArtist = artist;
    document.getElementById('enable-panel').style.display = 'none';
    document.getElementById('artist-dashboard').style.display = 'block';

    // header
    const sessionUser = await fetch('/api/session-user', { credentials: 'include' }).then(r => r.json()).catch(() => null);
    if (sessionUser?.profilePic) document.getElementById('dash-avatar').src = sessionUser.profilePic;
    document.getElementById('dash-name').textContent = artist.artistName || sessionUser?.name || 'Artist';
    document.getElementById('dash-genre').textContent = artist.genre || '';
    if (artist.isVerified) document.getElementById('dash-verified').style.display = 'inline-block';

    // stats
    const totalPlays = (artist.importedTracks || []).reduce((sum, t) => sum + (t.plays || 0), 0);
    document.getElementById('stat-tracks').textContent = (artist.importedTracks || []).length;
    document.getElementById('stat-shows').textContent = (artist.upcomingShows || []).length;
    document.getElementById('stat-msgs').textContent = (artist.fanMessages || []).length;
    document.getElementById('stat-plays').textContent = totalPlays;

    // edit form prefill
    document.getElementById('edit-artist-name').value = artist.artistName || '';
    document.getElementById('edit-genre').value = artist.genre || '';
    document.getElementById('edit-bio').value = artist.bio || '';
    document.getElementById('edit-sc').value = artist.soundcloudProfile || '';
    document.getElementById('edit-sp').value = artist.spotifyProfile || '';
    document.getElementById('edit-tip').value = artist.tipUrl || '';

    renderTracks(artist.importedTracks || []);
    renderShows(artist.upcomingShows || []);
    renderMessages(artist.fanMessages || []);

  } catch(e) {
    document.getElementById('enable-panel').style.display = 'block';
    document.getElementById('artist-dashboard').style.display = 'none';
  }
}

function renderTracks(tracks) {
  const el = document.getElementById('tracks-list');
  if (!el) return;
  if (!tracks.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;">No tracks yet. Import a SoundCloud URL above.</p>';
    return;
  }
  el.innerHTML = tracks.map((t, i) => `
    <div class="track-item">
      <div style="flex:1;min-width:0;">
        <div class="track-title">${t.title || t.url}</div>
        <div style="font-size:11px;color:#888;margin-top:2px;">
          <a href="${t.url}" target="_blank" style="color:#ff6a00;text-decoration:none;">Open ↗</a>
          &nbsp;·&nbsp; ${t.plays || 0} play${t.plays !== 1 ? 's' : ''}
        </div>
      </div>
      <button class="btn-danger" onclick="deleteTrack(${i})">✕</button>
    </div>
  `).join('');
}

function renderShows(shows) {
  const el = document.getElementById('shows-list');
  if (!el) return;
  if (!shows.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;">No shows yet.</p>';
    return;
  }
  el.innerHTML = shows.map((s, i) => `
    <div class="show-item">
      <div class="show-info">
        <div class="show-venue">${s.venue}</div>
        <div class="show-meta">${s.city} · ${new Date(s.date).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' })}
          ${s.ticketUrl ? `· <a href="${s.ticketUrl}" target="_blank" style="color:#ff6a00;text-decoration:none;">Tickets ↗</a>` : ''}
        </div>
      </div>
      <button class="btn-danger" onclick="deleteShow(${i})">✕</button>
    </div>
  `).join('');
}

function renderMessages(msgs) {
  const el = document.getElementById('messages-list');
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = '<p style="color:#666;font-size:13px;">No fan messages yet.</p>';
    return;
  }
  el.innerHTML = msgs.map(m => `
    <div class="msg-item" id="msg-${m._id}">
      <div class="msg-from">${m.fromName} <span style="color:#555;font-weight:400;font-size:11px;">${new Date(m.createdAt).toLocaleDateString()}</span></div>
      <div class="msg-text">${m.message}</div>
      ${m.reply ? `<div class="msg-reply">You replied: ${m.reply}</div>` : ''}
      <div class="msg-actions">
        ${!m.reply ? `
          <div class="reply-input-wrap" style="width:100%;">
            <input type="text" placeholder="Reply…" id="reply-input-${m._id}" onkeydown="if(event.key==='Enter')replyToMessage('${m._id}')"/>
            <button class="btn-secondary" style="padding:6px 12px;" onclick="replyToMessage('${m._id}')">Reply</button>
          </div>` : ''}
        <button class="btn-danger" onclick="deleteMessage('${m._id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

// TAB SWITCHING
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}

// ENABLE ARTIST
async function enableArtist() {
  const artistName = document.getElementById('enable-artist-name').value.trim();
  if (!artistName) return alert('Artist name is required.');
  await fetch('/api/artist/enable', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artistName,
      genre: document.getElementById('enable-genre').value.trim(),
      bio: document.getElementById('enable-bio').value.trim(),
      soundcloudProfile: document.getElementById('enable-sc').value.trim(),
      spotifyProfile: document.getElementById('enable-sp').value.trim(),
      tipUrl: document.getElementById('enable-tip').value.trim()
    })
  });
  await loadDashboard();
}

// SAVE PROFILE
async function saveProfile() {
  const artistName = document.getElementById('edit-artist-name').value.trim();
  if (!artistName) return alert('Artist name is required.');
  await fetch('/api/artist', {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artistName,
      genre: document.getElementById('edit-genre').value.trim(),
      bio: document.getElementById('edit-bio').value.trim(),
      soundcloudProfile: document.getElementById('edit-sc').value.trim(),
      spotifyProfile: document.getElementById('edit-sp').value.trim(),
      tipUrl: document.getElementById('edit-tip').value.trim()
    })
  });
  await loadDashboard();
  alert('Profile saved!');
}

// IMPORT TRACK
async function importTrack() {
  const url = document.getElementById('import-url').value.trim();
  if (!url) return alert('Paste a SoundCloud URL first.');
  const btn = event.target;
  btn.textContent = 'Importing…';
  btn.disabled = true;
  await fetch('/api/artist/import-tracks', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [url], platform: 'soundcloud' })
  });
  document.getElementById('import-url').value = '';
  btn.textContent = 'Import';
  btn.disabled = false;
  await loadDashboard();
}

// DELETE TRACK
async function deleteTrack(index) {
  if (!confirm('Remove this track?')) return;
  await fetch('/api/artist/tracks/' + index, { method: 'DELETE', credentials: 'include' });
  await loadDashboard();
}

// ADD SHOW
async function addShow() {
  const venue = document.getElementById('show-venue').value.trim();
  const city = document.getElementById('show-city').value.trim();
  const date = document.getElementById('show-date').value;
  if (!venue || !city || !date) return alert('Venue, city, and date are required.');
  await fetch('/api/artist/shows', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      venue, city, date,
      ticketUrl: document.getElementById('show-ticket').value.trim()
    })
  });
  document.getElementById('show-venue').value = '';
  document.getElementById('show-city').value = '';
  document.getElementById('show-date').value = '';
  document.getElementById('show-ticket').value = '';
  await loadDashboard();
}

// DELETE SHOW
async function deleteShow(index) {
  if (!confirm('Remove this show?')) return;
  await fetch('/api/artist/shows/' + index, { method: 'DELETE', credentials: 'include' });
  await loadDashboard();
}

// REPLY TO MESSAGE
async function replyToMessage(msgId) {
  const input = document.getElementById('reply-input-' + msgId);
  const reply = input?.value.trim();
  if (!reply) return;
  await fetch('/api/artist/fan-messages/' + msgId + '/reply', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reply })
  });
  await loadDashboard();
}

// DELETE MESSAGE
async function deleteMessage(msgId) {
  if (!confirm('Delete this message?')) return;
  await fetch('/api/artist/fan-messages/' + msgId, { method: 'DELETE', credentials: 'include' });
  await loadDashboard();
}

// SEARCH ARTISTS
async function searchArtists() {
  const q = document.getElementById('artist-search-input').value.trim();
  const el = document.getElementById('artist-search-results');
  if (!q) { el.innerHTML = ''; return; }
  el.innerHTML = '<p style="color:#666;font-size:13px;">Searching…</p>';
  const results = await fetch('/api/artists/search?q=' + encodeURIComponent(q), { credentials: 'include' })
    .then(r => r.json()).catch(() => []);
  if (!results.length) {
    el.innerHTML = `<p style="color:#666;font-size:13px;">No artists found for "${q}".</p>`;
    return;
  }
  el.innerHTML = results.map(a => `
    <div class="artist-search-result" onclick="window.location='/artist/${a.userId}'">
      <img class="artist-result-avatar" src="${a.profilePic || '/assets/images/default-avatar.png'}" onerror="this.src='/assets/images/default-avatar.png'"/>
      <div style="flex:1;min-width:0;">
        <div class="artist-result-name">
          ${a.artistName || a.userName}
          ${a.isVerified ? '<span style="background:#ff6a00;color:#000;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:6px;">✓</span>' : ''}
        </div>
        <div class="artist-result-meta">${a.genre || 'Artist'} · ${a.trackCount} track${a.trackCount !== 1 ? 's' : ''} · ${a.showCount} show${a.showCount !== 1 ? 's' : ''}</div>
      </div>
      <button class="btn-secondary" style="flex-shrink:0;font-size:12px;padding:5px 10px;" onclick="event.stopPropagation();openFanMsgModal('${a.userId}','${(a.artistName || a.userName).replace(/'/g, "\\'")}')">✉️ Message</button>
    </div>
  `).join('');
}

// FAN MESSAGE MODAL
function openFanMsgModal(userId, name) {
  _msgTargetUserId = userId;
  _msgTargetName = name;
  document.getElementById('fan-msg-to').textContent = 'To: ' + name;
  document.getElementById('fan-msg-input').value = '';
  document.getElementById('fan-msg-modal').style.display = 'flex';
}

function closeFanMsgModal() {
  document.getElementById('fan-msg-modal').style.display = 'none';
  _msgTargetUserId = null;
  _msgTargetName = null;
}

async function sendFanMessage() {
  const message = document.getElementById('fan-msg-input').value.trim();
  if (!message) return alert('Write a message first.');
  if (!_msgTargetUserId) return;
  await fetch('/api/artist/' + _msgTargetUserId + '/fan-message', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  closeFanMsgModal();
  alert('Message sent!');
}

// close modal on overlay click
document.getElementById('fan-msg-modal').addEventListener('click', function(e) {
  if (e.target === this) closeFanMsgModal();
});

init();