let allStories = [];
let viewerIndex = 0;
let viewerStories = [];
let progressTimer = null;
let storyType = 'text';

async function loadStories() {
  allStories = await fetch('/api/stories', { credentials: 'include' }).then(r => r.json()).catch(() => []);
  renderStoryBar();
}

function renderStoryBar() {
  const bar = document.getElementById('story-bar');
  const addBtn = bar.querySelector('.story-bubble');
  bar.innerHTML = '';
  bar.appendChild(addBtn);

  const grouped = {};
  allStories.forEach(s => {
    if (!grouped[s.userId]) grouped[s.userId] = [];
    grouped[s.userId].push(s);
  });

  Object.entries(grouped).forEach(([userId, stories]) => {
    const first = stories[0];
    const bubble = document.createElement('div');
    bubble.className = 'story-bubble';
    bubble.innerHTML = `
      <div class="story-ring">
        <img src="${first.userPic || '/default-avatar.png'}" alt=""
          onerror="this.src='/default-avatar.png'"/>
      </div>
      <span>${first.userName}</span>`;
    bubble.onclick = () => openStoryViewer(stories);
    bar.appendChild(bubble);
  });
}

function toggleCreatePanel() {
  const panel = document.getElementById('create-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function setStoryType(type, btn) {
  storyType = type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('text-inputs').style.display = type === 'text' ? 'block' : 'none';
  document.getElementById('media-inputs').style.display = type !== 'text' ? 'block' : 'none';
}

async function submitStory() {
  const fd = new FormData();
  fd.append('type', storyType);

  if (storyType === 'text') {
    const text = document.getElementById('story-text').value.trim();
    if (!text) return alert('Enter some text for your story.');
    fd.append('content', text);
    fd.append('bgColor', document.getElementById('story-bg').value);
    fd.append('fontColor', document.getElementById('story-fg').value);
  } else {
    const fileInput = document.getElementById('story-media-file');
    if (!fileInput.files[0]) return alert('Select a file.');
    fd.append('media', fileInput.files[0]);
  }

  await fetch('/api/stories', {
    method: 'POST', credentials: 'include', body: fd
  });

  document.getElementById('story-text').value = '';
  document.getElementById('story-media-file').value = '';
  toggleCreatePanel();
  await loadStories();
}

function openStoryViewer(stories) {
  viewerStories = stories;
  viewerIndex = 0;
  document.getElementById('story-viewer').classList.add('open');
  showStory(0);
}

function closeStoryViewer() {
  document.getElementById('story-viewer').classList.remove('open');
  clearProgress();
  viewerStories = [];
  viewerIndex = 0;
}

function showStory(index) {
  if (index < 0 || index >= viewerStories.length) { closeStoryViewer(); return; }
  viewerIndex = index;
  const story = viewerStories[index];

  fetch(`/api/stories/${story._id}/view`, { method: 'POST', credentials: 'include' }).catch(() => {});

  document.getElementById('sv-avatar').src = story.userPic || '/default-avatar.png';
  document.getElementById('sv-name').textContent = story.userName;
  document.getElementById('sv-time').textContent = timeAgo(story.createdAt);

  const body = document.getElementById('sv-body');
  const existingContent = body.querySelector('.sv-content');
  if (existingContent) existingContent.remove();

  const content = document.createElement('div');
  content.className = 'sv-content';
  content.style.cssText = 'width:100%;display:flex;align-items:center;justify-content:center;';

  if (story.type === 'text') {
    content.innerHTML = `
      <div class="sv-text-card" style="background:${story.bgColor||'#1a1a1a'};color:${story.fontColor||'#f2f2f2'}">
        ${story.content || ''}
      </div>`;
  } else if (story.type === 'photo') {
    content.innerHTML = `<img src="${story.mediaUrl}" style="max-height:78vh;max-width:100vw;object-fit:contain;border-radius:6px" onerror="this.src='/default-avatar.png'"/>`;
  } else if (story.type === 'video') {
    content.innerHTML = `<video src="${story.mediaUrl}" autoplay controls style="max-height:78vh;max-width:100vw;border-radius:6px"></video>`;
  }

  body.insertBefore(content, body.querySelector('.sv-reactions') || null);

  renderProgressBars(viewerStories.length, index);
  startProgress();
}

function renderProgressBars(total, current) {
  const prog = document.getElementById('sv-progress');
  prog.innerHTML = Array.from({ length: total }, (_, i) => `
    <div class="sv-prog-bar" id="prog-${i}">
      <div class="fill" style="width:${i < current ? '100%' : '0%'}"></div>
    </div>`).join('');
}

function startProgress() {
  clearProgress();
  const bar = document.querySelector(`#prog-${viewerIndex} .fill`);
  if (!bar) return;
  let width = 0;
  progressTimer = setInterval(() => {
    width += 0.5;
    bar.style.width = width + '%';
    if (width >= 100) { clearProgress(); nextStory(); }
  }, 25);
}

function clearProgress() {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
}

function nextStory() {
  clearProgress();
  showStory(viewerIndex + 1);
}

function prevStory() {
  clearProgress();
  showStory(viewerIndex - 1);
}

async function reactStory(emoji) {
  if (!viewerStories.length) return;
  const story = viewerStories[viewerIndex];
  await fetch(`/api/stories/${story._id}/react`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji })
  });
  showReactionBurst(emoji);
}

function showReactionBurst(emoji) {
  const el = document.createElement('div');
  el.className = 'reaction-burst';
  el.textContent = emoji;
  el.style.cssText = `left:${40 + Math.random() * 20}%;top:60%;position:fixed;pointer-events:none;font-size:32px;z-index:9999;animation:burst .9s ease-out forwards`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

async function toggleArchive() {
  const grid = document.getElementById('archive-grid');
  if (grid.style.display === 'none') {
    grid.style.display = 'grid';
    const stories = await fetch('/api/stories/archive', { credentials: 'include' }).then(r => r.json()).catch(() => []);
    if (!stories.length) {
      grid.innerHTML = '<div style="color:#888;font-size:13px;grid-column:1/-1">No archived stories.</div>';
      return;
    }
    grid.innerHTML = stories.map(s => `
      <div class="archive-thumb" style="cursor:pointer" onclick="openStoryViewer([${JSON.stringify(s).replace(/"/g,'&quot;')}])">
        ${s.type === 'text'
          ? `<div class="archive-text" style="background:${s.bgColor||'#1a1a1a'};color:${s.fontColor||'#f2f2f2'}">${(s.content||'').substring(0,40)}</div>`
          : `<img src="${s.mediaUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.src='/default-avatar.png'"/>`}
      </div>`).join('');
  } else {
    grid.style.display = 'none';
  }
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeStoryViewer();
  if (e.key === 'ArrowRight') nextStory();
  if (e.key === 'ArrowLeft') prevStory();
});

loadStories();
