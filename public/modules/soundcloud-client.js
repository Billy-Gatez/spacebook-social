const MOOD_LABELS = {
  default: '🎵 Profile Song',
  hype:    '🔥 Hype',
  chill:   '😌 Chill',
  sad:     '💔 Sad',
  focus:   '🧠 Focus'
};

async function initProfilePlayer(userId, slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) return;

  try {
    const songs = await fetch(`/api/profile-songs/${userId}`, { credentials: 'include' }).then(r => r.json());
    if (!songs || !songs.length) {
      slot.innerHTML = '';
      return;
    }

    const featured = songs.find(s => s.isFeatured);
    const defaultSong = songs.find(s => s.mood === 'default') || songs[0];
    const displaySong = featured || defaultSong;

    let embedHtml = '';
    if (displaySong?.soundcloudUrl) {
      const oembed = await fetch(`/api/soundcloud/oembed?url=${encodeURIComponent(displaySong.soundcloudUrl)}`, { credentials: 'include' })
        .then(r => r.json()).catch(() => null);

      const iframeUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(displaySong.soundcloudUrl)}&color=%23ff6a00&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`;

      embedHtml = `
        <div style="position:relative">
          <iframe id="sc-profile-iframe-${userId}"
            width="100%" height="80" scrolling="no" frameborder="no"
            src="${iframeUrl}"
            style="border-radius:6px"></iframe>
        </div>`;
    }

    const moodTabs = songs.length > 1 ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
        ${songs.map(s => `
          <button onclick="switchMoodSong('${userId}','${s._id}','${s.soundcloudUrl}','${slotId}')"
            style="padding:4px 10px;border-radius:20px;border:1px solid #333;background:#0d0d0d;color:#aaa;cursor:pointer;font-size:12px">
            ${MOOD_LABELS[s.mood] || s.mood}
          </button>`).join('')}
      </div>` : '';

    const featuredBadge = featured ? `
      <div style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#ff6a00,#ee0979);color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:8px">
        ⭐ Featured Track of the Week
        <span style="font-size:10px;opacity:.8">${featured.weekOf || ''}</span>
      </div>` : '';

    const autoPlayToggle = `
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
        <label style="font-size:12px;color:#888;display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="autoplay-toggle-${userId}"
            style="width:auto;margin:0"
            onchange="toggleAutoPlay('${userId}','${slotId}')"/>
          Auto-play
        </label>
      </div>`;

    slot.innerHTML = `
      <div style="background:#111;border:1px solid #222;border-radius:8px;padding:12px;margin-bottom:12px">
        ${featuredBadge}
        ${moodTabs}
        <div id="sc-embed-slot-${userId}">${embedHtml}</div>
        ${autoPlayToggle}
      </div>`;

  } catch (e) {
    slot.innerHTML = '';
  }
}

async function switchMoodSong(userId, songId, soundcloudUrl, slotId) {
  const embedSlot = document.getElementById(`sc-embed-slot-${userId}`);
  if (!embedSlot) return;

  const autoPlay = document.getElementById(`autoplay-toggle-${userId}`)?.checked || false;
  const iframeUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(soundcloudUrl)}&color=%23ff6a00&auto_play=${autoPlay}&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`;

  embedSlot.innerHTML = `
    <iframe id="sc-profile-iframe-${userId}"
      width="100%" height="80" scrolling="no" frameborder="no"
      src="${iframeUrl}"
      style="border-radius:6px"></iframe>`;
}

function toggleAutoPlay(userId, slotId) {
  const iframe = document.getElementById(`sc-profile-iframe-${userId}`);
  if (!iframe) return;
  const currentSrc = iframe.src;
  const autoPlay = document.getElementById(`autoplay-toggle-${userId}`)?.checked || false;
  const newSrc = currentSrc
    .replace('auto_play=false', `auto_play=${autoPlay}`)
    .replace('auto_play=true', `auto_play=${autoPlay}`);
  iframe.src = newSrc;
}

async function enableArtistMode() {
  const genre = prompt('Your genre (e.g. Hip-Hop, House, R&B):');
  if (genre === null) return;
  const bio = prompt('Short artist bio:') || '';
  const sc = prompt('SoundCloud profile URL:') || '';
  const tip = prompt('Tip/support link (Cash App, PayPal, etc.):') || '';

  await fetch('/api/artist/enable', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ genre, bio, soundcloudProfile: sc, tipUrl: tip })
  });

  alert('Artist Mode enabled! Redirecting to your Artist Dashboard.');
  window.location = '/artist-dashboard';
}
