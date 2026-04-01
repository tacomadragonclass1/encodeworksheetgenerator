// src/developer.js
// Developer tab: assign clipart images to words that are missing them.
//
// Save modes (auto-detected):
//   localhost  → POST /api/save-image  (requires python3 scripts/dev_server.py)
//   remote     → GitHub Contents API  (requires a PAT stored in localStorage)

const GH_SETTINGS_KEY = 'wsg_github_settings';

// ── GitHub helpers ────────────────────────────────────────────────────────────

function isLocalServer() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '';
}

function getGhSettings() {
  try { return JSON.parse(localStorage.getItem(GH_SETTINGS_KEY)) || null; }
  catch { return null; }
}

function saveGhSettings(s) {
  localStorage.setItem(GH_SETTINGS_KEY, JSON.stringify(s));
}

function clearGhSettings() {
  localStorage.removeItem(GH_SETTINGS_KEY);
}

/**
 * Write the clipart image + update clipartOverrides.json via GitHub Contents API.
 * Returns the saved filename on success, throws on failure.
 */
async function ghSaveImage(word, dataUrl, settings) {
  const { owner, repo, branch, token } = settings;
  const base    = `https://api.github.com/repos/${owner}/${repo}/contents`;
  const headers = {
    Authorization:  `token ${token}`,
    'Content-Type': 'application/json',
    Accept:         'application/vnd.github+json',
  };

  const filename    = `word_${word}.png`;
  const imagePath   = `public/images/${filename}`;
  const imageBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

  // ── 1. Save image ──────────────────────────────────────────────────────────
  // If the file already exists we need its SHA to overwrite it.
  let imageSha = null;
  try {
    const chk = await fetch(`${base}/${imagePath}?ref=${branch}`, { headers });
    if (chk.ok) imageSha = (await chk.json()).sha;
  } catch { /* new file, no SHA needed */ }

  const imgRes = await fetch(`${base}/${imagePath}`, {
    method:  'PUT',
    headers,
    body: JSON.stringify({
      message: `Add clipart for "${word}"`,
      content: imageBase64,
      branch,
      ...(imageSha ? { sha: imageSha } : {}),
    }),
  });

  if (!imgRes.ok) {
    const e = await imgRes.json().catch(() => ({}));
    throw new Error(e.message || `GitHub API error ${imgRes.status}`);
  }

  // ── 2. Update clipartOverrides.json ───────────────────────────────────────
  const overridesPath = 'src/data/clipartOverrides.json';
  let currentOverrides = {};
  let overridesSha     = null;

  const ovRes = await fetch(`${base}/${overridesPath}?ref=${branch}`, { headers });
  if (ovRes.ok) {
    const ovData     = await ovRes.json();
    overridesSha     = ovData.sha;
    // GitHub returns base64-encoded content; decode it
    currentOverrides = JSON.parse(atob(ovData.content.replace(/\s/g, '')));
  }

  currentOverrides[word] = filename;
  const newContent = JSON.stringify(currentOverrides, null, 2) + '\n';

  const updateRes = await fetch(`${base}/${overridesPath}`, {
    method:  'PUT',
    headers,
    body: JSON.stringify({
      message: `Update clipartOverrides for "${word}"`,
      content: btoa(newContent),
      branch,
      ...(overridesSha ? { sha: overridesSha } : {}),
    }),
  });

  if (!updateRes.ok) {
    const e = await updateRes.json().catch(() => ({}));
    throw new Error(e.message || `GitHub API error ${updateRes.status}`);
  }

  return filename;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param {object}   phonicsData   The imported phonicsData object
 * @param {Map}      overrides     Live map of word → imageFilename (shared with app.js)
 * @param {Element}  sidebarEl     #panel-developer
 * @param {Element}  workspaceEl   #dev-workspace
 * @param {Function} onSaved       Called with (word, filename) after a successful save
 * @returns {{ teardown, refresh }}
 */
export function initDeveloper(phonicsData, overrides, sidebarEl, workspaceEl, onSaved) {
  let selectedWord    = null;
  let selectedPattern = null;
  let pendingDataUrl  = null;

  // ── Paste-handler management ───────────────────────────────────────────────
  let activePasteHandler = null;

  function setPasteHandler(fn) {
    if (activePasteHandler) document.removeEventListener('paste', activePasteHandler);
    activePasteHandler = fn;
    if (fn) document.addEventListener('paste', fn);
  }

  // ── Missing-words list ─────────────────────────────────────────────────────
  function getMissingEntries() {
    const seen   = new Set();
    const result = [];
    for (const pat of phonicsData.patterns) {
      for (const w of pat.words) {
        if (!w.hasClipart && !overrides.has(w.word) && !seen.has(w.word)) {
          seen.add(w.word);
          result.push({ word: w.word, pattern: pat });
        }
      }
    }
    return result;
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  function renderSidebar() {
    sidebarEl.innerHTML = '';

    const missing = getMissingEntries();

    const hdr = document.createElement('div');
    hdr.className   = 'control-label';
    hdr.textContent = 'Missing Clipart';
    sidebarEl.appendChild(hdr);

    const countEl = document.createElement('div');
    countEl.className = 'dev-missing-count';
    if (missing.length === 0) {
      countEl.textContent = 'All words have clipart!';
      countEl.classList.add('all-done');
      sidebarEl.appendChild(countEl);
      return;
    }
    countEl.textContent = `${missing.length} word${missing.length !== 1 ? 's' : ''} need images`;
    sidebarEl.appendChild(countEl);

    const listEl = document.createElement('div');
    listEl.className = 'dev-word-list';

    const byCategory = {};
    for (const m of missing) {
      const cat = m.pattern.category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(m);
    }

    for (const [cat, items] of Object.entries(byCategory)) {
      const catLbl = document.createElement('div');
      catLbl.className   = 'dev-category-label';
      catLbl.textContent = cat;
      listEl.appendChild(catLbl);

      for (const m of items) {
        const row = document.createElement('div');
        row.className = 'dev-word-row';
        if (selectedWord === m.word) row.classList.add('active');

        const nameSpan       = document.createElement('span');
        nameSpan.className   = 'dev-word-name';
        nameSpan.textContent = m.word;

        const tagSpan       = document.createElement('span');
        tagSpan.className   = 'dev-word-tag';
        tagSpan.textContent = m.pattern.rime;

        row.appendChild(nameSpan);
        row.appendChild(tagSpan);

        row.addEventListener('click', () => {
          selectedWord    = m.word;
          selectedPattern = m.pattern;
          pendingDataUrl  = null;
          renderSidebar();
          renderWorkspace();
        });

        listEl.appendChild(row);
      }
    }

    sidebarEl.appendChild(listEl);
  }

  // ── Workspace ──────────────────────────────────────────────────────────────
  function renderWorkspace() {
    setPasteHandler(null);
    workspaceEl.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'dev-workspace-inner';

    // GitHub settings panel (shown when not on localhost)
    if (!isLocalServer()) {
      wrap.appendChild(buildGhSettingsPanel());
    }

    if (!selectedWord) {
      const ph = document.createElement('div');
      ph.className = 'dev-placeholder';
      ph.innerHTML = `
        <p>Select a word to assign clipart</p>
        <small>Copy an image, select a word, then paste (Ctrl+V)</small>`;
      wrap.appendChild(ph);
    } else {
      wrap.appendChild(buildWordCard());
    }

    workspaceEl.appendChild(wrap);
  }

  // ── GitHub settings panel ──────────────────────────────────────────────────
  function buildGhSettingsPanel() {
    const settings = getGhSettings();
    const panel    = document.createElement('div');
    panel.className = 'dev-gh-panel';

    if (settings) {
      // Configured — show summary with Edit button
      const summary = document.createElement('div');
      summary.className = 'dev-gh-summary';

      const info = document.createElement('div');
      info.className = 'dev-gh-info';
      info.innerHTML =
        `<span class="dev-gh-dot configured"></span>` +
        `<strong>${settings.owner}/${settings.repo}</strong>` +
        ` &middot; ${settings.branch}`;

      const editBtn       = document.createElement('button');
      editBtn.className   = 'dev-gh-edit-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        panel.replaceWith(buildGhSettingsForm(settings));
      });

      summary.appendChild(info);
      summary.appendChild(editBtn);
      panel.appendChild(summary);
    } else {
      // Not configured — show form immediately
      panel.appendChild(buildGhSettingsForm(null));
    }

    return panel;
  }

  function buildGhSettingsForm(existing) {
    const form = document.createElement('div');
    form.className = 'dev-gh-panel dev-gh-form';

    const title       = document.createElement('div');
    title.className   = 'dev-gh-form-title';
    title.textContent = 'GitHub Settings';
    form.appendChild(title);

    const hint       = document.createElement('p');
    hint.className   = 'dev-gh-hint';
    hint.innerHTML   =
      'Saves clipart directly to your repo. Needs a ' +
      '<strong>Personal Access Token</strong> with Contents read+write.';
    form.appendChild(hint);

    function field(labelText, inputAttrs) {
      const row = document.createElement('div');
      row.className = 'dev-gh-field';
      const lbl       = document.createElement('label');
      lbl.textContent = labelText;
      const inp       = document.createElement('input');
      Object.assign(inp, inputAttrs);
      inp.className = 'dev-gh-input';
      row.appendChild(lbl);
      row.appendChild(inp);
      form.appendChild(row);
      return inp;
    }

    const repoInp   = field('Repository', {
      type: 'text', placeholder: 'owner/repo-name',
      value: existing ? `${existing.owner}/${existing.repo}` : '',
    });
    const branchInp = field('Branch', {
      type: 'text', placeholder: 'main',
      value: existing ? existing.branch : 'main',
    });
    const tokenInp  = field('Personal Access Token', {
      type: 'password', placeholder: 'ghp_…',
      value: existing ? existing.token : '',
    });

    const row      = document.createElement('div');
    row.className  = 'dev-gh-form-actions';

    const saveBtn       = document.createElement('button');
    saveBtn.className   = 'dev-gh-save-btn';
    saveBtn.textContent = 'Save Settings';
    saveBtn.addEventListener('click', () => {
      const raw = repoInp.value.trim();
      const parts = raw.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        repoInp.classList.add('error');
        repoInp.focus();
        return;
      }
      repoInp.classList.remove('error');
      saveGhSettings({
        owner:  parts[0],
        repo:   parts[1],
        branch: branchInp.value.trim() || 'main',
        token:  tokenInp.value.trim(),
      });
      renderWorkspace();
    });

    row.appendChild(saveBtn);

    if (existing) {
      const cancelBtn       = document.createElement('button');
      cancelBtn.className   = 'dev-gh-cancel-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => renderWorkspace());
      row.appendChild(cancelBtn);
    }

    form.appendChild(row);
    return form;
  }

  // ── Word card (paste zone + save) ──────────────────────────────────────────
  function buildWordCard() {
    const card = document.createElement('div');
    card.className = 'dev-workspace-card';

    const titleEl       = document.createElement('div');
    titleEl.className   = 'dev-workspace-title';
    titleEl.textContent = selectedWord;
    card.appendChild(titleEl);

    const subEl       = document.createElement('div');
    subEl.className   = 'dev-workspace-sub';
    subEl.textContent = `${selectedPattern.rime}  ·  ${selectedPattern.category}`;
    card.appendChild(subEl);

    // Paste zone
    const pasteZone  = document.createElement('div');
    pasteZone.className = 'dev-paste-zone';
    pasteZone.tabIndex  = 0;

    if (pendingDataUrl) {
      pasteZone.classList.add('has-image');
      const previewImg   = document.createElement('img');
      previewImg.src     = pendingDataUrl;
      previewImg.className = 'dev-paste-preview';
      previewImg.alt     = selectedWord;
      pasteZone.appendChild(previewImg);

      const hint       = document.createElement('div');
      hint.className   = 'dev-paste-replace-hint';
      hint.textContent = 'Paste again to replace';
      pasteZone.appendChild(hint);
    } else {
      pasteZone.innerHTML = `
        <div class="dev-paste-instructions">
          <div class="dev-paste-key">Ctrl+V</div>
          <div>Paste an image here</div>
          <small>Copy any image first, then paste</small>
        </div>`;
    }

    card.appendChild(pasteZone);

    // Save button
    const saveBtn       = document.createElement('button');
    saveBtn.className   = 'dev-save-btn';
    saveBtn.textContent = `Save clipart for "${selectedWord}"`;
    saveBtn.disabled    = !pendingDataUrl;
    card.appendChild(saveBtn);

    // Status
    const statusEl    = document.createElement('div');
    statusEl.className = 'dev-status';
    card.appendChild(statusEl);

    // ── Paste ──────────────────────────────────────────────────────────────
    function handlePaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (!item.type.startsWith('image/')) continue;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = ev => {
          const tmpImg  = new Image();
          tmpImg.onload = () => {
            const canvas  = document.createElement('canvas');
            canvas.width  = tmpImg.naturalWidth;
            canvas.height = tmpImg.naturalHeight;
            canvas.getContext('2d').drawImage(tmpImg, 0, 0);
            pendingDataUrl = canvas.toDataURL('image/png');
            renderWorkspace();
          };
          tmpImg.src = ev.target.result;
        };
        reader.readAsDataURL(item.getAsFile());
        return;
      }
    }

    setPasteHandler(handlePaste);

    // ── Save ───────────────────────────────────────────────────────────────
    saveBtn.addEventListener('click', async () => {
      if (!pendingDataUrl) return;

      // On remote, require GitHub settings before attempting save
      if (!isLocalServer() && !getGhSettings()) {
        statusEl.textContent = 'Configure GitHub settings above first.';
        statusEl.className   = 'dev-status error';
        return;
      }

      saveBtn.disabled     = true;
      saveBtn.textContent  = 'Saving…';
      statusEl.textContent = '';
      statusEl.className   = 'dev-status';

      try {
        let filename;

        if (isLocalServer()) {
          const res  = await fetch('/api/save-image', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ word: selectedWord, imageData: pendingDataUrl }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Server error');
          filename = data.filename;
        } else {
          filename = await ghSaveImage(selectedWord, pendingDataUrl, getGhSettings());
        }

        overrides.set(selectedWord, filename);
        onSaved(selectedWord, filename);

        statusEl.textContent = isLocalServer()
          ? `Saved as ${filename}`
          : `Committed to repo as ${filename}`;
        statusEl.className = 'dev-status success';

        setTimeout(() => {
          selectedWord    = null;
          selectedPattern = null;
          pendingDataUrl  = null;
          renderSidebar();
          renderWorkspace();
        }, 1200);

      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
        statusEl.className   = 'dev-status error';
        saveBtn.disabled     = false;
        saveBtn.textContent  = `Save clipart for "${selectedWord}"`;
      }
    });

    return card;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  renderSidebar();
  renderWorkspace();

  return {
    teardown() { setPasteHandler(null); },
    refresh()  { renderSidebar(); },
  };
}
