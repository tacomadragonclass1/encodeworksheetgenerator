import { phonicsData }   from './data/phonicsData.js';
import { getGraphemes }  from './phonicsUtils.js';
import { initDeveloper } from './developer.js';

// ── Overrides (populated from clipartOverrides.json at startup) ──────────────
// Maps word string → image filename for words added via the Developer tab.
const overrides = new Map();

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  selectedPatternIds: new Set(),
  selectedWords: [],
  mode: 'encode',
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const patternSelector    = document.getElementById('pattern-selector');
const patternCountEl     = document.getElementById('pattern-selection-count');
const wordListContainer  = document.getElementById('word-list-container');
const selectionBadge     = document.getElementById('selection-badge');
const generateBtn        = document.getElementById('generate-btn');
const previewPlaceholder = document.getElementById('preview-placeholder');
const worksheet          = document.getElementById('worksheet');
const modeButtons        = document.querySelectorAll('.mode-btn');

// Tab elements
const tabBtns       = document.querySelectorAll('.tab-btn');
const panelGenerator = document.getElementById('panel-generator');
const panelDeveloper = document.getElementById('panel-developer');
const devWorkspace   = document.getElementById('dev-workspace');

// ── Tab switching ─────────────────────────────────────────────────────────────
let activeTab = 'generator';
let devInstance = null;
// Remember whether the generator had a worksheet showing when we left it
let generatorMainState = 'placeholder';

function switchTab(name) {
  if (name === activeTab) return;

  if (name === 'generator') {
    panelDeveloper.style.display = 'none';
    devWorkspace.style.display   = 'none';
    panelGenerator.style.display = '';
    // Restore generator main area to its previous state
    if (generatorMainState === 'worksheet') {
      previewPlaceholder.style.display = 'none';
      worksheet.style.display          = 'block';
    } else {
      previewPlaceholder.style.display = '';
      worksheet.style.display          = 'none';
    }
    devInstance?.teardown();
  } else {
    // Save generator main state before hiding it
    generatorMainState = worksheet.style.display === 'none' ? 'placeholder' : 'worksheet';
    panelGenerator.style.display     = 'none';
    previewPlaceholder.style.display = 'none';
    worksheet.style.display          = 'none';
    panelDeveloper.style.display     = '';
    devWorkspace.style.display       = '';

    if (!devInstance) {
      devInstance = initDeveloper(
        phonicsData, overrides, panelDeveloper, devWorkspace, onOverrideSaved
      );
    } else {
      devInstance.refresh();
    }
  }

  activeTab = name;
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
}

function onOverrideSaved(word, _filename) {
  // overrides Map already updated by developer.js before this is called.
  // If any patterns are currently selected, the new word should now be
  // visible and selectable in the generator word list.
  if (state.selectedPatternIds.size > 0) {
    renderWordList();
    updateGenerateButton();
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadOverrides();
  buildPatternPanel();
  setupModeButtons();
  generateBtn.addEventListener('click', onGenerate);
  tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  updateGenerateButton();
}

async function loadOverrides() {
  try {
    const res = await fetch('src/data/clipartOverrides.json');
    if (!res.ok) return;
    const obj = await res.json();
    for (const [word, filename] of Object.entries(obj)) {
      overrides.set(word, filename);
    }
  } catch {
    // File missing or invalid JSON — start with empty overrides
  }
}

// ── Pattern panel (toggle buttons) ───────────────────────────────────────────
function buildPatternPanel() {
  const groups = {};
  for (const pat of phonicsData.patterns) {
    if (!groups[pat.category]) groups[pat.category] = [];
    groups[pat.category].push(pat);
  }

  patternSelector.innerHTML = '';

  for (const [cat, pats] of Object.entries(groups)) {
    const group = document.createElement('div');
    group.className = 'pattern-category-group';

    const catLabel = document.createElement('div');
    catLabel.className   = 'pattern-category-label';
    catLabel.textContent = cat;
    group.appendChild(catLabel);

    const btnRow = document.createElement('div');
    btnRow.className = 'pattern-btns';

    for (const pat of pats) {
      const btn = document.createElement('button');
      btn.className    = 'pattern-btn';
      btn.dataset.id   = pat.id;
      btn.textContent  = pat.rime;
      btn.title        = pat.displayName;
      btn.addEventListener('click', () => togglePattern(pat.id, btn));
      btnRow.appendChild(btn);
    }

    group.appendChild(btnRow);
    patternSelector.appendChild(group);
  }
}

function togglePattern(patId, btn) {
  if (state.selectedPatternIds.has(patId)) {
    state.selectedPatternIds.delete(patId);
    btn.classList.remove('active');
    pruneDeselectedWords();
  } else {
    state.selectedPatternIds.add(patId);
    btn.classList.add('active');
  }

  updatePatternCount();
  renderWordList();
  updateGenerateButton();
  worksheet.innerHTML      = '';
  worksheet.style.display  = 'none';
  previewPlaceholder.style.display = '';
}

function updatePatternCount() {
  const n = state.selectedPatternIds.size;
  patternCountEl.textContent = n === 0
    ? '0 patterns selected'
    : `${n} pattern${n > 1 ? 's' : ''} selected`;
  patternCountEl.classList.toggle('has-selection', n > 0);
}

function pruneDeselectedWords() {
  const available = new Set(getAvailableWords().map(e => e.word));
  state.selectedWords = state.selectedWords.filter(w => available.has(w));
}

// ── Word pool ─────────────────────────────────────────────────────────────────
// A word is available if it has clipart from phonicsData OR from overrides.
function getAvailableWords() {
  const seen   = new Set();
  const result = [];
  for (const patId of state.selectedPatternIds) {
    const pat = phonicsData.patterns.find(p => p.id === patId);
    if (!pat) continue;
    for (const w of pat.words) {
      const hasImage = w.hasClipart || overrides.has(w.word);
      if (hasImage && !seen.has(w.word)) {
        seen.add(w.word);
        const image = w.image || overrides.get(w.word) || null;
        result.push({ word: w.word, image, rime: pat.rime });
      }
    }
  }
  return result;
}

function buildWordMap() {
  const map = {};
  for (const patId of state.selectedPatternIds) {
    const pat = phonicsData.patterns.find(p => p.id === patId);
    if (!pat) continue;
    for (const w of pat.words) {
      if (!map[w.word]) {
        const hasImage = w.hasClipart || overrides.has(w.word);
        const image    = w.image || overrides.get(w.word) || null;
        map[w.word]    = { ...w, hasClipart: hasImage, image, category: pat.category };
      }
    }
  }
  return map;
}

// ── Word list ─────────────────────────────────────────────────────────────────
function renderWordList() {
  wordListContainer.innerHTML = '';

  const available = getAvailableWords();

  if (available.length === 0) {
    wordListContainer.classList.add('empty');
    wordListContainer.innerHTML =
      '<p style="font-size:12px;color:#5a5a7a;text-align:center;padding:8px;">Select patterns above</p>';
    updateBadge();
    return;
  }

  wordListContainer.classList.remove('empty');

  const hdr = document.createElement('div');
  hdr.className   = 'word-list-header';
  hdr.textContent = `${available.length} word${available.length > 1 ? 's' : ''} available`;
  wordListContainer.appendChild(hdr);

  const byRime     = {};
  for (const e of available) {
    if (!byRime[e.rime]) byRime[e.rime] = [];
    byRime[e.rime].push(e);
  }

  const showTags = state.selectedPatternIds.size > 1;

  for (const [rime, entries] of Object.entries(byRime)) {
    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'word-item';

      const cb    = document.createElement('input');
      cb.type     = 'checkbox';
      cb.id       = `word-${e.word}`;
      cb.value    = e.word;
      cb.checked  = state.selectedWords.includes(e.word);

      const lbl       = document.createElement('label');
      lbl.htmlFor     = `word-${e.word}`;
      lbl.textContent = e.word;

      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (!state.selectedWords.includes(e.word)) state.selectedWords.push(e.word);
        } else {
          state.selectedWords = state.selectedWords.filter(x => x !== e.word);
        }
        updateBadge();
        updateGenerateButton();
      });

      row.appendChild(cb);
      row.appendChild(lbl);

      if (showTags) {
        const tag       = document.createElement('span');
        tag.className   = 'word-pattern-tag';
        tag.textContent = rime;
        row.appendChild(tag);
      }

      row.addEventListener('click', e => { if (e.target !== cb) cb.click(); });
      wordListContainer.appendChild(row);
    }
  }

  updateBadge();
}

function updateBadge() {
  const n = state.selectedWords.length;
  if (n === 0) {
    selectionBadge.textContent = '';
    return;
  }
  if (n > 10) {
    selectionBadge.textContent = `${n} selected — first 10 will be used`;
    selectionBadge.style.color = '#66aaff';
  } else {
    selectionBadge.textContent = `${n} selected — ready!`;
    selectionBadge.style.color = '#66cc88';
  }
}

// ── Worksheet mode (encode / decode) ─────────────────────────────────────────
function setupModeButtons() {
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === state.mode) return;
      state.mode = btn.dataset.mode;
      modeButtons.forEach(b => b.classList.toggle('active', b === btn));
      // Clear any displayed worksheet so it doesn't misrepresent the new mode
      worksheet.innerHTML     = '';
      worksheet.style.display = 'none';
      previewPlaceholder.style.display = '';
    });
  });
}

// ── Generate button state ─────────────────────────────────────────────────────
function updateGenerateButton() {
  generateBtn.disabled =
    state.selectedPatternIds.size === 0 || state.selectedWords.length === 0;
}

// ── Generate ──────────────────────────────────────────────────────────────────
function onGenerate() {
  if (state.selectedPatternIds.size === 0) return;

  const words = state.selectedWords.slice(0, 10);

  const wordMap = buildWordMap();
  if (state.mode === 'decode') {
    renderWorksheetDecode(words, wordMap);
  } else {
    renderWorksheet(words, wordMap);
  }
}

// ── Worksheet render ──────────────────────────────────────────────────────────
function renderWorksheet(words, wordMap) {
  previewPlaceholder.style.display = 'none';
  worksheet.style.display          = 'block';
  worksheet.innerHTML              = '';

  for (const wordStr of words) {
    const entry = wordMap[wordStr] || { word: wordStr, hasClipart: false };
    worksheet.appendChild(buildRow(entry));
  }
}

function buildRow(entry) {
  const row = document.createElement('div');
  row.className = 'worksheet-row';
  row.appendChild(buildClipartCell(entry));

  const boxesAndLines = document.createElement('div');
  boxesAndLines.className = 'boxes-and-lines';
  boxesAndLines.appendChild(buildSoundBoxes(entry.word, entry.category));
  boxesAndLines.appendChild(buildWritingLines());
  row.appendChild(boxesAndLines);

  return row;
}

function buildClipartCell(entry) {
  const cell = document.createElement('div');
  cell.className = 'clipart-cell';

  if (entry.hasClipart && entry.image) {
    const img    = document.createElement('img');
    img.src      = `public/images/${entry.image}`;
    img.alt      = entry.word;
    img.loading  = 'lazy';
    img.onerror  = () => {
      cell.innerHTML = '';
      const miss       = document.createElement('div');
      miss.className   = 'clipart-missing';
      miss.textContent = entry.word;
      cell.appendChild(miss);
    };
    cell.appendChild(img);
  } else {
    const miss       = document.createElement('div');
    miss.className   = 'clipart-missing';
    miss.textContent = entry.word;
    cell.appendChild(miss);
  }

  return cell;
}

function buildSoundBoxes(word, category, showLetters = false) {
  const container = document.createElement('div');
  container.className = 'sound-boxes';

  for (const g of getGraphemes(word, category === 'CVCe')) {
    const box = document.createElement('div');
    box.className = 'sound-box';
    if (g.isVowel)  box.classList.add('vowel');
    if (g.isDouble) box.classList.add('double');

    if (showLetters) {
      const span = document.createElement('span');
      span.className = 'sound-box-letter';
      const len = g.grapheme.length;
      span.style.fontSize = len <= 2 ? '100px' : '68px';
      span.textContent = g.grapheme;
      box.appendChild(span);
    }

    container.appendChild(box);
  }

  return container;
}

function buildWritingLines() {
  const cell   = document.createElement('div');
  cell.className = 'writing-lines-cell';

  const img    = document.createElement('img');
  img.src      = 'public/images/writing_lines.png';
  img.alt      = '';
  img.className = 'writing-lines-img';
  cell.appendChild(img);

  return cell;
}

// ── Decode worksheet ──────────────────────────────────────────────────────────

/**
 * Sattolo's algorithm — returns a new array that is a derangement of the
 * input (guaranteed: no element stays at its original index).
 */
function derange(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    // j in [0, i) — the strict upper bound is what makes it a single cycle
    const j = Math.floor(Math.random() * i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderWorksheetDecode(words, wordMap) {
  previewPlaceholder.style.display = 'none';
  worksheet.style.display          = 'block';
  worksheet.innerHTML              = '';

  const entries = words.map(w => wordMap[w] || { word: w, hasClipart: false, image: null, category: '' });
  const images  = entries.map(e => e.image);
  const shuffled = derange(images);

  for (let i = 0; i < entries.length; i++) {
    worksheet.appendChild(buildDecodeRow(entries[i], shuffled[i]));
  }
}

function buildDecodeRow(entry, shuffledImage) {
  const row = document.createElement('div');
  row.className = 'worksheet-row worksheet-row--decode';

  // Left: sound boxes with letters + blank writing lines
  const decodeLeft = document.createElement('div');
  decodeLeft.className = entry.word.length >= 5
    ? 'decode-left decode-left--long'
    : 'decode-left';
  decodeLeft.appendChild(buildSoundBoxes(entry.word, entry.category, true));
  decodeLeft.appendChild(buildWritingLines());
  row.appendChild(decodeLeft);

  // Right: shuffled image (belongs to a different word, pinned to far right by CSS)
  const cell = document.createElement('div');
  cell.className = 'clipart-cell';
  if (shuffledImage) {
    const img    = document.createElement('img');
    img.src      = `public/images/${shuffledImage}`;
    img.alt      = '';
    img.loading  = 'lazy';
    cell.appendChild(img);
  }
  row.appendChild(cell);

  return row;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
