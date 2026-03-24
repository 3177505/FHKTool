const CANVAS_W = Math.round(1080 * 297 / 210);
const CANVAS_H = 1080;
const POSTER_W = 595;
const POSTER_H = 842;
const LAYOUT_MARGIN = 48;
const BOTTOM_MARGIN = 48;
const CELL_PADDING = 4;
const FONT_SIZE_LOAD = 200;
const GLYPH_SIZE_FACTOR = 12;
const D_OFFSET_Y = 0.20;
const NUM_STAGES = 9;

const POINT_IDS = [
  'ID-L1-1', 'ID-L2-1', 'ID-L5-3', 'ID-L4-3', 'ID-L3-4', 'ID-C-3',
  'ID-R3-4', 'ID-R4-3', 'ID-R5-3', 'ID-R2-1', 'ID-R1-1'
];

const LEFT_CENTER_IDS = new Set(['ID-L1-1', 'ID-L2-1', 'ID-L5-3', 'ID-L4-3', 'ID-L3-4', 'ID-C-3']);
const RIGHT_IDS = new Set(['ID-R3-4', 'ID-R4-3', 'ID-R5-3', 'ID-R2-1', 'ID-R1-1']);

const SVG_PATH_TO_POINT_INDEX = [3, 0, 1, 2, 5, 7, 6, 10, 9, 8, 4];

const PALETTE_COLORS = [
  [0, 0, 0],
  [11, 24, 148],
  [218, 56, 50],
  [109, 214, 76],
  [249, 221, 74],
  [164, 164, 164]
];

const PALETTE_STORAGE_KEY = 'layout-palette';
const CANVAS_BG_STORAGE_KEY = 'layout-canvas-bg';

function normalizedCanvasBgHex(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHex(rgb[0], rgb[1], rgb[2]) : '#ffffff';
}

function loadCanvasBgFromStorage() {
  try {
    const raw = localStorage.getItem(CANVAS_BG_STORAGE_KEY);
    if (!raw) return null;
    return normalizedCanvasBgHex(raw);
  } catch {
    return null;
  }
}

function saveCanvasBgToStorage(hex) {
  try {
    localStorage.setItem(CANVAS_BG_STORAGE_KEY, hex);
  } catch (e) {
    console.warn('Failed to save canvas bg:', e);
  }
}

function syncCanvasChromeBg(state) {
  const bg = normalizedCanvasBgHex(state.canvasBg);
  document.getElementById('layout-canvas')?.style.setProperty('background', bg);
  document.getElementById('poster-canvas')?.style.setProperty('background', bg);
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  const h = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

function loadPaletteFromStorage() {
  try {
    const raw = localStorage.getItem(PALETTE_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== 6) return null;
    const valid = arr.every(c => Array.isArray(c) && c.length === 3 && c.every(n => typeof n === 'number' && n >= 0 && n <= 255));
    return valid ? arr : null;
  } catch {
    return null;
  }
}

function savePaletteToStorage(palette) {
  try {
    localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(palette));
  } catch (e) {
    console.warn('Failed to save palette:', e);
  }
}

const BERTIN_STYLE_AXES = [
  [0, 0, 500, 0, 30],
  [0, 1000, 500, 45, 30],
  [1000, 0, 500, 90, 30],
  [1000, 1000, 500, 135, 30],
  [0, 0, 500, 180, 30],
  [500, 500, 1000, 20, 30],
  [1000, 500, 500, 160, 30],
  [500, 1000, 500, 60, 30],
  [500, 500, 500, 120, 30]
];

import * as fontkit from 'fontkit';

const B = import.meta.env.BASE_URL;

function axesToVariationSettings(axes) {
  const [size, shap, valu, orie, rota] = axes;
  return { size, shap, valu, orie, rota };
}

async function loadFontKit(url) {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  return fontkit.create(buf);
}
const FONT_FILES = {
  DotSizeVAR: `${B}fonts/205TF-Bertin-DotSizeVAR.ttf`,
  DotValueVAR: `${B}fonts/205TF-Bertin-DotValueVAR.ttf`,
  DotShapeVAR: `${B}fonts/205TF-Bertin-DotShapeVAR.ttf`,
  DotMultiVAR: `${B}fonts/205TF-Bertin-DotMultiVAR.ttf`,
  DotOrientationVAR: `${B}fonts/205TF-Bertin-DotOrientationVAR.ttf`,
  DotRotationVAR: `${B}fonts/205TF-Bertin-DotRotationVAR.ttf`,
  SquareSizeVAR: `${B}fonts/205TF-Bertin-SquareSizeVAR.ttf`,
  SquareValueVAR: `${B}fonts/205TF-Bertin-SquareValueVAR.ttf`,
  SquareShapeVAR: `${B}fonts/205TF-Bertin-SquareShapeVAR.ttf`,
  SquareMultiVAR: `${B}fonts/205TF-Bertin-SquareMultiVAR.ttf`,
  SquareOrientationVAR: `${B}fonts/205TF-Bertin-SquareOrientationVAR.ttf`,
  SquareRotationVAR: `${B}fonts/205TF-Bertin-SquareRotationVAR.ttf`,
};

const FONT_NAMES = [
  'DotSizeVAR', 'DotValueVAR', 'DotShapeVAR', 'DotMultiVAR', 'DotOrientationVAR', 'DotRotationVAR',
  'SquareSizeVAR', 'SquareValueVAR', 'SquareShapeVAR', 'SquareMultiVAR', 'SquareOrientationVAR', 'SquareRotationVAR',
];

const FONT_NAMES_DOT = FONT_NAMES.slice(0, 6);
const FONT_NAMES_SQUARE = FONT_NAMES.slice(6, 12);

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

function getGlyphCharForId(id) {
  const dash = id.lastIndexOf('-');
  if (dash < 0) return 'A';
  const suffix = parseInt(id.substring(dash + 1), 10) || 1;
  if (suffix === 1) return 'A';
  if (suffix === 3) return 'C';
  if (suffix === 4) return 'D';
  return 'I';
}

function parseSvgPositions(svgText) {
  const pathPositions = [];
  const pathPattern = /d="M([\d.]+),([\d.]+)/g;
  let m;
  while ((m = pathPattern.exec(svgText)) !== null) {
    pathPositions.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  const positions = new Array(POINT_IDS.length);
  for (let i = 0; i < pathPositions.length && i < SVG_PATH_TO_POINT_INDEX.length; i++) {
    positions[SVG_PATH_TO_POINT_INDEX[i]] = [...pathPositions[i]];
  }
  const positionsToUse = positions.filter(Boolean).length === pathPositions.length
    ? positions.filter(Boolean)
    : pathPositions.sort((a, b) => a[0] - b[0]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positionsToUse) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  const svgWidth = maxX - minX + 4;
  const svgHeight = maxY - minY + 4;
  for (const p of positionsToUse) {
    p[0] -= minX;
    p[1] -= minY;
  }
  return { positions: positionsToUse, svgWidth, svgHeight };
}

function loadFont(name) {
  return new Promise((resolve, reject) => {
    const url = FONT_FILES[name];
    if (!url) return resolve();
    const font = new FontFace('Bertin-' + name, `url(${url})`, { style: 'normal', weight: '400' });
    font.load().then(() => {
      document.fonts.add(font);
      resolve();
    }).catch(reject);
  });
}

function getVariationString(axes) {
  const [size, shap, valu, orie, rota] = axes;
  return `"size" ${size}, "shap" ${shap}, "valu" ${valu}, "orie" ${orie}, "rota" ${rota}`;
}

function measureGlyph(char, fontName, variation, feature) {
  const span = document.createElement('span');
  span.textContent = char;
  span.style.cssText = `
    position: absolute;
    visibility: hidden;
    font-family: "Bertin-${fontName}", sans-serif;
    font-size: ${FONT_SIZE_LOAD}px;
    font-variation-settings: ${variation};
    font-feature-settings: ${feature};
    white-space: nowrap;
  `;
  document.body.appendChild(span);
  const w = span.offsetWidth;
  const h = span.offsetHeight;
  document.body.removeChild(span);
  return { w, h };
}

function measureGlyphNoFeature(char, fontName, variation) {
  return measureGlyph(char, fontName, variation, 'normal');
}

function generateRandomAxes() {
  return Array.from({ length: NUM_STAGES }, () => [
    Math.floor(Math.random() * 1001),
    Math.floor(Math.random() * 1001),
    Math.floor(Math.random() * 1001),
    Math.floor(Math.random() * 181),
    Math.floor(Math.random() * 181)
  ]);
}

function generateExtremeAxes() {
  const pickExtreme = (min, max) => Math.random() < 0.5 ? min : max;
  return Array.from({ length: NUM_STAGES }, () => [
    pickExtreme(0, 1000),
    pickExtreme(0, 1000),
    pickExtreme(0, 1000),
    pickExtreme(0, 180),
    pickExtreme(0, 180)
  ]);
}

function generateOrientationPresetAxes() {
  return [
    [0, 0, 500, 0, 30],
    [0, 0, 500, 180, 30],
    [0, 1000, 500, 0, 30],
    [0, 1000, 500, 180, 30],
    [1000, 0, 500, 0, 30],
    [1000, 0, 500, 180, 30],
    [1000, 1000, 500, 0, 30],
    [1000, 1000, 500, 180, 30],
    [800, 800, 500, 90, 30]
  ];
}

function getAxesForStage(state, stageIndex) {
  const pool = state.randomizeStyling ? state.axesPool : BERTIN_STYLE_AXES;
  return pool[stageIndex % pool.length];
}

function createStageIndices(mode, numPoints, pointIds) {
  const stageIndices1 = new Array(numPoints);
  const stageIndices2 = new Array(numPoints);
  if (mode === 'unify') {
    const s1 = Math.floor(Math.random() * NUM_STAGES);
    let s2 = Math.floor(Math.random() * NUM_STAGES);
    while (NUM_STAGES > 1 && s2 === s1) s2 = Math.floor(Math.random() * NUM_STAGES);
    for (let i = 0; i < numPoints; i++) {
      stageIndices1[i] = s1;
      stageIndices2[i] = s2;
    }
  } else if (mode === 'symmetrical') {
    const s1 = Math.floor(Math.random() * NUM_STAGES);
    let s2 = Math.floor(Math.random() * NUM_STAGES);
    while (NUM_STAGES > 1 && s2 === s1) s2 = Math.floor(Math.random() * NUM_STAGES);
    const s3 = Math.floor(Math.random() * NUM_STAGES);
    let s4 = Math.floor(Math.random() * NUM_STAGES);
    while (NUM_STAGES > 1 && s4 === s3) s4 = Math.floor(Math.random() * NUM_STAGES);
    for (let i = 0; i < numPoints; i++) {
      const id = pointIds[i] || '';
      if (LEFT_CENTER_IDS.has(id)) {
        stageIndices1[i] = s1;
        stageIndices2[i] = s2;
      } else {
        stageIndices1[i] = s3;
        stageIndices2[i] = s4;
      }
    }
  } else if (mode === 'unifyCuts') {
    for (let i = 0; i < numPoints; i++) {
      const s = Math.floor(Math.random() * NUM_STAGES);
      stageIndices1[i] = s;
      stageIndices2[i] = s;
    }
  } else {
    for (let i = 0; i < numPoints; i++) {
      stageIndices1[i] = Math.floor(Math.random() * NUM_STAGES);
      stageIndices2[i] = Math.floor(Math.random() * NUM_STAGES);
      while (NUM_STAGES > 1 && stageIndices2[i] === stageIndices1[i]) {
        stageIndices2[i] = Math.floor(Math.random() * NUM_STAGES);
      }
    }
  }
  return { stageIndices1, stageIndices2 };
}

function updateLayoutFooter(state, stageIndices1, stageIndices2) {
  const fontInfoEl1 = document.getElementById('layout-font-info-1');
  const fontInfoEl2 = document.getElementById('layout-font-info-2');
  const cssEl1 = document.getElementById('layout-css-layer1');
  const cssEl2 = document.getElementById('layout-css-layer2');
  if (!fontInfoEl1 && !fontInfoEl2 && !cssEl1 && !cssEl2) return;
  if (!stageIndices1.length) return;

  const { fontName1, fontName2, useCutout, layer1Visible, layer2Visible, randomizeStyling, orientationAxesMode, fontFeatureSettings } = state;
  const axes1 = getAxesForStage(state, stageIndices1[0] % NUM_STAGES);
  const axes2 = getAxesForStage(state, stageIndices2[0] % NUM_STAGES);
  const variation1 = getVariationString(axes1);
  const variation2 = getVariationString(axes2);
  const feature = fontFeatureSettings || '"ss04" 1';

  const modeParts1 = [];
  if (useCutout) modeParts1.push('výřez');
  if (!layer1Visible) modeParts1.push('vypnuto');
  if (randomizeStyling) modeParts1.push(orientationAxesMode ? 'os orientace' : 'náhodné osy');
  const modeStr1 = modeParts1.length ? ` · ${modeParts1.join(', ')}` : '';

  const modeParts2 = [];
  if (useCutout) modeParts2.push('výřez');
  if (!layer2Visible) modeParts2.push('vypnuto');
  if (randomizeStyling) modeParts2.push(orientationAxesMode ? 'os orientace' : 'náhodné osy');
  const modeStr2 = modeParts2.length ? ` · ${modeParts2.join(', ')}` : '';

  if (fontInfoEl1) fontInfoEl1.textContent = `${COMPANION_LABELS[fontName1]} · Vrstva 1 · ss04 Pattern${modeStr1}`;
  if (fontInfoEl2) fontInfoEl2.textContent = `${COMPANION_LABELS[fontName2]} · Vrstva 2 · ss04 Pattern${modeStr2}`;

  const cssBlock = (fontName, variation) => `font-family: "Bertin-${fontName}", sans-serif;
font-variation-settings: ${variation};
font-feature-settings: ${feature};`;

  if (cssEl1) cssEl1.textContent = layer1Visible ? cssBlock(fontName1, variation1) : '—';
  if (cssEl2) cssEl2.textContent = layer2Visible ? cssBlock(fontName2, variation2) : '—';
}

function renderLayoutToCanvas(state, stageIndices1, stageIndices2) {
  const { fontName1, fontName2, logo1Color, logo2Color, pointIds, numPoints, screenX, screenY, availCellW, availCellH, cellHeight, layer1Visible, layer2Visible, fontFeatureSettings } = state;
  const feature = fontFeatureSettings || '"ss04" 1';

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  const canvasBg = normalizedCanvasBgHex(state.canvasBg);
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const layer1Canvas = document.createElement('canvas');
  layer1Canvas.width = CANVAS_W;
  layer1Canvas.height = CANVAS_H;
  const ctx1 = layer1Canvas.getContext('2d');
  ctx1.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx1.globalAlpha = 1;

  const layer2Canvas = document.createElement('canvas');
  layer2Canvas.width = CANVAS_W;
  layer2Canvas.height = CANVAS_H;
  const ctx2 = layer2Canvas.getContext('2d');
  ctx2.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx2.globalAlpha = 1;

  const drawGlyph = (gCtx, color, fontName, variation, fitScale, centerX, centerY, ch) => {
    const fontFamily = `"Bertin-${fontName}", sans-serif`;
    gCtx.save();
    gCtx.translate(centerX, centerY);
    gCtx.scale(fitScale, fitScale);
    gCtx.font = `${FONT_SIZE_LOAD}px ${fontFamily}`;
    gCtx.fontVariationSettings = variation;
    gCtx.fontFeatureSettings = feature;
    gCtx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    gCtx.textAlign = 'center';
    gCtx.textBaseline = 'middle';
    gCtx.fillText(ch, 0, 0);
    gCtx.restore();
  };

  for (let i = 0; i < numPoints; i++) {
    const stage1 = stageIndices1[i] % NUM_STAGES;
    const stage2 = stageIndices2[i] % NUM_STAGES;
    const axes1 = getAxesForStage(state, stage1);
    const axes2 = getAxesForStage(state, stage2);
    const variation1 = getVariationString(axes1);
    const variation2 = getVariationString(axes2);
    const char = pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I';

    const { w: w1, h: h1 } = measureGlyph(char, fontName1, variation1, feature);
    const { w: w2, h: h2 } = measureGlyph(char, fontName2, variation2, feature);

    const fitScale1 = Math.min(availCellW / w1, availCellH / h1);
    const fitScale2 = Math.min(availCellW / w2, availCellH / h2);

    const pointId = pointIds[i] || '';
    const isDAtL3R3 = pointId === 'ID-L3-4' || pointId === 'ID-R3-4';
    const offsetY = isDAtL3R3 ? cellHeight * D_OFFSET_Y : 0;
    const centerX = screenX[i];
    const centerY = screenY[i] + offsetY;

    if (layer1Visible) drawGlyph(ctx1, logo1Color, fontName1, variation1, fitScale1, centerX, centerY, char);
    if (layer2Visible) drawGlyph(ctx2, logo2Color, fontName2, variation2, fitScale2, centerX, centerY, char);
  }

  ctx.drawImage(layer1Canvas, 0, 0);
  ctx.drawImage(layer2Canvas, 0, 0);

  const data1 = ctx1.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const data2 = ctx2.getImageData(0, 0, CANVAS_W, CANVAS_H);
  const overlapCanvas = document.createElement('canvas');
  overlapCanvas.width = CANVAS_W;
  overlapCanvas.height = CANVAS_H;
  const overlapCtx = overlapCanvas.getContext('2d');
  const overlapData = overlapCtx.createImageData(CANVAS_W, CANVAS_H);

  const overlapThreshold = 60;
  for (let i = 0; i < data1.data.length; i += 4) {
    const a1 = layer1Visible ? data1.data[i + 3] : 0;
    const a2 = layer2Visible ? data2.data[i + 3] : 0;
    if (a1 > overlapThreshold && a2 > overlapThreshold) {
      overlapData.data[i] = 255;
      overlapData.data[i + 1] = 255;
      overlapData.data[i + 2] = 255;
      overlapData.data[i + 3] = 255;
    }
  }

  overlapCtx.putImageData(overlapData, 0, 0);
  ctx.drawImage(overlapCanvas, 0, 0);
  return canvas;
}

function renderLayout(state, stageIndices1, stageIndices2) {
  const { container, fontName1, fontName2, logo1Color, logo2Color, pointIds, numPoints, screenX, screenY, availCellW, availCellH, cellHeight, layer1Visible, layer2Visible, useCutout, fontFeatureSettings } = state;
  const feature = fontFeatureSettings || '"ss04" 1';
  const canvasBg = normalizedCanvasBgHex(state.canvasBg);

  const oldWrapper = container.querySelector('.layout-wrapper');
  if (oldWrapper) oldWrapper.remove();

  if (useCutout) {
    const canvas = renderLayoutToCanvas(state, stageIndices1, stageIndices2);
    canvas.className = 'layout-wrapper';
    canvas.style.cssText = `display: block; background: ${canvasBg};`;
    container.appendChild(canvas);
    scaleLayoutToFit(container);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'layout-wrapper';
  wrapper.style.cssText = `position: relative; width: ${CANVAS_W}px; height: ${CANVAS_H}px; background: ${canvasBg};`;

  const renderLayoutDebug = [];

  const layer1 = document.createElement('div');
  layer1.className = 'layout-layer1';
  layer1.style.cssText = `position: absolute; inset: 0;${layer1Visible === false ? ' visibility: hidden;' : ''}`;
  const layer2 = document.createElement('div');
  layer2.className = 'layout-layer2';
  layer2.style.cssText = `position: absolute; inset: 0; mix-blend-mode: multiply;${layer2Visible === false ? ' visibility: hidden;' : ''}`;

  for (let i = 0; i < numPoints; i++) {
    const stage1 = stageIndices1[i] % NUM_STAGES;
    const stage2 = stageIndices2[i] % NUM_STAGES;
    const axes1 = getAxesForStage(state, stage1);
    const axes2 = getAxesForStage(state, stage2);
    const variation1 = getVariationString(axes1);
    const variation2 = getVariationString(axes2);
    const char = pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I';

    const { w: w1, h: h1 } = measureGlyph(char, fontName1, variation1, feature);
    const { w: w2, h: h2 } = measureGlyph(char, fontName2, variation2, feature);

    const fitScale1 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w1, availCellH / h1);
    const fitScale2 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w2, availCellH / h2);

    const pointId = pointIds[i] || '';
    const isDAtL3R3 = pointId === 'ID-L3-4' || pointId === 'ID-R3-4';
    const offsetY = isDAtL3R3 ? cellHeight * D_OFFSET_Y : 0;
    const translateY = offsetY > 0 ? `calc(-50% + ${offsetY}px)` : '-50%';

    renderLayoutDebug.push({
      i,
      pointId,
      char,
      left: screenX[i],
      top: screenY[i],
      offsetY,
      effectiveCenterY: screenY[i] + offsetY,
      translateY,
      fitScale1,
      fitScale2
    });

    const span1 = document.createElement('span');
    span1.textContent = char;
    span1.dataset.debugIdx = String(i);
    span1.style.cssText = `
      position: absolute;
      left: ${screenX[i]}px;
      top: ${screenY[i]}px;
      transform: translate(-50%, ${translateY}) scale(${fitScale1});
      transform-origin: center center;
      font-family: "Bertin-${fontName1}", sans-serif;
      font-size: ${FONT_SIZE_LOAD}px;
      font-variation-settings: ${variation1};
      font-feature-settings: ${feature};
      color: rgb(${logo1Color[0]}, ${logo1Color[1]}, ${logo1Color[2]});
      line-height: 1;
      pointer-events: none;
    `;
    layer1.appendChild(span1);

    const span2 = document.createElement('span');
    span2.textContent = char;
    span2.dataset.debugIdx = String(i);
    span2.style.cssText = `
      position: absolute;
      left: ${screenX[i]}px;
      top: ${screenY[i]}px;
      transform: translate(-50%, ${translateY}) scale(${fitScale2});
      transform-origin: center center;
      font-family: "Bertin-${fontName2}", sans-serif;
      font-size: ${FONT_SIZE_LOAD}px;
      font-variation-settings: ${variation2};
      font-feature-settings: ${feature};
      color: rgb(${logo2Color[0]}, ${logo2Color[1]}, ${logo2Color[2]});
      line-height: 1;
      pointer-events: none;
    `;
    layer2.appendChild(span2);
  }

  wrapper.appendChild(layer1);
  wrapper.appendChild(layer2);
  container.appendChild(wrapper);
  scaleLayoutToFit(container);

  requestAnimationFrame(() => {
    const wr = wrapper.getBoundingClientRect();
    const scaleX = wr.width / CANVAS_W;
    const scaleY = wr.height / CANVAS_H;
    const spanDebug = [];
    layer1.querySelectorAll('[data-debug-idx]').forEach((span) => {
      const i = parseInt(span.dataset.debugIdx, 10);
      const set = renderLayoutDebug[i];
      const r = span.getBoundingClientRect();
      const setLeft = parseFloat(span.style.left) || 0;
      const setTop = parseFloat(span.style.top) || 0;
      const relX = r.x - wr.x;
      const relY = r.y - wr.y;
      const centerX = (relX + r.width / 2) / scaleX;
      const centerY = (relY + r.height / 2) / scaleY;
      const expectedCenterX = setLeft;
      const expectedCenterY = (set?.effectiveCenterY ?? setTop);
      const diffX = centerX - expectedCenterX;
      const diffY = centerY - expectedCenterY;
      const row = {
        i,
        pointId: set?.pointId,
        char: set?.char,
        set: { left: setLeft, top: setTop },
        expectedCenter: { x: expectedCenterX, y: expectedCenterY },
        actualCenter: { x: centerX, y: centerY },
        diff: { x: diffX, y: diffY },
        width: r.width,
        height: r.height
      };
      spanDebug.push(row);
    });
    console.log('[Span position debug] Wrapper scale:', { scaleX, scaleY }, 'Canvas:', CANVAS_W, 'x', CANVAS_H);
    console.log('[Span position debug] Expected center vs actual center (in canvas space) per span:', spanDebug);
    console.table(spanDebug.map((r) => ({
      i: r.i,
      pointId: r.pointId,
      'exp.centerX': r.expectedCenter.x.toFixed(1),
      'exp.centerY': r.expectedCenter.y.toFixed(1),
      'act.centerX': r.actualCenter.x.toFixed(1),
      'act.centerY': r.actualCenter.y.toFixed(1),
      'diff.x': r.diff.x.toFixed(1),
      'diff.y': r.diff.y.toFixed(1)
    })));
    const layoutCanvas = container.getBoundingClientRect();
    const wrapperComputed = window.getComputedStyle(wrapper);
    const firstSpan = layer1.querySelector('[data-debug-idx="0"]');
    const firstSpanRect = firstSpan ? firstSpan.getBoundingClientRect() : null;
    const layoutContext = {
      view: 'font',
      layoutCanvas: { x: layoutCanvas.x, y: layoutCanvas.y, width: layoutCanvas.width, height: layoutCanvas.height },
      wrapper: { x: wr.x, y: wr.y, width: wr.width, height: wr.height, transform: wrapperComputed.transform },
      wrapperOffsetFromCanvas: { top: wr.y - layoutCanvas.y, left: wr.x - layoutCanvas.x },
      scale: { scaleX, scaleY },
      firstElement: firstSpanRect ? {
        viewport: { x: firstSpanRect.x, y: firstSpanRect.y },
        fromCanvasTop: firstSpanRect.y - layoutCanvas.y,
        fromWrapperTop: firstSpanRect.y - wr.y,
        centerFromCanvasTop: (firstSpanRect.y - layoutCanvas.y + firstSpanRect.height / 2)
      } : null
    };
    console.log('[Layout context - FONT view]', layoutContext);
    if (typeof window !== 'undefined') window.__spanPositionDebug = { spanDebug, wrapperRect: wr, scaleX, scaleY, renderLayoutDebug, layoutContext };
  });
}

function scaleLayoutToFit(container) {
  const wrapper = container.querySelector('.layout-wrapper');
  if (!wrapper) return;
  const availW = container.clientWidth || 1;
  const availH = container.clientHeight || 1;
  const scaleW = availW / CANVAS_W;
  const scaleH = availH / CANVAS_H;
  let scale = Math.max(scaleW, scaleH);
  if (scale > 1) scale = 1;
  wrapper.style.transform = scale < 1 ? `scale(${scale})` : 'none';
  wrapper.style.transformOrigin = 'center center';
}

const POSTER_MARGIN = 48;
const POSTER_FONT_SIZE = 400;

function posterFeatureKeyToCss(key) {
  if (!key || key === 'normal') return 'normal';
  return `"${key}" 1`;
}

function posterFeatureKeyToFontKit(key) {
  if (!key || key === 'normal') return {};
  return { [key]: 1 };
}

function renderPoster(state, stageIndices1, stageIndices2, posterLetter, posterNumber, posterFeatureKey) {
  const posterContainer = document.getElementById('poster-canvas');
  if (!posterContainer) return;

  const { fontName1, fontName2, logo1Color, logo2Color, layer1Visible, layer2Visible } = state;
  const feature = posterFeatureKeyToCss(posterFeatureKey);

  const stage1 = stageIndices1[0] % NUM_STAGES;
  const stage2 = stageIndices2[0] % NUM_STAGES;
  const axes1 = getAxesForStage(state, stage1);
  const axes2 = getAxesForStage(state, stage2);
  const variation1 = getVariationString(axes1);
  const variation2 = getVariationString(axes2);

  const letter = String(posterLetter || 'S').charAt(0);
  const number = String(posterNumber || '1').charAt(0);

  const { w: w1, h: h1 } = measureGlyph(letter, fontName1, variation1, feature);
  const { w: w2, h: h2 } = measureGlyph(number, fontName2, variation2, feature);

  const availW = POSTER_W - 2 * POSTER_MARGIN;
  const availH = POSTER_H - 2 * POSTER_MARGIN;
  const maxW = Math.max(w1, w2);
  const maxH = Math.max(h1, h2);
  const fitScale = Math.min(availW / maxW, availH / maxH) * (FONT_SIZE_LOAD / POSTER_FONT_SIZE);

  const centerX = POSTER_W / 2;
  const centerY = POSTER_H / 2;

  const oldWrapper = posterContainer.querySelector('.poster-wrapper');
  if (oldWrapper) oldWrapper.remove();

  const canvasBg = normalizedCanvasBgHex(state.canvasBg);
  const wrapper = document.createElement('div');
  wrapper.className = 'poster-wrapper';
  wrapper.style.cssText = `position: relative; width: ${POSTER_W}px; height: ${POSTER_H}px; background: ${canvasBg};`;

  const layer1 = document.createElement('div');
  layer1.className = 'poster-layer1';
  layer1.style.cssText = `position: absolute; inset: 0;${layer1Visible === false ? ' visibility: hidden;' : ''}`;
  const layer2 = document.createElement('div');
  layer2.className = 'poster-layer2';
  layer2.style.cssText = `position: absolute; inset: 0; mix-blend-mode: multiply;${layer2Visible === false ? ' visibility: hidden;' : ''}`;

  const span1 = document.createElement('span');
  span1.textContent = letter;
  span1.style.cssText = `
    position: absolute;
    left: ${centerX}px;
    top: ${centerY}px;
    transform: translate(-50%, -50%) scale(${fitScale});
    transform-origin: center center;
    font-family: "Bertin-${fontName1}", sans-serif;
    font-size: ${POSTER_FONT_SIZE}px;
    font-variation-settings: ${variation1};
    font-feature-settings: ${feature};
    color: rgb(${logo1Color[0]}, ${logo1Color[1]}, ${logo1Color[2]});
    line-height: 1;
    pointer-events: none;
  `;
  layer1.appendChild(span1);

  const span2 = document.createElement('span');
  span2.textContent = number;
  span2.style.cssText = `
    position: absolute;
    left: ${centerX}px;
    top: ${centerY}px;
    transform: translate(-50%, -50%) scale(${fitScale});
    transform-origin: center center;
    font-family: "Bertin-${fontName2}", sans-serif;
    font-size: ${POSTER_FONT_SIZE}px;
    font-variation-settings: ${variation2};
    font-feature-settings: ${feature};
    color: rgb(${logo2Color[0]}, ${logo2Color[1]}, ${logo2Color[2]});
    line-height: 1;
    pointer-events: none;
  `;
  layer2.appendChild(span2);

  wrapper.appendChild(layer1);
  wrapper.appendChild(layer2);
  posterContainer.appendChild(wrapper);
  scalePosterToFit(posterContainer);
}

function scalePosterToFit(container) {
  if (!container) return;
  const wrapper = container.querySelector('.poster-wrapper');
  if (!wrapper) return;
  const availW = container.clientWidth || 1;
  const availH = container.clientHeight || 1;
  const scaleW = availW / POSTER_W;
  const scaleH = availH / POSTER_H;
  let scale = Math.max(scaleW, scaleH);
  if (scale > 1) scale = 1;
  wrapper.style.transform = scale < 1 ? `scale(${scale})` : 'none';
  wrapper.style.transformOrigin = 'center center';
}

function renderPosterToCanvas(state, stageIndices1, stageIndices2, posterLetter, posterNumber, posterFeatureKey) {
  const { fontName1, fontName2, logo1Color, logo2Color, layer1Visible, layer2Visible } = state;
  const feature = posterFeatureKeyToCss(posterFeatureKey);

  const stage1 = stageIndices1[0] % NUM_STAGES;
  const stage2 = stageIndices2[0] % NUM_STAGES;
  const axes1 = getAxesForStage(state, stage1);
  const axes2 = getAxesForStage(state, stage2);
  const variation1 = getVariationString(axes1);
  const variation2 = getVariationString(axes2);

  const letter = String(posterLetter || 'S').charAt(0);
  const number = String(posterNumber || '1').charAt(0);

  const { w: w1, h: h1 } = measureGlyph(letter, fontName1, variation1, feature);
  const { w: w2, h: h2 } = measureGlyph(number, fontName2, variation2, feature);

  const availW = POSTER_W - 2 * POSTER_MARGIN;
  const availH = POSTER_H - 2 * POSTER_MARGIN;
  const maxW = Math.max(w1, w2);
  const maxH = Math.max(h1, h2);
  const fitScale = Math.min(availW / maxW, availH / maxH) * (FONT_SIZE_LOAD / POSTER_FONT_SIZE);

  const centerX = POSTER_W / 2;
  const centerY = POSTER_H / 2;

  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d');
  const canvasBg = normalizedCanvasBgHex(state.canvasBg);
  ctx.fillStyle = canvasBg;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  const drawGlyph = (gCtx, color, fontName, variation, fitScale, cx, cy, ch) => {
    const fontFamily = `"Bertin-${fontName}", sans-serif`;
    gCtx.save();
    gCtx.translate(cx, cy);
    gCtx.scale(fitScale, fitScale);
    gCtx.font = `${POSTER_FONT_SIZE}px ${fontFamily}`;
    gCtx.fontVariationSettings = variation;
    gCtx.fontFeatureSettings = feature;
    gCtx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    gCtx.textAlign = 'center';
    gCtx.textBaseline = 'middle';
    gCtx.fillText(ch, 0, 0);
    gCtx.restore();
  };

  if (layer1Visible) drawGlyph(ctx, logo1Color, fontName1, variation1, fitScale, centerX, centerY, letter);
  if (layer2Visible) {
    ctx.globalCompositeOperation = 'multiply';
    drawGlyph(ctx, logo2Color, fontName2, variation2, fitScale, centerX, centerY, number);
    ctx.globalCompositeOperation = 'source-over';
  }
  return canvas;
}

function layoutTimestamp() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '_' +
    String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function svgToPngBlob(svgString, width, height, bgHex = '#ffffff') {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = normalizedCanvasBgHex(bgHex);
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url);
        resolve(b);
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG load failed'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve));
}

async function saveLayoutAndPosterPng(shapes, canvasBg) {
  if (!shapes) return;
  const bg = normalizedCanvasBgHex(canvasBg);
  const ts = layoutTimestamp();
  const layoutBlob = await svgToPngBlob(shapes.layoutSvg, CANVAS_W, CANVAS_H, bg);
  const posterBlob = await svgToPngBlob(shapes.posterSvg, POSTER_W, POSTER_H, bg);
  if (layoutBlob) downloadBlob(layoutBlob, `layout_${ts}.png`);
  if (posterBlob) downloadBlob(posterBlob, `poster_${ts}.png`);
}

function escapeXmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getGlyphPathFromFontKit(font, char, fontSize, axes, openTypeFeatures) {
  try {
    let fontVar = font;
    if (axes && font.directory?.tables?.fvar) {
      const settings = axesToVariationSettings(axes);
      fontVar = font.getVariation(settings);
    }
    const features = openTypeFeatures && typeof openTypeFeatures === 'object' ? openTypeFeatures : {};
    const run = fontVar.layout(char, features);
    if (!run.glyphs.length) return null;
    const glyph = run.glyphs[0];
    if (!glyph.path) return null;
    const scaledPath = glyph.getScaledPath(fontSize);
    const pathData = scaledPath.toSVG();
    if (!pathData || pathData.trim() === '') return null;
    const box = scaledPath.bbox || scaledPath.cbox;
    if (!box) return null;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    return { pathData, cx, cy, width, height };
  } catch {
    return null;
  }
}

function convertLayoutToShapes(font1, font2, state, stageIndices1, stageIndices2) {
  const { fontName1, fontName2, logo1Color, logo2Color, pointIds, numPoints, screenX, screenY, availCellW, availCellH, cellHeight, layer1Visible, layer2Visible } = state;
  const feature = state.fontFeatureSettings || '"ss04" 1';
  const bgHex = normalizedCanvasBgHex(state.canvasBg);

  let layer1Paths = '';
  let layer2Paths = '';
  const debugBefore = [];
  const debugAfter = [];

  for (let i = 0; i < numPoints; i++) {
    const stage1 = stageIndices1[i] % NUM_STAGES;
    const stage2 = stageIndices2[i] % NUM_STAGES;
    const axes1 = getAxesForStage(state, stage1);
    const axes2 = getAxesForStage(state, stage2);
    const variation1 = getVariationString(axes1);
    const variation2 = getVariationString(axes2);
    const char = pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I';

    const { w: w1, h: h1 } = measureGlyph(char, fontName1, variation1, feature);
    const { w: w2, h: h2 } = measureGlyph(char, fontName2, variation2, feature);

    const fitScale1 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w1, availCellH / h1);
    const fitScale2 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w2, availCellH / h2);

    const pointId = pointIds[i] || '';
    const isDAtL3R3 = pointId === 'ID-L3-4' || pointId === 'ID-R3-4';
    const offsetY = isDAtL3R3 ? cellHeight * D_OFFSET_Y : 0;
    const posY = screenY[i] + offsetY;

    debugBefore.push({
      i,
      pointId,
      char,
      screenX: screenX[i],
      screenY: screenY[i],
      offsetY,
      posY,
      translateY: offsetY > 0 ? `calc(-50% + ${offsetY}px)` : '-50%',
      fitScale1,
      fitScale2,
      w1,
      h1,
      w2,
      h2
    });

    const c1 = `rgb(${logo1Color[0]},${logo1Color[1]},${logo1Color[2]})`;
    const c2 = `rgb(${logo2Color[0]},${logo2Color[1]},${logo2Color[2]})`;

    const glyph1 = getGlyphPathFromFontKit(font1, char, FONT_SIZE_LOAD, axes1, { ss04: 1 });
    const glyph2 = getGlyphPathFromFontKit(font2, char, FONT_SIZE_LOAD, axes2, { ss04: 1 });

    debugAfter.push({
      i,
      pointId,
      char,
      svgPosX: screenX[i],
      svgPosY: posY,
      fitScale1,
      fitScale2,
      glyph1: glyph1 ? { cx: glyph1.cx, cy: glyph1.cy, width: glyph1.width, height: glyph1.height } : null,
      glyph2: glyph2 ? { cx: glyph2.cx, cy: glyph2.cy, width: glyph2.width, height: glyph2.height } : null
    });

    if (layer1Visible && glyph1) {
      const tr = `translate(${screenX[i]},${posY}) scale(${fitScale1}) scale(1,-1) translate(${-glyph1.cx},${-glyph1.cy})`;
      layer1Paths += `  <path data-idx="${i}" d="${escapeXmlAttr(glyph1.pathData)}" fill="${c1}" transform="${tr}"/>\n`;
    }
    if (layer2Visible && glyph2) {
      const tr = `translate(${screenX[i]},${posY}) scale(${fitScale2}) scale(1,-1) translate(${-glyph2.cx},${-glyph2.cy})`;
      layer2Paths += `  <path data-idx="${i}" d="${escapeXmlAttr(glyph2.pathData)}" fill="${c2}" transform="${tr}"/>\n`;
    }
  }

  const debugData = {
    before: debugBefore,
    after: debugAfter,
    canvas: { CANVAS_W, CANVAS_H },
    geometry: { availCellW, availCellH, cellHeight }
  };
  console.log('[Layout AFTER - SVG export] Position calculation:', debugAfter);
  console.log('[Layout conversion] Canvas:', debugData.canvas, 'Geometry:', debugData.geometry);
  if (typeof window !== 'undefined') {
    window.__layoutConversionDebug = debugData;
    if (window.__layoutRenderDebug) {
      console.log('[Layout COMPARISON] Render vs Export:', {
        render: window.__layoutRenderDebug.renderLayout,
        export: debugAfter
      });
    }
  }

  const useCutout = state.cutout && layer1Paths && layer2Paths;
  if (useCutout) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="100%" height="100%" fill="${bgHex}"/>
<defs>
  <g id="layout-layer1">\n${layer1Paths}</g>
  <g id="layout-layer2">\n${layer2Paths}</g>
  <filter id="layout-cutout" x="-10%" y="-10%" width="120%" height="120%">
    <feImage xlink:href="#layout-layer1" result="l1"/>
    <feImage xlink:href="#layout-layer2" result="l2"/>
    <feComposite in="l1" in2="l2" operator="in" result="overlap"/>
    <feFlood flood-color="${bgHex}" result="white"/>
    <feComposite in="white" in2="overlap" operator="in" result="whiteOverlap"/>
    <feBlend in="l1" in2="l2" mode="normal" result="combined"/>
    <feComposite in="whiteOverlap" in2="combined" operator="over" result="final"/>
  </filter>
</defs>
<rect width="100%" height="100%" fill="none" filter="url(#layout-cutout)"/>
</svg>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="${bgHex}"/>
<g id="layout-content">
<g id="layer1">\n${layer1Paths}</g>
<g id="layer2" style="mix-blend-mode:multiply">\n${layer2Paths}</g>
</g>
</svg>`;
}

function convertPosterToShapes(font1, font2, state, stageIndices1, stageIndices2, posterLetter, posterNumber, posterFeatureKey) {
  const { fontName1, fontName2, logo1Color, logo2Color, layer1Visible, layer2Visible } = state;
  const bgHex = normalizedCanvasBgHex(state.canvasBg);
  const feature = posterFeatureKeyToCss(posterFeatureKey);
  const posterFk = posterFeatureKeyToFontKit(posterFeatureKey);

  const stage1 = stageIndices1[0] % NUM_STAGES;
  const stage2 = stageIndices2[0] % NUM_STAGES;
  const axes1 = getAxesForStage(state, stage1);
  const axes2 = getAxesForStage(state, stage2);
  const variation1 = getVariationString(axes1);
  const variation2 = getVariationString(axes2);

  const letter = String(posterLetter || 'S').charAt(0);
  const number = String(posterNumber || '1').charAt(0);

  const availW = POSTER_W - 2 * POSTER_MARGIN;
  const availH = POSTER_H - 2 * POSTER_MARGIN;
  const centerX = POSTER_W / 2;
  const centerY = POSTER_H / 2;

  const { w: w1, h: h1 } = measureGlyph(letter, fontName1, variation1, feature);
  const { w: w2, h: h2 } = measureGlyph(number, fontName2, variation2, feature);
  const maxW = Math.max(w1, w2);
  const maxH = Math.max(h1, h2);
  const fitScale = Math.min(availW / maxW, availH / maxH) * (FONT_SIZE_LOAD / POSTER_FONT_SIZE);

  const glyph1 = getGlyphPathFromFontKit(font1, letter, POSTER_FONT_SIZE, axes1, posterFk);
  const glyph2 = getGlyphPathFromFontKit(font2, number, POSTER_FONT_SIZE, axes2, posterFk);

  const c1 = `rgb(${logo1Color[0]},${logo1Color[1]},${logo1Color[2]})`;
  const c2 = `rgb(${logo2Color[0]},${logo2Color[1]},${logo2Color[2]})`;

  let layer1Paths = '';
  let layer2Paths = '';

  if (layer1Visible && glyph1) {
    const tr = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyph1.cx},${-glyph1.cy})`;
    layer1Paths = `  <path d="${escapeXmlAttr(glyph1.pathData)}" fill="${c1}" transform="${tr}"/>\n`;
  }
  if (layer2Visible && glyph2) {
    const tr = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyph2.cx},${-glyph2.cy})`;
    layer2Paths = `  <path d="${escapeXmlAttr(glyph2.pathData)}" fill="${c2}" transform="${tr}"/>\n`;
  }

  const useCutout = state.cutout && layer1Paths && layer2Paths;
  if (useCutout) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${POSTER_W}" height="${POSTER_H}" viewBox="0 0 ${POSTER_W} ${POSTER_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="100%" height="100%" fill="${bgHex}"/>
<defs>
  <g id="poster-layer1">\n${layer1Paths}</g>
  <g id="poster-layer2">\n${layer2Paths}</g>
  <filter id="poster-cutout" x="-10%" y="-10%" width="120%" height="120%">
    <feImage xlink:href="#poster-layer1" result="l1"/>
    <feImage xlink:href="#poster-layer2" result="l2"/>
    <feComposite in="l1" in2="l2" operator="in" result="overlap"/>
    <feFlood flood-color="${bgHex}" result="white"/>
    <feComposite in="white" in2="overlap" operator="in" result="whiteOverlap"/>
    <feBlend in="l1" in2="l2" mode="normal" result="combined"/>
    <feComposite in="whiteOverlap" in2="combined" operator="over" result="final"/>
  </filter>
</defs>
<rect width="100%" height="100%" fill="none" filter="url(#poster-cutout)"/>
</svg>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${POSTER_W}" height="${POSTER_H}" viewBox="0 0 ${POSTER_W} ${POSTER_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="${bgHex}"/>
<g id="layer1">\n${layer1Paths}</g>
<g id="layer2" style="mix-blend-mode:multiply">\n${layer2Paths}</g>
</svg>`;
}

async function convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs) {
  const fontUrl1 = FONT_FILES[state.fontName1];
  const fontUrl2 = FONT_FILES[state.fontName2];
  if (!fontUrl1 || !fontUrl2) return null;
  const font1 = await loadFontKit(fontUrl1);
  const font2 = await loadFontKit(fontUrl2);
  const posterInputs = getPosterInputs();
  const layoutSvg = convertLayoutToShapes(font1, font2, state, stageIndices1, stageIndices2);
  const posterSvg = convertPosterToShapes(font1, font2, state, stageIndices1, stageIndices2, posterInputs.letter, posterInputs.number);
  return { layoutSvg, posterSvg };
}

function displayShapesAsSvg(layoutSvg, posterSvg, layoutContainer, options = {}) {
  const { cutout = false, canvasBg: canvasBgOpt } = options;
  const canvasBg = normalizedCanvasBgHex(canvasBgOpt || '#ffffff');
  const layoutEl = document.getElementById('layout-canvas');
  const posterEl = document.getElementById('poster-canvas');
  if (layoutEl) layoutEl.style.background = canvasBg;
  if (posterEl) posterEl.style.background = canvasBg;
  const svgPart = (s) => {
    const i = s.indexOf('<svg');
    return i >= 0 ? s.substring(i) : s;
  };
  if (layoutEl && layoutContainer) {
    let wrap = layoutEl.querySelector('.layout-wrapper');
    const savedTransform = wrap ? window.getComputedStyle(wrap).transform : null;
    const savedTransformOrigin = wrap ? window.getComputedStyle(wrap).transformOrigin : null;
    if (!wrap) {
      wrap = document.createElement('div');
      layoutEl.appendChild(wrap);
    }
    wrap.className = cutout ? 'layout-wrapper layout-cutout-view' : 'layout-wrapper layout-shapes-view';
    wrap.style.cssText = `position: relative; width: ${CANVAS_W}px; height: ${CANVAS_H}px; background: ${canvasBg};`;
    wrap.innerHTML = svgPart(layoutSvg);
    if (savedTransform && savedTransform !== 'none') {
      wrap.style.transform = savedTransform;
      wrap.style.transformOrigin = savedTransformOrigin || 'center center';
    } else {
      scaleLayoutToFit(layoutContainer);
    }
    requestAnimationFrame(() => {
      if (!savedTransform || savedTransform === 'none') scaleLayoutToFit(layoutContainer);
      const wr = wrap.getBoundingClientRect();
      const scaleX = wr.width / CANVAS_W;
      const scaleY = wr.height / CANVAS_H;
      const svgEl = wrap.querySelector('svg');
      const paths = svgEl ? Array.from(svgEl.querySelectorAll('#layer1 path')).sort((a, b) => parseInt(a.getAttribute('data-idx') || '0', 10) - parseInt(b.getAttribute('data-idx') || '0', 10)) : [];
      const exportData = window.__layoutConversionDebug?.after || [];
      const svgDebug = paths.map((path) => {
        const i = parseInt(path.getAttribute('data-idx') || '-1', 10);
        const exp = exportData[i];
        const tr = path.getAttribute('transform') || '';
        const m = tr.match(/translate\(([^,]+),([^)]+)\)/);
        const posX = m ? parseFloat(m[1]) : 0;
        const posY = m ? parseFloat(m[2]) : 0;
        const r = path.getBoundingClientRect();
        const centerX = (r.x - wr.x + r.width / 2) / scaleX;
        const centerY = (r.y - wr.y + r.height / 2) / scaleY;
        const diffX = exp ? centerX - exp.svgPosX : 0;
        const diffY = exp ? centerY - exp.svgPosY : 0;
        return {
          i,
          pointId: exp?.pointId,
          expected: { x: posX, y: posY },
          actualCenter: { x: centerX, y: centerY },
          diff: { x: diffX, y: diffY }
        };
      });
      const layoutCanvas = layoutContainer.getBoundingClientRect();
      const wrapperComputed = window.getComputedStyle(wrap);
      const firstPath = paths[0];
      const firstPathRect = firstPath ? firstPath.getBoundingClientRect() : null;
      const layoutContext = {
        view: 'svg',
        layoutCanvas: { x: layoutCanvas.x, y: layoutCanvas.y, width: layoutCanvas.width, height: layoutCanvas.height },
        wrapper: { x: wr.x, y: wr.y, width: wr.width, height: wr.height, transform: wrapperComputed.transform },
        wrapperOffsetFromCanvas: { top: wr.y - layoutCanvas.y, left: wr.x - layoutCanvas.x },
        scale: { scaleX, scaleY },
        firstElement: firstPathRect ? {
          viewport: { x: firstPathRect.x, y: firstPathRect.y },
          fromCanvasTop: firstPathRect.y - layoutCanvas.y,
          fromWrapperTop: firstPathRect.y - wr.y,
          centerFromCanvasTop: (firstPathRect.y - layoutCanvas.y + firstPathRect.height / 2)
        } : null
      };
      console.log('[Layout context - SVG view]', layoutContext);
      const fontCtx = window.__spanPositionDebug?.layoutContext;
      if (fontCtx) {
        const comparison = {
          layoutCanvasSize: {
            font: `${fontCtx.layoutCanvas.width.toFixed(0)}x${fontCtx.layoutCanvas.height.toFixed(0)}`,
            svg: `${layoutContext.layoutCanvas.width.toFixed(0)}x${layoutContext.layoutCanvas.height.toFixed(0)}`,
            same: Math.abs(fontCtx.layoutCanvas.width - layoutContext.layoutCanvas.width) < 1
          },
          wrapperSize: {
            font: `${fontCtx.wrapper.width.toFixed(0)}x${fontCtx.wrapper.height.toFixed(0)}`,
            svg: `${layoutContext.wrapper.width.toFixed(0)}x${layoutContext.wrapper.height.toFixed(0)}`
          },
          wrapperOffset: {
            font: `top:${fontCtx.wrapperOffsetFromCanvas.top.toFixed(0)} left:${fontCtx.wrapperOffsetFromCanvas.left.toFixed(0)}`,
            svg: `top:${layoutContext.wrapperOffsetFromCanvas.top.toFixed(0)} left:${layoutContext.wrapperOffsetFromCanvas.left.toFixed(0)}`
          },
          firstElementFromCanvasTop: {
            font: fontCtx.firstElement?.centerFromCanvasTop.toFixed(1),
            svg: layoutContext.firstElement?.centerFromCanvasTop.toFixed(1),
            diff: fontCtx.firstElement && layoutContext.firstElement
              ? (layoutContext.firstElement.centerFromCanvasTop - fontCtx.firstElement.centerFromCanvasTop).toFixed(1)
              : 'n/a'
          }
        };
        console.log('[Layout JUMP analysis] Font vs SVG comparison:', comparison);
      }
      console.log('[Layout SVG shapes debug] Wrapper:', { width: wr.width, height: wr.height }, 'scale:', { scaleX, scaleY });
      console.log('[Layout SVG shapes debug] Paths expected vs actual:', svgDebug);
      console.table(svgDebug.map((r) => ({
        i: r.i,
        pointId: r.pointId,
        'exp.x': r.expected.x.toFixed(1),
        'exp.y': r.expected.y.toFixed(1),
        'act.x': r.actualCenter.x.toFixed(1),
        'act.y': r.actualCenter.y.toFixed(1),
        'diff.x': r.diff.x.toFixed(2),
        'diff.y': r.diff.y.toFixed(2)
      })));
      if (typeof window !== 'undefined') window.__layoutSvgShapesDebug = { svgDebug, wrapperRect: wr, scaleX, scaleY, layoutContext };
    });
  }
  if (posterEl) {
    posterEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = cutout ? 'poster-wrapper poster-cutout-view' : 'poster-wrapper poster-shapes-view';
    wrap.style.cssText = `position: relative; width: ${POSTER_W}px; height: ${POSTER_H}px; background: ${canvasBg};`;
    wrap.innerHTML = svgPart(posterSvg);
    posterEl.appendChild(wrap);
    scalePosterToFit(posterEl);
  }
}

function saveLayoutAndPosterSvg(shapes) {
  if (!shapes) return;
  const ts = layoutTimestamp();
  downloadBlob(new Blob([shapes.layoutSvg], { type: 'image/svg+xml' }), `layout_${ts}.svg`);
  downloadBlob(new Blob([shapes.posterSvg], { type: 'image/svg+xml' }), `poster_${ts}.svg`);
}

export function initLayout(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  fetch(`${B}Logo_startD.svg`)
    .then((r) => {
      if (!r.ok) throw new Error(`SVG fetch failed: ${r.status}`);
      return r.text();
    })
    .then(async (svgText) => {
      const parsed = parseSvgPositions(svgText);
      const svgPositions = parsed.positions;
      const svgWidth = parsed.svgWidth;
      const svgHeight = parsed.svgHeight;
      const pointIds = POINT_IDS.slice(0, svgPositions.length);
      const numPoints = svgPositions.length;

      let pairIdx = Math.floor(Math.random() * FONT_NAMES_DOT.length);
      let fontName1 = FONT_NAMES_DOT[pairIdx];
      let fontName2 = FONT_NAMES_SQUARE[pairIdx];
      try {
        await loadFont(fontName1);
        await loadFont(fontName2);
      } catch (e) {
        fontName1 = 'DotSizeVAR';
        fontName2 = 'SquareSizeVAR';
        await loadFont(fontName1);
        await loadFont(fontName2);
      }
      await document.fonts.ready;

      const availW = CANVAS_W - 2 * LAYOUT_MARGIN;
      const availH = CANVAS_H - 2 * LAYOUT_MARGIN;
      const layoutScale = Math.min(availW / svgWidth, availH / svgHeight);
      const scaledW = svgWidth * layoutScale;
      const scaledH = svgHeight * layoutScale;
      const layoutOffsetX = LAYOUT_MARGIN + (availW - scaledW) / 2;
      const layoutOffsetY = LAYOUT_MARGIN + (availH - scaledH) / 2;

      const screenX = new Array(numPoints);
      const screenY = new Array(numPoints);
      for (let i = 0; i < numPoints; i++) {
        screenX[i] = layoutOffsetX + svgPositions[i][0] * layoutScale;
        screenY[i] = layoutOffsetY + svgPositions[i][1] * layoutScale;
      }

      const initDebug = {
        svgPositions: svgPositions.map((p, i) => ({ i, pointId: pointIds[i], raw: p })),
        layoutScale,
        layoutOffsetX,
        layoutOffsetY,
        screenX: [...screenX],
        screenY: [...screenY]
      };
      console.log('[Layout init] Position computation (svg→screen):', initDebug);
      if (typeof window !== 'undefined') window.__layoutInitDebug = initDebug;

      const cols = Math.max(4, Math.ceil(Math.sqrt(numPoints)));
      const rows = Math.ceil(numPoints / cols);
      const cellWidth = (svgWidth / cols) * layoutScale;
      const cellHeight = (svgHeight / rows) * layoutScale;
      const availCellW = cellWidth - CELL_PADDING * 2;
      const availCellH = cellHeight - CELL_PADDING * 2;

      const palette = loadPaletteFromStorage() || PALETTE_COLORS.map(c => [...c]);
      let idx1 = Math.floor(Math.random() * palette.length);
      let idx2 = Math.floor(Math.random() * palette.length);
      while (palette.length > 1 && idx2 === idx1) {
        idx2 = Math.floor(Math.random() * palette.length);
      }
      const logo1Color = palette[idx1];
      const logo2Color = palette[idx2];

      const { stageIndices1, stageIndices2 } = createStageIndices('random', numPoints, pointIds);

      const state = {
        container,
        fontName1,
        fontName2,
        palette,
        idx1,
        idx2,
        logo1Color,
        logo2Color,
        pointIds,
        numPoints,
        screenX,
        screenY,
        availCellW,
        availCellH,
        cellHeight,
        layer1Visible: true,
        layer2Visible: true,
        useCutout: false,
        cutout: false,
        randomizeStyling: false,
        extremeStyling: false,
        orientationAxesMode: false,
        axesPool: [],
        fontFeatureSettings: '"ss04" 1',
        canvasBg: loadCanvasBgFromStorage() || '#ffffff'
      };

      const getPosterInputs = () => ({
        letter: document.getElementById('poster-letter')?.value || 'S',
        number: document.getElementById('poster-number')?.value || '1',
        featureKey: document.getElementById('poster-feature')?.value || 'normal'
      });

      let convertedShapes = null;
      let krok1ConfirmedForSvg = false;

      const syncExportButtons = () => {
        const png = document.getElementById('layout-btn-png');
        const svg = document.getElementById('layout-btn-svg');
        const hasShapes = !!convertedShapes;
        if (png) png.disabled = !hasShapes;
        if (svg) svg.disabled = !hasShapes || !krok1ConfirmedForSvg;
      };

      let updateLayer1Swatch;
      let updateLayer2Swatch;
      let updateCanvasBgSwatch;

      const paintView = () => {
        if (state.randomizeStyling) {
          if (state.extremeStyling) state.axesPool = generateExtremeAxes();
          else if (state.orientationAxesMode) state.axesPool = generateOrientationPresetAxes();
          else state.axesPool = generateRandomAxes();
        }
        renderLayout(state, stageIndices1, stageIndices2);
        const pi = getPosterInputs();
        renderPoster(state, stageIndices1, stageIndices2, pi.letter, pi.number, pi.featureKey);
        updateLayoutFooter(state, stageIndices1, stageIndices2);
        syncCanvasChromeBg(state);
        if (updateLayer1Swatch) updateLayer1Swatch();
        if (updateLayer2Swatch) updateLayer2Swatch();
        if (updateCanvasBgSwatch) updateCanvasBgSwatch();
      };

      const reRender = () => {
        convertedShapes = null;
        krok1ConfirmedForSvg = false;
        syncExportButtons();
        paintView();
      };

      function buildLayerSwatch(containerId, getColor, setColor) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const update = () => {
          const [r, g, b] = getColor();
          const hex = rgbToHex(r, g, b);
          colorInput.value = hex;
          hexInput.value = hex;
        };
        const [r, g, b] = getColor();
        const hex = rgbToHex(r, g, b);
        container.innerHTML = '';
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = hex;
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.value = hex;
        hexInput.placeholder = '#000000';
        hexInput.maxLength = 7;
        const syncFromColor = () => {
          const rgb = hexToRgb(colorInput.value);
          if (rgb) { setColor(rgb); hexInput.value = colorInput.value; reRender(); }
        };
        const syncFromHex = () => {
          const rgb = hexToRgb(hexInput.value);
          if (rgb) { setColor(rgb); colorInput.value = rgbToHex(rgb[0], rgb[1], rgb[2]); reRender(); }
        };
        colorInput.addEventListener('input', syncFromColor);
        colorInput.addEventListener('change', syncFromColor);
        hexInput.addEventListener('change', syncFromHex);
        hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') syncFromHex(); });
        container.appendChild(colorInput);
        container.appendChild(hexInput);
        return update;
      }

      function buildCanvasBgSwatch() {
        const el = document.getElementById('layout-canvas-bg-swatch');
        if (!el) return () => {};
        const update = () => {
          const h = normalizedCanvasBgHex(state.canvasBg);
          colorInput.value = h;
          hexInput.value = h;
        };
        const h0 = normalizedCanvasBgHex(state.canvasBg);
        el.innerHTML = '';
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = h0;
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.value = h0;
        hexInput.placeholder = '#ffffff';
        hexInput.maxLength = 7;
        const applyFromHex = (raw) => {
          const rgb = hexToRgb(raw);
          if (!rgb) return;
          state.canvasBg = normalizedCanvasBgHex(raw);
          saveCanvasBgToStorage(state.canvasBg);
          colorInput.value = state.canvasBg;
          hexInput.value = state.canvasBg;
          paintView();
          if (convertedShapes) {
            convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs).then((shapes) => {
              if (shapes) {
                convertedShapes = shapes;
                displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, { cutout: state.cutout, canvasBg: state.canvasBg });
              }
            }).catch((e) => console.error('Convert failed:', e));
          }
        };
        colorInput.addEventListener('input', () => applyFromHex(colorInput.value));
        colorInput.addEventListener('change', () => applyFromHex(colorInput.value));
        hexInput.addEventListener('change', () => applyFromHex(hexInput.value));
        hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFromHex(hexInput.value); });
        el.appendChild(colorInput);
        el.appendChild(hexInput);
        return update;
      }

      updateLayer1Swatch = buildLayerSwatch('layout-layer1-swatch', () => state.logo1Color, (rgb) => {
        state.logo1Color = rgb;
        state.palette[state.idx1] = rgb;
      });
      updateLayer2Swatch = buildLayerSwatch('layout-layer2-swatch', () => state.logo2Color, (rgb) => {
        state.logo2Color = rgb;
        state.palette[state.idx2] = rgb;
      });

      function buildPaletteSwatches() {
        const container = document.getElementById('layout-palette-swatches');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < state.palette.length; i++) {
          const [r, g, b] = state.palette[i];
          const hex = rgbToHex(r, g, b);
          const wrap = document.createElement('div');
          wrap.className = 'layout-palette-swatch';
          const colorInput = document.createElement('input');
          colorInput.type = 'color';
          colorInput.value = hex;
          colorInput.title = `Color ${i + 1}`;
          const hexInput = document.createElement('input');
          hexInput.type = 'text';
          hexInput.value = hex;
          hexInput.placeholder = '#000000';
          hexInput.maxLength = 7;
          const syncFromColor = () => {
            const rgb = hexToRgb(colorInput.value);
            if (rgb) {
              state.palette[i] = rgb;
              hexInput.value = colorInput.value;
              if (i === state.idx1) { state.logo1Color = state.palette[i]; }
              if (i === state.idx2) { state.logo2Color = state.palette[i]; }
              reRender();
            }
          };
          const syncFromHex = () => {
            const rgb = hexToRgb(hexInput.value);
            if (rgb) {
              state.palette[i] = rgb;
              colorInput.value = rgbToHex(rgb[0], rgb[1], rgb[2]);
              if (i === state.idx1) { state.logo1Color = state.palette[i]; }
              if (i === state.idx2) { state.logo2Color = state.palette[i]; }
              reRender();
            }
          };
          colorInput.addEventListener('input', syncFromColor);
          colorInput.addEventListener('change', syncFromColor);
          hexInput.addEventListener('change', syncFromHex);
          hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') syncFromHex(); });
          wrap.appendChild(colorInput);
          wrap.appendChild(hexInput);
          container.appendChild(wrap);
        }
      }

      buildPaletteSwatches();
      updateCanvasBgSwatch = buildCanvasBgSwatch();
      paintView();
      syncExportButtons();

      const updateMode = (mode) => {
        const { stageIndices1: s1, stageIndices2: s2 } = createStageIndices(mode, numPoints, pointIds);
        stageIndices1.splice(0, stageIndices1.length, ...s1);
        stageIndices2.splice(0, stageIndices2.length, ...s2);
        reRender();
      };

      const applyUnifyCuts = async () => {
        const group = Math.random() < 0.5 ? FONT_NAMES_DOT : FONT_NAMES_SQUARE;
        let i1 = Math.floor(Math.random() * group.length);
        let i2 = Math.floor(Math.random() * group.length);
        while (group.length > 1 && i2 === i1) {
          i2 = Math.floor(Math.random() * group.length);
        }
        const name1 = group[i1];
        const name2 = group[i2];
        await loadFont(name1);
        await loadFont(name2);
        await document.fonts.ready;
        state.fontName1 = name1;
        state.fontName2 = name2;
        const { stageIndices1: s1, stageIndices2: s2 } = createStageIndices('unifyCuts', numPoints, pointIds);
        stageIndices1.splice(0, stageIndices1.length, ...s1);
        stageIndices2.splice(0, stageIndices2.length, ...s2);
        reRender();
      };

      document.getElementById('layout-btn-convert')?.addEventListener('click', async () => {
        if (!window.confirm('Převést návrh na vektorové tvary?')) return;
        const btn = document.getElementById('layout-btn-convert');
        if (btn) btn.disabled = true;
        try {
          const shapes = await convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs);
          if (shapes) {
            convertedShapes = shapes;
            krok1ConfirmedForSvg = true;
            displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, { cutout: state.cutout, canvasBg: state.canvasBg });
            syncExportButtons();
          }
        } catch (e) {
          console.error('Convert failed:', e);
        } finally {
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('layout-btn-png')?.addEventListener('click', () => saveLayoutAndPosterPng(convertedShapes, state.canvasBg));
      document.getElementById('layout-btn-svg')?.addEventListener('click', () => {
        if (!convertedShapes || !krok1ConfirmedForSvg) return;
        saveLayoutAndPosterSvg(convertedShapes);
      });
      document.getElementById('layout-btn-unify')?.addEventListener('click', () => updateMode('unify'));
      document.getElementById('layout-btn-symmetrical')?.addEventListener('click', () => updateMode('symmetrical'));
      document.getElementById('layout-btn-unify-cuts')?.addEventListener('click', async () => {
        const btn = document.getElementById('layout-btn-unify-cuts');
        if (btn) btn.disabled = true;
        try {
          await applyUnifyCuts();
        } catch (e) {
          console.warn('Sjednotit rezy failed:', e);
        } finally {
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('layout-btn-layer1')?.addEventListener('click', () => {
        state.layer1Visible = !state.layer1Visible;
        reRender();
      });

      document.getElementById('layout-btn-layer2')?.addEventListener('click', () => {
        state.layer2Visible = !state.layer2Visible;
        reRender();
      });

      document.getElementById('layout-btn-cutout')?.addEventListener('click', async () => {
        const btn = document.getElementById('layout-btn-cutout');
        if (btn) btn.disabled = true;
        state.cutout = !state.cutout;
        try {
          const shapes = await convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs);
          if (shapes) {
            convertedShapes = shapes;
            syncExportButtons();
            displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, { cutout: state.cutout, canvasBg: state.canvasBg });
          }
        } finally {
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('layout-btn-randomize')?.addEventListener('click', () => {
        state.randomizeStyling = !state.randomizeStyling;
        state.extremeStyling = false;
        state.orientationAxesMode = false;
        reRender();
      });

      document.getElementById('layout-btn-extreme')?.addEventListener('click', () => {
        state.randomizeStyling = true;
        state.extremeStyling = true;
        state.orientationAxesMode = false;
        state.axesPool = generateExtremeAxes();
        reRender();
      });

      document.getElementById('layout-btn-orientation-axes')?.addEventListener('click', async () => {
        const f1 = 'DotOrientationVAR';
        const f2 = 'SquareOrientationVAR';
        try {
          await loadFont(f1);
          await loadFont(f2);
          state.fontName1 = f1;
          state.fontName2 = f2;
          state.randomizeStyling = true;
          state.extremeStyling = false;
          state.orientationAxesMode = true;
          state.axesPool = generateOrientationPresetAxes();
          reRender();
        } catch (e) {
          console.warn('Failed to load orientation fonts:', e);
        }
      });

      document.getElementById('layout-btn-typeface')?.addEventListener('click', async () => {
        const i = FONT_NAMES_DOT.indexOf(state.fontName1);
        const cur = i >= 0 ? i : 0;
        const nextPair = (cur + 1) % FONT_NAMES_DOT.length;
        const next1 = FONT_NAMES_DOT[nextPair];
        const next2 = FONT_NAMES_SQUARE[nextPair];
        try {
          await loadFont(next1);
          await loadFont(next2);
          state.fontName1 = next1;
          state.fontName2 = next2;
          reRender();
        } catch (e) {
          console.warn('Failed to load font:', next1, next2, e);
        }
      });

      document.getElementById('layout-btn-typeface-1')?.addEventListener('click', async () => {
        const i = FONT_NAMES_DOT.indexOf(state.fontName1);
        const cur = i >= 0 ? i : 0;
        const next1 = FONT_NAMES_DOT[(cur + 1) % FONT_NAMES_DOT.length];
        try {
          await loadFont(next1);
          state.fontName1 = next1;
          reRender();
        } catch (e) {
          console.warn('Failed to load font:', next1, e);
        }
      });

      document.getElementById('layout-btn-typeface-2')?.addEventListener('click', async () => {
        const i = FONT_NAMES_SQUARE.indexOf(state.fontName2);
        const cur = i >= 0 ? i : 0;
        const next2 = FONT_NAMES_SQUARE[(cur + 1) % FONT_NAMES_SQUARE.length];
        try {
          await loadFont(next2);
          state.fontName2 = next2;
          reRender();
        } catch (e) {
          console.warn('Failed to load font:', next2, e);
        }
      });

      document.getElementById('layout-btn-colors')?.addEventListener('click', () => {
        state.idx1 = Math.floor(Math.random() * state.palette.length);
        state.idx2 = Math.floor(Math.random() * state.palette.length);
        while (state.palette.length > 1 && state.idx2 === state.idx1) {
          state.idx2 = Math.floor(Math.random() * state.palette.length);
        }
        state.logo1Color = state.palette[state.idx1];
        state.logo2Color = state.palette[state.idx2];
        reRender();
      });

      document.getElementById('layout-btn-save-palette')?.addEventListener('click', () => {
        savePaletteToStorage(state.palette);
        const btn = document.getElementById('layout-btn-save-palette');
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = 'Uloženo!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }
      });

      document.getElementById('layout-btn-reset-palette')?.addEventListener('click', () => {
        state.palette = PALETTE_COLORS.map(c => [...c]);
        state.logo1Color = state.palette[state.idx1];
        state.logo2Color = state.palette[state.idx2];
        buildPaletteSwatches();
        reRender();
      });

      document.getElementById('layout-btn-randomize-all')?.addEventListener('click', async () => {
        const { stageIndices1: s1, stageIndices2: s2 } = createStageIndices('random', numPoints, pointIds);
        stageIndices1.splice(0, stageIndices1.length, ...s1);
        stageIndices2.splice(0, stageIndices2.length, ...s2);
        state.layer1Visible = Math.random() < 0.9;
        state.layer2Visible = Math.random() < 0.9;
        if (!state.layer1Visible && !state.layer2Visible) state.layer2Visible = true;
        state.randomizeStyling = Math.random() < 0.7;
        state.extremeStyling = state.randomizeStyling && Math.random() < 0.5;
        state.orientationAxesMode = false;
        if (state.randomizeStyling) state.axesPool = state.extremeStyling ? generateExtremeAxes() : generateRandomAxes();
        const rp = Math.floor(Math.random() * FONT_NAMES_DOT.length);
        const next1 = FONT_NAMES_DOT[rp];
        const next2 = FONT_NAMES_SQUARE[rp];
        try {
          await loadFont(next1);
          await loadFont(next2);
          state.fontName1 = next1;
          state.fontName2 = next2;
        } catch (e) {
          console.warn('Failed to load font:', next1, next2, e);
        }
        state.idx1 = Math.floor(Math.random() * state.palette.length);
        state.idx2 = Math.floor(Math.random() * state.palette.length);
        while (state.palette.length > 1 && state.idx2 === state.idx1) {
          state.idx2 = Math.floor(Math.random() * state.palette.length);
        }
        state.logo1Color = state.palette[state.idx1];
        state.logo2Color = state.palette[state.idx2];
        reRender();
      });

      const resizeHandler = () => {
        requestAnimationFrame(() => {
          scaleLayoutToFit(container);
          scalePosterToFit(document.getElementById('poster-canvas'));
        });
      };
      window.addEventListener('resize', resizeHandler);
      resizeHandler();

      document.getElementById('poster-letter')?.addEventListener('input', reRender);
      document.getElementById('poster-letter')?.addEventListener('change', reRender);
      document.getElementById('poster-number')?.addEventListener('input', reRender);
      document.getElementById('poster-number')?.addEventListener('change', reRender);
      document.getElementById('poster-feature')?.addEventListener('input', reRender);
      document.getElementById('poster-feature')?.addEventListener('change', reRender);
    })
    .catch((err) => {
      console.error('Failed to load layout:', err);
      if (container) {
        container.innerHTML = `<p style="padding:1rem;color:#c00;">Nepodařilo se načíst rozložení: ${err.message}. Zkontrolujte konzoli.</p>`;
      }
    });
}

document.addEventListener('DOMContentLoaded', () => {
  initLayout('layout-canvas');
});
