async function reactPost(postId, emoji) {
  await fetch(`/api/posts/${postId}/react`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji })
  });
  loadReactions(postId);
}

async function loadReactions(postId) {
  const rxns = await fetch(`/api/posts/${postId}/reactions`, { credentials: 'include' })
    .then(r => r.json()).catch(() => []);

  const el = document.getElementById(`rxn-${postId}`);
  if (!el) return;

  const counts = {};
  rxns.forEach(r => { counts[r.emoji] = (counts[r.emoji] || 0) + 1; });

  let summary = document.getElementById(`rxn-summary-${postId}`);
  if (!summary) {
    summary = document.createElement('div');
    summary.id = `rxn-summary-${postId}`;
    summary.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap';
    el.parentNode.insertBefore(summary, el.nextSibling);
  }

  summary.innerHTML = Object.entries(counts).map(([e, c]) =>
    `<span style="background:#1a1a1a;border:1px solid #333;border-radius:20px;padding:3px 8px;font-size:14px;cursor:pointer"
      onclick="reactPost('${postId}','${e}')">${e} ${c}</span>`).join('');
}

async function loadComments(postId) {
  const cmts = await fetch(`/api/posts/${postId}/comments`, { credentials: 'include' })
    .then(r => r.json()).catch(() => []);

  const el = document.getElementById(`cmts-${postId}`);
  if (!el) return;

  el.innerHTML = cmts.slice(-5).map(c => `
    <div style="font-size:13px;padding:5px 0;border-bottom:1px solid #1a1a1a;display:flex;gap:8px;align-items:flex-start">
      <img src="${c.userPic || '/default-avatar.png'}"
        style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:1px solid #ff6a00;flex-shrink:0"
        onerror="this.src='/default-avatar.png'"/>
      <div style="flex:1;min-width:0">
        <span style="color:#ff6a00;font-weight:700">${c.userName}:</span>
        <span style="color:#e2e2e2;margin-left:4px">${c.text || ''}</span>
        ${c.mediaUrl ? `<br/><img src="${c.mediaUrl}"
          style="max-width:120px;border-radius:4px;margin-top:4px"
          onerror="this.src='/default-avatar.png'"/>` : ''}
        <div style="display:flex;gap:4px;margin-top:4px">
          ${['🔥','❤️','😂'].map(e =>
            `<span style="cursor:pointer;font-size:14px" onclick="reactComment('${c._id}','${e}')">${e}</span>`
          ).join('')}
        </div>
      </div>
    </div>`).join('');
}

async function submitComment(postId) {
  const input = document.getElementById(`cmt-input-${postId}`);
  const fileInput = document.getElementById(`cmt-file-${postId}`);
  const text = input.value.trim();
  if (!text && (!fileInput || !fileInput.files[0])) return;

  const fd = new FormData();
  if (text) fd.append('text', text);
  if (fileInput && fileInput.files[0]) fd.append('media', fileInput.files[0]);

  await fetch(`/api/posts/${postId}/comments`, {
    method: 'POST', credentials: 'include', body: fd
  });

  input.value = '';
  if (fileInput) fileInput.value = '';
  loadComments(postId);
}

async function reactComment(commentId, emoji) {
  await fetch(`/api/comments/${commentId}/react`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji })
  });
}

async function deleteComment(commentId, postId) {
  if (!confirm('Delete this comment?')) return;
  await fetch(`/api/comments/${commentId}`, {
    method: 'DELETE', credentials: 'include'
  });
  loadComments(postId);
}

async function loadFriendSuggestions(containerId) {
  const suggs = await fetch('/api/friend-suggestions', { credentials: 'include' })
    .then(r => r.json()).catch(() => []);

  const el = document.getElementById(containerId);
  if (!el) return;

  if (!suggs.length) {
    el.innerHTML = '<div style="color:#888;font-size:13px">No suggestions right now.</div>';
    return;
  }

  el.innerHTML = suggs.slice(0, 8).map(u => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <a href="/profile?id=${u._id}">
        <img src="${u.profilePic || '/default-avatar.png'}"
          style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid #ff6a00"
          onerror="this.src='/default-avatar.png'"/>
      </a>
      <div style="flex:1;min-width:0">
        <a href="/profile?id=${u._id}"
          style="color:#f2f2f2;font-weight:700;font-size:13px;display:block;
                 white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</a>
        ${u.mutuals > 0
          ? `<div style="font-size:11px;color:#888">${u.mutuals} mutual friend${u.mutuals !== 1 ? 's' : ''}</div>`
          : ''}
      </div>
      <button class="btn-secondary"
        style="padding:4px 10px;font-size:12px;flex-shrink:0"
        onclick="addFriend('${u._id}',this)">+Add</button>
    </div>`).join('');
}

async function addFriend(userId, btn) {
  await fetch('/add-friend', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendId: userId })
  });
  if (btn) {
    btn.textContent = '✓ Added';
    btn.disabled = true;
    btn.style.opacity = '0.6';
  }
}

async function loadActivityPreview(containerId, limit = 5) {
  const acts = await fetch('/api/activity-feed', { credentials: 'include' })
    .then(r => r.json()).catch(() => []);

  const el = document.getElementById(containerId);
  if (!el) return;

  if (!acts.length) {
    el.innerHTML = '<div style="color:#888;font-size:13px">No activity yet.</div>';
    return;
  }

  const ICONS = {
    post: '📝', comment: '💬', friend: '🤝',
    photo: '📷', story: '⚡', playlist: '🎵', song: '🎧'
  };

  el.innerHTML = acts.slice(0, limit).map(a => `
    <div style="font-size:13px;padding:6px 0;border-bottom:1px solid #1a1a1a;
                display:flex;gap:8px;align-items:center;color:#ccc">
      <span style="font-size:16px">${ICONS[a.type] || '⚡'}</span>
      <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.description}</span>
    </div>`).join('');
}

function buildPostCard(p, currentUserId) {
  return `
    <div class="card" style="margin-top:16px" id="post-card-${p._id}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <a href="/profile?id=${p.userId}">
          <img src="${p.authorPic || '/default-avatar.png'}"
            style="width:40px;height:40px;border-radius:50%;border:2px solid #ff6a00;object-fit:cover"
            onerror="this.src='/default-avatar.png'"/>
        </a>
        <div>
          <div style="font-weight:700">
            <a href="/profile?id=${p.userId}" style="color:#ff6a00">${p.userName}</a>
          </div>
          <div style="font-size:12px;color:#888">${timeAgo(p.createdAt)}</div>
        </div>
      </div>
      ${p.imagePath
        ? `<img src="${p.imagePath}"
            style="width:100%;border-radius:6px;margin-bottom:10px;cursor:pointer"
            onclick="window.open('${p.imagePath}','_blank')"
            onerror="this.style.display='none'"/>`
        : ''}
      ${p.content ? `<div style="margin-bottom:10px;line-height:1.6">${p.content}</div>` : ''}
      <div style="display:flex;gap:8px;margin-bottom:6px" id="rxn-${p._id}">
        ${['🔥','💫','😭','🤝','🚀'].map(e =>
          `<button onclick="reactPost('${p._id}','${e}')"
            style="background:#111;border:1px solid #222;border-radius:20px;
                   padding:4px 10px;cursor:pointer;font-size:15px;color:#f2f2f2">
            ${e}
          </button>`).join('')}
      </div>
      <div style="border-top:1px solid #1a1a1a;padding-top:10px;margin-top:4px">
        <div id="cmts-${p._id}"></div>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
          <input id="cmt-input-${p._id}"
            placeholder="Add a comment…"
            style="flex:1;margin-bottom:0;font-size:13px"
            onkeydown="if(event.key==='Enter')submitComment('${p._id}')"/>
          <label style="cursor:pointer;color:#ff6a00;font-size:18px" title="Attach image">
            📷
            <input type="file" id="cmt-file-${p._id}" accept="image/*"
              style="display:none" onchange="submitComment('${p._id}')"/>
          </label>
          <button class="btn-secondary"
            style="padding:6px 12px;font-size:13px;flex-shrink:0"
            onclick="submitComment('${p._id}')">→</button>
        </div>
      </div>
    </div>`;
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}
