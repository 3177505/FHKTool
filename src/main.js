import './style.scss';

const FONT_FILES = {
  DotSizeVAR: '/fonts/205TF-Bertin-DotSizeVAR.ttf',
  DotValueVAR: '/fonts/205TF-Bertin-DotValueVAR.ttf',
  DotShapeVAR: '/fonts/205TF-Bertin-DotShapeVAR.ttf',
  DotMultiVAR: '/fonts/205TF-Bertin-DotMultiVAR.ttf',
  DotOrientationVAR: '/fonts/205TF-Bertin-DotOrientationVAR.ttf',
  DotRotationVAR: '/fonts/205TF-Bertin-DotRotationVAR.ttf',
  SquareSizeVAR: '/fonts/205TF-Bertin-SquareSizeVAR.ttf',
  SquareValueVAR: '/fonts/205TF-Bertin-SquareValueVAR.ttf',
  SquareShapeVAR: '/fonts/205TF-Bertin-SquareShapeVAR.ttf',
  SquareMultiVAR: '/fonts/205TF-Bertin-SquareMultiVAR.ttf',
  SquareOrientationVAR: '/fonts/205TF-Bertin-SquareOrientationVAR.ttf',
  SquareRotationVAR: '/fonts/205TF-Bertin-SquareRotationVAR.ttf',
};

const FONT_NAMES = [
  'DotSizeVAR', 'DotValueVAR', 'DotShapeVAR', 'DotMultiVAR', 'DotOrientationVAR', 'DotRotationVAR',
  'SquareSizeVAR', 'SquareValueVAR', 'SquareShapeVAR', 'SquareMultiVAR', 'SquareOrientationVAR', 'SquareRotationVAR',
];

const COMPANION_LABELS = {
  DotSizeVAR: 'Dot Size',
  DotValueVAR: 'Dot Value',
  DotShapeVAR: 'Dot Shape',
  DotMultiVAR: 'Dot Multi',
  DotOrientationVAR: 'Dot Orientation',
  DotRotationVAR: 'Dot Rotation',
  SquareSizeVAR: 'Square Size',
  SquareValueVAR: 'Square Value',
  SquareShapeVAR: 'Square Shape',
  SquareMultiVAR: 'Square Multi',
  SquareOrientationVAR: 'Square Orientation',
  SquareRotationVAR: 'Square Rotation',
};

const COMPANION_VALUES = { size: 500, shap: 1000, valu: 500, orie: 0, rota: 30 };

const FONT_AXES = {
  DotSizeVAR: { size: [0, 1000], shap: 500, valu: 500 },
  DotValueVAR: { size: 1000, shap: 500, valu: [0, 1000] },
  DotShapeVAR: { size: [0, 1000], shap: [0, 1000], valu: 500 },
  DotMultiVAR: { size: 1000, shap: [0, 1000], valu: [0, 1000] },
  DotOrientationVAR: { size: [0, 1000], shap: [0, 1000], orie: [0, 180] },
  DotRotationVAR: { size: [0, 1000], shap: [0, 1000], rota: [0, 180] },
  SquareSizeVAR: { size: [0, 1000], shap: 500, valu: 500 },
  SquareValueVAR: { size: 1000, shap: 500, valu: [0, 1000] },
  SquareShapeVAR: { size: [0, 1000], shap: [0, 1000], valu: 500 },
  SquareMultiVAR: { size: 1000, shap: [0, 1000], valu: [0, 1000] },
  SquareOrientationVAR: { size: [0, 1000], shap: [0, 1000], orie: [0, 180] },
  SquareRotationVAR: { size: [0, 1000], shap: [0, 1000], rota: [0, 180] },
};

const NAMED_STYLES = [
  { font: 'DotSizeVAR', label: 'Dot Size', axes: [{ size: 0 }, { size: 450 }, { size: 1000 }] },
  { font: 'DotValueVAR', label: 'Dot Value', axes: [{ valu: 0 }, { valu: 450 }, { valu: 1000 }] },
  { font: 'DotShapeVAR', label: 'Dot Shape', axes: [{ size: 0, shap: 0 }, { size: 0, shap: 1000 }, { size: 450, shap: 0 }, { size: 450, shap: 1000 }] },
  { font: 'DotMultiVAR', label: 'Dot Multi', axes: [{ shap: 0, valu: 0 }, { shap: 0, valu: 1000 }, { shap: 1000, valu: 0 }, { shap: 1000, valu: 1000 }] },
  { font: 'DotOrientationVAR', label: 'Dot Orientation', axes: [{ size: 0, shap: 0, orie: 0 }, { size: 0, shap: 0, orie: 180 }, { size: 0, shap: 1000, orie: 0 }, { size: 0, shap: 1000, orie: 180 }, { size: 1000, shap: 0, orie: 0 }, { size: 1000, shap: 0, orie: 180 }, { size: 1000, shap: 1000, orie: 0 }, { size: 1000, shap: 1000, orie: 180 }] },
  { font: 'DotRotationVAR', label: 'Dot Rotation', axes: [{ size: 0, shap: 0, rota: 30 }, { size: 0, shap: 0, rota: 150 }, { size: 0, shap: 1000, rota: 30 }, { size: 0, shap: 1000, rota: 150 }, { size: 1000, shap: 0, rota: 30 }, { size: 1000, shap: 0, rota: 150 }, { size: 1000, shap: 1000, rota: 30 }, { size: 1000, shap: 1000, rota: 150 }] },
  { font: 'SquareSizeVAR', label: 'Square Size', axes: [{ size: 0 }, { size: 450 }, { size: 1000 }] },
  { font: 'SquareValueVAR', label: 'Square Value', axes: [{ valu: 0 }, { valu: 450 }, { valu: 1000 }] },
  { font: 'SquareShapeVAR', label: 'Square Shape', axes: [{ size: 0, shap: 0 }, { size: 0, shap: 1000 }, { size: 450, shap: 0 }, { size: 450, shap: 1000 }] },
  { font: 'SquareMultiVAR', label: 'Square Multi', axes: [{ shap: 0, valu: 0 }, { shap: 0, valu: 1000 }, { shap: 1000, valu: 0 }, { shap: 1000, valu: 1000 }] },
  { font: 'SquareOrientationVAR', label: 'Square Orientation', axes: [{ size: 0, shap: 0, orie: 0 }, { size: 0, shap: 0, orie: 180 }, { size: 0, shap: 1000, orie: 0 }, { size: 0, shap: 1000, orie: 180 }, { size: 800, shap: 0, orie: 0 }, { size: 800, shap: 0, orie: 180 }, { size: 800, shap: 1000, orie: 0 }, { size: 800, shap: 1000, orie: 180 }] },
  { font: 'SquareRotationVAR', label: 'Square Rotation', axes: [{ size: 0, shap: 0, rota: 30 }, { size: 0, shap: 0, rota: 150 }, { size: 0, shap: 1000, rota: 30 }, { size: 0, shap: 1000, rota: 150 }, { size: 800, shap: 0, rota: 30 }, { size: 800, shap: 0, rota: 150 }, { size: 800, shap: 1000, rota: 30 }, { size: 800, shap: 1000, rota: 150 }] },
];

let companionFont = 'DotSizeVAR';
let previewRandomFont = FONT_NAMES[Math.floor(Math.random() * FONT_NAMES.length)];
const loadedFonts = new Set();

function loadFont(name) {
  if (loadedFonts.has(name)) return Promise.resolve();
  const url = FONT_FILES[name];
  if (!url) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const font = new FontFace('Bertin-' + name, `url(${url})`, {
      style: 'normal',
      weight: '400',
    });
    font.load().then(() => {
      document.fonts.add(font);
      loadedFonts.add(name);
      resolve();
    }).catch((err) => {
      console.error('Font load failed:', name, url, err);
      reject(err);
    });
  });
}

function getVariationForFont(fontName, values) {
  const axes = FONT_AXES[fontName];
  if (!axes) return '';
  const parts = [];
  for (const [key, val] of Object.entries(axes)) {
    const v = Array.isArray(val) ? (values[key] !== undefined ? values[key] : val[0]) : val;
    parts.push(`"${key}" ${v}`);
  }
  return parts.join(', ');
}

function getValues() {
  return {
    size: parseInt(document.getElementById('size').value, 10),
    shap: parseInt(document.getElementById('shap').value, 10),
    valu: parseInt(document.getElementById('valu').value, 10),
    orie: parseInt(document.getElementById('orie').value, 10),
    rota: parseInt(document.getElementById('rota').value, 10),
    ss: document.getElementById('ssSelect').value,
  };
}

function applyStyles() {
  const v = getValues();
  const feature = v.ss ? `"${v.ss}" 1` : 'normal';

  document.querySelectorAll('.preview-glyph').forEach((el) => {
    const fontName = el.dataset.font;
    if (!fontName) return;
    const variation = getVariationForFont(fontName, v);
    el.style.fontFamily = '"Bertin-' + fontName + '", sans-serif';
    el.style.fontVariationSettings = variation;
    el.style.fontFeatureSettings = feature;
  });

  document.getElementById('sizeVal').textContent = v.size;
  document.getElementById('shapVal').textContent = v.shap;
  document.getElementById('valuVal').textContent = v.valu;
  document.getElementById('orieVal').textContent = v.orie;
  document.getElementById('rotaVal').textContent = v.rota;

  const companionVariation = getVariationForFont(companionFont, COMPANION_VALUES);
  const css = `font-family: "Bertin-${companionFont}", sans-serif;
font-variation-settings: ${companionVariation};
font-feature-settings: ${feature};`;
  document.getElementById('cssCode').textContent = css;

  updateCompanion();
}

function setPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  document.getElementById('size').value = p.size;
  document.getElementById('shap').value = p.shap;
  document.getElementById('valu').value = p.valu;
  document.getElementById('orie').value = p.orie;
  document.getElementById('rota').value = p.rota;
  applyStyles();
}

function setCompanionFont(fontName) {
  companionFont = fontName;
  updateCompanion();
}

function updateCompanion() {
  const el = document.getElementById('companionGlyph');
  const lbl = document.getElementById('companionLabel');
  if (!el || !lbl) return;
  const feature = document.getElementById('ssSelect').value ? `"${document.getElementById('ssSelect').value}" 1` : 'normal';
  const variation = getVariationForFont(companionFont, COMPANION_VALUES);
  el.style.fontFamily = `"Bertin-${companionFont}", sans-serif`;
  el.style.fontVariationSettings = variation;
  el.style.fontFeatureSettings = feature;
  lbl.textContent = COMPANION_LABELS[companionFont];
}

function randomizeCompanion() {
  const idx = Math.floor(Math.random() * FONT_NAMES.length);
  setCompanionFont(FONT_NAMES[idx]);
}

function randomizePreviewRandom() {
  const idx = Math.floor(Math.random() * FONT_NAMES.length);
  previewRandomFont = FONT_NAMES[idx];
  const el = document.getElementById('previewRandomGlyph');
  const lbl = document.getElementById('previewRandomLabel');
  if (el) el.dataset.font = previewRandomFont;
  if (lbl) lbl.textContent = COMPANION_LABELS[previewRandomFont];
  applyStyles();
}

const PRESETS = {
  dots: { size: 0, shap: 500, valu: 500, orie: 0, rota: 30 },
  'pattern-tight': { size: 1000, shap: 1000, valu: 500, orie: 0, rota: 180 },
  default: { size: 500, shap: 500, valu: 500, orie: 0, rota: 30 },
  'size-max': { size: 1000, shap: 500, valu: 500, orie: 0, rota: 30 },
  'shape-max': { size: 500, shap: 1000, valu: 500, orie: 0, rota: 30 },
};

function setView(mode) {
  document.getElementById('viewControls').classList.toggle('hidden', mode === 'grid');
  document.getElementById('viewPreview').classList.toggle('hidden', mode === 'grid');
  document.getElementById('viewGrid').classList.toggle('hidden', mode !== 'grid');
  document.getElementById('viewCss').classList.toggle('hidden', mode === 'grid');
  document.querySelectorAll('.view-toggle').forEach((b) => b.classList.toggle('active', b.dataset.view === mode));
  if (mode === 'grid') {
    renderAllStylesGrid();
  }
}

async function renderAllStylesGrid() {
  const grid = document.getElementById('allStylesGrid');
  grid.innerHTML = '';
  const ss = document.getElementById('ssSelect').value;
  const feature = ss ? `"${ss}" 1` : 'normal';

  for (const { font, label, axes } of NAMED_STYLES) {
    await loadFont(font);
    const section = document.createElement('div');
    section.className = 'grid-section';
    section.innerHTML = `<h3>${label}</h3>`;
    const row = document.createElement('div');
    row.className = 'grid-row';
    for (const a of axes) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      const variation = getVariationForFont(font, a);
      const span = document.createElement('span');
      span.className = 'grid-glyph';
      span.innerHTML = 'ABC<span class="char-d">D</span>';
      span.style.fontFamily = `"Bertin-${font}", sans-serif`;
      span.style.fontVariationSettings = variation;
      span.style.fontFeatureSettings = feature;
      const lbl = document.createElement('span');
      lbl.className = 'grid-label';
      lbl.textContent = Object.entries(a).map(([k, v]) => `${k}=${v}`).join(' ');
      cell.appendChild(span);
      cell.appendChild(lbl);
      row.appendChild(cell);
    }
    section.appendChild(row);
    grid.appendChild(section);
  }
}

document.getElementById('ssSelect').addEventListener('change', () => {
  applyStyles();
  if (document.getElementById('viewGrid').classList.contains('hidden') === false) {
    renderAllStylesGrid();
  }
});
['size', 'shap', 'valu', 'orie', 'rota'].forEach((id) => {
  document.getElementById(id).addEventListener('input', applyStyles);
});

document.querySelectorAll('.preset-btns button').forEach((btn) => {
  btn.addEventListener('click', () => setPreset(btn.dataset.preset));
});

document.querySelectorAll('.view-toggle').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

document.getElementById('companionBtn')?.addEventListener('click', randomizeCompanion);
document.getElementById('previewRandomBtn')?.addEventListener('click', randomizePreviewRandom);

Promise.all([
  loadFont('DotSizeVAR'),
  loadFont('DotValueVAR'),
  loadFont('DotShapeVAR'),
  loadFont('DotMultiVAR'),
  loadFont('DotOrientationVAR'),
  loadFont('DotRotationVAR'),
  loadFont('SquareSizeVAR'),
  loadFont('SquareValueVAR'),
  loadFont('SquareShapeVAR'),
  loadFont('SquareMultiVAR'),
  loadFont('SquareOrientationVAR'),
  loadFont('SquareRotationVAR'),
]).then(() => {
  const randomEl = document.getElementById('previewRandomGlyph');
  const randomLbl = document.getElementById('previewRandomLabel');
  if (randomEl) randomEl.dataset.font = previewRandomFont;
  if (randomLbl) randomLbl.textContent = COMPANION_LABELS[previewRandomFont];
  randomizeCompanion();
  applyStyles();
});
