const FONT_OPTIONS = [
  { label: 'Inter (Default)', value: 'Inter' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Playfair Display', value: 'Playfair Display' },
  { label: 'Space Grotesk', value: 'Space Grotesk' },
  { label: 'Bebas Neue', value: 'Bebas Neue' },
  { label: 'Montserrat', value: 'Montserrat' },
  { label: 'Courier Prime', value: 'Courier Prime' },
];

const LAYOUT_PRESETS = [
  { label: 'Default', value: 'default' },
  { label: 'Compact', value: 'compact' },
  { label: 'Wide', value: 'wide' },
  { label: 'Centered', value: 'centered' },
];

const GRADIENT_PRESETS = [
  { label: 'Midnight', value: 'linear-gradient(135deg,#0d0d0d,#1a1a2e)' },
  { label: 'Solar Flare', value: 'linear-gradient(135deg,#1a0500,#3d1500)' },
  { label: 'Deep Space', value: 'linear-gradient(135deg,#000010,#0a0a2a)' },
  { label: 'Forest Night', value: 'linear-gradient(135deg,#001a0d,#003320)' },
  { label: 'Purple Haze', value: 'linear-gradient(135deg,#0d001a,#1a0033)' },
  { label: 'Ocean Deep', value: 'linear-gradient(135deg,#000d1a,#001433)' },
];

async function applyTheme(userId) {
  try {
    const theme = await fetch(`/api/themes/${userId}`).then(r => r.json());
    injectTheme(theme);
  } catch {}
}

function injectTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;

  if (theme.backgroundType === 'gradient') {
    document.body.style.background = theme.backgroundValue;
  } else if (theme.backgroundType === 'image') {
    document.body.style.background = `url('${theme.backgroundValue}') center/cover fixed`;
  } else {
    document.body.style.background = theme.background || '#0d0d0d';
  }

  if (theme.accentColor) {
    root.style.setProperty('--accent', theme.accentColor);
    document.querySelectorAll('.logo, .profile-info h2, .post .author').forEach(el => {
      el.style.color = theme.accentColor;
    });
    document.querySelectorAll('.btn-primary').forEach(el => {
      el.style.background = theme.accentColor;
    });
    document.querySelectorAll('.navbar').forEach(el => {
      el.style.borderBottomColor = theme.accentColor;
    });
  }

  if (theme.fontFamily) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.fontFamily)}&display=swap`;
    document.head.appendChild(link);
    document.body.style.fontFamily = `'${theme.fontFamily}', system-ui, sans-serif`;
  }

  if (theme.layoutPreset) {
    document.body.dataset.layout = theme.layoutPreset;
    const page = document.querySelector('.page, .profile-page');
    if (page) {
      if (theme.layoutPreset === 'compact') page.style.maxWidth = '760px';
      else if (theme.layoutPreset === 'wide') page.style.maxWidth = '1300px';
      else if (theme.layoutPreset === 'centered') {
        page.style.maxWidth = '680px';
        page.style.flexDirection = 'column';
      } else page.style.maxWidth = '1100px';
    }
  }
}

function initThemeEditor(slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) return;

  slot.innerHTML = `
    <div style="padding:4px 0">
      <h3 style="color:#ff6a00;margin-bottom:16px">🎨 Customize Your Theme</h3>

      <div style="margin-bottom:14px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Background Type</label>
        <div style="display:flex;gap:8px">
          <button class="bg-type-btn type-btn-active" onclick="setBgType('color',this)" style="padding:6px 14px;border-radius:20px;border:1px solid #ff6a00;background:#ff6a00;color:#000;cursor:pointer;font-size:13px">Color</button>
          <button class="bg-type-btn" onclick="setBgType('gradient',this)" style="padding:6px 14px;border-radius:20px;border:1px solid #333;background:#0d0d0d;color:#f2f2f2;cursor:pointer;font-size:13px">Gradient</button>
          <button class="bg-type-btn" onclick="setBgType('image',this)" style="padding:6px 14px;border-radius:20px;border:1px solid #333;background:#0d0d0d;color:#f2f2f2;cursor:pointer;font-size:13px">Image URL</button>
        </div>
      </div>

      <div id="bg-color-section" style="margin-bottom:14px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Background Color</label>
        <input type="color" id="theme-bg-color" value="#0d0d0d" style="width:60px;height:40px;padding:2px;border-radius:4px;border:1px solid #333;background:#0d0d0d;cursor:pointer;margin-bottom:0"/>
      </div>

      <div id="bg-gradient-section" style="display:none;margin-bottom:14px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Gradient Presets</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${GRADIENT_PRESETS.map(g => `
            <div onclick="selectGradient('${g.value}',this)"
              style="width:48px;height:48px;border-radius:6px;background:${g.value};cursor:pointer;border:2px solid transparent;title='${g.label}'"
              title="${g.label}"></div>`).join('')}
        </div>
      </div>

      <div id="bg-image-section" style="display:none;margin-bottom:14px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Background Image URL</label>
        <input type="text" id="theme-bg-image" placeholder="https://example.com/image.jpg" style="margin-bottom:0"/>
      </div>

      <div style="margin-bottom:14px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Accent Color</label>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input type="color" id="theme-accent" value="#ff6a00" style="width:48px;height:40px;padding:2px;border-radius:4px;border:1px solid #333;background:#0d0d0d;cursor:pointer;margin-bottom:0"/>
          ${['#ff6a00','#ee0979','#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444','#ffffff'].map(c =>
            `<div onclick="document.getElementById('theme-accent').value='${c}'"
              style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:2px solid #333"></div>`).join('')}
        </div>
      </div>

      <div style="margin-bottom:14px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Font</label>
        <select id="theme-font" style="background:#0d0d0d;color:#f2f2f2;border:1px solid #333;border-radius:6px;padding:8px;width:100%;margin-bottom:0;font-size:14px">
          ${FONT_OPTIONS.map(f => `<option value="${f.value}">${f.label}</option>`).join('')}
        </select>
      </div>

      <div style="margin-bottom:18px">
        <label style="font-size:12px;color:#888;display:block;margin-bottom:6px">Layout</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${LAYOUT_PRESETS.map(l => `
            <button onclick="selectLayout('${l.value}',this)"
              class="layout-btn"
              style="padding:6px 14px;border-radius:20px;border:1px solid #333;background:#0d0d0d;color:#f2f2f2;cursor:pointer;font-size:13px">
              ${l.label}
            </button>`).join('')}
        </div>
      </div>

      <div style="display:flex;gap:10px">
        <button class="btn-primary" onclick="saveTheme()" style="flex:1">Save Theme</button>
        <button class="btn-secondary" onclick="previewTheme()" style="flex:1">Preview</button>
      </div>

      <div id="theme-save-msg" style="display:none;color:#22c55e;font-size:13px;margin-top:10px;text-align:center">✓ Theme saved!</div>
    </div>`;

  loadCurrentTheme();
}

let selectedBgType = 'color';
let selectedGradient = GRADIENT_PRESETS[0].value;
let selectedLayout = 'default';

function setBgType(type, btn) {
  selectedBgType = type;
  document.querySelectorAll('.bg-type-btn').forEach(b => {
    b.style.background = '#0d0d0d';
    b.style.color = '#f2f2f2';
    b.style.borderColor = '#333';
  });
  btn.style.background = '#ff6a00';
  btn.style.color = '#000';
  btn.style.borderColor = '#ff6a00';
  document.getElementById('bg-color-section').style.display = type === 'color' ? 'block' : 'none';
  document.getElementById('bg-gradient-section').style.display = type === 'gradient' ? 'block' : 'none';
  document.getElementById('bg-image-section').style.display = type === 'image' ? 'block' : 'none';
}

function selectGradient(value, el) {
  selectedGradient = value;
  document.querySelectorAll('#bg-gradient-section div').forEach(d => d.style.borderColor = 'transparent');
  el.style.borderColor = '#ff6a00';
}

function selectLayout(value, btn) {
  selectedLayout = value;
  document.querySelectorAll('.layout-btn').forEach(b => {
    b.style.background = '#0d0d0d';
    b.style.color = '#f2f2f2';
    b.style.borderColor = '#333';
  });
  btn.style.background = '#ff6a00';
  btn.style.color = '#000';
  btn.style.borderColor = '#ff6a00';
}

function getThemeValues() {
  const accentColor = document.getElementById('theme-accent')?.value || '#ff6a00';
  const fontFamily  = document.getElementById('theme-font')?.value  || 'Inter';
  let backgroundValue, background;

  if (selectedBgType === 'color') {
    background = document.getElementById('theme-bg-color')?.value || '#0d0d0d';
    backgroundValue = background;
  } else if (selectedBgType === 'gradient') {
    background = selectedGradient;
    backgroundValue = selectedGradient;
  } else {
    backgroundValue = document.getElementById('theme-bg-image')?.value || '';
    background = '#0d0d0d';
  }

  return { background, accentColor, fontFamily, layoutPreset: selectedLayout, backgroundType: selectedBgType, backgroundValue };
}

function previewTheme() {
  injectTheme(getThemeValues());
}

async function saveTheme() {
  const theme = getThemeValues();
  await fetch('/api/themes', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theme)
  });
  injectTheme(theme);
  const msg = document.getElementById('theme-save-msg');
  if (msg) {
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2500);
  }
}

async function loadCurrentTheme() {
  try {
    const theme = await fetch('/api/themes/me', { credentials: 'include' }).then(r => r.json());
    if (!theme) return;
    if (theme.accentColor) {
      const el = document.getElementById('theme-accent');
      if (el) el.value = theme.accentColor;
    }
    if (theme.fontFamily) {
      const el = document.getElementById('theme-font');
      if (el) el.value = theme.fontFamily;
    }
    if (theme.backgroundType) {
      selectedBgType = theme.backgroundType;
    }
    if (theme.background && theme.backgroundType === 'color') {
      const el = document.getElementById('theme-bg-color');
      if (el) el.value = theme.background;
    }
    if (theme.backgroundValue && theme.backgroundType === 'image') {
      const el = document.getElementById('theme-bg-image');
      if (el) el.value = theme.backgroundValue;
    }
    if (theme.layoutPreset) {
      selectedLayout = theme.layoutPreset;
      document.querySelectorAll('.layout-btn').forEach(b => {
        if (b.textContent.trim().toLowerCase() === theme.layoutPreset) {
          b.style.background = '#ff6a00';
          b.style.color = '#000';
          b.style.borderColor = '#ff6a00';
        }
      });
    }
  } catch {}
}
