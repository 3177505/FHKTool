import { pairFragmentsIntersectPathD } from './pairCutoutPaths.js';

const CANVAS_W = Math.round(1080 * 297 / 210);
const CANVAS_H = 1080;
const POSTER_W = 595;
const POSTER_H = 842;
const LAYOUT_MEDIA_MAX_WIDTH = 1440;
const LAYOUT_MEDIA_QUERY = `(max-width: ${LAYOUT_MEDIA_MAX_WIDTH}px)`;
const LAYOUT_MARGIN = 48;
const BOTTOM_MARGIN = 48;
const CELL_PADDING = 4;
const FONT_SIZE_LOAD = 200;
const GLYPH_SIZE_FACTOR = 12;
const LAYOUT_SHAPES_DISPLAY_SCALE = 1.5;
const D_OFFSET_Y = 0.20;
const NUM_STAGES = 9;

let posterClipIdSeq = 0;
let textureRadialIdSeq = 0;

const POINT_IDS = [
  'ID-L1-1', 'ID-L2-1', 'ID-L5-3', 'ID-L4-3', 'ID-L3-4', 'ID-C-3',
  'ID-R3-4', 'ID-R4-3', 'ID-R5-3', 'ID-R2-1', 'ID-R1-1'
];

const LEFT_CENTER_IDS = new Set(['ID-L1-1', 'ID-L2-1', 'ID-L5-3', 'ID-L4-3', 'ID-L3-4', 'ID-C-3']);
const RIGHT_IDS = new Set(['ID-R3-4', 'ID-R4-3', 'ID-R5-3', 'ID-R2-1', 'ID-R1-1']);

const SVG_PATH_TO_POINT_INDEX = [3, 0, 1, 2, 5, 7, 6, 10, 9, 8, 4];

const SVG_PATH_TO_POINT_INDEX_LOGO_START = [3, 4, 0, 1, 2, 5, 7, 6, 10, 9, 8];

const PALETTE_COLORS = [
  [0, 0, 0],
  [247, 208, 217],
  [249, 232, 102],
  [91, 177, 102],
  [249, 165, 75],
  [237, 109, 46],
  [232, 81, 71]
];

const PALETTE_STORAGE_KEY = 'filhramonie-palette';
const CANVAS_BG_STORAGE_KEY = 'filhramonie-canvas-bg';
const LAYOUT_DEBUG_STORAGE_KEY = 'layoutDebug';

function layoutDebugEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.__LAYOUT_DEBUG === true) return true;
    const q = window.location && window.location.search;
    if (q && /(?:^|[?&])layoutDebug=1(?:&|$)/.test(q)) return true;
    if (localStorage.getItem(LAYOUT_DEBUG_STORAGE_KEY) === '1') return true;
  } catch {
    return false;
  }
  return false;
}

function layoutDlog(...args) {
  if (layoutDebugEnabled()) console.log(...args);
}

function layoutDtable(data) {
  if (layoutDebugEnabled()) console.table(data);
}

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

function pickRandomDistinctIndices(count, poolSize) {
  const n = Math.min(Math.max(0, count), poolSize);
  if (n <= 0 || poolSize <= 0) return [];
  const arr = [];
  for (let i = 0; i < poolSize; i++) arr.push(i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr.slice(0, n);
}

function randomOmitPickCount(poolSize) {
  if (poolSize <= 0) return 0;
  const frac = 0.2 + Math.random() * 0.85;
  return Math.min(poolSize, Math.max(1, Math.round(poolSize * frac)));
}

const SUBCONTOUR_SCALE_MAX = 1.35;

function randomSubcontourScaleFactor() {
  const lo = 1 / SUBCONTOUR_SCALE_MAX;
  const hi = SUBCONTOUR_SCALE_MAX;
  return lo + Math.random() * (hi - lo);
}

function clearShapeOmitState(state) {
  state.shapeOmitSubcontours1.clear();
  state.shapeOmitSubcontours2.clear();
  state.shapeOmitPosterSub1.clear();
  state.shapeOmitPosterSub2.clear();
}

function clearShapeScaleState(state) {
  state.shapeScaleSubcontours1.clear();
  state.shapeScaleSubcontours2.clear();
  state.shapeScalePosterFilh.clear();
}

function clearShapePairCutoutState(state) {
  state.shapePairCutoutCells.clear();
  state.posterRandomPairCutout = false;
}

function subcontourLocalScaleSuffix(sub, pivotX, py, perSlotMap, slotIdx, subIdx) {
  const inner = perSlotMap && perSlotMap.get(slotIdx);
  const sc = inner && inner.get(subIdx);
  const s = sc != null && Number.isFinite(sc) ? sc : 1;
  if (Math.abs(s - 1) < 1e-6) return '';
  const cxRel = sub.cx - pivotX;
  const cyRel = sub.cy - py;
  const rq = Math.round(s * 1000) / 1000;
  return ` translate(${cxRel},${cyRel}) scale(${rq}) translate(${-cxRel},${-cyRel})`;
}

function filhPosterScaleSuffix(sub, pivotX, py, map, tag, si) {
  const sc = map.get(`${tag}:${si}`);
  const s = sc != null && Number.isFinite(sc) ? sc : 1;
  if (Math.abs(s - 1) < 1e-6) return '';
  const cxRel = sub.cx - pivotX;
  const cyRel = sub.cy - py;
  const rq = Math.round(s * 1000) / 1000;
  return ` translate(${cxRel},${cyRel}) scale(${rq}) translate(${-cxRel},${-cyRel})`;
}

function logNahodneVynechatTvaryDebug(state, pointIds, shapes, pickMeta) {
  const after = typeof window !== 'undefined' ? window.__layoutConversionDebug?.after : null;
  const n = state.numPoints;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = Array.isArray(after) ? after[i] : null;
    const char = row?.char ?? (pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I');
    const pid = row?.pointId ?? pointIds[i] ?? '—';
    const g1 = !!(row && row.glyph1);
    const g2 = !!(row && row.glyph2);
    const s1 = state.shapeOmitSubcontours1.get(i);
    const s2 = state.shapeOmitSubcontours2.get(i);
    const skip1 = s1 && s1.size ? [...s1].sort((aa, bb) => aa - bb).join(',') : '';
    const skip2 = s2 && s2.size ? [...s2].sort((aa, bb) => aa - bb).join(',') : '';
    const nc1 = row?.glyph1?.nContour ?? 0;
    const nc2 = row?.glyph2?.nContour ?? 0;
    const rem1 = g1 ? Math.max(0, nc1 - (s1?.size ?? 0)) : 0;
    const rem2 = g2 ? Math.max(0, nc2 - (s2?.size ?? 0)) : 0;
    const out1 = state.layer1Visible && rem1 > 0;
    const out2 = state.layer2Visible && rem2 > 0;
    rows.push({
      i,
      pointId: pid,
      char,
      font_L1: g1 ? 'ok' : 'no',
      font_L2: g2 ? 'ok' : 'no',
      sub_skip_L1: skip1,
      sub_skip_L2: skip2,
      svg_L1: out1 ? 'yes' : '',
      svg_L2: out2 ? 'yes' : ''
    });
  }
  const pathTags = shapes && shapes.layoutSvg ? shapes.layoutSvg.match(/<path\b/g)?.length ?? 0 : null;
  let expectedPaths = 0;
  for (let i = 0; i < n; i++) {
    const a = Array.isArray(after) ? after[i] : null;
    if (state.layer1Visible && a?.glyph1) {
      const skipped = state.shapeOmitSubcontours1.get(i)?.size ?? 0;
      expectedPaths += Math.max(0, (a.glyph1.nContour ?? 0) - skipped);
    }
    if (state.layer2Visible && a?.glyph2) {
      const skipped = state.shapeOmitSubcontours2.get(i)?.size ?? 0;
      expectedPaths += Math.max(0, (a.glyph2.nContour ?? 0) - skipped);
    }
  }
  const convOk = Array.isArray(after) && after.length === n;
  const tagsOk = pathTags != null && pathTags === expectedPaths;
  layoutDlog('%c[Náhodně vynechat tvary · souhrn]', 'font-weight:bold;font-size:12px');
  layoutDtable([
    {
      pool_kontur: pickMeta.poolSize,
      vybrano_dilu: pickMeta.picked,
      vyber: pickMeta.picksStr,
      poster_skip_L1_spodviz: pickMeta.posterSkip1Str,
      poster_skip_L2_spodviz: pickMeta.posterSkip2Str,
      vrstva1: state.layer1Visible,
      vrstva2: state.layer2Visible,
      vyrez_prekryvu: layoutViewUsesCutoutChrome(state),
      svg_path_tags: pathTags ?? '—',
      expected_path_tags: expectedPaths,
      tags_ok: tagsOk ? 'yes' : 'NO',
      conversion_rows: convOk ? after.length : '—',
      conversion_ok: convOk ? 'yes' : 'NO'
    }
  ]);
  layoutDlog('%c[Náhodně vynechat tvary · sloty]', 'font-weight:bold;font-size:12px');
  layoutDtable(rows);
  if (typeof window !== 'undefined') {
    window.__layoutShapeOmitLast = {
      subcontoursLayer1: Object.fromEntries(
        [...state.shapeOmitSubcontours1.entries()].map(([k, v]) => [k, [...v].sort((a, b) => a - b)])
      ),
      subcontoursLayer2: Object.fromEntries(
        [...state.shapeOmitSubcontours2.entries()].map(([k, v]) => [k, [...v].sort((a, b) => a - b)])
      ),
      posterSub1: [...state.shapeOmitPosterSub1].sort((a, b) => a - b),
      posterSub2: [...state.shapeOmitPosterSub2].sort((a, b) => a - b),
      layoutPathTagsInSvg: pathTags,
      pair_cutout_chrome: layoutViewUsesCutoutChrome(state),
      expectedPathTags: expectedPaths,
      tagsMatchExpected: tagsOk,
      perSlot: rows,
      pickMeta
    };
  }
}

function syncCanvasChromeBg(state) {
  const bg = normalizedCanvasBgHex(state.canvasBg);
  document.getElementById('layout-canvas')?.style.setProperty('background', bg);
  document.getElementById('poster-canvas')?.style.setProperty('background', bg);
}

function syncTextureBlur(state) {
  if (!state) return;
  const px = Math.max(0, Number(state.textureBlurPx) || 0);
  const mode = state.textureBlurMode || 'both';
  const blurCss = px > 0 ? `blur(${px}px)` : 'none';
  const blurLayer1 = px > 0 && state.layer1Visible && (mode === 'both' || mode === 'layer1');
  const blurLayer2 = px > 0 && state.layer2Visible && (mode === 'both' || mode === 'layer2');
  const mergedBlur = px > 0 && (blurLayer1 || blurLayer2);

  function applyLayerPair(l1, l2) {
    if (l1) l1.style.filter = blurLayer1 ? blurCss : '';
    if (l2) l2.style.filter = blurLayer2 ? blurCss : '';
  }

  const layoutCanvasEl = document.getElementById('layout-canvas');
  const lw = layoutCanvasEl?.querySelector('.layout-wrapper');
  if (lw) {
    if (lw.tagName === 'CANVAS') {
      lw.style.filter = mergedBlur ? blurCss : '';
    } else {
      const l1Wrap = lw.querySelector('.layout-layer1');
      const l2Wrap = lw.querySelector('.layout-layer2');
      if (l1Wrap || l2Wrap) {
        applyLayerPair(l1Wrap, l2Wrap);
      } else {
        const svg = lw.querySelector('svg');
        const g1 = svg?.querySelector('#layer1');
        const g2 = svg?.querySelector('#layer2');
        if (svg && !g1 && !g2) {
          svg.style.filter = mergedBlur ? blurCss : '';
        } else {
          applyLayerPair(g1, g2);
        }
      }
    }
  }

  const posterCanvasEl = document.getElementById('poster-canvas');
  const pw = posterCanvasEl?.querySelector('.poster-wrapper');
  if (pw) {
    const sub1 = pw.querySelectorAll('.poster-sublayer-1');
    const sub2 = pw.querySelectorAll('.poster-sublayer-2');
    if (sub1.length || sub2.length) {
      sub1.forEach((el) => { el.style.filter = blurLayer1 ? blurCss : ''; });
      sub2.forEach((el) => { el.style.filter = blurLayer2 ? blurCss : ''; });
    } else {
      const p1Wrap = pw.querySelector('.poster-layer1');
      const p2Wrap = pw.querySelector('.poster-layer2');
      if (p1Wrap || p2Wrap) {
        applyLayerPair(p1Wrap, p2Wrap);
      } else {
        const svg = pw.querySelector('svg');
        const g1 = svg?.querySelector('#layer1');
        const g2 = svg?.querySelector('#layer2');
        if (svg && !g1 && !g2) {
          svg.style.filter = mergedBlur ? blurCss : '';
        } else {
          applyLayerPair(g1, g2);
        }
      }
    }
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function mixRgbTowardWhite(rgb, t) {
  const u = Math.min(1, Math.max(0, t));
  const [r, g, b] = rgb;
  return [
    Math.round(r + (255 - r) * u),
    Math.round(g + (255 - g) * u),
    Math.round(b + (255 - b) * u)
  ];
}

function textureRadialParamsFromAmount(amount, r, g, b) {
  const t = Math.min(1, Math.max(0, amount) / 16);
  const [cr, cg, cb] = mixRgbTowardWhite([r, g, b], t * 0.9);
  const innerStop = Math.round(28 + (1 - t) * 42);
  return { cr, cg, cb, innerStop, edgeR: r, edgeG: g, edgeB: b };
}

function parseSvgFillToRgb(fill) {
  const f = String(fill || '').trim();
  if (!f || f.startsWith('url(')) return [0, 0, 0];
  if (f.startsWith('#')) {
    const h = hexToRgb(f);
    return h || [0, 0, 0];
  }
  const m = f.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [0, 0, 0];
}

function resetSvgTextureRadial(svgEl) {
  const defs = svgEl.querySelector('defs');
  if (defs) defs.querySelectorAll('[data-texrad="1"]').forEach((n) => n.remove());
  svgEl.querySelectorAll('#layer1 path[data-texrad-base], #layer2 path[data-texrad-base]').forEach((path) => {
    path.setAttribute('fill', path.getAttribute('data-texrad-base') || '#000000');
    path.removeAttribute('data-texrad-base');
  });
}

function applyRadialToSvgPaths(defs, paths, amount) {
  paths.forEach((path) => {
    const rawFill = path.getAttribute('fill') || '#000000';
    if (rawFill.includes('url(')) return;
    const [r, g, b] = parseSvgFillToRgb(rawFill);
    const { cr, cg, cb, innerStop, edgeR, edgeG, edgeB } = textureRadialParamsFromAmount(amount, r, g, b);
    path.setAttribute('data-texrad-base', rawFill);
    const id = `texrad-${++textureRadialIdSeq}`;
    const rg = document.createElementNS(SVG_NS, 'radialGradient');
    rg.setAttribute('id', id);
    rg.setAttribute('cx', '50%');
    rg.setAttribute('cy', '50%');
    rg.setAttribute('r', '65%');
    rg.setAttribute('gradientUnits', 'objectBoundingBox');
    rg.setAttribute('data-texrad', '1');
    const s0 = document.createElementNS(SVG_NS, 'stop');
    s0.setAttribute('offset', '0%');
    s0.setAttribute('stop-color', `rgb(${cr},${cg},${cb})`);
    const s1 = document.createElementNS(SVG_NS, 'stop');
    s1.setAttribute('offset', `${innerStop}%`);
    s1.setAttribute('stop-color', `rgb(${edgeR},${edgeG},${edgeB})`);
    const s2 = document.createElementNS(SVG_NS, 'stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', `rgb(${edgeR},${edgeG},${edgeB})`);
    rg.appendChild(s0);
    rg.appendChild(s1);
    rg.appendChild(s2);
    defs.appendChild(rg);
    path.setAttribute('fill', `url(#${id})`);
  });
}

function syncTextureRadialSvgInDoc(svgEl, amount, active1, active2) {
  resetSvgTextureRadial(svgEl);
  if (!amount || (!active1 && !active2)) return;
  let defs = svgEl.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(SVG_NS, 'defs');
    svgEl.insertBefore(defs, svgEl.firstChild);
  }
  const g1 = svgEl.querySelector('#layer1');
  const g2 = svgEl.querySelector('#layer2');
  if (active1 && g1) applyRadialToSvgPaths(defs, g1.querySelectorAll('path'), amount);
  if (active2 && g2) applyRadialToSvgPaths(defs, g2.querySelectorAll('path'), amount);
}

function setLayerRadialGradient(layerEl, rgba, amount, active) {
  if (!layerEl) return;
  const spans = layerEl.querySelectorAll('span');
  const [r, g, b] = rgba;
  const amt = Math.max(0, Number(amount) || 0);
  if (!active || !amt) {
    spans.forEach((span) => {
      span.style.color = `rgb(${r},${g},${b})`;
      span.style.backgroundImage = '';
      span.style.removeProperty('background-clip');
      span.style.removeProperty('-webkit-background-clip');
      span.style.removeProperty('-webkit-text-fill-color');
    });
    return;
  }
  const { cr, cg, cb, innerStop, edgeR, edgeG, edgeB } = textureRadialParamsFromAmount(amt, r, g, b);
  const bg = `radial-gradient(circle at 50% 50%, rgb(${cr},${cg},${cb}) 0%, rgb(${edgeR},${edgeG},${edgeB}) ${innerStop}%, rgb(${edgeR},${edgeG},${edgeB}) 100%)`;
  spans.forEach((span) => {
    span.style.color = 'transparent';
    span.style.setProperty('-webkit-text-fill-color', 'transparent');
    span.style.backgroundImage = bg;
    span.style.setProperty('background-clip', 'text');
    span.style.setProperty('-webkit-background-clip', 'text');
  });
}

function syncTextureRadial(state) {
  if (!state) return;
  const mode = state.textureRadialMode || 'both';
  const amt = Math.max(0, Number(state.textureRadialAmount) || 0);
  const active1 = (mode === 'both' || mode === 'layer1') && state.layer1Visible;
  const active2 = (mode === 'both' || mode === 'layer2') && state.layer2Visible;

  const layoutCanvasEl = document.getElementById('layout-canvas');
  const lw = layoutCanvasEl?.querySelector('.layout-wrapper');
  if (lw && lw.tagName !== 'CANVAS') {
    const svg = lw.querySelector('svg');
    if (svg?.querySelector('#layer1')) {
      syncTextureRadialSvgInDoc(svg, amt, active1, active2);
    } else {
      setLayerRadialGradient(lw.querySelector('.layout-layer1'), state.logo1Color, amt, active1);
      setLayerRadialGradient(lw.querySelector('.layout-layer2'), state.logo2Color, amt, active2);
    }
  }

  const posterCanvasEl = document.getElementById('poster-canvas');
  const pw = posterCanvasEl?.querySelector('.poster-wrapper');
  if (pw) {
    const svg = pw.querySelector('svg');
    if (svg?.querySelector('#layer1')) {
      syncTextureRadialSvgInDoc(svg, amt, active1, active2);
    } else {
      const subs1 = pw.querySelectorAll('.poster-sublayer-1');
      const subs2 = pw.querySelectorAll('.poster-sublayer-2');
      if (subs1.length || subs2.length) {
        subs1.forEach((el) => setLayerRadialGradient(el, state.logo1Color, amt, active1));
        subs2.forEach((el) => setLayerRadialGradient(el, state.logo2Color, amt, active2));
      } else {
        setLayerRadialGradient(pw.querySelector('.poster-layer1'), state.logo1Color, amt, active1);
        setLayerRadialGradient(pw.querySelector('.poster-layer2'), state.logo2Color, amt, active2);
      }
    }
  }
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

const layoutFontKitResolved = new Map();
const layoutFontKitLoading = new Map();

async function resolveLayoutFontKit(fontName) {
  const url = FONT_FILES[fontName];
  if (!url) return null;
  if (layoutFontKitResolved.has(url)) return layoutFontKitResolved.get(url);
  if (!layoutFontKitLoading.has(url)) {
    const p = loadFontKit(url)
      .then((f) => {
        layoutFontKitResolved.set(url, f);
        layoutFontKitLoading.delete(url);
        return f;
      })
      .catch((e) => {
        layoutFontKitLoading.delete(url);
        throw e;
      });
    layoutFontKitLoading.set(url, p);
  }
  return layoutFontKitLoading.get(url);
}

function getResolvedLayoutFontKit(fontName) {
  const url = FONT_FILES[fontName];
  return url ? layoutFontKitResolved.get(url) : null;
}

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

function extractPathDsFromSvg(svgText) {
  const pathDs = [];
  const re = /<path\b[^>]*\bd="([^"]+)"/gi;
  let m;
  while ((m = re.exec(svgText)) !== null) pathDs.push(m[1]);
  return pathDs;
}

function pathBBoxCenterFromD(d) {
  if (typeof document === 'undefined' || !d) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.setAttribute('width', '1');
  svg.setAttribute('height', '1');
  svg.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:-9999px';
  svg.appendChild(path);
  document.body.appendChild(svg);
  let bb;
  try {
    bb = path.getBBox();
  } catch {
    bb = null;
  }
  document.body.removeChild(svg);
  if (!bb || !Number.isFinite(bb.width) || !Number.isFinite(bb.height)) return null;
  return [bb.x + bb.width / 2, bb.y + bb.height / 2];
}

function parseSvgPositionsCore(pathPositions, pathIndexMap) {
  const positions = new Array(POINT_IDS.length);
  for (let i = 0; i < pathPositions.length && i < pathIndexMap.length; i++) {
    positions[pathIndexMap[i]] = [...pathPositions[i]];
  }
  const positionsToUse = positions.filter(Boolean).length === pathPositions.length
    ? positions.filter(Boolean)
    : pathPositions.slice().sort((a, b) => a[0] - b[0]);
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

function parseSvgPositions(svgText, pathIndexMap = SVG_PATH_TO_POINT_INDEX) {
  const pathPositions = [];
  const pathPattern = /d="M([\d.]+),([\d.]+)/g;
  let m;
  while ((m = pathPattern.exec(svgText)) !== null) {
    pathPositions.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  return parseSvgPositionsCore(pathPositions, pathIndexMap);
}

function parseSvgPositionsWithBBoxCenters(svgText, pathIndexMap = SVG_PATH_TO_POINT_INDEX) {
  const pathDs = extractPathDsFromSvg(svgText);
  if (!pathDs.length) return parseSvgPositions(svgText, pathIndexMap);
  const pathPositions = pathDs.map((d) => {
    const c = pathBBoxCenterFromD(d);
    if (c) return c;
    const m0 = /^M\s*([\d.-]+)\s*[, ]\s*([\d.-]+)/i.exec(d);
    if (m0) return [parseFloat(m0[1]), parseFloat(m0[2])];
    return null;
  });
  if (pathPositions.some((p) => !p)) {
    console.warn('[Layout] Some SVG paths missing bbox center; falling back to M-coordinate parse.');
    return parseSvgPositions(svgText, pathIndexMap);
  }
  return parseSvgPositionsCore(pathPositions, pathIndexMap);
}

function pathCenterInSvgViewport(pathEl) {
  try {
    const svg = pathEl.ownerSVGElement;
    if (!svg) return null;
    const bb = pathEl.getBBox();
    const pt = svg.createSVGPoint();
    pt.x = bb.x + bb.width / 2;
    pt.y = bb.y + bb.height / 2;
    const ctm = pathEl.getCTM();
    if (!ctm) return null;
    const out = pt.matrixTransform(ctm);
    return { x: out.x, y: out.y };
  } catch {
    return null;
  }
}

function computeLayoutScreenGeometry(parsed) {
  const { positions, svgWidth, svgHeight } = parsed;
  const numPoints = positions.length;
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
    screenX[i] = layoutOffsetX + positions[i][0] * layoutScale;
    screenY[i] = layoutOffsetY + positions[i][1] * layoutScale;
  }
  const cols = Math.max(4, Math.ceil(Math.sqrt(numPoints)));
  const rows = Math.ceil(numPoints / cols);
  const cellWidth = (svgWidth / cols) * layoutScale;
  const cellHeight = (svgHeight / rows) * layoutScale;
  const availCellW = cellWidth - CELL_PADDING * 2;
  const availCellH = cellHeight - CELL_PADDING * 2;
  return { screenX, screenY, availCellW, availCellH, cellHeight };
}

function copyLayoutGeometryIntoState(state, geomF, geomE) {
  state.screenX = geomF.screenX.slice();
  state.screenY = geomF.screenY.slice();
  state.availCellW = geomF.availCellW;
  state.availCellH = geomF.availCellH;
  state.cellHeight = geomF.cellHeight;
  state.exportScreenX = geomE.screenX.slice();
  state.exportScreenY = geomE.screenY.slice();
  state.exportAvailCellW = geomE.availCellW;
  state.exportAvailCellH = geomE.availCellH;
  state.exportCellHeight = geomE.cellHeight;
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
    line-height: 1;
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

const EXTREME_AXIS_PRESETS = [
  [0, 0, 0, 0, 0],
  [1000, 1000, 1000, 180, 180],
  [1000, 0, 0, 0, 0],
  [0, 1000, 0, 0, 0],
  [0, 0, 1000, 0, 0],
  [0, 0, 0, 180, 0],
  [0, 0, 0, 0, 180],
  [1000, 1000, 0, 0, 0],
  [0, 0, 1000, 180, 180],
  [1000, 0, 1000, 180, 0],
  [0, 1000, 0, 180, 180],
  [1000, 1000, 1000, 0, 0],
  [0, 0, 0, 180, 180],
  [1000, 0, 0, 180, 180],
  [0, 1000, 1000, 0, 0],
  [1000, 1000, 0, 180, 180]
];

function generateExtremeAxes() {
  return Array.from({ length: NUM_STAGES }, () => {
    const p = EXTREME_AXIS_PRESETS[Math.floor(Math.random() * EXTREME_AXIS_PRESETS.length)];
    return p.slice();
  });
}

const OPPOSITE_LAYER_SMALL_AXES = [0, 0, 0, 0, 0];

const OPPOSITE_LAYER_WILD_AXIS_PRESETS = [
  [1000, 1000, 1000, 180, 180],
  [1000, 1000, 1000, 180, 135],
  [1000, 1000, 1000, 135, 180],
  [1000, 1000, 1000, 90, 180],
  [1000, 1000, 1000, 180, 90],
  [1000, 1000, 1000, 180, 45],
  [1000, 1000, 1000, 45, 180],
  [1000, 1000, 1000, 0, 180],
  [1000, 1000, 1000, 180, 0],
  [1000, 1000, 1000, 120, 120],
  [1000, 0, 1000, 180, 180],
  [1000, 1000, 0, 180, 180],
  [0, 1000, 1000, 45, 135],
  [1000, 0, 0, 135, 90],
  [500, 500, 1000, 160, 20],
  [1000, 500, 500, 20, 160],
  [0, 0, 1000, 90, 90],
  [1000, 1000, 500, 60, 120]
];

function pickWildOppositePresetAxes() {
  const p = OPPOSITE_LAYER_WILD_AXIS_PRESETS[
    Math.floor(Math.random() * OPPOSITE_LAYER_WILD_AXIS_PRESETS.length)];
  return p.slice();
}

function generateOppositeLayerAxes() {
  const calm = OPPOSITE_LAYER_SMALL_AXES.slice();
  return [calm, pickWildOppositePresetAxes(), calm.slice(), pickWildOppositePresetAxes()];
}

function getAxesForLayer(state, layerNum, stageIndex) {
  const pool = state.randomizeStyling ? state.axesPool : BERTIN_STYLE_AXES;
  if (state.oppositeLayerStyling && state.randomizeStyling && Array.isArray(pool) && pool.length >= 4) {
    const local = (Number(stageIndex) || 0) % 2;
    return pool[layerNum === 1 ? local : 2 + local];
  }
  return pool[(Number(stageIndex) || 0) % pool.length];
}

function createStageIndices(mode, numPoints, pointIds, stageCap = NUM_STAGES) {
  const stageIndices1 = new Array(numPoints);
  const stageIndices2 = new Array(numPoints);
  if (mode === 'unify') {
    const s1 = Math.floor(Math.random() * stageCap);
    let s2 = Math.floor(Math.random() * stageCap);
    while (stageCap > 1 && s2 === s1) s2 = Math.floor(Math.random() * stageCap);
    for (let i = 0; i < numPoints; i++) {
      stageIndices1[i] = s1;
      stageIndices2[i] = s2;
    }
  } else if (mode === 'symmetrical') {
    const s1 = Math.floor(Math.random() * stageCap);
    let s2 = Math.floor(Math.random() * stageCap);
    while (stageCap > 1 && s2 === s1) s2 = Math.floor(Math.random() * stageCap);
    const s3 = Math.floor(Math.random() * stageCap);
    let s4 = Math.floor(Math.random() * stageCap);
    while (stageCap > 1 && s4 === s3) s4 = Math.floor(Math.random() * stageCap);
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
  } else if (mode === 'oppositeLayers') {
    const a = Math.random() < 0.5 ? 0 : 1;
    const b = Math.random() < 0.5 ? 0 : 1;
    for (let i = 0; i < numPoints; i++) {
      stageIndices1[i] = a;
      stageIndices2[i] = b;
    }
  } else if (mode === 'unifyCuts') {
    for (let i = 0; i < numPoints; i++) {
      const s = Math.floor(Math.random() * stageCap);
      stageIndices1[i] = s;
      stageIndices2[i] = s;
    }
  } else {
    for (let i = 0; i < numPoints; i++) {
      stageIndices1[i] = Math.floor(Math.random() * stageCap);
      stageIndices2[i] = Math.floor(Math.random() * stageCap);
      while (stageCap > 1 && stageIndices2[i] === stageIndices1[i]) {
        stageIndices2[i] = Math.floor(Math.random() * stageCap);
      }
    }
  }
  return { stageIndices1, stageIndices2 };
}

function computeLayoutVerticalCenterShift(state, stageIndices1, stageIndices2, sx, sy, cellGeom) {
  const layoutGlyphAnchor = state.layoutGlyphAnchor || 'bottom';
  const centerAnchors = layoutGlyphAnchor === 'center';
  const feature = state.fontFeatureSettings || '"ss04" 1';
  const { fontName1, fontName2, pointIds, numPoints, layer1Visible, layer2Visible } = state;
  const { availCellW, availCellH, cellHeight } = cellGeom;
  const fk1 = getResolvedLayoutFontKit(fontName1);
  const fk2 = getResolvedLayoutFontKit(fontName2);

  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < numPoints; i++) {
    const stage1 = stageIndices1[i] % NUM_STAGES;
    const stage2 = stageIndices2[i] % NUM_STAGES;
    const axes1 = getAxesForLayer(state, 1, stage1);
    const axes2 = getAxesForLayer(state, 2, stage2);
    const variation1 = getVariationString(axes1);
    const variation2 = getVariationString(axes2);
    const char = pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I';

    const { w: w1, h: h1 } = measureGlyph(char, fontName1, variation1, feature);
    const { w: w2, h: h2 } = measureGlyph(char, fontName2, variation2, feature);

    const fitScale1 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w1, availCellH / h1);
    const fitScale2 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w2, availCellH / h2);
    const fitUnified = centerAnchors ? Math.min(fitScale1, fitScale2) : null;

    const pointId = pointIds[i] || '';
    const isDAtL3R3 = pointId === 'ID-L3-4' || pointId === 'ID-R3-4';
    const offsetY = isDAtL3R3 ? cellHeight * D_OFFSET_Y : 0;
    const ay = sy[i] + offsetY;

    let colMin;
    let colMax;
    if (centerAnchors) {
      let maxHalf = 0;
      if (layer1Visible) {
        const ink = filhramonieInkHalfHeightTimesFit(char, fk1, axes1, fitUnified);
        maxHalf = Math.max(maxHalf, ink ?? (h1 * fitUnified) / 2);
      }
      if (layer2Visible) {
        const ink = filhramonieInkHalfHeightTimesFit(char, fk2, axes2, fitUnified);
        maxHalf = Math.max(maxHalf, ink ?? (h2 * fitUnified) / 2);
      }
      if (maxHalf <= 0) continue;
      colMin = ay - maxHalf;
      colMax = ay + maxHalf;
    } else {
      let maxH = 0;
      if (layer1Visible) {
        const ink = filhramonieInkFullHeightTimesFit(char, fk1, axes1, fitScale1);
        maxH = Math.max(maxH, ink ?? h1 * fitScale1);
      }
      if (layer2Visible) {
        const ink = filhramonieInkFullHeightTimesFit(char, fk2, axes2, fitScale2);
        maxH = Math.max(maxH, ink ?? h2 * fitScale2);
      }
      if (maxH <= 0) continue;
      colMin = ay - maxH;
      colMax = ay;
    }
    minY = Math.min(minY, colMin);
    maxY = Math.max(maxY, colMax);
  }

  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return 0;
  return CANVAS_H / 2 - (minY + maxY) / 2;
}

function computeLayoutContentBoundsWithShift(state, stageIndices1, stageIndices2, sx, sy, cellGeom, shiftY) {
  const layoutGlyphAnchor = state.layoutGlyphAnchor || 'bottom';
  const centerAnchors = layoutGlyphAnchor === 'center';
  const feature = state.fontFeatureSettings || '"ss04" 1';
  const { fontName1, fontName2, pointIds, numPoints, layer1Visible, layer2Visible } = state;
  const { availCellW, availCellH, cellHeight } = cellGeom;
  const fk1 = getResolvedLayoutFontKit(fontName1);
  const fk2 = getResolvedLayoutFontKit(fontName2);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < numPoints; i++) {
    const stage1 = stageIndices1[i] % NUM_STAGES;
    const stage2 = stageIndices2[i] % NUM_STAGES;
    const axes1 = getAxesForLayer(state, 1, stage1);
    const axes2 = getAxesForLayer(state, 2, stage2);
    const variation1 = getVariationString(axes1);
    const variation2 = getVariationString(axes2);
    const char = pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I';

    const { w: w1, h: h1 } = measureGlyph(char, fontName1, variation1, feature);
    const { w: w2, h: h2 } = measureGlyph(char, fontName2, variation2, feature);

    const fitScale1 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w1, availCellH / h1);
    const fitScale2 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w2, availCellH / h2);
    const fitUnified = centerAnchors ? Math.min(fitScale1, fitScale2) : null;

    const pointId = pointIds[i] || '';
    const isDAtL3R3 = pointId === 'ID-L3-4' || pointId === 'ID-R3-4';
    const offsetY = isDAtL3R3 ? cellHeight * D_OFFSET_Y : 0;
    const ax = sx[i];
    const ay = sy[i] + offsetY + shiftY;

    if (centerAnchors) {
      let maxHalfY = 0;
      let halfW = 0;
      if (layer1Visible) {
        const inkY = filhramonieInkHalfHeightTimesFit(char, fk1, axes1, fitUnified);
        maxHalfY = Math.max(maxHalfY, inkY ?? (h1 * fitUnified) / 2);
        const inkWi = filhramonieInkHalfWidthTimesFit(char, fk1, axes1, fitUnified);
        halfW = Math.max(halfW, inkWi ?? (w1 * fitUnified) / 2);
      }
      if (layer2Visible) {
        const inkY = filhramonieInkHalfHeightTimesFit(char, fk2, axes2, fitUnified);
        maxHalfY = Math.max(maxHalfY, inkY ?? (h2 * fitUnified) / 2);
        const inkWi = filhramonieInkHalfWidthTimesFit(char, fk2, axes2, fitUnified);
        halfW = Math.max(halfW, inkWi ?? (w2 * fitUnified) / 2);
      }
      if (maxHalfY <= 0) continue;
      minX = Math.min(minX, ax - halfW);
      maxX = Math.max(maxX, ax + halfW);
      minY = Math.min(minY, ay - maxHalfY);
      maxY = Math.max(maxY, ay + maxHalfY);
    } else {
      let maxH = 0;
      let halfW = 0;
      if (layer1Visible) {
        const inkH = filhramonieInkFullHeightTimesFit(char, fk1, axes1, fitScale1);
        maxH = Math.max(maxH, inkH ?? h1 * fitScale1);
        const inkWi = filhramonieInkHalfWidthTimesFit(char, fk1, axes1, fitScale1);
        halfW = Math.max(halfW, inkWi ?? (w1 * fitScale1) / 2);
      }
      if (layer2Visible) {
        const inkH = filhramonieInkFullHeightTimesFit(char, fk2, axes2, fitScale2);
        maxH = Math.max(maxH, inkH ?? h2 * fitScale2);
        const inkWi = filhramonieInkHalfWidthTimesFit(char, fk2, axes2, fitScale2);
        halfW = Math.max(halfW, inkWi ?? (w2 * fitScale2) / 2);
      }
      if (maxH <= 0) continue;
      minX = Math.min(minX, ax - halfW);
      maxX = Math.max(maxX, ax + halfW);
      minY = Math.min(minY, ay - maxH);
      maxY = Math.max(maxY, ay);
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function layoutExportCropBox(bounds, pad = LAYOUT_MARGIN) {
  if (!bounds) return null;
  const { minX, minY, maxX, maxY } = bounds;
  const vwRaw = maxX - minX + 2 * pad;
  const vhRaw = maxY - minY + 2 * pad;
  if (vwRaw < 8 || vhRaw < 8 || vwRaw > CANVAS_W * 2.5 || vhRaw > CANVAS_H * 2.5) return null;
  const vx = Math.floor(minX - pad);
  const vy = Math.floor(minY - pad);
  const vw = Math.max(1, Math.ceil(maxX - minX + 2 * pad));
  const vh = Math.max(1, Math.ceil(maxY - minY + 2 * pad));
  return { vx, vy, vw, vh };
}

function layoutSvgLayersInner(layer1Paths, layer2Paths) {
  return `<g id="layout-content">
<g id="layer1">\n${layer1Paths}</g>
<g id="layer2" style="mix-blend-mode:multiply">\n${layer2Paths}</g>
</g>`;
}

function layoutSvgStringNormal(layer1Paths, layer2Paths, bgHex, crop) {
  const vx = crop ? crop.vx : 0;
  const vy = crop ? crop.vy : 0;
  const vw = crop ? crop.vw : CANVAS_W;
  const vh = crop ? crop.vh : CANVAS_H;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${vw}" height="${vh}" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="${bgHex}"/>
${layoutSvgLayersInner(layer1Paths, layer2Paths)}
</svg>`;
}

function updateLayoutFooter(state, stageIndices1, stageIndices2) {
  const fontInfoEl1 = document.getElementById('layout-font-info-1');
  const fontInfoEl2 = document.getElementById('layout-font-info-2');
  const cssEl1 = document.getElementById('layout-css-layer1');
  const cssEl2 = document.getElementById('layout-css-layer2');
  if (!fontInfoEl1 && !fontInfoEl2 && !cssEl1 && !cssEl2) return;
  if (!stageIndices1.length) return;

  const { fontName1, fontName2, layer1Visible, layer2Visible, randomizeStyling, extremeStyling, oppositeLayerStyling, orientationAxesMode, fontFeatureSettings } = state;
  const axes1 = getAxesForLayer(state, 1, stageIndices1[0]);
  const axes2 = getAxesForLayer(state, 2, stageIndices2[0]);
  const variation1 = getVariationString(axes1);
  const variation2 = getVariationString(axes2);
  const feature = fontFeatureSettings || '"ss04" 1';

  const styleModeLabel = () => {
    if (oppositeLayerStyling) return 'protiklady vrstev';
    if (orientationAxesMode) return 'os orientace';
    if (extremeStyling) return 'extrémní osy';
    return 'náhodné osy';
  };

  const modeParts1 = [];
  if (layoutViewUsesCutoutChrome(state)) modeParts1.push('výřez překryvů');
  if (!layer1Visible) modeParts1.push('vypnuto');
  if (randomizeStyling) modeParts1.push(styleModeLabel());
  const modeStr1 = modeParts1.length ? ` · ${modeParts1.join(', ')}` : '';

  const modeParts2 = [];
  if (layoutViewUsesCutoutChrome(state)) modeParts2.push('výřez překryvů');
  if (!layer2Visible) modeParts2.push('vypnuto');
  if (randomizeStyling) modeParts2.push(styleModeLabel());
  const modeStr2 = modeParts2.length ? ` · ${modeParts2.join(', ')}` : '';

  if (fontInfoEl1) fontInfoEl1.textContent = `${COMPANION_LABELS[fontName1]} · Vrstva 1 · ss04 Pattern${modeStr1}`;
  if (fontInfoEl2) fontInfoEl2.textContent = `${COMPANION_LABELS[fontName2]} · Vrstva 2 · ss04 Pattern${modeStr2}`;

  const cssBlock = (fontName, variation) => `font-family: "Bertin-${fontName}", sans-serif;
font-variation-settings: ${variation};
font-feature-settings: ${feature};`;

  if (cssEl1) cssEl1.textContent = layer1Visible ? cssBlock(fontName1, variation1) : '—';
  if (cssEl2) cssEl2.textContent = layer2Visible ? cssBlock(fontName2, variation2) : '—';

  const pfTop1 = document.getElementById('layout-css-poster-top1');
  const pfTop2 = document.getElementById('layout-css-poster-top2');
  const pfBot1 = document.getElementById('layout-css-poster-bot1');
  const pfBot2 = document.getElementById('layout-css-poster-bot2');
  const pLabelTop1 = document.getElementById('layout-font-info-poster-top1');
  const pLabelTop2 = document.getElementById('layout-font-info-poster-top2');
  const pLabelBot1 = document.getElementById('layout-font-info-poster-bot1');
  const pLabelBot2 = document.getElementById('layout-font-info-poster-bot2');
  if (pfTop1 || pfTop2 || pfBot1 || pfBot2) {
    const posterFeatRaw = posterFeatureKeyToCss(
      document.getElementById('poster-feature')?.value || 'normal'
    );
    const posterFeatCss = posterFeatRaw === 'normal' ? 'normal' : posterFeatRaw;
    const posterCssBlock = (fn, varStr, vis) => {
      if (!vis) return '—';
      return `font-family: "Bertin-${fn}", sans-serif;
font-variation-settings: ${varStr};
font-feature-settings: ${posterFeatCss};`;
    };
    const pst1 = stageIndices1[0] % NUM_STAGES;
    const pst2 = stageIndices2[0] % NUM_STAGES;
    const psb1 = (stageIndices1[1] != null ? stageIndices1[1] : stageIndices1[0]) % NUM_STAGES;
    const psb2 = (stageIndices2[1] != null ? stageIndices2[1] : stageIndices2[0]) % NUM_STAGES;
    const pvTop1 = getVariationString(getAxesForLayer(state, 1, pst1));
    const pvTop2 = getVariationString(getAxesForLayer(state, 2, pst2));
    const pvBot1 = getVariationString(getAxesForLayer(state, 1, psb1));
    const pvBot2 = getVariationString(getAxesForLayer(state, 2, psb2));

    if (pLabelTop1) pLabelTop1.textContent = `${COMPANION_LABELS[fontName1]} · Plakát horní · Vrstva 1 · st. ${pst1}`;
    if (pLabelTop2) pLabelTop2.textContent = `${COMPANION_LABELS[fontName2]} · Plakát horní · Vrstva 2 · st. ${pst2}`;
    if (pLabelBot1) pLabelBot1.textContent = `${COMPANION_LABELS[fontName1]} · Plakát dolní · Vrstva 1 · st. ${psb1}`;
    if (pLabelBot2) pLabelBot2.textContent = `${COMPANION_LABELS[fontName2]} · Plakát dolní · Vrstva 2 · st. ${psb2}`;
    if (pfTop1) pfTop1.textContent = posterCssBlock(fontName1, pvTop1, layer1Visible);
    if (pfTop2) pfTop2.textContent = posterCssBlock(fontName2, pvTop2, layer2Visible);
    if (pfBot1) pfBot1.textContent = posterCssBlock(fontName1, pvBot1, layer1Visible);
    if (pfBot2) pfBot2.textContent = posterCssBlock(fontName2, pvBot2, layer2Visible);
  }
}

function renderLayout(state, stageIndices1, stageIndices2) {
  const { container, fontName1, fontName2, logo1Color, logo2Color, pointIds, numPoints, screenX, screenY, availCellW, availCellH, cellHeight, layer1Visible, layer2Visible, fontFeatureSettings } = state;
  const layoutGlyphAnchor = state.layoutGlyphAnchor || 'bottom';
  const centerAnchors = layoutGlyphAnchor === 'center';
  const feature = fontFeatureSettings || '"ss04" 1';
  const canvasBg = normalizedCanvasBgHex(state.canvasBg);
  const shiftY = computeLayoutVerticalCenterShift(state, stageIndices1, stageIndices2, screenX, screenY, {
    availCellW,
    availCellH,
    cellHeight
  });

  const oldWrapper = container.querySelector('.layout-wrapper');
  if (oldWrapper) oldWrapper.remove();

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
    const axes1 = getAxesForLayer(state, 1, stage1);
    const axes2 = getAxesForLayer(state, 2, stage2);
    const variation1 = getVariationString(axes1);
    const variation2 = getVariationString(axes2);
    const char = pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I';

    const { w: w1, h: h1 } = measureGlyph(char, fontName1, variation1, feature);
    const { w: w2, h: h2 } = measureGlyph(char, fontName2, variation2, feature);

    const fitScale1 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w1, availCellH / h1);
    const fitScale2 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w2, availCellH / h2);
    const fitUnified = centerAnchors ? Math.min(fitScale1, fitScale2) : null;

    const pointId = pointIds[i] || '';
    const isDAtL3R3 = pointId === 'ID-L3-4' || pointId === 'ID-R3-4';
    const offsetY = isDAtL3R3 ? cellHeight * D_OFFSET_Y : 0;
    const anchorX = screenX[i];
    const anchorY = screenY[i] + offsetY + shiftY;

    let translateY;
    let transformOrigin;
    let scale1;
    let scale2;
    if (centerAnchors) {
      translateY = offsetY > 0 ? `calc(-50% + ${offsetY}px)` : '-50%';
      transformOrigin = 'center center';
      scale1 = fitUnified;
      scale2 = fitUnified;
    } else {
      translateY = offsetY > 0 ? `calc(-100% + ${offsetY}px)` : '-100%';
      transformOrigin = 'center bottom';
      scale1 = fitScale1;
      scale2 = fitScale2;
    }

    renderLayoutDebug.push({
      i,
      pointId,
      char,
      layoutGlyphAnchor,
      left: anchorX,
      top: anchorY,
      offsetY,
      anchorBottomY: centerAnchors ? undefined : anchorY,
      anchorCenter: centerAnchors ? { x: anchorX, y: anchorY } : undefined,
      translateY,
      fitScale1,
      fitScale2,
      fitUnified
    });

    const span1 = document.createElement('span');
    span1.textContent = char;
    span1.dataset.debugIdx = String(i);
    span1.style.cssText = `
      position: absolute;
      left: ${anchorX}px;
      top: ${anchorY}px;
      transform: translate(-50%, ${translateY}) scale(${scale1});
      transform-origin: ${transformOrigin};
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
      left: ${anchorX}px;
      top: ${anchorY}px;
      transform: translate(-50%, ${translateY}) scale(${scale2});
      transform-origin: ${transformOrigin};
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

  if (typeof window !== 'undefined') {
    window.__layoutRenderDebug = { layoutGlyphAnchor, centerAnchors, renderLayoutDebug };
  }

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
      const actCenterX = (relX + r.width / 2) / scaleX;
      const actCenterY = (relY + r.height / 2) / scaleY;
      const bottomY = (relY + r.height) / scaleY;
      let row;
      if (centerAnchors) {
        row = {
          i,
          pointId: set?.pointId,
          char: set?.char,
          mode: 'center',
          expAnchor: { x: setLeft, y: setTop },
          actual: { centerX: actCenterX, centerY: actCenterY },
          diff: { x: actCenterX - setLeft, y: actCenterY - setTop },
          width: r.width,
          height: r.height
        };
      } else {
        const expectedBottomY = set?.anchorBottomY ?? setTop;
        row = {
          i,
          pointId: set?.pointId,
          char: set?.char,
          mode: 'bottom',
          set: { left: setLeft, top: setTop },
          expectedAnchor: { x: setLeft, bottomY: expectedBottomY },
          actual: { centerX: actCenterX, bottomY },
          diff: { x: actCenterX - setLeft, y: bottomY - expectedBottomY },
          width: r.width,
          height: r.height
        };
      }
      spanDebug.push(row);
    });
    layoutDlog('[Layout FONT debug]', { layoutGlyphAnchor, centerAnchors, wrapperScale: { scaleX, scaleY }, canvas: { w: CANVAS_W, h: CANVAS_H } });
    layoutDlog('[Layout FONT debug] Layer1 spans:', spanDebug);
    layoutDtable(spanDebug.map((r) => (r.mode === 'center' ? {
      i: r.i,
      pointId: r.pointId,
      expX: r.expAnchor.x.toFixed(2),
      expY: r.expAnchor.y.toFixed(2),
      actCX: r.actual.centerX.toFixed(2),
      actCY: r.actual.centerY.toFixed(2),
      dX: r.diff.x.toFixed(2),
      dY: r.diff.y.toFixed(2)
    } : {
      i: r.i,
      pointId: r.pointId,
      expAX: r.expectedAnchor.x.toFixed(2),
      expBot: r.expectedAnchor.bottomY.toFixed(2),
      actCX: r.actual.centerX.toFixed(2),
      actBot: r.actual.bottomY.toFixed(2),
      dX: r.diff.x.toFixed(2),
      dY: r.diff.y.toFixed(2)
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
        bottomFromCanvasTop: firstSpanRect.y - layoutCanvas.y + firstSpanRect.height
      } : null
    };
    const layerPairDiff = [];
    layer2.querySelectorAll('[data-debug-idx]').forEach((span2) => {
      const i = parseInt(span2.dataset.debugIdx, 10);
      const span1 = layer1.querySelector(`[data-debug-idx="${i}"]`);
      if (!span1) return;
      const r1 = span1.getBoundingClientRect();
      const r2 = span2.getBoundingClientRect();
      const c1x = (r1.x - wr.x + r1.width / 2) / scaleX;
      const c1y = (r1.y - wr.y + r1.height / 2) / scaleY;
      const c2x = (r2.x - wr.x + r2.width / 2) / scaleX;
      const c2y = (r2.y - wr.y + r2.height / 2) / scaleY;
      layerPairDiff.push({ i, dCX: c2x - c1x, dCY: c2y - c1y });
    });
    layoutDlog('[Layout FONT] L1 vs L2 center delta (canvas):', layerPairDiff);
    layoutDtable(layerPairDiff.map((r) => ({ i: r.i, dCX: r.dCX.toFixed(4), dCY: r.dCY.toFixed(4) })));
    layoutDlog('[Layout context - FONT view]', layoutContext);
    if (typeof window !== 'undefined') {
      window.__spanPositionDebug = { spanDebug, layerPairDiff, wrapperRect: wr, scaleX, scaleY, renderLayoutDebug, layoutContext, layoutGlyphAnchor, centerAnchors };
    }
  });
}

function getLayoutCanvasInnerSize(container) {
  if (!container) return { width: 1, height: 1 };
  const cs = window.getComputedStyle(container);
  const pl = parseFloat(cs.paddingLeft) || 0;
  const pr = parseFloat(cs.paddingRight) || 0;
  const pt = parseFloat(cs.paddingTop) || 0;
  const pb = parseFloat(cs.paddingBottom) || 0;
  const width = Math.max(1, container.clientWidth - pl - pr);
  const height = Math.max(1, container.clientHeight - pt - pb);
  return { width, height };
}

function applyLayoutShapesDisplayScale(svgEl) {
  if (!svgEl || LAYOUT_SHAPES_DISPLAY_SCALE === 1) return;
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H / 2;
  const s = LAYOUT_SHAPES_DISPLAY_SCALE;
  const shell = document.createElementNS(SVG_NS, 'g');
  shell.setAttribute('transform', `translate(${cx},${cy}) scale(${s}) translate(${-cx},${-cy})`);
  const layoutContent = svgEl.querySelector('#layout-content');
  if (layoutContent) {
    svgEl.insertBefore(shell, layoutContent);
    shell.appendChild(layoutContent);
    return;
  }
  const filterRect = svgEl.querySelector('rect[filter]');
  if (filterRect) {
    svgEl.insertBefore(shell, filterRect);
    shell.appendChild(filterRect);
  }
}

function scaleLayoutToFit(container) {
  const wrapper = container.querySelector('.layout-wrapper');
  if (!container || !wrapper) return;
  const { width: availW, height: availH } = getLayoutCanvasInnerSize(container);
  const scaleW = availW / CANVAS_W;
  const scaleH = availH / CANVAS_H;
  let scale = Math.min(scaleW, scaleH);
  if (scale > 1) scale = 1;
  wrapper.style.position = 'absolute';
  wrapper.style.left = '50%';
  wrapper.style.top = '50%';
  wrapper.style.margin = '0';
  if (wrapper.tagName === 'CANVAS') wrapper.style.display = 'block';
  wrapper.style.transformOrigin = 'center center';
  wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
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

  const sTop1 = stageIndices1[0] % NUM_STAGES;
  const sTop2 = stageIndices2[0] % NUM_STAGES;
  const sBot1 = (stageIndices1[1] != null ? stageIndices1[1] : stageIndices1[0]) % NUM_STAGES;
  const sBot2 = (stageIndices2[1] != null ? stageIndices2[1] : stageIndices2[0]) % NUM_STAGES;

  const axesTop1 = getAxesForLayer(state, 1, sTop1);
  const axesTop2 = getAxesForLayer(state, 2, sTop2);
  const axesBot1 = getAxesForLayer(state, 1, sBot1);
  const axesBot2 = getAxesForLayer(state, 2, sBot2);
  const variationTop1 = getVariationString(axesTop1);
  const variationTop2 = getVariationString(axesTop2);
  const variationBot1 = getVariationString(axesBot1);
  const variationBot2 = getVariationString(axesBot2);

  const letter = String(posterLetter || 'F').charAt(0);

  const mTop1 = measureGlyph(letter, fontName1, variationTop1, feature);
  const mTop2 = measureGlyph(letter, fontName2, variationTop2, feature);
  const mBot1 = measureGlyph(letter, fontName1, variationBot1, feature);
  const mBot2 = measureGlyph(letter, fontName2, variationBot2, feature);
  const maxW = Math.max(mTop1.w, mTop2.w, mBot1.w, mBot2.w);
  const maxH = Math.max(mTop1.h, mTop2.h, mBot1.h, mBot2.h);

  const availW = POSTER_W - 2 * POSTER_MARGIN;
  const availH = POSTER_H - 2 * POSTER_MARGIN;
  const fitScale = Math.min(availW / maxW, availH / maxH) * (FONT_SIZE_LOAD / POSTER_FONT_SIZE);

  const centerX = POSTER_W / 2;
  const centerY = POSTER_H / 2;

  const oldWrapper = posterContainer.querySelector('.poster-wrapper');
  if (oldWrapper) oldWrapper.remove();

  const canvasBg = normalizedCanvasBgHex(state.canvasBg);
  const wrapper = document.createElement('div');
  wrapper.className = 'poster-wrapper';
  wrapper.style.cssText = `position: relative; width: ${POSTER_W}px; height: ${POSTER_H}px; background: ${canvasBg};`;

  function appendPosterHalf(clipInset, variation1, variation2) {
    const half = document.createElement('div');
    half.style.cssText = `position: absolute; inset: 0; clip-path: ${clipInset};`;
    const sub1 = document.createElement('div');
    sub1.className = 'poster-sublayer-1';
    sub1.style.cssText = `position: absolute; inset: 0;${layer1Visible === false ? ' visibility: hidden;' : ''}`;
    const sub2 = document.createElement('div');
    sub2.className = 'poster-sublayer-2';
    sub2.style.cssText = `position: absolute; inset: 0; mix-blend-mode: multiply;${layer2Visible === false ? ' visibility: hidden;' : ''}`;
    const spanA = document.createElement('span');
    spanA.textContent = letter;
    spanA.style.cssText = `
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
    const spanB = document.createElement('span');
    spanB.textContent = letter;
    spanB.style.cssText = `
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
    sub1.appendChild(spanA);
    sub2.appendChild(spanB);
    half.appendChild(sub1);
    half.appendChild(sub2);
    wrapper.appendChild(half);
  }

  appendPosterHalf('inset(0 0 50% 0)', variationTop1, variationTop2);
  appendPosterHalf('inset(50% 0 0 0)', variationBot1, variationBot2);

  posterContainer.appendChild(wrapper);
  scalePosterToFit(posterContainer);
}

function scalePosterToFit(container) {
  if (!container) return;
  const wrapper = container.querySelector('.poster-wrapper');
  if (!wrapper) return;
  const { width: availW, height: availH } = getLayoutCanvasInnerSize(container);
  const scaleW = availW / POSTER_W;
  const scaleH = availH / POSTER_H;
  let scale = Math.max(scaleW, scaleH);
  if (scale > 1) scale = 1;
  wrapper.style.position = 'absolute';
  wrapper.style.left = '50%';
  wrapper.style.top = '50%';
  wrapper.style.margin = '0';
  wrapper.style.transformOrigin = 'center center';
  wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function renderPosterToCanvas(state, stageIndices1, stageIndices2, posterLetter, posterNumber, posterFeatureKey) {
  const { fontName1, fontName2, logo1Color, logo2Color, layer1Visible, layer2Visible } = state;
  const feature = posterFeatureKeyToCss(posterFeatureKey);

  const sTop1 = stageIndices1[0] % NUM_STAGES;
  const sTop2 = stageIndices2[0] % NUM_STAGES;
  const sBot1 = (stageIndices1[1] != null ? stageIndices1[1] : stageIndices1[0]) % NUM_STAGES;
  const sBot2 = (stageIndices2[1] != null ? stageIndices2[1] : stageIndices2[0]) % NUM_STAGES;

  const variationTop1 = getVariationString(getAxesForLayer(state, 1, sTop1));
  const variationTop2 = getVariationString(getAxesForLayer(state, 2, sTop2));
  const variationBot1 = getVariationString(getAxesForLayer(state, 1, sBot1));
  const variationBot2 = getVariationString(getAxesForLayer(state, 2, sBot2));

  const letter = String(posterLetter || 'F').charAt(0);

  const mTop1 = measureGlyph(letter, fontName1, variationTop1, feature);
  const mTop2 = measureGlyph(letter, fontName2, variationTop2, feature);
  const mBot1 = measureGlyph(letter, fontName1, variationBot1, feature);
  const mBot2 = measureGlyph(letter, fontName2, variationBot2, feature);
  const maxW = Math.max(mTop1.w, mTop2.w, mBot1.w, mBot2.w);
  const maxH = Math.max(mTop1.h, mTop2.h, mBot1.h, mBot2.h);

  const availW = POSTER_W - 2 * POSTER_MARGIN;
  const availH = POSTER_H - 2 * POSTER_MARGIN;
  const fitScale = Math.min(availW / maxW, availH / maxH) * (FONT_SIZE_LOAD / POSTER_FONT_SIZE);

  const centerX = POSTER_W / 2;
  const centerY = POSTER_H / 2;
  const halfH = POSTER_H / 2;

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

  if (layer1Visible) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, POSTER_W, halfH);
    ctx.clip();
    drawGlyph(ctx, logo1Color, fontName1, variationTop1, fitScale, centerX, centerY, letter);
    ctx.restore();
  }
  if (layer2Visible) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, POSTER_W, halfH);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    drawGlyph(ctx, logo2Color, fontName2, variationTop2, fitScale, centerX, centerY, letter);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (layer1Visible) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, halfH, POSTER_W, halfH);
    ctx.clip();
    drawGlyph(ctx, logo1Color, fontName1, variationBot1, fitScale, centerX, centerY, letter);
    ctx.restore();
  }
  if (layer2Visible) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, halfH, POSTER_W, halfH);
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    drawGlyph(ctx, logo2Color, fontName2, variationBot2, fitScale, centerX, centerY, letter);
    ctx.restore();
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

async function saveLayoutPng(shapes, canvasBg) {
  if (!shapes) return;
  const bg = normalizedCanvasBgHex(canvasBg);
  const ts = layoutTimestamp();
  const layoutSvgForFile = shapes.layoutSvgExport || shapes.layoutSvg;
  const layoutW = shapes.layoutExportW ?? CANVAS_W;
  const layoutH = shapes.layoutExportH ?? CANVAS_H;
  const layoutBlob = await svgToPngBlob(layoutSvgForFile, layoutW, layoutH, bg);
  if (layoutBlob) downloadBlob(layoutBlob, `layout_${ts}.png`);
}

async function savePosterPng(shapes, canvasBg) {
  if (!shapes) return;
  const bg = normalizedCanvasBgHex(canvasBg);
  const ts = layoutTimestamp();
  const posterBlob = await svgToPngBlob(shapes.posterSvg, POSTER_W, POSTER_H, bg);
  if (posterBlob) downloadBlob(posterBlob, `poster_${ts}.png`);
}

function escapeXmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FONT_PATH_CMD = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' };

function glyphCommandsToSvgD(commands) {
  return commands.map((c) => {
    const args = c.args.map((arg) => Math.round(arg * 100) / 100);
    return `${FONT_PATH_CMD[c.command]}${args.join(' ')}`;
  }).join('');
}

function glyphCommandsBBox(commands) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of commands) {
    for (let i = 0; i < c.args.length; i += 2) {
      const x = c.args[i];
      const y = c.args[i + 1];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function splitScaledGlyphPathToContours(scaledPath) {
  const chunks = [];
  let cur = [];
  for (const c of scaledPath.commands) {
    if (c.command === 'moveTo' && cur.length > 0) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(c);
  }
  if (cur.length) chunks.push(cur);
  return chunks
    .map((commands) => {
      const pathData = glyphCommandsToSvgD(commands);
      const box = glyphCommandsBBox(commands);
      if (!box) return null;
      const cx = (box.minX + box.maxX) / 2;
      const cy = (box.minY + box.maxY) / 2;
      const bottomY = box.minY;
      const width = box.maxX - box.minX;
      const height = box.maxY - box.minY;
      return { pathData, cx, cy, bottomY, width, height };
    })
    .filter(Boolean);
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
    const contours = splitScaledGlyphPathToContours(scaledPath);
    if (!contours.length) return null;
    const box = scaledPath.bbox || scaledPath.cbox;
    if (!box) return null;
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const bottomY = box.minY;
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    const upem = fontVar.unitsPerEm;
    const scalePx = upem ? fontSize / upem : 0;
    const adv = glyph.advanceWidth;
    const os2 = fontVar['OS/2'];
    let metAsc = fontVar.ascent;
    let metDesc = fontVar.descent;
    if (os2 && os2.version > 0 && Number.isFinite(os2.typoAscender) && Number.isFinite(os2.typoDescender)) {
      metAsc = os2.typoAscender;
      metDesc = os2.typoDescender;
    }
    let pivotX = cx;
    let pivotYBottom = bottomY;
    let pivotYCenter = cy;
    if (scalePx > 0 && Number.isFinite(adv) && adv > 0) {
      pivotX = (adv / 2) * scalePx;
    }
    if (scalePx > 0 && Number.isFinite(metDesc)) {
      pivotYBottom = metDesc * scalePx;
    }
    if (scalePx > 0 && Number.isFinite(metAsc) && Number.isFinite(metDesc)) {
      pivotYCenter = ((metAsc + metDesc) / 2) * scalePx;
    }
    return { contours, cx, cy, bottomY, width, height, pivotX, pivotYBottom, pivotYCenter };
  } catch {
    return null;
  }
}

function collectSubcontourOmitPool(state, stageIndices1, stageIndices2, font1, font2, _getPosterInputs) {
  const { pointIds, numPoints, layer1Visible, layer2Visible } = state;
  const fkFeat = { ss04: 1 };
  const pool = [];
  for (let i = 0; i < numPoints; i++) {
    const stage1 = stageIndices1[i] % NUM_STAGES;
    const stage2 = stageIndices2[i] % NUM_STAGES;
    const axes1 = getAxesForLayer(state, 1, stage1);
    const axes2 = getAxesForLayer(state, 2, stage2);
    const char = pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I';
    const glyph1 = getGlyphPathFromFontKit(font1, char, FONT_SIZE_LOAD, axes1, fkFeat);
    const glyph2 = getGlyphPathFromFontKit(font2, char, FONT_SIZE_LOAD, axes2, fkFeat);
    if (layer1Visible && glyph1 && glyph1.contours.length > 1) {
      for (let si = 0; si < glyph1.contours.length; si++) pool.push({ layer: 1, i, si });
    }
    if (layer2Visible && glyph2 && glyph2.contours.length > 1) {
      for (let si = 0; si < glyph2.contours.length; si++) pool.push({ layer: 2, i, si });
    }
  }
  return pool;
}

function collectFilhSubcontourScalePool(state, stageIndices1, stageIndices2, font1, font2, getPosterInputs) {
  const fkFeat = { ss04: 1 };
  const { pointIds, numPoints, layer1Visible, layer2Visible } = state;
  const pool = [];
  for (let i = 0; i < numPoints; i++) {
    const stage1 = stageIndices1[i] % NUM_STAGES;
    const stage2 = stageIndices2[i] % NUM_STAGES;
    const axes1 = getAxesForLayer(state, 1, stage1);
    const axes2 = getAxesForLayer(state, 2, stage2);
    const char = pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I';
    const glyph1 = getGlyphPathFromFontKit(font1, char, FONT_SIZE_LOAD, axes1, fkFeat);
    const glyph2 = getGlyphPathFromFontKit(font2, char, FONT_SIZE_LOAD, axes2, fkFeat);
    if (layer1Visible && glyph1 && glyph1.contours.length) {
      for (let si = 0; si < glyph1.contours.length; si++) pool.push({ layer: 1, i, si });
    }
    if (layer2Visible && glyph2 && glyph2.contours.length) {
      for (let si = 0; si < glyph2.contours.length; si++) pool.push({ layer: 2, i, si });
    }
  }
  const pi = getPosterInputs();
  const posterFeatureKey = pi.featureKey || 'normal';
  const posterFk = posterFeatureKeyToFontKit(posterFeatureKey);
  const st1 = stageIndices1[0] % NUM_STAGES;
  const st2 = stageIndices2[0] % NUM_STAGES;
  const sb1 = (stageIndices1[1] != null ? stageIndices1[1] : stageIndices1[0]) % NUM_STAGES;
  const sb2 = (stageIndices2[1] != null ? stageIndices2[1] : stageIndices2[0]) % NUM_STAGES;
  const axesTop1 = getAxesForLayer(state, 1, st1);
  const axesTop2 = getAxesForLayer(state, 2, st2);
  const axesBot1 = getAxesForLayer(state, 1, sb1);
  const axesBot2 = getAxesForLayer(state, 2, sb2);
  const letter = String(pi.letter || 'F').charAt(0);
  const glyphTop1 = getGlyphPathFromFontKit(font1, letter, POSTER_FONT_SIZE, axesTop1, posterFk);
  const glyphTop2 = getGlyphPathFromFontKit(font2, letter, POSTER_FONT_SIZE, axesTop2, posterFk);
  const glyphBot1 = getGlyphPathFromFontKit(font1, letter, POSTER_FONT_SIZE, axesBot1, posterFk);
  const glyphBot2 = getGlyphPathFromFontKit(font2, letter, POSTER_FONT_SIZE, axesBot2, posterFk);
  const add = (tag, g, vis) => {
    if (vis && g && g.contours.length) {
      for (let si = 0; si < g.contours.length; si++) pool.push({ filhTag: tag, si });
    }
  };
  add('l1t', glyphTop1, layer1Visible);
  add('l1b', glyphBot1, layer1Visible);
  add('l2t', glyphTop2, layer2Visible);
  add('l2b', glyphBot2, layer2Visible);
  return pool;
}

function applyRandomSubcontourOmissions(state, picks) {
  clearShapeOmitState(state);
  for (const p of picks) {
    if (p.poster) {
      if (p.layer === 1) state.shapeOmitPosterSub1.add(p.si);
      else state.shapeOmitPosterSub2.add(p.si);
    } else {
      const map = p.layer === 1 ? state.shapeOmitSubcontours1 : state.shapeOmitSubcontours2;
      let sub = map.get(p.i);
      if (!sub) {
        sub = new Set();
        map.set(p.i, sub);
      }
      sub.add(p.si);
    }
  }
}

function applyPairCutoutAllCells(state) {
  clearShapePairCutoutState(state);
  const n = state.numPoints || 0;
  for (let i = 0; i < n; i++) {
    state.shapePairCutoutCells.add(i);
  }
  if (state.layer1Visible && state.layer2Visible) {
    state.posterRandomPairCutout = true;
  }
}

function applyRandomSubcontourScales(state, scaledPicks) {
  for (const p of scaledPicks) {
    if (p.filhTag) {
      state.shapeScalePosterFilh.set(`${p.filhTag}:${p.si}`, p.scale);
      continue;
    }
    const top = p.layer === 1 ? state.shapeScaleSubcontours1 : state.shapeScaleSubcontours2;
    let inner = top.get(p.i);
    if (!inner) {
      inner = new Map();
      top.set(p.i, inner);
    }
    inner.set(p.si, p.scale);
  }
}

function filhramonieInkHalfHeightTimesFit(char, fontKit, axes, fit) {
  if (!fontKit || fit == null || !Number.isFinite(fit)) return null;
  const g = getGlyphPathFromFontKit(fontKit, char, FONT_SIZE_LOAD, axes, { ss04: 1 });
  if (!g) return null;
  return (g.height * fit) / 2;
}

function filhramonieInkFullHeightTimesFit(char, fontKit, axes, fit) {
  if (!fontKit || !Number.isFinite(fit)) return null;
  const g = getGlyphPathFromFontKit(fontKit, char, FONT_SIZE_LOAD, axes, { ss04: 1 });
  if (!g) return null;
  return g.height * fit;
}

function filhramonieInkHalfWidthTimesFit(char, fontKit, axes, fit) {
  if (!fontKit || !Number.isFinite(fit)) return null;
  const g = getGlyphPathFromFontKit(fontKit, char, FONT_SIZE_LOAD, axes, { ss04: 1 });
  if (!g) return null;
  return (g.width * fit) / 2;
}

function convertLayoutToShapes(font1, font2, state, stageIndices1, stageIndices2) {
  const { fontName1, fontName2, logo1Color, logo2Color, pointIds, numPoints, layer1Visible, layer2Visible } = state;
  const layoutGlyphAnchor = state.layoutGlyphAnchor || 'bottom';
  const centerAnchors = layoutGlyphAnchor === 'center';
  const screenX = state.screenX;
  const screenY = state.screenY;
  const availCellW = state.availCellW;
  const availCellH = state.availCellH;
  const cellHeight = state.cellHeight;
  const feature = state.fontFeatureSettings || '"ss04" 1';
  const bgHex = normalizedCanvasBgHex(state.canvasBg);
  const shiftY = computeLayoutVerticalCenterShift(state, stageIndices1, stageIndices2, screenX, screenY, {
    availCellW,
    availCellH,
    cellHeight
  });

  const useCellSplit = state.shapePairCutoutCells && state.shapePairCutoutCells.size > 0;
  const cellL1 = useCellSplit ? new Array(numPoints).fill('') : null;
  const cellL2 = useCellSplit ? new Array(numPoints).fill('') : null;

  let layer1Paths = '';
  let layer2Paths = '';
  const debugBefore = [];
  const debugAfter = [];

  for (let i = 0; i < numPoints; i++) {
    const stage1 = stageIndices1[i] % NUM_STAGES;
    const stage2 = stageIndices2[i] % NUM_STAGES;
    const axes1 = getAxesForLayer(state, 1, stage1);
    const axes2 = getAxesForLayer(state, 2, stage2);
    const variation1 = getVariationString(axes1);
    const variation2 = getVariationString(axes2);
    const char = pointIds[i] ? getGlyphCharForId(pointIds[i]) : 'I';

    const { w: w1, h: h1 } = measureGlyph(char, fontName1, variation1, feature);
    const { w: w2, h: h2 } = measureGlyph(char, fontName2, variation2, feature);

    const fitScale1 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w1, availCellH / h1);
    const fitScale2 = GLYPH_SIZE_FACTOR * Math.min(availCellW / w2, availCellH / h2);
    const fitUnified = centerAnchors ? Math.min(fitScale1, fitScale2) : null;

    const pointId = pointIds[i] || '';
    const isDAtL3R3 = pointId === 'ID-L3-4' || pointId === 'ID-R3-4';
    const offsetY = isDAtL3R3 ? cellHeight * D_OFFSET_Y : 0;
    const posY = screenY[i] + offsetY + shiftY;

    debugBefore.push({
      i,
      pointId,
      char,
      layoutGlyphAnchor,
      screenX: screenX[i],
      screenY: screenY[i],
      offsetY,
      posY,
      translateY: offsetY > 0 ? `calc(-50% + ${offsetY}px)` : '-50%',
      fitScale1,
      fitScale2,
      fitUnified,
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
      anchor: centerAnchors ? 'center' : 'bottom',
      fitScale1,
      fitScale2,
      fitUnified,
      glyph1: glyph1
        ? {
            nContour: glyph1.contours.length,
            cx: glyph1.cx,
            cy: glyph1.cy,
            bottomY: glyph1.bottomY,
            pivotX: glyph1.pivotX,
            pivotYBottom: glyph1.pivotYBottom,
            pivotYCenter: glyph1.pivotYCenter,
            width: glyph1.width,
            height: glyph1.height
          }
        : null,
      glyph2: glyph2
        ? {
            nContour: glyph2.contours.length,
            cx: glyph2.cx,
            cy: glyph2.cy,
            bottomY: glyph2.bottomY,
            pivotX: glyph2.pivotX,
            pivotYBottom: glyph2.pivotYBottom,
            pivotYCenter: glyph2.pivotYCenter,
            width: glyph2.width,
            height: glyph2.height
          }
        : null
    });

    const subOmit1 = state.shapeOmitSubcontours1 && state.shapeOmitSubcontours1.get(i);
    const subOmit2 = state.shapeOmitSubcontours2 && state.shapeOmitSubcontours2.get(i);
    if (layer1Visible && glyph1) {
      const fs = centerAnchors ? fitUnified : fitScale1;
      const py1 = centerAnchors ? glyph1.pivotYCenter : glyph1.pivotYBottom;
      const trBase = `translate(${screenX[i]},${posY}) scale(${fs}) scale(1,-1) translate(${-glyph1.pivotX},${-py1})`;
      glyph1.contours.forEach((sub, si) => {
        if (subOmit1 && subOmit1.has(si)) return;
        const tr = `${trBase}${subcontourLocalScaleSuffix(sub, glyph1.pivotX, py1, state.shapeScaleSubcontours1, i, si)}`;
        const line = `  <path data-idx="${i}" data-sub="${si}" d="${escapeXmlAttr(sub.pathData)}" fill="${c1}" transform="${tr}"/>\n`;
        if (useCellSplit) cellL1[i] += line;
        else layer1Paths += line;
      });
    }
    if (layer2Visible && glyph2) {
      const fs = centerAnchors ? fitUnified : fitScale2;
      const py2 = centerAnchors ? glyph2.pivotYCenter : glyph2.pivotYBottom;
      const trBase = `translate(${screenX[i]},${posY}) scale(${fs}) scale(1,-1) translate(${-glyph2.pivotX},${-py2})`;
      glyph2.contours.forEach((sub, si) => {
        if (subOmit2 && subOmit2.has(si)) return;
        const tr = `${trBase}${subcontourLocalScaleSuffix(sub, glyph2.pivotX, py2, state.shapeScaleSubcontours2, i, si)}`;
        const line = `  <path data-idx="${i}" data-sub="${si}" d="${escapeXmlAttr(sub.pathData)}" fill="${c2}" transform="${tr}"/>\n`;
        if (useCellSplit) cellL2[i] += line;
        else layer2Paths += line;
      });
    }
  }

  const debugData = {
    before: debugBefore,
    after: debugAfter,
    canvas: { CANVAS_W, CANVAS_H },
    geometry: { availCellW, availCellH, cellHeight },
    layoutGlyphAnchor
  };
  layoutDlog('[Layout conversion → shapes]', { layoutGlyphAnchor, centerAnchors, rows: debugAfter.length });
  layoutDlog('[Layout conversion] Sample after[0..2]:', debugAfter.slice(0, 3));
  layoutDlog('[Layout conversion] Canvas:', debugData.canvas, 'Geometry:', debugData.geometry);
  if (typeof window !== 'undefined') {
    window.__layoutConversionDebug = debugData;
    if (window.__layoutRenderDebug && layoutDebugEnabled()) {
      layoutDlog('[Layout COMPARISON] Render vs Export:', {
        render: window.__layoutRenderDebug.renderLayout,
        export: debugAfter
      });
    }
  }

  if (useCellSplit) {
    let base1 = '';
    let base2 = '';
    const cutIdx = [];
    for (let i = 0; i < numPoints; i++) {
      const wantCut = state.shapePairCutoutCells.has(i);
      const a = cellL1[i];
      const b = cellL2[i];
      if (wantCut && a && b) cutIdx.push(i);
      else {
        base1 += a;
        base2 += b;
      }
    }
    if (cutIdx.length > 0) {
      const stackParts = [];
      for (const ci of cutIdx.sort((x, y) => x - y)) {
        const holeD = pairFragmentsIntersectPathD(cellL1[ci], cellL2[ci]);
        const mul = `<g style="mix-blend-mode:multiply">\n${cellL1[ci]}${cellL2[ci]}</g>`;
        const holePath = holeD
          ? `\n  <path fill="${escapeXmlAttr(bgHex)}" d="${escapeXmlAttr(holeD)}"/>`
          : '';
        stackParts.push(`<g data-layout-pair-cutout="1">\n${mul}${holePath}\n</g>`);
      }
      const layoutSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="${bgHex}"/>
${layoutSvgLayersInner(base1, base2)}
${stackParts.join('\n')}
</svg>`;
      return {
        layoutSvg,
        layoutSvgExport: layoutSvg,
        layoutExportW: CANVAS_W,
        layoutExportH: CANVAS_H
      };
    }
    for (let i = 0; i < numPoints; i++) {
      layer1Paths += cellL1[i];
      layer2Paths += cellL2[i];
    }
  }

  const cellGeom = { availCellW, availCellH, cellHeight };
  const contentBounds = computeLayoutContentBoundsWithShift(
    state,
    stageIndices1,
    stageIndices2,
    screenX,
    screenY,
    cellGeom,
    shiftY
  );
  const exportCrop = layoutExportCropBox(contentBounds);

  const layoutSvg = layoutSvgStringNormal(layer1Paths, layer2Paths, bgHex, null);
  let layoutSvgExport = layoutSvg;
  let layoutExportW = CANVAS_W;
  let layoutExportH = CANVAS_H;
  if (exportCrop) {
    layoutSvgExport = layoutSvgStringNormal(layer1Paths, layer2Paths, bgHex, exportCrop);
    layoutExportW = exportCrop.vw;
    layoutExportH = exportCrop.vh;
  }
  return { layoutSvg, layoutSvgExport, layoutExportW, layoutExportH };
}

function convertPosterToShapes(font1, font2, state, stageIndices1, stageIndices2, posterLetter, posterNumber, posterFeatureKey) {
  const { fontName1, fontName2, logo1Color, logo2Color, layer1Visible, layer2Visible } = state;
  const bgHex = normalizedCanvasBgHex(state.canvasBg);
  const feature = posterFeatureKeyToCss(posterFeatureKey);
  const posterFk = posterFeatureKeyToFontKit(posterFeatureKey);

  const st1 = stageIndices1[0] % NUM_STAGES;
  const st2 = stageIndices2[0] % NUM_STAGES;
  const sb1 = (stageIndices1[1] != null ? stageIndices1[1] : stageIndices1[0]) % NUM_STAGES;
  const sb2 = (stageIndices2[1] != null ? stageIndices2[1] : stageIndices2[0]) % NUM_STAGES;

  const axesTop1 = getAxesForLayer(state, 1, st1);
  const axesTop2 = getAxesForLayer(state, 2, st2);
  const axesBot1 = getAxesForLayer(state, 1, sb1);
  const axesBot2 = getAxesForLayer(state, 2, sb2);
  const variationTop1 = getVariationString(axesTop1);
  const variationTop2 = getVariationString(axesTop2);
  const variationBot1 = getVariationString(axesBot1);
  const variationBot2 = getVariationString(axesBot2);

  const letter = String(posterLetter || 'F').charAt(0);

  const availW = POSTER_W - 2 * POSTER_MARGIN;
  const availH = POSTER_H - 2 * POSTER_MARGIN;
  const centerX = POSTER_W / 2;
  const centerY = POSTER_H / 2;
  const halfH = POSTER_H / 2;

  const mTop1 = measureGlyph(letter, fontName1, variationTop1, feature);
  const mTop2 = measureGlyph(letter, fontName2, variationTop2, feature);
  const mBot1 = measureGlyph(letter, fontName1, variationBot1, feature);
  const mBot2 = measureGlyph(letter, fontName2, variationBot2, feature);
  const maxW = Math.max(mTop1.w, mTop2.w, mBot1.w, mBot2.w);
  const maxH = Math.max(mTop1.h, mTop2.h, mBot1.h, mBot2.h);
  const fitScale = Math.min(availW / maxW, availH / maxH) * (FONT_SIZE_LOAD / POSTER_FONT_SIZE);

  const glyphTop1 = getGlyphPathFromFontKit(font1, letter, POSTER_FONT_SIZE, axesTop1, posterFk);
  const glyphTop2 = getGlyphPathFromFontKit(font2, letter, POSTER_FONT_SIZE, axesTop2, posterFk);
  const glyphBot1 = getGlyphPathFromFontKit(font1, letter, POSTER_FONT_SIZE, axesBot1, posterFk);
  const glyphBot2 = getGlyphPathFromFontKit(font2, letter, POSTER_FONT_SIZE, axesBot2, posterFk);

  const c1 = `rgb(${logo1Color[0]},${logo1Color[1]},${logo1Color[2]})`;
  const c2 = `rgb(${logo2Color[0]},${logo2Color[1]},${logo2Color[2]})`;

  const clipSeq = ++posterClipIdSeq;
  const clipTop = `fh-poster-clipTop-${clipSeq}`;
  const clipBot = `fh-poster-clipBot-${clipSeq}`;
  const clipDefs = `<clipPath id="${clipTop}"><rect x="0" y="0" width="${POSTER_W}" height="${halfH}"/></clipPath>
  <clipPath id="${clipBot}"><rect x="0" y="${halfH}" width="${POSTER_W}" height="${halfH}"/></clipPath>
`;

  let layer1Paths = '';
  let layer2Paths = '';

  function posterGlyphToClippedGroup(glyph, fill, trBase, clipId, omitSet, filhTag) {
    if (!glyph) return '';
    const inner = glyph.contours
      .map((sub, si) => {
        if (omitSet && omitSet.has(si)) return '';
        const tr = `${trBase}${filhPosterScaleSuffix(sub, glyph.pivotX, glyph.pivotYCenter, state.shapeScalePosterFilh, filhTag, si)}`;
        return `<path d="${escapeXmlAttr(sub.pathData)}" fill="${fill}" transform="${tr}"/>`;
      })
      .join('');
    return `  <g clip-path="url(#${clipId})">${inner}</g>\n`;
  }
  if (layer1Visible && glyphTop1) {
    const trBase = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyphTop1.pivotX},${-glyphTop1.pivotYCenter})`;
    layer1Paths += posterGlyphToClippedGroup(glyphTop1, c1, trBase, clipTop, state.shapeOmitPosterSub1, 'l1t');
  }
  if (layer1Visible && glyphBot1) {
    const trBase = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyphBot1.pivotX},${-glyphBot1.pivotYCenter})`;
    layer1Paths += posterGlyphToClippedGroup(glyphBot1, c1, trBase, clipBot, state.shapeOmitPosterSub1, 'l1b');
  }
  if (layer2Visible && glyphTop2) {
    const trBase = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyphTop2.pivotX},${-glyphTop2.pivotYCenter})`;
    layer2Paths += posterGlyphToClippedGroup(glyphTop2, c2, trBase, clipTop, state.shapeOmitPosterSub2, 'l2t');
  }
  if (layer2Visible && glyphBot2) {
    const trBase = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyphBot2.pivotX},${-glyphBot2.pivotYCenter})`;
    layer2Paths += posterGlyphToClippedGroup(glyphBot2, c2, trBase, clipBot, state.shapeOmitPosterSub2, 'l2b');
  }

  const usePosterPairCut = state.posterRandomPairCutout && layer1Paths && layer2Paths;
  if (usePosterPairCut) {
    const holeD = pairFragmentsIntersectPathD(layer1Paths, layer2Paths);
    const holePath = holeD
      ? `  <path fill="${escapeXmlAttr(bgHex)}" d="${escapeXmlAttr(holeD)}"/>\n`
      : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${POSTER_W}" height="${POSTER_H}" viewBox="0 0 ${POSTER_W} ${POSTER_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="${bgHex}"/>
<defs>
${clipDefs}</defs>
<g data-poster-pair-cutout="1">
<g id="layer1">\n${layer1Paths}</g>
<g id="layer2" style="mix-blend-mode:multiply">\n${layer2Paths}</g>
${holePath}</g>
</svg>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${POSTER_W}" height="${POSTER_H}" viewBox="0 0 ${POSTER_W} ${POSTER_H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="${bgHex}"/>
<defs>
${clipDefs}</defs>
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
  const layout = convertLayoutToShapes(font1, font2, state, stageIndices1, stageIndices2);
  const posterSvg = convertPosterToShapes(font1, font2, state, stageIndices1, stageIndices2, posterInputs.letter, posterInputs.number, posterInputs.featureKey);
  return { ...layout, posterSvg };
}

function layoutViewUsesCutoutChrome(state) {
  if (!state) return false;
  return !!(
    (state.shapePairCutoutCells && state.shapePairCutoutCells.size > 0) ||
    state.posterRandomPairCutout
  );
}

function displayShapesAsSvg(layoutSvg, posterSvg, layoutContainer, options = {}) {
  const cutoutOpt = options.cutout;
  const cutout = typeof cutoutOpt === 'boolean' ? cutoutOpt : layoutViewUsesCutoutChrome(options.state);
  const { canvasBg: canvasBgOpt } = options;
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
    if (!wrap) {
      wrap = document.createElement('div');
      layoutEl.appendChild(wrap);
    }
    wrap.className = cutout ? 'layout-wrapper layout-cutout-view' : 'layout-wrapper layout-shapes-view';
    wrap.style.cssText = `position: relative; width: ${CANVAS_W}px; height: ${CANVAS_H}px; background: ${canvasBg};`;
    wrap.innerHTML = svgPart(layoutSvg);
    applyLayoutShapesDisplayScale(wrap.querySelector('svg'));
    scaleLayoutToFit(layoutContainer);
    requestAnimationFrame(() => {
      scaleLayoutToFit(layoutContainer);
      const wr = wrap.getBoundingClientRect();
      const scaleX = wr.width / CANVAS_W;
      const scaleY = wr.height / CANVAS_H;
      const svgEl = wrap.querySelector('svg');
      const paths = svgEl
        ? Array.from(svgEl.querySelectorAll('path[data-idx]')).sort(
            (a, b) => parseInt(a.getAttribute('data-idx') || '0', 10) - parseInt(b.getAttribute('data-idx') || '0', 10)
          )
        : [];
      const exportData = window.__layoutConversionDebug?.after || [];
      const convAnchor = window.__layoutConversionDebug?.layoutGlyphAnchor || 'bottom';
      const svgDebug = paths.map((path) => {
        const i = parseInt(path.getAttribute('data-idx') || '-1', 10);
        const exp = exportData[i];
        const tr = path.getAttribute('transform') || '';
        const m = tr.match(/translate\(([^,]+),([^)]+)\)/);
        const posX = m ? parseFloat(m[1]) : 0;
        const posY = m ? parseFloat(m[2]) : 0;
        const svgPt = pathCenterInSvgViewport(path);
        const r = path.getBoundingClientRect();
        let actCX;
        let actCY;
        if (svgPt) {
          actCX = svgPt.x;
          actCY = svgPt.y;
        } else {
          actCX = (r.x - wr.x + r.width / 2) / scaleX;
          actCY = (r.y - wr.y + r.height / 2) / scaleY;
        }
        const bottomY = (r.y - wr.y + r.height) / scaleY;
        const expX = exp?.svgPosX ?? posX;
        const expY = exp?.svgPosY ?? posY;
        let diffX;
        let diffY;
        if (convAnchor === 'center') {
          diffX = actCX - expX;
          diffY = actCY - expY;
        } else {
          diffX = actCX - expX;
          diffY = bottomY - expY;
        }
        return {
          i,
          pointId: exp?.pointId,
          anchor: convAnchor,
          firstTranslate: { x: posX, y: posY },
          expAnchor: { x: expX, y: expY },
          actualCenterSVG: svgPt ? { x: actCX, y: actCY } : null,
          actualCenterFallback: svgPt ? null : { x: actCX, y: actCY },
          actualBottomY: bottomY,
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
          bottomFromCanvasTop: firstPathRect.y - layoutCanvas.y + firstPathRect.height
        } : null
      };
      layoutDlog('[Layout context - SVG view]', layoutContext);
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
            font: fontCtx.firstElement?.bottomFromCanvasTop.toFixed(1),
            svg: layoutContext.firstElement?.bottomFromCanvasTop.toFixed(1),
            diff: fontCtx.firstElement && layoutContext.firstElement
              ? (layoutContext.firstElement.bottomFromCanvasTop - fontCtx.firstElement.bottomFromCanvasTop).toFixed(1)
              : 'n/a'
          }
        };
        layoutDlog('[Layout JUMP analysis] Font vs SVG comparison:', comparison);
      }
      layoutDlog('[Layout SVG shapes debug]', {
        layoutGlyphAnchor: convAnchor,
        wrapperCss: { width: wr.width, height: wr.height },
        scale: { scaleX, scaleY },
        note: convAnchor === 'center'
          ? 'diff = rendered path center (SVG user/px) minus expAnchor (should be ~0)'
          : 'diff.x = centerX gap; diff.y = bottomY minus anchor Y'
      });
      layoutDlog('[Layout SVG shapes debug] Per path:', svgDebug);
      layoutDtable(svgDebug.map((r) => ({
        i: r.i,
        pointId: r.pointId,
        expAX: r.expAnchor.x.toFixed(1),
        expAY: r.expAnchor.y.toFixed(1),
        actCX: (r.actualCenterSVG || r.actualCenterFallback).x.toFixed(2),
        actCY: (r.actualCenterSVG || r.actualCenterFallback).y.toFixed(2),
        dX: r.diff.x.toFixed(2),
        dY: r.diff.y.toFixed(2)
      })));
      if (typeof window !== 'undefined') {
        window.__layoutSvgShapesDebug = { svgDebug, convAnchor, wrapperRect: wr, scaleX, scaleY, layoutContext };
      }
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
  if (options.state) {
    syncTextureBlur(options.state);
    syncTextureRadial(options.state);
  }
}

function saveLayoutSvg(shapes) {
  if (!shapes) return;
  const ts = layoutTimestamp();
  const layoutSvgForFile = shapes.layoutSvgExport || shapes.layoutSvg;
  downloadBlob(new Blob([layoutSvgForFile], { type: 'image/svg+xml' }), `layout_${ts}.svg`);
}

function savePosterSvg(shapes) {
  if (!shapes) return;
  const ts = layoutTimestamp();
  downloadBlob(new Blob([shapes.posterSvg], { type: 'image/svg+xml' }), `poster_${ts}.svg`);
}

export function initLayout(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  Promise.all([
    fetch(`${B}Logo_startD.svg`).then((r) => {
      if (!r.ok) throw new Error(`Logo_startD.svg fetch failed: ${r.status}`);
      return r.text();
    }),
    fetch(`${B}Logo_start.svg`).then((r) => {
      if (!r.ok) throw new Error(`Logo_start.svg fetch failed: ${r.status}`);
      return r.text();
    })
  ])
    .then(async ([svgTextD, svgTextStart]) => {
      const parsedD = parseSvgPositions(svgTextD);
      const parsedStart = parseSvgPositions(svgTextStart, SVG_PATH_TO_POINT_INDEX_LOGO_START);
      const svgPositions = parsedD.positions;
      const pointIds = POINT_IDS.slice(0, svgPositions.length);
      const numPoints = svgPositions.length;

      let fontName1 = FONT_NAMES_DOT[Math.floor(Math.random() * FONT_NAMES_DOT.length)];
      let fontName2 = FONT_NAMES_SQUARE[Math.floor(Math.random() * FONT_NAMES_SQUARE.length)];
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

      const geomDefaultFont = computeLayoutScreenGeometry(parsedD);
      const geomDefaultExport = computeLayoutScreenGeometry(parsedStart);

      let krok1ConfirmedForSvg = false;

      function syncLayoutGeometry(state) {
        state.layoutGlyphAnchor = 'bottom';
        copyLayoutGeometryIntoState(state, geomDefaultFont, geomDefaultExport);
        if (typeof window !== 'undefined') {
          window.__layoutGeometryDebug = {
            useLogoKrok1: false,
            layoutGlyphAnchor: state.layoutGlyphAnchor,
            krokPathMap: 'Logo_startD screen · Logo_start export',
            pair_cutout_chrome: layoutViewUsesCutoutChrome(state),
            krok1ConfirmedForSvg
          };
        }
      }

      const screenX = geomDefaultFont.screenX.slice();
      const screenY = geomDefaultFont.screenY.slice();
      const availCellW = geomDefaultFont.availCellW;
      const availCellH = geomDefaultFont.availCellH;
      const cellHeight = geomDefaultFont.cellHeight;

      const initDebug = {
        svgPositions: svgPositions.map((p, i) => ({ i, pointId: pointIds[i], raw: p })),
        fontScreen: { screenX: [...screenX], screenY: [...screenY] },
        exportScreen: { screenX: [...geomDefaultExport.screenX], screenY: [...geomDefaultExport.screenY] }
      };
      layoutDlog('[Layout init] Position computation (svg→screen):', initDebug);
      if (typeof window !== 'undefined') window.__layoutInitDebug = initDebug;

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
        exportScreenX: geomDefaultExport.screenX.slice(),
        exportScreenY: geomDefaultExport.screenY.slice(),
        exportAvailCellW: geomDefaultExport.availCellW,
        exportAvailCellH: geomDefaultExport.availCellH,
        exportCellHeight: geomDefaultExport.cellHeight,
        layer1Visible: true,
        layer2Visible: true,
        layoutGlyphAnchor: 'bottom',
        randomizeStyling: false,
        extremeStyling: false,
        oppositeLayerStyling: false,
        orientationAxesMode: false,
        axesPool: [],
        fontFeatureSettings: '"ss04" 1',
        canvasBg: loadCanvasBgFromStorage() || '#ffffff',
        shapeOmitSubcontours1: new Map(),
        shapeOmitSubcontours2: new Map(),
        shapeOmitPosterSub1: new Set(),
        shapeOmitPosterSub2: new Set(),
        shapePairCutoutCells: new Set(),
        posterRandomPairCutout: false,
        shapeScaleSubcontours1: new Map(),
        shapeScaleSubcontours2: new Map(),
        shapeScalePosterFilh: new Map(),
        textureBlurPx: 0,
        textureBlurMode: 'both',
        textureRadialAmount: 0,
        textureRadialMode: 'both'
      };

      const getPosterInputs = () => ({
        letter: document.getElementById('poster-letter')?.value || 'F',
        number: '',
        featureKey: document.getElementById('poster-feature')?.value || 'normal'
      });

      let convertedShapes = null;

      const syncExportButtons = () => {
        const pngLogo = document.getElementById('layout-btn-png-logo');
        const pngPlakat = document.getElementById('layout-btn-png-plakat');
        const svgLogo = document.getElementById('layout-btn-svg-logo');
        const svgPlakat = document.getElementById('layout-btn-svg-plakat');
        const randomOmit = document.getElementById('layout-btn-random-omit-shapes');
        const randomPairCut = document.getElementById('layout-btn-random-pair-cutout');
        const restoreShapes = document.getElementById('layout-btn-restore-all-shapes');
        const randomScale = document.getElementById('layout-btn-random-scale-shapes');
        const restoreScale = document.getElementById('layout-btn-restore-scale-shapes');
        const hasShapes = !!convertedShapes;
        const fontsOk = !!(FONT_FILES[state.fontName1] && FONT_FILES[state.fontName2]);
        if (pngLogo) pngLogo.disabled = !hasShapes;
        if (pngPlakat) pngPlakat.disabled = !hasShapes;
        if (svgLogo) svgLogo.disabled = !hasShapes || !krok1ConfirmedForSvg;
        if (svgPlakat) svgPlakat.disabled = !hasShapes || !krok1ConfirmedForSvg;
        if (randomOmit) randomOmit.disabled = !fontsOk;
        if (randomPairCut) randomPairCut.disabled = !fontsOk;
        if (restoreShapes) restoreShapes.disabled = !fontsOk;
        if (randomScale) randomScale.disabled = !fontsOk;
        if (restoreScale) restoreScale.disabled = !fontsOk;
      };

      async function commitKrok1LayoutVectorShapes() {
        syncLayoutGeometry(state);
        const shapes = await convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs);
        if (!shapes) return null;
        convertedShapes = shapes;
        krok1ConfirmedForSvg = true;
        syncLayoutGeometry(state);
        displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, { canvasBg: state.canvasBg, state });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scaleLayoutToFit(container);
            scalePosterToFit(document.getElementById('poster-canvas'));
          });
        });
        updateLayoutFooter(state, stageIndices1, stageIndices2);
        syncExportButtons();
        return shapes;
      }

      let updateLayer1Swatch;
      let updateLayer2Swatch;
      let updateCanvasBgSwatch;

      const paintView = () => {
        syncLayoutGeometry(state);
        if (state.randomizeStyling) {
          if (state.oppositeLayerStyling) {
            if (!state.axesPool || state.axesPool.length < 4) state.axesPool = generateOppositeLayerAxes();
          } else if (state.extremeStyling) state.axesPool = generateExtremeAxes();
          else if (state.orientationAxesMode) state.axesPool = generateRandomAxes();
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
        const blurRangeEl = document.getElementById('layout-texture-blur-amount');
        const blurLabelEl = document.getElementById('layout-texture-blur-amount-label');
        if (blurRangeEl) blurRangeEl.value = String(state.textureBlurPx ?? 0);
        if (blurLabelEl) blurLabelEl.textContent = `Rozostření: ${state.textureBlurPx ?? 0} px`;
        const radialRangeEl = document.getElementById('layout-texture-radial-amount');
        const radialLabelEl = document.getElementById('layout-texture-radial-amount-label');
        if (radialRangeEl) radialRangeEl.value = String(state.textureRadialAmount ?? 0);
        if (radialLabelEl) radialLabelEl.textContent = `Radiální přechod: ${state.textureRadialAmount ?? 0}`;
        syncTextureBlur(state);
        syncTextureRadial(state);
      };

      const reRender = () => {
        convertedShapes = null;
        krok1ConfirmedForSvg = false;
        clearShapeOmitState(state);
        clearShapeScaleState(state);
        clearShapePairCutoutState(state);
        syncExportButtons();
        paintView();
      };

      const onPosterFieldsChanged = () => {
        if (!convertedShapes) {
          paintView();
          return;
        }
        syncLayoutGeometry(state);
        const pi = getPosterInputs();
        renderPoster(state, stageIndices1, stageIndices2, pi.letter, pi.number, pi.featureKey);
        updateLayoutFooter(state, stageIndices1, stageIndices2);
        syncTextureBlur(state);
        syncTextureRadial(state);
        convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs)
          .then((shapes) => {
            if (shapes) {
              convertedShapes = shapes;
              displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, {
                canvasBg: state.canvasBg,
                state
              });
              requestAnimationFrame(() => {
                scaleLayoutToFit(container);
                scalePosterToFit(document.getElementById('poster-canvas'));
              });
            }
          })
          .catch((e) => console.error('Sync vector view after poster change failed:', e));
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
            syncLayoutGeometry(state);
            convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs).then((shapes) => {
              if (shapes) {
                convertedShapes = shapes;
                displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, { canvasBg: state.canvasBg, state });
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
        const cap = state.oppositeLayerStyling ? 2 : NUM_STAGES;
        const { stageIndices1: s1, stageIndices2: s2 } = createStageIndices(mode, numPoints, pointIds, cap);
        stageIndices1.splice(0, stageIndices1.length, ...s1);
        stageIndices2.splice(0, stageIndices2.length, ...s2);
        reRender();
      };

      let layoutFontQueue = Promise.resolve();
      function enqueueLayoutFontQueue(task) {
        const run = () => Promise.resolve().then(task);
        const next = layoutFontQueue.then(run);
        layoutFontQueue = next.catch((e) => console.warn('Layout font queue:', e));
        return next;
      }

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
        const cap = state.oppositeLayerStyling ? 2 : NUM_STAGES;
        const { stageIndices1: s1, stageIndices2: s2 } = createStageIndices('unifyCuts', numPoints, pointIds, cap);
        stageIndices1.splice(0, stageIndices1.length, ...s1);
        stageIndices2.splice(0, stageIndices2.length, ...s2);
        reRender();
      };

      document.getElementById('layout-btn-convert')?.addEventListener('click', async () => {
        if (!window.confirm('Převést návrh na vektorové tvary?')) return;
        const btn = document.getElementById('layout-btn-convert');
        if (btn) btn.disabled = true;
        try {
          await commitKrok1LayoutVectorShapes();
        } catch (e) {
          console.error('Convert failed:', e);
        } finally {
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('layout-btn-png-logo')?.addEventListener('click', () => saveLayoutPng(convertedShapes, state.canvasBg));
      document.getElementById('layout-btn-png-plakat')?.addEventListener('click', () => savePosterPng(convertedShapes, state.canvasBg));
      document.getElementById('layout-btn-svg-logo')?.addEventListener('click', () => {
        if (!convertedShapes || !krok1ConfirmedForSvg) return;
        saveLayoutSvg(convertedShapes);
      });
      document.getElementById('layout-btn-svg-plakat')?.addEventListener('click', () => {
        if (!convertedShapes || !krok1ConfirmedForSvg) return;
        savePosterSvg(convertedShapes);
      });
      document.getElementById('layout-btn-unify')?.addEventListener('click', () => updateMode('unify'));
      document.getElementById('layout-btn-symmetrical')?.addEventListener('click', () => updateMode('symmetrical'));
      document.getElementById('layout-btn-unify-cuts')?.addEventListener('click', async () => {
        const btn = document.getElementById('layout-btn-unify-cuts');
        if (btn) btn.disabled = true;
        try {
          await enqueueLayoutFontQueue(() => applyUnifyCuts());
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

      document.getElementById('layout-btn-random-omit-shapes')?.addEventListener('click', async () => {
        const fontUrl1 = FONT_FILES[state.fontName1];
        const fontUrl2 = FONT_FILES[state.fontName2];
        if (!fontUrl1 || !fontUrl2) {
          console.warn('[Omit tvary] Chybí URL fontů.');
          return;
        }
        const btn = document.getElementById('layout-btn-random-omit-shapes');
        if (btn) btn.disabled = true;
        let pickMeta = {
          poolSize: 0,
          picked: 0,
          picksStr: '—',
          posterSkip1Str: '—',
          posterSkip2Str: '—'
        };
        try {
          const font1 = await loadFontKit(fontUrl1);
          const font2 = await loadFontKit(fontUrl2);
          const pool = collectSubcontourOmitPool(state, stageIndices1, stageIndices2, font1, font2, getPosterInputs);
          const pickN = randomOmitPickCount(pool.length);
          const pickIdx = pickRandomDistinctIndices(pickN, pool.length);
          const picks = pickIdx.map((j) => pool[j]);
          applyRandomSubcontourOmissions(state, picks);
          pickMeta = {
            poolSize: pool.length,
            picked: picks.length,
            picksStr:
              picks.length > 0
                ? picks
                    .map((p) => (p.poster ? `P${p.layer}#${p.si}` : `L${p.layer}[${p.i}].${p.si}`))
                    .join('; ')
                : '—',
            posterSkip1Str:
              state.shapeOmitPosterSub1.size > 0
                ? [...state.shapeOmitPosterSub1].sort((a, b) => a - b).join(',')
                : '—',
            posterSkip2Str:
              state.shapeOmitPosterSub2.size > 0
                ? [...state.shapeOmitPosterSub2].sort((a, b) => a - b).join(',')
                : '—'
          };
          if (!pool.length) {
            console.info('[Omit tvary] Žádné více-konturové tvary v aktuálním výběru — nic k náhodnému vynechání.');
          }
          syncLayoutGeometry(state);
          const shapes = await convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs);
          if (shapes) {
            convertedShapes = shapes;
            displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, { canvasBg: state.canvasBg, state });
            logNahodneVynechatTvaryDebug(state, pointIds, shapes, pickMeta);
            {
              const ptc = shapes.layoutSvg.match(/<path\b/g)?.length ?? 0;
              console.info(`[Omit tvary] ${pickMeta.picksStr} · <path> layout: ${ptc} · výřez překryvů: ${layoutViewUsesCutoutChrome(state) ? 'ano' : 'ne'}`);
            }
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scaleLayoutToFit(container);
                scalePosterToFit(document.getElementById('poster-canvas'));
              });
            });
          } else {
            console.warn('[Omit tvary] convertToShapes → null. ?layoutDebug=1 pro tabulku.');
            layoutDtable([
              {
                shapes: 'null',
                font1: state.fontName1,
                font2: state.fontName2,
                font_url_1: FONT_FILES[state.fontName1] ? 'ok' : 'CHYBÍ',
                font_url_2: FONT_FILES[state.fontName2] ? 'ok' : 'CHYBÍ',
                vyber: pickMeta.picksStr,
                pool_kontur: pickMeta.poolSize
              }
            ]);
          }
        } catch (e) {
          console.error('Random omit shapes failed:', e);
          layoutDtable([
            {
              error: String(e?.message || e),
              pool_kontur: pickMeta.poolSize,
              vyber: pickMeta.picksStr
            }
          ]);
        } finally {
          syncExportButtons();
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('layout-btn-random-pair-cutout')?.addEventListener('click', async () => {
        const fontUrl1 = FONT_FILES[state.fontName1];
        const fontUrl2 = FONT_FILES[state.fontName2];
        if (!fontUrl1 || !fontUrl2) {
          console.warn('[Výřez překryvů] Chybí URL fontů.');
          return;
        }
        const btn = document.getElementById('layout-btn-random-pair-cutout');
        if (btn) btn.disabled = true;
        try {
          applyPairCutoutAllCells(state);
          syncLayoutGeometry(state);
          const shapes = await convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs);
          if (shapes) {
            convertedShapes = shapes;
            displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, { canvasBg: state.canvasBg, state });
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scaleLayoutToFit(container);
                scalePosterToFit(document.getElementById('poster-canvas'));
              });
            });
          }
        } catch (e) {
          console.error('Pair cutout (all cells) failed:', e);
        } finally {
          syncExportButtons();
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('layout-btn-restore-all-shapes')?.addEventListener('click', async () => {
        const fontUrl1 = FONT_FILES[state.fontName1];
        const fontUrl2 = FONT_FILES[state.fontName2];
        if (!fontUrl1 || !fontUrl2) return;
        const btn = document.getElementById('layout-btn-restore-all-shapes');
        if (btn) btn.disabled = true;
        try {
          clearShapeOmitState(state);
          clearShapePairCutoutState(state);
          syncLayoutGeometry(state);
          const shapes = await convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs);
          if (shapes) {
            convertedShapes = shapes;
            displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, {
              canvasBg: state.canvasBg,
              state
            });
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scaleLayoutToFit(container);
                scalePosterToFit(document.getElementById('poster-canvas'));
              });
            });
          }
        } catch (e) {
          console.error('Obnovit tvary failed:', e);
        } finally {
          syncExportButtons();
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('layout-btn-random-scale-shapes')?.addEventListener('click', async () => {
        const fontUrl1 = FONT_FILES[state.fontName1];
        const fontUrl2 = FONT_FILES[state.fontName2];
        if (!fontUrl1 || !fontUrl2) {
          console.warn('[Měřítko tvarů] Chybí URL fontů.');
          return;
        }
        const btn = document.getElementById('layout-btn-random-scale-shapes');
        if (btn) btn.disabled = true;
        try {
          const font1 = await loadFontKit(fontUrl1);
          const font2 = await loadFontKit(fontUrl2);
          const pool = collectFilhSubcontourScalePool(state, stageIndices1, stageIndices2, font1, font2, getPosterInputs);
          const pickN = randomOmitPickCount(pool.length);
          const pickIdx = pickRandomDistinctIndices(pickN, pool.length);
          const scaledPicks = pickIdx.map((j) => {
            const e = pool[j];
            return { ...e, scale: randomSubcontourScaleFactor() };
          });
          applyRandomSubcontourScales(state, scaledPicks);
          syncLayoutGeometry(state);
          const shapes = await convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs);
          if (shapes) {
            convertedShapes = shapes;
            displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, {
              canvasBg: state.canvasBg,
              state
            });
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scaleLayoutToFit(container);
                scalePosterToFit(document.getElementById('poster-canvas'));
              });
            });
          }
        } catch (e) {
          console.error('Random scale shapes failed:', e);
        } finally {
          syncExportButtons();
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('layout-btn-restore-scale-shapes')?.addEventListener('click', async () => {
        const fontUrl1 = FONT_FILES[state.fontName1];
        const fontUrl2 = FONT_FILES[state.fontName2];
        if (!fontUrl1 || !fontUrl2) return;
        const btn = document.getElementById('layout-btn-restore-scale-shapes');
        if (btn) btn.disabled = true;
        try {
          clearShapeScaleState(state);
          syncLayoutGeometry(state);
          const shapes = await convertToShapes(state, stageIndices1, stageIndices2, getPosterInputs);
          if (shapes) {
            convertedShapes = shapes;
            displayShapesAsSvg(shapes.layoutSvg, shapes.posterSvg, container, {
              canvasBg: state.canvasBg,
              state
            });
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                scaleLayoutToFit(container);
                scalePosterToFit(document.getElementById('poster-canvas'));
              });
            });
          }
        } catch (e) {
          console.error('Obnovit měřítko failed:', e);
        } finally {
          syncExportButtons();
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('layout-btn-randomize')?.addEventListener('click', () => {
        state.randomizeStyling = !state.randomizeStyling;
        state.extremeStyling = false;
        state.oppositeLayerStyling = false;
        state.orientationAxesMode = false;
        reRender();
      });

      document.getElementById('layout-btn-extreme')?.addEventListener('click', () => {
        state.randomizeStyling = true;
        state.extremeStyling = true;
        state.oppositeLayerStyling = false;
        state.orientationAxesMode = false;
        state.axesPool = generateExtremeAxes();
        const cap = NUM_STAGES;
        const { stageIndices1: s1, stageIndices2: s2 } = createStageIndices('random', numPoints, pointIds, cap);
        stageIndices1.splice(0, stageIndices1.length, ...s1);
        stageIndices2.splice(0, stageIndices2.length, ...s2);
        reRender();
      });

      document.getElementById('layout-btn-extreme-opposite')?.addEventListener('click', () => {
        enqueueLayoutFontQueue(async () => {
          state.randomizeStyling = true;
          state.extremeStyling = false;
          state.oppositeLayerStyling = true;
          state.orientationAxesMode = false;
          state.axesPool = generateOppositeLayerAxes();
          const next1 = FONT_NAMES_DOT[Math.floor(Math.random() * FONT_NAMES_DOT.length)];
          const next2 = FONT_NAMES_SQUARE[Math.floor(Math.random() * FONT_NAMES_SQUARE.length)];
          try {
            await loadFont(next1);
            await loadFont(next2);
            state.fontName1 = next1;
            state.fontName2 = next2;
            try {
              await Promise.all([resolveLayoutFontKit(next1), resolveLayoutFontKit(next2)]);
            } catch (e) {
              console.warn('FontKit:', e);
            }
          } catch (e) {
            console.warn('Failed to load font:', next1, next2, e);
          }
          const { stageIndices1: s1, stageIndices2: s2 } = createStageIndices('oppositeLayers', numPoints, pointIds);
          stageIndices1.splice(0, stageIndices1.length, ...s1);
          stageIndices2.splice(0, stageIndices2.length, ...s2);
          reRender();
        });
      });

      document.getElementById('layout-btn-orientation-axes')?.addEventListener('click', () => {
        enqueueLayoutFontQueue(async () => {
          const f1 = 'DotOrientationVAR';
          const f2 = 'SquareOrientationVAR';
          try {
            await loadFont(f1);
            await loadFont(f2);
            state.fontName1 = f1;
            state.fontName2 = f2;
            state.randomizeStyling = true;
            state.extremeStyling = false;
            state.oppositeLayerStyling = false;
            state.orientationAxesMode = true;
            reRender();
          } catch (e) {
            console.warn('Failed to load orientation fonts:', e);
          }
        });
      });

      document.getElementById('layout-btn-typeface')?.addEventListener('click', () => {
        enqueueLayoutFontQueue(async () => {
          const i = FONT_NAMES_DOT.indexOf(state.fontName1);
          const cur = i >= 0 ? i : 0;
          const next1 = FONT_NAMES_DOT[(cur + 1) % FONT_NAMES_DOT.length];
          const next2 = FONT_NAMES_SQUARE[Math.floor(Math.random() * FONT_NAMES_SQUARE.length)];
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
      });

      document.getElementById('layout-btn-typeface-1')?.addEventListener('click', () => {
        enqueueLayoutFontQueue(async () => {
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
      });

      document.getElementById('layout-btn-typeface-2')?.addEventListener('click', () => {
        enqueueLayoutFontQueue(async () => {
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

      document.getElementById('layout-btn-randomize-all')?.addEventListener('click', () => {
        enqueueLayoutFontQueue(async () => {
          const { stageIndices1: s1, stageIndices2: s2 } = createStageIndices('random', numPoints, pointIds);
          stageIndices1.splice(0, stageIndices1.length, ...s1);
          stageIndices2.splice(0, stageIndices2.length, ...s2);
          state.layer1Visible = Math.random() < 0.9;
          state.layer2Visible = Math.random() < 0.9;
          if (!state.layer1Visible && !state.layer2Visible) state.layer2Visible = true;
          state.randomizeStyling = Math.random() < 0.7;
          state.oppositeLayerStyling = false;
          state.extremeStyling = state.randomizeStyling && Math.random() < 0.5;
          state.orientationAxesMode = false;
          if (state.randomizeStyling) state.axesPool = state.extremeStyling ? generateExtremeAxes() : generateRandomAxes();
          const next1 = FONT_NAMES_DOT[Math.floor(Math.random() * FONT_NAMES_DOT.length)];
          const next2 = FONT_NAMES_SQUARE[Math.floor(Math.random() * FONT_NAMES_SQUARE.length)];
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
      });

      const resizeHandler = () => {
        requestAnimationFrame(() => {
          scaleLayoutToFit(container);
          scalePosterToFit(document.getElementById('poster-canvas'));
        });
      };
      window.addEventListener('resize', resizeHandler);
      const layoutMql = window.matchMedia(LAYOUT_MEDIA_QUERY);
      if (typeof layoutMql.addEventListener === 'function') {
        layoutMql.addEventListener('change', resizeHandler);
      } else {
        layoutMql.addListener(resizeHandler);
      }
      resizeHandler();

      document.getElementById('poster-letter')?.addEventListener('input', onPosterFieldsChanged);
      document.getElementById('poster-letter')?.addEventListener('change', onPosterFieldsChanged);
      document.getElementById('poster-number')?.addEventListener('input', onPosterFieldsChanged);
      document.getElementById('poster-number')?.addEventListener('change', onPosterFieldsChanged);
      document.getElementById('poster-feature')?.addEventListener('input', onPosterFieldsChanged);
      document.getElementById('poster-feature')?.addEventListener('change', onPosterFieldsChanged);

      document.getElementById('layout-texture-blur-amount')?.addEventListener('input', (e) => {
        state.textureBlurPx = Number(e.target.value) || 0;
        const blurLabelEl = document.getElementById('layout-texture-blur-amount-label');
        if (blurLabelEl) blurLabelEl.textContent = `Rozostření: ${state.textureBlurPx} px`;
        syncTextureBlur(state);
      });

      document.getElementById('layout-texture-blur-random-layer')?.addEventListener('click', () => {
        const v1 = state.layer1Visible;
        const v2 = state.layer2Visible;
        if (v1 && v2) state.textureBlurMode = Math.random() < 0.5 ? 'layer1' : 'layer2';
        else if (v1) state.textureBlurMode = 'layer1';
        else if (v2) state.textureBlurMode = 'layer2';
        else state.textureBlurMode = 'both';
        const blurRangeEl = document.getElementById('layout-texture-blur-amount');
        const max = Number(blurRangeEl?.max) || 16;
        const min = Number(blurRangeEl?.min) || 0;
        const step = Number(blurRangeEl?.step) || 1;
        const steps = Math.floor((max - min) / step) + 1;
        state.textureBlurPx = min + Math.floor(Math.random() * steps) * step;
        if (blurRangeEl) blurRangeEl.value = String(state.textureBlurPx);
        const blurLabelEl = document.getElementById('layout-texture-blur-amount-label');
        if (blurLabelEl) blurLabelEl.textContent = `Rozostření: ${state.textureBlurPx} px`;
        syncTextureBlur(state);
      });

      document.getElementById('layout-texture-blur-all')?.addEventListener('click', () => {
        state.textureBlurMode = 'both';
        syncTextureBlur(state);
      });

      document.getElementById('layout-texture-radial-amount')?.addEventListener('input', (e) => {
        state.textureRadialAmount = Number(e.target.value) || 0;
        const radialLabelEl = document.getElementById('layout-texture-radial-amount-label');
        if (radialLabelEl) radialLabelEl.textContent = `Radiální přechod: ${state.textureRadialAmount}`;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-radial-random-layer')?.addEventListener('click', () => {
        const v1 = state.layer1Visible;
        const v2 = state.layer2Visible;
        if (v1 && v2) state.textureRadialMode = Math.random() < 0.5 ? 'layer1' : 'layer2';
        else if (v1) state.textureRadialMode = 'layer1';
        else if (v2) state.textureRadialMode = 'layer2';
        else state.textureRadialMode = 'both';
        const radialRangeEl = document.getElementById('layout-texture-radial-amount');
        const max = Number(radialRangeEl?.max) || 16;
        const min = Number(radialRangeEl?.min) || 0;
        const step = Number(radialRangeEl?.step) || 1;
        const steps = Math.floor((max - min) / step) + 1;
        state.textureRadialAmount = min + Math.floor(Math.random() * steps) * step;
        if (radialRangeEl) radialRangeEl.value = String(state.textureRadialAmount);
        const radialLabelEl = document.getElementById('layout-texture-radial-amount-label');
        if (radialLabelEl) radialLabelEl.textContent = `Radiální přechod: ${state.textureRadialAmount}`;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-radial-all')?.addEventListener('click', () => {
        state.textureRadialMode = 'both';
        syncTextureRadial(state);
      });
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
