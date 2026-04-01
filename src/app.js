import { phonicsData }   from './data/phonicsData.js';
import { getGraphemes }  from './phonicsUtils.js';
import { initDeveloper } from './developer.js';

// ── Overrides (populated from clipartOverrides.json at startup) ──────────────
// Maps word string → image filename for words added via the Developer tab.
const overrides = new Map();

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  selectedPatternIds: new Set(),
  problemCount: 6,
  selectedWords: [],
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const patternSelector    = document.getElementById('pattern-selector');
const patternCountEl     = document.getElementById('pattern-selection-count');
const wordListContainer  = document.getElementById('word-list-container');
const selectionBadge     = document.getElementById('selection-badge');
const generateBtn        = document.getElementById('generate-btn');
const previewPlaceholder = document.getElementById('preview-placeholder');
const worksheet          = document.getElementById('worksheet');
const countButtons       = document.querySelectorAll('.count-btn');

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
  setupCountButtons();
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
        map[w.word]    = { ...w, hasClipart: hasImage, image };
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
  const n      = state.selectedWords.length;
  const needed = state.problemCount;

  if (n === 0) {
    selectionBadge.textContent = '';
    return;
  }
  if (n < needed) {
    selectionBadge.textContent = `${n} selected — need ${needed - n} more`;
    selectionBadge.style.color = '#ffaa66';
  } else if (n > needed) {
    selectionBadge.textContent = `${n} selected — first ${needed} will be used`;
    selectionBadge.style.color = '#66aaff';
  } else {
    selectionBadge.textContent = `${n} selected — ready!`;
    selectionBadge.style.color = '#66cc88';
  }
}

// ── Problem count ─────────────────────────────────────────────────────────────
function setupCountButtons() {
  countButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      state.problemCount = parseInt(btn.dataset.count, 10);
      countButtons.forEach(b => b.classList.toggle('active', b === btn));
      updateBadge();
      updateGenerateButton();
    });
  });
  countButtons.forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.count, 10) === state.problemCount);
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

  let words        = [...state.selectedWords];
  const needed     = state.problemCount;

  if (words.length < needed) {
    const original = [...words];
    let i = 0;
    while (words.length < needed) { words.push(original[i++ % original.length]); }
  } else {
    words = words.slice(0, needed);
  }

  const wordMap = buildWordMap();
  renderWorksheet(words, wordMap);
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
  boxesAndLines.appendChild(buildSoundBoxes(entry.word));
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

function buildSoundBoxes(word) {
  const container = document.createElement('div');
  container.className = 'sound-boxes';

  for (const g of getGraphemes(word)) {
    const box = document.createElement('div');
    box.className = 'sound-box';
    if (g.isVowel)  box.classList.add('vowel');
    if (g.isDouble) box.classList.add('double');
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

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
