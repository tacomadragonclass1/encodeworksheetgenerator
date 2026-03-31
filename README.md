# Phonics Worksheet Generator

Generates screenshot-ready phonics encoding problems for classroom worksheets.
Matches the layout of the provided `.docx` templates exactly.

---

## First-time setup

The clipart images and data are extracted from the Word documents in `../assets/` and `../paradigm documents/`.
You only need to run this once (or again if the source `.docx` files change).

```bash
# From the worksheetgenerator/ folder:
python3 -m venv /tmp/wsg_env
/tmp/wsg_env/bin/pip install python-docx
/tmp/wsg_env/bin/python3 scripts/extract_assets.py
```

This will:
- Extract all 291 clipart images → `public/images/`
- Generate `src/data/phonicsData.js` with all 96 phonics patterns

---

## Running locally

Open `index.html` with VS Code Live Server, or run:

```bash
python3 -m http.server 8000
```
then visit `http://localhost:8000`.

> **Why a server?** The app uses ES modules (`type="module"`), which browsers block when opened as `file://`. A local HTTP server fixes this.

---

## How to use

1. **Phonics Pattern** — pick a pattern from the dropdown (grouped by category: CVC, CVCe, Beginning Blends, Ending Blends, Vowel Teams)
2. **Number of Problems** — choose 4–8
3. **Select Words** — only words with clipart appear; check the ones you want
   - If you pick fewer than needed, words repeat to fill the count
   - If you pick more than needed, extras are trimmed
4. **Generate Worksheet** — click the button; the preview appears on the right
5. **Screenshot** — take a screenshot of the white worksheet area and paste into your worksheet document

---

## Sound box rules

| Grapheme type | Box width | Box colour |
|---|---|---|
| Regular consonant | 1× | Light gray |
| Regular vowel (a, e, i, o, u) | 1× | Off-white |
| Consonant digraph (ch, sh, th, wh, ck, ng, nk, qu) | 2× | Light gray |
| Vowel team (ai, ee, oa, etc.) | 2× | Off-white |
| R-controlled vowel (ar, er, ir, or, ur) | 2× | Off-white |

---

## Project structure

```
worksheetgenerator/
├── index.html              Main app
├── styles/main.css         All styling
├── src/
│   ├── app.js              UI logic and worksheet renderer
│   ├── phonicsUtils.js     Grapheme splitter
│   └── data/
│       └── phonicsData.js  Generated — do not edit by hand
├── public/
│   ├── images/             Extracted clipart + writing lines graphic
│   └── fonts/              KG Primary Dots font
├── scripts/
│   └── extract_assets.py  One-time data extraction script
└── README.md
```

---

## GitHub Pages deployment

1. Push the entire `worksheetgenerator/` folder to a public GitHub repo
2. Enable Pages in repo Settings → Pages → Source: `main` branch, `/ (root)`
3. Visit the Pages URL — no build step needed
