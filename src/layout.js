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
const D_OFFSET_Y = 0.20;
const NUM_STAGES = 9;

let textureRadialIdSeq = 0;

const POINT_IDS = [
  'ID-L1-1', 'ID-L2-1', 'ID-L5-3', 'ID-L4-3', 'ID-L3-4', 'ID-C-3',
  'ID-R3-4', 'ID-R4-3', 'ID-R5-3', 'ID-R2-1', 'ID-R1-1'
];

const LEFT_CENTER_IDS = new Set(['ID-L1-1', 'ID-L2-1', 'ID-L3-4', 'ID-R3-4', 'ID-R2-1', 'ID-R1-1']);
const RIGHT_IDS = new Set(['ID-L5-3', 'ID-L4-3', 'ID-C-3', 'ID-R4-3', 'ID-R5-3']);

const SVG_PATH_TO_POINT_INDEX = [3, 0, 1, 2, 5, 7, 6, 10, 9, 8, 4];

const SVG_PATH_TO_POINT_INDEX_LOGO_START = [3, 4, 0, 1, 2, 5, 7, 6, 10, 9, 8];

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
  const frac = 0.2 + Math.random() * 0.55;
  return Math.min(poolSize, Math.max(1, Math.round(poolSize * frac)));
}

const SUBCONTOUR_SCALE_MAX = 2.35;

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
  state.shapeScalePosterSub1.clear();
  state.shapeScalePosterSub2.clear();
}

function clearShapePairCutoutState(state) {
  state.shapePairCutoutCells.clear();
  state.posterRandomPairCutout = false;
}

function subcontourLocalScaleSuffix(sub, _pivotX, _py, perSlotMap, slotIdx, subIdx) {
  const inner = perSlotMap && perSlotMap.get(slotIdx);
  const sc = inner && inner.get(subIdx);
  const s = sc != null && Number.isFinite(sc) ? sc : 1;
  if (Math.abs(s - 1) < 1e-6) return '';
  const cx = sub.cx;
  const cy = sub.cy;
  const rq = Math.round(s * 1000) / 1000;
  return ` translate(${cx},${cy}) scale(${rq}) translate(${-cx},${-cy})`;
}

function posterSubcontourLocalScaleSuffix(sub, _pivotX, _py, posterScaleMap, si) {
  const sc = posterScaleMap && posterScaleMap.get(si);
  const s = sc != null && Number.isFinite(sc) ? sc : 1;
  if (Math.abs(s - 1) < 1e-6) return '';
  const cx = sub.cx;
  const cy = sub.cy;
  const rq = Math.round(s * 1000) / 1000;
  return ` translate(${cx},${cy}) scale(${rq}) translate(${-cx},${-cy})`;
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
  const blurCss = px > 0 ? `blur(${px}px)` : 'none';
  const blurLayer1 = px > 0 && state.layer1Visible && !!state.textureBlurLayer1;
  const blurLayer2 = px > 0 && state.layer2Visible && !!state.textureBlurLayer2;
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

function textureFillInnerStopPct(amount) {
  const t = Math.min(1, Math.max(0, amount) / 16);
  return Math.round(88 - t * 30);
}

function textureFillEdgeAndLit(amount, r, g, b, invert) {
  const t = Math.min(1, Math.max(0, amount) / 16);
  const lit = mixRgbTowardWhite([r, g, b], t);
  const er = r;
  const eg = g;
  const eb = b;
  const lr = lit[0];
  const lg = lit[1];
  const lb = lit[2];
  if (invert) {
    return { c0r: er, c0g: eg, c0b: eb, c1r: lr, c1g: lg, c1b: lb };
  }
  return { c0r: lr, c0g: lg, c0b: lb, c1r: er, c1g: eg, c1b: eb };
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

function pathStrokeRgbFromShapeFill(path, layerRgb) {
  const fill = (path.getAttribute('fill') || '').trim();
  if (fill.includes('url(')) {
    const of = path.getAttribute('data-tex-orig-fill');
    if (of) {
      const t = of.trim();
      if (t && !t.includes('url(')) {
        const rgb = parseSvgFillToRgb(t);
        if (t.startsWith('#') || rgb[0] || rgb[1] || rgb[2]) return rgb;
      }
    }
    return [layerRgb[0], layerRgb[1], layerRgb[2]];
  }
  const low = fill.toLowerCase();
  if (!fill || low === 'none' || low === 'transparent') return [layerRgb[0], layerRgb[1], layerRgb[2]];
  return parseSvgFillToRgb(fill);
}

const OUTLINE_STROKE_SCALE = 0.38;

function pathOutlineWidthForLayer(state, layerNum) {
  const legacy = Math.max(0, Number(state.pathOutlineWidth) || 0);
  const w1 = Number(state.pathOutlineWidth1);
  const w2 = Number(state.pathOutlineWidth2);
  const v1 = Number.isFinite(w1) ? Math.max(0, w1) : legacy;
  const v2 = Number.isFinite(w2) ? Math.max(0, w2) : legacy;
  return layerNum === 1 ? v1 : v2;
}

function hashPathOutlineSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32FromSeed(seedU32) {
  let a = seedU32 >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function singleGapOutlineDash(path, layerNum, state, strokePx) {
  const salt = Number(state.pathOutlineDashSalt) || 0;
  const rawGap = Number(state.pathOutlineGapAmount);
  const gapAmtN = Number.isFinite(rawGap) ? Math.max(0, Math.min(10, rawGap)) : 5;
  const d = path.getAttribute('d') || '';
  const seedU32 = hashPathOutlineSeed(`${salt}:${layerNum}:${strokePx.toFixed(3)}:${d.slice(0, 140)}`);
  const rnd = mulberry32FromSeed(seedU32);
  let len = 0;
  try {
    len = typeof path.getTotalLength === 'function' ? path.getTotalLength() : 0;
  } catch {
    len = 0;
  }
  const gapMinFrac = 0.04 + (gapAmtN / 10) * 0.16;
  const gapMaxFrac = 0.09 + (gapAmtN / 10) * 0.28;
  const gapFrac = gapMinFrac + rnd() * (gapMaxFrac - gapMinFrac);
  if (!Number.isFinite(len) || len < 0.8) {
    const gapLen = Math.max(2, strokePx * (2.8 + gapAmtN * 0.45));
    const dashLen = Math.max(4, strokePx * 10);
    const period = dashLen + gapLen;
    return {
      dasharray: `${dashLen} ${gapLen}`,
      dashoffset: String(-rnd() * period)
    };
  }
  let gapLen = len * gapFrac;
  gapLen = Math.min(gapLen, len * 0.42);
  gapLen = Math.max(gapLen, Math.min(len * 0.32, strokePx * (1.0 + gapAmtN * 0.12)));
  gapLen = Math.min(gapLen, len * 0.95);
  const drawLen = len - gapLen;
  if (drawLen <= strokePx * 0.25) {
    const g2 = Math.min(len * 0.38, len - strokePx * 0.5);
    const d2 = len - g2;
    return {
      dasharray: `${d2} ${g2}`,
      dashoffset: String(-rnd() * len)
    };
  }
  const phase = rnd() * len;
  return {
    dasharray: `${drawLen} ${gapLen}`,
    dashoffset: String(-phase)
  };
}

function resetSvgTextureFill(svgEl) {
  const defs = svgEl.querySelector('defs');
  if (defs) defs.querySelectorAll('[data-texfill="1"]').forEach((n) => n.remove());
  svgEl.querySelectorAll('path[data-tex-orig-fill]').forEach((path) => {
    path.setAttribute('fill', path.getAttribute('data-tex-orig-fill') || '#000000');
    path.removeAttribute('data-tex-orig-fill');
  });
}

function resetSvgPathOutlines(svgEl) {
  svgEl.querySelectorAll('path[data-tex-outline-clone="1"]').forEach((n) => n.remove());
  svgEl.querySelectorAll('path[data-tex-outline-base="1"]').forEach((path) => {
    const os = path.getAttribute('data-tex-orig-stroke');
    if (os === '__none__') path.removeAttribute('stroke');
    else if (os != null) path.setAttribute('stroke', os);
    else path.removeAttribute('stroke');
    const ow = path.getAttribute('data-tex-orig-stroke-width');
    if (ow === '__none__') path.removeAttribute('stroke-width');
    else if (ow != null) path.setAttribute('stroke-width', ow);
    else path.removeAttribute('stroke-width');
    const op = path.getAttribute('data-tex-orig-paint-order');
    if (op === '__none__') path.removeAttribute('paint-order');
    else if (op != null) path.setAttribute('paint-order', op);
    else path.removeAttribute('paint-order');
    const oj = path.getAttribute('data-tex-orig-stroke-linejoin');
    if (oj === '__none__') path.removeAttribute('stroke-linejoin');
    else if (oj != null) path.setAttribute('stroke-linejoin', oj);
    else path.removeAttribute('stroke-linejoin');
    const oc = path.getAttribute('data-tex-orig-stroke-linecap');
    if (oc === '__none__') path.removeAttribute('stroke-linecap');
    else if (oc != null) path.setAttribute('stroke-linecap', oc);
    else path.removeAttribute('stroke-linecap');
    const oda = path.getAttribute('data-tex-orig-stroke-dasharray');
    if (oda === '__none__') path.removeAttribute('stroke-dasharray');
    else if (oda != null) path.setAttribute('stroke-dasharray', oda);
    else path.removeAttribute('stroke-dasharray');
    const odo = path.getAttribute('data-tex-orig-stroke-dashoffset');
    if (odo === '__none__') path.removeAttribute('stroke-dashoffset');
    else if (odo != null) path.setAttribute('stroke-dashoffset', odo);
    else path.removeAttribute('stroke-dashoffset');
    path.removeAttribute('data-tex-outline-base');
    path.removeAttribute('data-tex-orig-stroke');
    path.removeAttribute('data-tex-orig-stroke-width');
    path.removeAttribute('data-tex-orig-paint-order');
    path.removeAttribute('data-tex-orig-stroke-linejoin');
    path.removeAttribute('data-tex-orig-stroke-linecap');
    path.removeAttribute('data-tex-orig-stroke-dasharray');
    path.removeAttribute('data-tex-orig-stroke-dashoffset');
    const sf = path.getAttribute('data-tex-outline-saved-fill');
    if (sf != null) {
      if (sf === '__missing__') path.removeAttribute('fill');
      else if (sf === '__none__') path.setAttribute('fill', 'none');
      else path.setAttribute('fill', sf);
      path.removeAttribute('data-tex-outline-saved-fill');
    }
  });
}

function layoutStateHasPathOutlines(state) {
  if (!state) return false;
  const w1 = pathOutlineWidthForLayer(state, 1);
  const w2 = pathOutlineWidthForLayer(state, 2);
  const v1 = !!state.layer1Visible && !!state.pathOutlineLayer1 && w1 > 0;
  const v2 = !!state.layer2Visible && !!state.pathOutlineLayer2 && w2 > 0;
  return v1 || v2;
}

function applyPathOutlinesToPaths(paths, layerRgb, state, layerNum) {
  const enabled = layerNum === 1 ? !!state.pathOutlineLayer1 : !!state.pathOutlineLayer2;
  const w = pathOutlineWidthForLayer(state, layerNum);
  if (!enabled || !w) return;
  const visL = layerNum === 1 ? state.layer1Visible : state.layer2Visible;
  if (!visL) return;
  const randomGaps = !!state.pathOutlineRandomGaps;
  paths.forEach((path) => {
    if (path.getAttribute('data-tex-outline-clone') === '1') return;
    const [sr, sg, sb] = pathStrokeRgbFromShapeFill(path, layerRgb);
    const strokeCol = `rgb(${sr},${sg},${sb})`;
    if (!path.hasAttribute('data-tex-outline-base')) {
      path.setAttribute('data-tex-outline-base', '1');
      if (path.hasAttribute('fill')) {
        const v = path.getAttribute('fill');
        path.setAttribute('data-tex-outline-saved-fill', v === '' ? '__none__' : v);
      } else {
        path.setAttribute('data-tex-outline-saved-fill', '__missing__');
      }
      path.setAttribute('data-tex-orig-stroke', path.hasAttribute('stroke') ? path.getAttribute('stroke') : '__none__');
      path.setAttribute('data-tex-orig-stroke-width', path.hasAttribute('stroke-width') ? path.getAttribute('stroke-width') : '__none__');
      path.setAttribute('data-tex-orig-paint-order', path.hasAttribute('paint-order') ? path.getAttribute('paint-order') : '__none__');
      path.setAttribute('data-tex-orig-stroke-linejoin', path.hasAttribute('stroke-linejoin') ? path.getAttribute('stroke-linejoin') : '__none__');
      path.setAttribute('data-tex-orig-stroke-linecap', path.hasAttribute('stroke-linecap') ? path.getAttribute('stroke-linecap') : '__none__');
      path.setAttribute(
        'data-tex-orig-stroke-dasharray',
        path.hasAttribute('stroke-dasharray') ? path.getAttribute('stroke-dasharray') : '__none__'
      );
      path.setAttribute(
        'data-tex-orig-stroke-dashoffset',
        path.hasAttribute('stroke-dashoffset') ? path.getAttribute('stroke-dashoffset') : '__none__'
      );
    }
    const strokePx = Math.max(0.18, w * OUTLINE_STROKE_SCALE);
    path.setAttribute('stroke', strokeCol);
    path.setAttribute('stroke-width', String(strokePx));
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    path.removeAttribute('paint-order');
    path.setAttribute('fill', 'none');
    if (randomGaps) {
      const { dasharray, dashoffset } = singleGapOutlineDash(path, layerNum, state, strokePx);
      path.setAttribute('stroke-dasharray', dasharray);
      path.setAttribute('stroke-dashoffset', dashoffset);
    } else {
      path.removeAttribute('stroke-dasharray');
      path.removeAttribute('stroke-dashoffset');
    }
  });
}

function applyPathOutlinesToGroup(g, state, layerNum, layerRgb) {
  if (!g) return;
  const paths = g.querySelectorAll('path');
  if (!paths.length) return;
  applyPathOutlinesToPaths(paths, layerRgb, state, layerNum);
}

function applyPathOutlinesToLayerRoot(svgRoot, state, layerNum) {
  if (!svgRoot) return;
  const visL = layerNum === 1 ? state.layer1Visible : state.layer2Visible;
  if (!visL) return;
  const paths = svgRoot.querySelectorAll('path');
  if (!paths.length) return;
  const rgb = layerNum === 1 ? state.logo1Color : state.logo2Color;
  applyPathOutlinesToPaths(paths, rgb, state, layerNum);
}

function syncLayerCssSpanOutline(layerEl, state, layerNum) {
  if (!layerEl) return;
  const spans = layerEl.querySelectorAll('span');
  const visL = layerNum === 1 ? state.layer1Visible : state.layer2Visible;
  const enabled = layerNum === 1 ? !!state.pathOutlineLayer1 : !!state.pathOutlineLayer2;
  const w = pathOutlineWidthForLayer(state, layerNum);
  const rgba = layerNum === 1 ? state.logo1Color : state.logo2Color;
  const [r, g, b] = rgba;
  const col = `rgb(${r},${g},${b})`;
  if (!visL || !enabled || !w) {
    spans.forEach((span) => {
      span.style.removeProperty('-webkit-text-stroke-width');
      span.style.removeProperty('-webkit-text-stroke-color');
      span.style.removeProperty('paint-order');
      span.style.removeProperty('text-shadow');
    });
    return;
  }
  const strokePx = Math.max(0.18, w * OUTLINE_STROKE_SCALE);
  spans.forEach((span) => {
    span.style.setProperty('color', 'transparent');
    span.style.setProperty('-webkit-text-fill-color', 'transparent');
    span.style.setProperty('-webkit-text-stroke-width', `${strokePx}px`);
    span.style.setProperty('-webkit-text-stroke-color', col);
    span.style.setProperty('paint-order', 'stroke fill');
    span.style.removeProperty('text-shadow');
  });
}

function texturePatternKindResolved(raw) {
  const k = String(raw || 'stripes');
  if (k === 'bitmap') return 'bitmap';
  if (k === 'dothatch') return 'dothatch';
  return 'stripes';
}

function textureFillOptsForLayer(state, layerNum) {
  if (layerNum === 1) {
    return {
      kind: state.textureGradientKind1 === 'linear' ? 'linear' : 'radial',
      angle: Number(state.textureGradientAngle1) || 0,
      invert: !!state.textureGradientInvert1
    };
  }
  return {
    kind: state.textureGradientKind2 === 'linear' ? 'linear' : 'radial',
    angle: Number(state.textureGradientAngle2) || 0,
    invert: !!state.textureGradientInvert2
  };
}

function createSvgTextureGradient(defs, gradId, gradOpts, c0, c1, innerStopPct) {
  const doc = defs.ownerDocument || document;
  const linear = gradOpts.kind === 'linear';
  const angle = Number(gradOpts.angle) || 0;
  if (!linear) {
    const rg = doc.createElementNS(SVG_NS, 'radialGradient');
    rg.setAttribute('id', gradId);
    rg.setAttribute('cx', '50%');
    rg.setAttribute('cy', '50%');
    rg.setAttribute('r', '100%');
    rg.setAttribute('gradientUnits', 'objectBoundingBox');
    rg.setAttribute('data-texfill', '1');
    const s0 = doc.createElementNS(SVG_NS, 'stop');
    s0.setAttribute('offset', '0%');
    s0.setAttribute('stop-color', `rgb(${c0.r},${c0.g},${c0.b})`);
    const s1 = doc.createElementNS(SVG_NS, 'stop');
    s1.setAttribute('offset', `${innerStopPct}%`);
    s1.setAttribute('stop-color', `rgb(${c1.r},${c1.g},${c1.b})`);
    const s2 = doc.createElementNS(SVG_NS, 'stop');
    s2.setAttribute('offset', '100%');
    s2.setAttribute('stop-color', `rgb(${c1.r},${c1.g},${c1.b})`);
    rg.appendChild(s0);
    rg.appendChild(s1);
    rg.appendChild(s2);
    defs.appendChild(rg);
    return;
  }
  const lg = doc.createElementNS(SVG_NS, 'linearGradient');
  lg.setAttribute('id', gradId);
  lg.setAttribute('x1', '0');
  lg.setAttribute('y1', '0');
  lg.setAttribute('x2', '1');
  lg.setAttribute('y2', '0');
  lg.setAttribute('gradientUnits', 'objectBoundingBox');
  lg.setAttribute('gradientTransform', `rotate(${angle} 0.5 0.5)`);
  lg.setAttribute('data-texfill', '1');
  const t0 = doc.createElementNS(SVG_NS, 'stop');
  t0.setAttribute('offset', '0%');
  t0.setAttribute('stop-color', `rgb(${c0.r},${c0.g},${c0.b})`);
  const t1 = doc.createElementNS(SVG_NS, 'stop');
  t1.setAttribute('offset', '100%');
  t1.setAttribute('stop-color', `rgb(${c1.r},${c1.g},${c1.b})`);
  lg.appendChild(t0);
  lg.appendChild(t1);
  defs.appendChild(lg);
}

function texturePatternOptsForLayer(state, layerNum) {
  if (layerNum === 1) {
    return {
      enabled: !!state.texturePatternEnabled1,
      kind: texturePatternKindResolved(state.texturePatternKind1),
      angle: Number(state.texturePatternStripesAngle1) || 0,
      period: Math.max(4, Number(state.texturePatternStripesPeriod1) || 14),
      ratio: (() => {
        const x = Number(state.texturePatternStripesRatio1);
        return Number.isFinite(x) ? Math.min(0.92, Math.max(0.08, x)) : 0.45;
      })(),
      bitmapUrl: state.texturePatternBitmapUrl1 || '',
      bitmapScale: Number(state.texturePatternBitmapScale1) || 100,
      bitmapPerShape: !!state.texturePatternBitmapPerShape1
    };
  }
  return {
    enabled: !!state.texturePatternEnabled2,
    kind: texturePatternKindResolved(state.texturePatternKind2),
    angle: Number(state.texturePatternStripesAngle2) || 0,
    period: Math.max(4, Number(state.texturePatternStripesPeriod2) || 14),
    ratio: (() => {
      const x = Number(state.texturePatternStripesRatio2);
      return Number.isFinite(x) ? Math.min(0.92, Math.max(0.08, x)) : 0.45;
    })(),
    bitmapUrl: state.texturePatternBitmapUrl2 || '',
    bitmapScale: Number(state.texturePatternBitmapScale2) || 100,
    bitmapPerShape: !!state.texturePatternBitmapPerShape2
  };
}

function textureGradientActiveForLayer(state, layerNum) {
  const on = layerNum === 1 ? !!state.textureFillLayer1 : !!state.textureFillLayer2;
  const amt = Math.max(0, Number(layerNum === 1 ? state.textureRadialAmount1 : state.textureRadialAmount2) || 0);
  return on && amt > 0;
}

function layerPatternShouldApply(state, layerNum) {
  const pat = texturePatternOptsForLayer(state, layerNum);
  if (!pat.enabled) return false;
  if (pat.kind === 'bitmap') return !!pat.bitmapUrl;
  if (pat.kind === 'dothatch') return true;
  return true;
}

function applyStripePatternToSvgPaths(defs, paths, pat, r, g, b) {
  const doc = defs.ownerDocument || document;
  const period = Math.max(4, Math.min(160, pat.period || 14));
  const ratio = Math.min(0.92, Math.max(0.08, Number(pat.ratio) || 0.45));
  const stripeW = Math.max(1, period * ratio);
  const angle = Number(pat.angle) || 0;
  const patId = `texpat-${++textureRadialIdSeq}`;
  const p = doc.createElementNS(SVG_NS, 'pattern');
  p.setAttribute('id', patId);
  p.setAttribute('patternUnits', 'userSpaceOnUse');
  p.setAttribute('width', String(period));
  p.setAttribute('height', String(period));
  p.setAttribute('patternTransform', `rotate(${angle} ${period / 2} ${period / 2})`);
  p.setAttribute('data-texfill', '1');
  const rect = doc.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', String(-period));
  rect.setAttribute('width', String(stripeW));
  rect.setAttribute('height', String(period * 3));
  rect.setAttribute('fill', `rgb(${r},${g},${b})`);
  p.appendChild(rect);
  defs.appendChild(p);
  paths.forEach((path) => {
    const rawFill = path.getAttribute('fill') || '#000000';
    if (rawFill.includes('url(')) return;
    path.setAttribute('data-tex-orig-fill', rawFill);
    path.setAttribute('fill', `url(#${patId})`);
  });
}

function applyDotsPatternToSvgPaths(defs, paths, pat, r, g, b) {
  const doc = defs.ownerDocument || document;
  const period = Math.max(4, Math.min(160, pat.period || 14));
  const ratio = Math.min(0.92, Math.max(0.08, Number(pat.ratio) || 0.45));
  const angle = Number(pat.angle) || 0;
  const fillCol = `rgb(${r},${g},${b})`;
  const n = Math.min(22, Math.max(2, Math.round(96 / period)));
  const step = 1 / n;
  const dotR = Math.min(step * 0.48, step * ratio * 0.55);
  paths.forEach((path) => {
    const rawFill = path.getAttribute('fill') || '#000000';
    if (rawFill.includes('url(')) return;
    path.setAttribute('data-tex-orig-fill', rawFill);
    const patId = `texpat-${++textureRadialIdSeq}`;
    const p = doc.createElementNS(SVG_NS, 'pattern');
    p.setAttribute('id', patId);
    p.setAttribute('patternUnits', 'objectBoundingBox');
    p.setAttribute('patternContentUnits', 'objectBoundingBox');
    p.setAttribute('width', '1');
    p.setAttribute('height', '1');
    if (angle) p.setAttribute('patternTransform', `rotate(${angle} 0.5 0.5)`);
    p.setAttribute('data-texfill', '1');
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const cx = step * (ix + 0.5);
        const cy = step * (iy + 0.5);
        const circle = doc.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', String(Math.max(0.004, dotR)));
        circle.setAttribute('fill', fillCol);
        p.appendChild(circle);
      }
    }
    defs.appendChild(p);
    path.setAttribute('fill', `url(#${patId})`);
  });
}

function applyGradientWithWaveDotsToSvgPaths(defs, paths, fillOpts, amount, pat, pr, pg, pb, layerNum) {
  const doc = defs.ownerDocument || document;
  const amt = Math.max(0, Number(amount) || 0);
  const innerStop = textureFillInnerStopPct(amt);
  const period = Math.max(4, Math.min(160, pat.period || 14));
  const ratio = Math.min(0.92, Math.max(0.08, Number(pat.ratio) || 0.45));
  const angle = Number(pat.angle) || 0;
  const n = Math.min(26, Math.max(4, Math.round(128 / period)));
  const fillCol = `rgb(${pr},${pg},${pb})`;
  const step = 1 / n;
  const maxDist = Math.hypot(n, n) / 2;

  paths.forEach((path) => {
    const rawFill = path.getAttribute('fill') || '#000000';
    if (rawFill.includes('url(')) return;
    path.setAttribute('data-tex-orig-fill', rawFill);
    const [r, g, b] = parseSvgFillToRgb(rawFill);
    const st = textureFillEdgeAndLit(amt, r, g, b, !!fillOpts.invert);
    const c0 = { r: st.c0r, g: st.c0g, b: st.c0b };
    const c1 = { r: st.c1r, g: st.c1g, b: st.c1b };
    const gradId = `texgrad-${++textureRadialIdSeq}`;
    const gradOpts = { kind: fillOpts.kind, angle: fillOpts.angle };
    createSvgTextureGradient(defs, gradId, gradOpts, c0, c1, innerStop);

    const d = path.getAttribute('d') || '';
    const seedU32 = hashPathOutlineSeed(`wvd:${layerNum}:${amt}:${d.slice(0, 200)}`);
    const rnd = mulberry32FromSeed(seedU32);
    const centerXi = Math.floor(rnd() * n);
    const centerYi = Math.floor(rnd() * n);
    const minR = step * (0.06 + ratio * 0.06);
    const maxR = step * (0.22 + ratio * 0.28);

    const patId = `texpat-${++textureRadialIdSeq}`;
    const p = doc.createElementNS(SVG_NS, 'pattern');
    p.setAttribute('id', patId);
    p.setAttribute('patternUnits', 'objectBoundingBox');
    p.setAttribute('patternContentUnits', 'objectBoundingBox');
    p.setAttribute('width', '1');
    p.setAttribute('height', '1');
    if (angle) p.setAttribute('patternTransform', `rotate(${angle} 0.5 0.5)`);
    p.setAttribute('data-texfill', '1');
    const bg = doc.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', '1');
    bg.setAttribute('height', '1');
    bg.setAttribute('fill', `url(#${gradId})`);
    p.appendChild(bg);
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const dist = Math.hypot(ix - centerXi, iy - centerYi);
        const df = Math.max(0, Math.min(1, 1 - dist / maxDist));
        const rad = Math.max(minR, minR + (maxR - minR) * df * (0.8 + rnd() * 0.4));
        const cx = step * (ix + 0.5);
        const cy = step * (iy + 0.5);
        const circle = doc.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(cx));
        circle.setAttribute('cy', String(cy));
        circle.setAttribute('r', String(Math.max(0.0025, rad)));
        circle.setAttribute('fill', fillCol);
        p.appendChild(circle);
      }
    }
    defs.appendChild(p);
    path.setAttribute('fill', `url(#${patId})`);
  });
}

function applyBitmapPatternToSvgPaths(defs, paths, pat) {
  const doc = defs.ownerDocument || document;
  const sc = Math.max(0.25, Math.min(4, (Number(pat.bitmapScale) || 100) / 100));
  const w = Math.round(96 * sc);
  const h = Math.round(96 * sc);
  if (pat.bitmapPerShape) {
    const iw = 1 / sc;
    const io = (1 - iw) / 2;
    paths.forEach((path) => {
      const rawFill = path.getAttribute('fill') || '#000000';
      if (rawFill.includes('url(')) return;
      path.setAttribute('data-tex-orig-fill', rawFill);
      const patId = `texpat-${++textureRadialIdSeq}`;
      const p = doc.createElementNS(SVG_NS, 'pattern');
      p.setAttribute('id', patId);
      p.setAttribute('patternUnits', 'objectBoundingBox');
      p.setAttribute('patternContentUnits', 'objectBoundingBox');
      p.setAttribute('width', '1');
      p.setAttribute('height', '1');
      p.setAttribute('data-texfill', '1');
      const img = doc.createElementNS(SVG_NS, 'image');
      img.setAttribute('href', pat.bitmapUrl);
      img.setAttribute('x', String(io));
      img.setAttribute('y', String(io));
      img.setAttribute('width', String(iw));
      img.setAttribute('height', String(iw));
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      p.appendChild(img);
      defs.appendChild(p);
      path.setAttribute('fill', `url(#${patId})`);
    });
    return;
  }
  const patId = `texpat-${++textureRadialIdSeq}`;
  const p = doc.createElementNS(SVG_NS, 'pattern');
  p.setAttribute('id', patId);
  p.setAttribute('patternUnits', 'userSpaceOnUse');
  p.setAttribute('width', String(w));
  p.setAttribute('height', String(h));
  p.setAttribute('data-texfill', '1');
  const img = doc.createElementNS(SVG_NS, 'image');
  img.setAttribute('href', pat.bitmapUrl);
  img.setAttribute('width', String(w));
  img.setAttribute('height', String(h));
  img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  p.appendChild(img);
  defs.appendChild(p);
  paths.forEach((path) => {
    const rawFill = path.getAttribute('fill') || '#000000';
    if (rawFill.includes('url(')) return;
    path.setAttribute('data-tex-orig-fill', rawFill);
    path.setAttribute('fill', `url(#${patId})`);
  });
}

function applyTextureFillToSvgPaths(defs, paths, fillOpts, amount) {
  const amt = Math.max(0, Number(amount) || 0);
  const innerStop = textureFillInnerStopPct(amt);
  paths.forEach((path) => {
    const rawFill = path.getAttribute('fill') || '#000000';
    if (rawFill.includes('url(')) return;
    const [r, g, b] = parseSvgFillToRgb(rawFill);
    path.setAttribute('data-tex-orig-fill', rawFill);
    const st = textureFillEdgeAndLit(amt, r, g, b, !!fillOpts.invert);
    const c0 = { r: st.c0r, g: st.c0g, b: st.c0b };
    const c1 = { r: st.c1r, g: st.c1g, b: st.c1b };
    const gradId = `texgrad-${++textureRadialIdSeq}`;
    const gradOpts = { kind: fillOpts.kind, angle: fillOpts.angle };
    createSvgTextureGradient(defs, gradId, gradOpts, c0, c1, innerStop);
    path.setAttribute('fill', `url(#${gradId})`);
  });
}

function applySyncTextureToPathList(defs, paths, layerNum, state) {
  if (!paths || paths.length === 0) return;
  const visL = layerNum === 1 ? state.layer1Visible : state.layer2Visible;
  if (!visL) return;
  const [pr, pg, pb] = layerNum === 1 ? state.logo1Color : state.logo2Color;
  if (layerPatternShouldApply(state, layerNum)) {
    const pat = texturePatternOptsForLayer(state, layerNum);
    const amt = Math.max(0, Number(layerNum === 1 ? state.textureRadialAmount1 : state.textureRadialAmount2) || 0);
    if (pat.kind === 'dothatch' && textureGradientActiveForLayer(state, layerNum)) {
      applyGradientWithWaveDotsToSvgPaths(
        defs,
        paths,
        textureFillOptsForLayer(state, layerNum),
        amt,
        pat,
        pr,
        pg,
        pb,
        layerNum
      );
      return;
    }
    if (pat.kind === 'stripes') {
      applyStripePatternToSvgPaths(defs, paths, pat, pr, pg, pb);
    } else if (pat.kind === 'dothatch') {
      applyDotsPatternToSvgPaths(defs, paths, pat, pr, pg, pb);
    } else {
      applyBitmapPatternToSvgPaths(defs, paths, pat);
    }
    return;
  }
  const activeGrad = layerNum === 1 ? !!state.textureFillLayer1 : !!state.textureFillLayer2;
  const amt = Math.max(0, Number(layerNum === 1 ? state.textureRadialAmount1 : state.textureRadialAmount2) || 0);
  if (activeGrad && amt > 0) {
    applyTextureFillToSvgPaths(defs, paths, textureFillOptsForLayer(state, layerNum), amt);
  }
}

function syncTextureFillSvgDoc(svgEl, state) {
  resetSvgTextureFill(svgEl);
  resetSvgPathOutlines(svgEl);
  const doc = svgEl.ownerDocument || document;
  let defs = svgEl.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS(SVG_NS, 'defs');
    svgEl.insertBefore(defs, svgEl.firstChild);
  }
  const g1 = svgEl.querySelector('#layer1');
  const g2 = svgEl.querySelector('#layer2');
  if (g1) applySyncTextureToPathList(defs, g1.querySelectorAll('path'), 1, state);
  if (g2) applySyncTextureToPathList(defs, g2.querySelectorAll('path'), 2, state);
  svgEl.querySelectorAll('g[data-layout-pair-cutout="1"]').forEach((cg) => {
    applySyncTextureToPathList(defs, cg.querySelectorAll('path[data-tex-layer="1"]'), 1, state);
    applySyncTextureToPathList(defs, cg.querySelectorAll('path[data-tex-layer="2"]'), 2, state);
  });
  if (g1) applyPathOutlinesToGroup(g1, state, 1, state.logo1Color);
  if (g2) applyPathOutlinesToGroup(g2, state, 2, state.logo2Color);
  svgEl.querySelectorAll('g[data-layout-pair-cutout="1"]').forEach((cg) => {
    applyPathOutlinesToPaths(cg.querySelectorAll('path[data-tex-layer="1"]'), state.logo1Color, state, 1);
    applyPathOutlinesToPaths(cg.querySelectorAll('path[data-tex-layer="2"]'), state.logo2Color, state, 2);
  });
}

function syncTextureFillLayerSvgRoot(svgRoot, state, layerNum) {
  resetSvgTextureFill(svgRoot);
  resetSvgPathOutlines(svgRoot);
  const visL = layerNum === 1 ? state.layer1Visible : state.layer2Visible;
  if (!visL) return;
  const paths = svgRoot.querySelectorAll('path');
  if (!paths.length) return;
  const doc = svgRoot.ownerDocument || document;
  let defs = svgRoot.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS(SVG_NS, 'defs');
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }
  const [pr, pg, pb] = layerNum === 1 ? state.logo1Color : state.logo2Color;
  if (layerPatternShouldApply(state, layerNum)) {
    const pat = texturePatternOptsForLayer(state, layerNum);
    const amt = Math.max(0, Number(layerNum === 1 ? state.textureRadialAmount1 : state.textureRadialAmount2) || 0);
    if (pat.kind === 'dothatch' && textureGradientActiveForLayer(state, layerNum)) {
      applyGradientWithWaveDotsToSvgPaths(
        defs,
        paths,
        textureFillOptsForLayer(state, layerNum),
        amt,
        pat,
        pr,
        pg,
        pb,
        layerNum
      );
      applyPathOutlinesToLayerRoot(svgRoot, state, layerNum);
      return;
    }
    if (pat.kind === 'stripes') {
      applyStripePatternToSvgPaths(defs, paths, pat, pr, pg, pb);
    } else if (pat.kind === 'dothatch') {
      applyDotsPatternToSvgPaths(defs, paths, pat, pr, pg, pb);
    } else {
      applyBitmapPatternToSvgPaths(defs, paths, pat);
    }
    applyPathOutlinesToLayerRoot(svgRoot, state, layerNum);
    return;
  }
  const activeGrad = layerNum === 1 ? !!state.textureFillLayer1 : !!state.textureFillLayer2;
  const amt = Math.max(0, Number(layerNum === 1 ? state.textureRadialAmount1 : state.textureRadialAmount2) || 0);
  if (activeGrad && amt > 0) {
    applyTextureFillToSvgPaths(defs, paths, textureFillOptsForLayer(state, layerNum), amt);
  }
  applyPathOutlinesToLayerRoot(svgRoot, state, layerNum);
}

function setLayerCssTextureGradientOnly(layerEl, rgba, amount, active, fillOpts) {
  if (!layerEl) return;
  const spans = layerEl.querySelectorAll('span');
  const [r, g, b] = rgba;
  const amt = Math.max(0, Number(amount) || 0);
  if (!active || !amt) {
    spans.forEach((span) => {
      span.style.color = `rgb(${r},${g},${b})`;
      span.style.backgroundImage = '';
      span.style.removeProperty('background-size');
      span.style.removeProperty('background-repeat');
      span.style.removeProperty('background-position');
      span.style.removeProperty('background-clip');
      span.style.removeProperty('-webkit-background-clip');
      span.style.removeProperty('-webkit-text-fill-color');
      span.style.removeProperty('transform');
    });
    return;
  }
  const st = textureFillEdgeAndLit(amt, r, g, b, !!fillOpts.invert);
  const innerStop = textureFillInnerStopPct(amt);
  const linear = fillOpts.kind === 'linear';
  const angle = Number(fillOpts.angle) || 0;
  const bg = linear
    ? `linear-gradient(${angle}deg, rgb(${st.c0r},${st.c0g},${st.c0b}), rgb(${st.c1r},${st.c1g},${st.c1b}))`
    : `radial-gradient(ellipse farthest-corner at 50% 50%, rgb(${st.c0r},${st.c0g},${st.c0b}) 0%, rgb(${st.c1r},${st.c1g},${st.c1b}) ${innerStop}%, rgb(${st.c1r},${st.c1g},${st.c1b}) 100%)`;
  spans.forEach((span) => {
    span.style.color = 'transparent';
    span.style.setProperty('-webkit-text-fill-color', 'transparent');
    span.style.backgroundImage = bg;
    span.style.removeProperty('background-size');
    span.style.removeProperty('background-repeat');
    span.style.removeProperty('background-position');
    span.style.setProperty('background-clip', 'text');
    span.style.setProperty('-webkit-background-clip', 'text');
    span.style.removeProperty('transform');
  });
}

function syncLayerCssSpanFill(layerEl, state, layerNum) {
  if (!layerEl) return;
  const spans = layerEl.querySelectorAll('span');
  const rgba = layerNum === 1 ? state.logo1Color : state.logo2Color;
  const [r, g, b] = rgba;
  const visL = layerNum === 1 ? state.layer1Visible : state.layer2Visible;
  if (!visL) return;

  const solidReset = () => {
    spans.forEach((span) => {
      span.style.color = `rgb(${r},${g},${b})`;
      span.style.backgroundImage = '';
      span.style.removeProperty('background-size');
      span.style.removeProperty('background-repeat');
      span.style.removeProperty('background-position');
      span.style.removeProperty('background-clip');
      span.style.removeProperty('-webkit-background-clip');
      span.style.removeProperty('-webkit-text-fill-color');
      span.style.removeProperty('transform');
    });
  };

  if (layerPatternShouldApply(state, layerNum)) {
    const pat = texturePatternOptsForLayer(state, layerNum);
    if (pat.kind === 'stripes') {
      const period = Math.max(4, Math.min(160, pat.period || 14));
      const ratio = Math.min(0.92, Math.max(0.08, Number(pat.ratio) || 0.45));
      const stripePx = Math.max(1, period * ratio);
      const gapPx = Math.max(1, period - stripePx);
      const ang = Number(pat.angle) || 0;
      const bg = `repeating-linear-gradient(${ang}deg, rgb(${r},${g},${b}) 0 ${stripePx}px, transparent ${stripePx}px ${stripePx + gapPx}px)`;
      spans.forEach((span) => {
        span.style.color = 'transparent';
        span.style.setProperty('-webkit-text-fill-color', 'transparent');
        span.style.backgroundImage = bg;
        span.style.removeProperty('background-size');
        span.style.removeProperty('background-repeat');
        span.style.backgroundPosition = 'center';
        span.style.setProperty('background-clip', 'text');
        span.style.setProperty('-webkit-background-clip', 'text');
        span.style.removeProperty('transform');
      });
      return;
    }
    if (pat.kind === 'dothatch') {
      const period = Math.max(4, Math.min(160, pat.period || 14));
      const ratio = Math.min(0.92, Math.max(0.08, Number(pat.ratio) || 0.45));
      const ang = Number(pat.angle) || 0;
      const c = `rgb(${r},${g},${b})`;
      const dotStop = Math.round(ratio * 42);
      const bg = `radial-gradient(circle closest-side, ${c} ${dotStop}%, transparent ${Math.min(99, dotStop + 3)}%)`;
      spans.forEach((span) => {
        span.style.color = 'transparent';
        span.style.setProperty('-webkit-text-fill-color', 'transparent');
        span.style.backgroundImage = bg;
        span.style.backgroundSize = `${period}px ${period}px`;
        span.style.backgroundRepeat = 'repeat';
        span.style.backgroundPosition = 'center';
        span.style.setProperty('background-clip', 'text');
        span.style.setProperty('-webkit-background-clip', 'text');
        if (ang) span.style.transform = `rotate(${ang}deg)`;
        else span.style.removeProperty('transform');
      });
      return;
    }
    spans.forEach((span) => {
      span.style.color = 'transparent';
      span.style.setProperty('-webkit-text-fill-color', 'transparent');
      span.style.backgroundImage = `url(${JSON.stringify(pat.bitmapUrl)})`;
      if (pat.bitmapPerShape) {
        span.style.backgroundSize = 'cover';
        span.style.backgroundRepeat = 'no-repeat';
      } else {
        const tilePx = Math.max(24, Math.min(240, Math.round((Number(pat.bitmapScale) || 100) * 0.96)));
        span.style.backgroundSize = `${tilePx}px ${tilePx}px`;
        span.style.backgroundRepeat = 'repeat';
      }
      span.style.backgroundPosition = 'center';
      span.style.setProperty('background-clip', 'text');
      span.style.setProperty('-webkit-background-clip', 'text');
      span.style.removeProperty('transform');
    });
    return;
  }

  const activeGrad = layerNum === 1 ? !!state.textureFillLayer1 : !!state.textureFillLayer2;
  const amt = Math.max(0, Number(layerNum === 1 ? state.textureRadialAmount1 : state.textureRadialAmount2) || 0);
  if (!activeGrad || !amt) {
    solidReset();
    return;
  }
  setLayerCssTextureGradientOnly(layerEl, rgba, amt, true, textureFillOptsForLayer(state, layerNum));
}

function syncTextureRadial(state) {
  if (!state) return;

  const layoutCanvasEl = document.getElementById('layout-canvas');
  const lw = layoutCanvasEl?.querySelector('.layout-wrapper');
  if (lw && lw.tagName !== 'CANVAS') {
    const svgL1 = lw.querySelector('.layout-layer1 svg.layout-layer-svg');
    const svgL2 = lw.querySelector('.layout-layer2 svg.layout-layer-svg');
    if (svgL1 || svgL2) {
      if (svgL1) syncTextureFillLayerSvgRoot(svgL1, state, 1);
      if (svgL2) syncTextureFillLayerSvgRoot(svgL2, state, 2);
    } else {
      const svg = lw.querySelector('svg');
      if (svg?.querySelector('#layer1')) {
        syncTextureFillSvgDoc(svg, state);
      } else {
        syncLayerCssSpanFill(lw.querySelector('.layout-layer1'), state, 1);
        syncLayerCssSpanFill(lw.querySelector('.layout-layer2'), state, 2);
        syncLayerCssSpanOutline(lw.querySelector('.layout-layer1'), state, 1);
        syncLayerCssSpanOutline(lw.querySelector('.layout-layer2'), state, 2);
      }
    }
  }

  const posterCanvasEl = document.getElementById('poster-canvas');
  const pw = posterCanvasEl?.querySelector('.poster-wrapper');
  if (pw) {
    const svgP1 = pw.querySelector('.poster-layer1 svg.layout-layer-svg');
    const svgP2 = pw.querySelector('.poster-layer2 svg.layout-layer-svg');
    if (svgP1 || svgP2) {
      if (svgP1) syncTextureFillLayerSvgRoot(svgP1, state, 1);
      if (svgP2) syncTextureFillLayerSvgRoot(svgP2, state, 2);
    } else {
      const svg = pw.querySelector('svg');
      if (svg?.querySelector('#layer1')) {
        syncTextureFillSvgDoc(svg, state);
      } else {
        syncLayerCssSpanFill(pw.querySelector('.poster-layer1'), state, 1);
        syncLayerCssSpanFill(pw.querySelector('.poster-layer2'), state, 2);
        syncLayerCssSpanOutline(pw.querySelector('.poster-layer1'), state, 1);
        syncLayerCssSpanOutline(pw.querySelector('.poster-layer2'), state, 2);
      }
    }
  }
}

function applySvgExportBlur(svgRoot, state) {
  const px = Math.max(0, Number(state.textureBlurPx) || 0);
  if (px < 0.01) return;
  const blurLayer1 = state.layer1Visible && !!state.textureBlurLayer1;
  const blurLayer2 = state.layer2Visible && !!state.textureBlurLayer2;
  if (!blurLayer1 && !blurLayer2) return;
  const doc = svgRoot.ownerDocument || document;
  let defs = svgRoot.querySelector('defs');
  if (!defs) {
    defs = doc.createElementNS(SVG_NS, 'defs');
    svgRoot.insertBefore(defs, svgRoot.firstChild);
  }
  const std = Math.max(0.25, px * 0.52);
  const mk = (id) => {
    const f = doc.createElementNS(SVG_NS, 'filter');
    f.setAttribute('id', id);
    f.setAttribute('filterUnits', 'userSpaceOnUse');
    f.setAttribute('x', '-60%');
    f.setAttribute('y', '-60%');
    f.setAttribute('width', '220%');
    f.setAttribute('height', '220%');
    f.setAttribute('data-texfill', '1');
    const blur = doc.createElementNS(SVG_NS, 'feGaussianBlur');
    blur.setAttribute('in', 'SourceGraphic');
    blur.setAttribute('stdDeviation', String(std));
    f.appendChild(blur);
    defs.appendChild(f);
  };
  if (blurLayer1) mk('export-blur-layer1');
  if (blurLayer2) mk('export-blur-layer2');
  const g1 = svgRoot.querySelector('#layer1');
  const g2 = svgRoot.querySelector('#layer2');
  if (blurLayer1 && g1) g1.setAttribute('filter', 'url(#export-blur-layer1)');
  if (blurLayer2 && g2) g2.setAttribute('filter', 'url(#export-blur-layer2)');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function resolveImageUrlForSvgExport(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('data:')) return u;
  try {
    const res = await fetch(u);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  } catch (e) {
    console.warn('[SVG export] Nepodařilo se vložit obrázek:', e);
    return u;
  }
}

async function stateWithBitmapDataUrlsForExport(state) {
  if (!state) return state;
  let u1 = state.texturePatternBitmapUrl1;
  let u2 = state.texturePatternBitmapUrl2;
  const need1 =
    layerPatternShouldApply(state, 1) &&
    texturePatternOptsForLayer(state, 1).kind === 'bitmap' &&
    u1 &&
    !String(u1).startsWith('data:');
  const need2 =
    layerPatternShouldApply(state, 2) &&
    texturePatternOptsForLayer(state, 2).kind === 'bitmap' &&
    u2 &&
    !String(u2).startsWith('data:');
  if (need1) u1 = await resolveImageUrlForSvgExport(u1);
  if (need2) u2 = await resolveImageUrlForSvgExport(u2);
  if (need1 || need2) return { ...state, texturePatternBitmapUrl1: u1, texturePatternBitmapUrl2: u2 };
  return state;
}

async function finalizeSvgForExport(svgStr, state) {
  if (!svgStr || !state) return svgStr;
  const exportState = await stateWithBitmapDataUrlsForExport(state);
  const parser = new DOMParser();
  const pdoc = parser.parseFromString(svgStr, 'image/svg+xml');
  const root = pdoc.documentElement;
  if (!root || root.localName !== 'svg') return svgStr;
  if (!root.querySelector('#layer1') && !root.querySelector('g[data-layout-pair-cutout="1"]')) return svgStr;
  syncTextureFillSvgDoc(root, exportState);
  applySvgExportBlur(root, exportState);
  const serialized = new XMLSerializer().serializeToString(root);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
}

function textureGradientSliderBounds() {
  const ref = typeof document !== 'undefined' ? document.getElementById('layout-texture-radial-amount-1') : null;
  const max = Number(ref?.max) || 16;
  const min = Number(ref?.min) || 0;
  const step = Number(ref?.step) || 1;
  const steps = Math.max(1, Math.floor((max - min) / step) + 1);
  return { max, min, step, steps };
}

function randomTextureGradientAmountNonZero() {
  const { min, step, steps } = textureGradientSliderBounds();
  if (steps <= 1) return min;
  const idx = 1 + Math.floor(Math.random() * (steps - 1));
  return min + idx * step;
}

function applyRandomTextureBlur(state) {
  const v1 = state.layer1Visible;
  const v2 = state.layer2Visible;
  if (v1 && v2) {
    if (Math.random() < 0.5) {
      state.textureBlurLayer1 = true;
      state.textureBlurLayer2 = false;
    } else {
      state.textureBlurLayer1 = false;
      state.textureBlurLayer2 = true;
    }
  } else {
    state.textureBlurLayer1 = v1;
    state.textureBlurLayer2 = v2;
  }
  const blurRangeEl = document.getElementById('layout-texture-blur-amount');
  const max = Number(blurRangeEl?.max) || 16;
  const min = Number(blurRangeEl?.min) || 0;
  const step = Number(blurRangeEl?.step) || 1;
  const steps = Math.floor((max - min) / step) + 1;
  state.textureBlurPx = min + Math.floor(Math.random() * steps) * step;
  if (blurRangeEl) blurRangeEl.value = String(state.textureBlurPx);
  const blurLabelEl = document.getElementById('layout-texture-blur-amount-label');
  if (blurLabelEl) blurLabelEl.textContent = `Rozostření: ${state.textureBlurPx} px`;
  const blurL1 = document.getElementById('layout-texture-blur-l1');
  const blurL2 = document.getElementById('layout-texture-blur-l2');
  if (blurL1) blurL1.checked = !!state.textureBlurLayer1;
  if (blurL2) blurL2.checked = !!state.textureBlurLayer2;
  syncTextureBlur(state);
}

function applyRandomTextureGradient(state) {
  const v1 = state.layer1Visible;
  const v2 = state.layer2Visible;
  state.textureFillLayer1 = !!v1;
  state.textureFillLayer2 = !!v2;
  if (v1) {
    state.textureRadialAmount1 = randomTextureGradientAmountNonZero();
  } else {
    state.textureRadialAmount1 = 0;
  }
  if (v2) {
    state.textureRadialAmount2 = randomTextureGradientAmountNonZero();
  } else {
    state.textureRadialAmount2 = 0;
  }
  state.textureGradientKind1 = Math.random() < 0.5 ? 'radial' : 'linear';
  state.textureGradientKind2 = Math.random() < 0.5 ? 'radial' : 'linear';
  state.textureGradientAngle1 = Math.floor(Math.random() * 24) * 15;
  state.textureGradientAngle2 = Math.floor(Math.random() * 24) * 15;
  state.textureGradientInvert1 = Math.random() < 0.5;
  state.textureGradientInvert2 = Math.random() < 0.5;
  syncTextureGradientControlsFromState(state);
  syncTextureRadial(state);
}

function rollTexturePatternLayer(state, ln) {
  const period = 6 + Math.floor(Math.random() * 23) * 2;
  const ratio = (12 + Math.floor(Math.random() * 58)) / 100;
  const angle = Math.floor(Math.random() * 24) * 15;
  const scale = 40 + Math.floor(Math.random() * 15) * 10;
  const url1 = state.texturePatternBitmapUrl1;
  const url2 = state.texturePatternBitmapUrl2;
  const pickKind = (url) => {
    const r = Math.random();
    if (r < 0.34) return 'stripes';
    if (r < 0.58) {
      if (url) return 'bitmap';
      return Math.random() < 0.5 ? 'stripes' : 'dothatch';
    }
    if (r < 0.78) return 'dothatch';
    if (url) return 'bitmap';
    return Math.random() < 0.5 ? 'stripes' : 'dothatch';
  };
  if (ln === 1) {
    state.texturePatternStripesPeriod1 = period;
    state.texturePatternStripesRatio1 = ratio;
    state.texturePatternStripesAngle1 = angle;
    state.texturePatternBitmapScale1 = Math.min(200, Math.max(25, scale));
    state.texturePatternKind1 = pickKind(url1);
  } else {
    state.texturePatternStripesPeriod2 = period;
    state.texturePatternStripesRatio2 = ratio;
    state.texturePatternStripesAngle2 = angle;
    state.texturePatternBitmapScale2 = Math.min(200, Math.max(25, scale));
    state.texturePatternKind2 = pickKind(url2);
  }
}

function applyRandomTexturePattern(state) {
  const v1 = !!state.layer1Visible;
  const v2 = !!state.layer2Visible;
  let target = 'both';
  if (v1 && v2) {
    const t = Math.random();
    if (t < 1 / 3) target = '1';
    else if (t < 2 / 3) target = '2';
    else target = 'both';
  } else if (v1) target = '1';
  else if (v2) target = '2';

  if (target === '1') {
    state.texturePatternEnabled1 = true;
    state.texturePatternEnabled2 = false;
  } else if (target === '2') {
    state.texturePatternEnabled1 = false;
    state.texturePatternEnabled2 = true;
  } else {
    state.texturePatternEnabled1 = v1;
    state.texturePatternEnabled2 = v2;
  }

  if (state.texturePatternEnabled1) rollTexturePatternLayer(state, 1);
  if (state.texturePatternEnabled2) rollTexturePatternLayer(state, 2);
  syncTexturePatternControlsFromState(state);
  syncTextureRadial(state);
}

function applyRandomPathOutline(state) {
  const v1 = !!state.layer1Visible;
  const v2 = !!state.layer2Visible;
  if (!v1 && !v2) return;
  state.pathOutlineWidth1 = 1 + Math.floor(Math.random() * 5);
  state.pathOutlineWidth2 = 1 + Math.floor(Math.random() * 5);
  state.pathOutlineWidth = 0;
  if (Math.random() < 0.35) state.pathOutlineRandomGaps = true;
  if (Math.random() < 0.5) state.pathOutlineDashSalt = (Number(state.pathOutlineDashSalt) || 0) + 1 + Math.floor(Math.random() * 8);
  if (v1 && v2) {
    const t = Math.random();
    if (t < 1 / 3) {
      state.pathOutlineLayer1 = true;
      state.pathOutlineLayer2 = false;
    } else if (t < 2 / 3) {
      state.pathOutlineLayer1 = false;
      state.pathOutlineLayer2 = true;
    } else {
      state.pathOutlineLayer1 = true;
      state.pathOutlineLayer2 = true;
    }
  } else {
    state.pathOutlineLayer1 = v1;
    state.pathOutlineLayer2 = v2;
  }
  syncPathOutlineControlsFromState(state);
  syncTextureRadial(state);
}

function applyRandomTextureEffectsCombo(state) {
  applyRandomTextureBlur(state);
  applyRandomTextureGradient(state);
  applyRandomTexturePattern(state);
  if (Math.random() < 0.45) applyRandomPathOutline(state);
}

function resetNahodneTextureEfekty(state) {
  revokeTexturePatternBitmap(state, 1);
  revokeTexturePatternBitmap(state, 2);
  state.textureBlurPx = 0;
  state.textureBlurLayer1 = true;
  state.textureBlurLayer2 = true;
  state.textureRadialAmount1 = 0;
  state.textureRadialAmount2 = 0;
  state.textureFillLayer1 = true;
  state.textureFillLayer2 = true;
  state.textureGradientKind1 = 'radial';
  state.textureGradientKind2 = 'radial';
  state.textureGradientInvert1 = false;
  state.textureGradientInvert2 = false;
  state.textureGradientAngle1 = 90;
  state.textureGradientAngle2 = 90;
  state.texturePatternEnabled1 = false;
  state.texturePatternEnabled2 = false;
  state.texturePatternKind1 = 'stripes';
  state.texturePatternKind2 = 'stripes';
  state.texturePatternStripesAngle1 = 45;
  state.texturePatternStripesAngle2 = 330;
  state.texturePatternStripesPeriod1 = 14;
  state.texturePatternStripesPeriod2 = 18;
  state.texturePatternStripesRatio1 = 0.45;
  state.texturePatternStripesRatio2 = 0.5;
  state.texturePatternBitmapUrl1 = '';
  state.texturePatternBitmapUrl2 = '';
  state.texturePatternBitmapScale1 = 100;
  state.texturePatternBitmapScale2 = 100;
  state.texturePatternBitmapPerShape1 = false;
  state.texturePatternBitmapPerShape2 = false;
  state.pathOutlineLayer1 = false;
  state.pathOutlineLayer2 = false;
  state.pathOutlineWidth = 0;
  state.pathOutlineWidth1 = 0;
  state.pathOutlineWidth2 = 0;
  state.pathOutlineRandomGaps = false;
  state.pathOutlineGapAmount = 5;
  state.pathOutlineDashSalt = 0;
  const blurRangeEl = document.getElementById('layout-texture-blur-amount');
  if (blurRangeEl) blurRangeEl.value = String(state.textureBlurPx);
  const blurLabelEl = document.getElementById('layout-texture-blur-amount-label');
  if (blurLabelEl) blurLabelEl.textContent = `Rozostření: ${state.textureBlurPx} px`;
  const blurL1 = document.getElementById('layout-texture-blur-l1');
  const blurL2 = document.getElementById('layout-texture-blur-l2');
  if (blurL1) blurL1.checked = !!state.textureBlurLayer1;
  if (blurL2) blurL2.checked = !!state.textureBlurLayer2;
  syncTextureGradientControlsFromState(state);
  syncTexturePatternControlsFromState(state);
  syncPathOutlineControlsFromState(state);
  syncTextureBlur(state);
  syncTextureRadial(state);
}

function syncPathOutlineControlsFromState(state) {
  const w1 = pathOutlineWidthForLayer(state, 1);
  const w2 = pathOutlineWidthForLayer(state, 2);
  const wEl1 = document.getElementById('layout-path-outline-width-1');
  const wLb1 = document.getElementById('layout-path-outline-width-1-label');
  if (wEl1) wEl1.value = String(w1);
  if (wLb1) wLb1.textContent = `Šířka obrysu V1: ${w1} px`;
  const wEl2 = document.getElementById('layout-path-outline-width-2');
  const wLb2 = document.getElementById('layout-path-outline-width-2-label');
  if (wEl2) wEl2.value = String(w2);
  if (wLb2) wLb2.textContent = `Šířka obrysu V2: ${w2} px`;
  const gapEl = document.getElementById('layout-path-outline-gap-amount');
  const gapLb = document.getElementById('layout-path-outline-gap-amount-label');
  const gapAmt = Math.max(0, Math.min(10, Number(state.pathOutlineGapAmount)));
  const gapV = Number.isFinite(gapAmt) ? gapAmt : 5;
  if (gapEl) gapEl.value = String(gapV);
  if (gapLb) gapLb.textContent = `Přerušení (mezery): ${gapV}`;
  const rg = document.getElementById('layout-path-outline-random-gaps');
  if (rg) rg.checked = !!state.pathOutlineRandomGaps;
  const l1 = document.getElementById('layout-path-outline-l1');
  const l2 = document.getElementById('layout-path-outline-l2');
  if (l1) l1.checked = !!state.pathOutlineLayer1;
  if (l2) l2.checked = !!state.pathOutlineLayer2;
}

function syncTextureGradientControlsFromState(state) {
  const radialRangeEl1 = document.getElementById('layout-texture-radial-amount-1');
  const radialLabelEl1 = document.getElementById('layout-texture-radial-amount-1-label');
  if (radialRangeEl1) radialRangeEl1.value = String(state.textureRadialAmount1 ?? 0);
  if (radialLabelEl1) radialLabelEl1.textContent = `V1 gradient: ${state.textureRadialAmount1 ?? 0}`;
  const radialRangeEl2 = document.getElementById('layout-texture-radial-amount-2');
  const radialLabelEl2 = document.getElementById('layout-texture-radial-amount-2-label');
  if (radialRangeEl2) radialRangeEl2.value = String(state.textureRadialAmount2 ?? 0);
  if (radialLabelEl2) radialLabelEl2.textContent = `V2 gradient: ${state.textureRadialAmount2 ?? 0}`;
  const fillL1 = document.getElementById('layout-texture-fill-l1');
  const fillL2 = document.getElementById('layout-texture-fill-l2');
  if (fillL1) fillL1.checked = !!state.textureFillLayer1;
  if (fillL2) fillL2.checked = !!state.textureFillLayer2;
  const g1r = document.getElementById('layout-texture-grad-1-radial');
  const g1l = document.getElementById('layout-texture-grad-1-linear');
  if (g1r && g1l) {
    const lin = state.textureGradientKind1 === 'linear';
    g1r.checked = !lin;
    g1l.checked = lin;
  }
  const g2r = document.getElementById('layout-texture-grad-2-radial');
  const g2l = document.getElementById('layout-texture-grad-2-linear');
  if (g2r && g2l) {
    const lin2 = state.textureGradientKind2 === 'linear';
    g2r.checked = !lin2;
    g2l.checked = lin2;
  }
  const linAng1 = document.getElementById('layout-texture-linear-angle-1');
  const linAngLabel1 = document.getElementById('layout-texture-linear-angle-1-label');
  if (linAng1) linAng1.value = String(state.textureGradientAngle1 ?? 90);
  if (linAngLabel1) linAngLabel1.textContent = `Směr: ${state.textureGradientAngle1 ?? 90}°`;
  const linAng2 = document.getElementById('layout-texture-linear-angle-2');
  const linAngLabel2 = document.getElementById('layout-texture-linear-angle-2-label');
  if (linAng2) linAng2.value = String(state.textureGradientAngle2 ?? 90);
  if (linAngLabel2) linAngLabel2.textContent = `Směr: ${state.textureGradientAngle2 ?? 90}°`;
  syncTextureSubpanelVisibility(state);
}

function syncTextureSubpanelVisibility(state) {
  const gradLin1 = document.getElementById('layout-tex-grad-linear-wrap-1');
  const gradRad1 = document.getElementById('layout-tex-grad-radial-wrap-1');
  const lin1 = state.textureGradientKind1 === 'linear';
  if (gradLin1) gradLin1.hidden = !lin1;
  if (gradRad1) gradRad1.hidden = lin1;
  const gradLin2 = document.getElementById('layout-tex-grad-linear-wrap-2');
  const gradRad2 = document.getElementById('layout-tex-grad-radial-wrap-2');
  const lin2 = state.textureGradientKind2 === 'linear';
  if (gradLin2) gradLin2.hidden = !lin2;
  if (gradRad2) gradRad2.hidden = lin2;

  const k1 = texturePatternKindResolved(state.texturePatternKind1);
  const k2 = texturePatternKindResolved(state.texturePatternKind2);
  const bm1 = k1 === 'bitmap';
  const sw1 = document.getElementById('layout-tex-pat-stripes-wrap-1');
  const bw1 = document.getElementById('layout-tex-pat-bitmap-wrap-1');
  if (sw1) sw1.hidden = bm1;
  if (bw1) bw1.hidden = !bm1;
  const bm2 = k2 === 'bitmap';
  const sw2 = document.getElementById('layout-tex-pat-stripes-wrap-2');
  const bw2 = document.getElementById('layout-tex-pat-bitmap-wrap-2');
  if (sw2) sw2.hidden = bm2;
  if (bw2) bw2.hidden = !bm2;
}

function revokeTexturePatternBitmap(state, layerNum) {
  const uKey = layerNum === 1 ? 'texturePatternBitmapUrl1' : 'texturePatternBitmapUrl2';
  const cur = state[uKey];
  if (cur && String(cur).startsWith('blob:')) {
    try {
      URL.revokeObjectURL(cur);
    } catch {}
  }
  state[uKey] = '';
}

function refreshTexturePatParamLabelsFromState(state) {
  for (const ln of [1, 2]) {
    const k = texturePatternKindResolved(ln === 1 ? state.texturePatternKind1 : state.texturePatternKind2);
    const isDots = k === 'dothatch';
    const ang = ln === 1 ? state.texturePatternStripesAngle1 : state.texturePatternStripesAngle2;
    const per = ln === 1 ? state.texturePatternStripesPeriod1 : state.texturePatternStripesPeriod2;
    const pct = Math.round((Number(ln === 1 ? state.texturePatternStripesRatio1 : state.texturePatternStripesRatio2) || 0.45) * 100);
    const aEl = document.getElementById(`layout-texture-pat-angle-${ln}-label`);
    const pEl = document.getElementById(`layout-texture-pat-period-${ln}-label`);
    const rEl = document.getElementById(`layout-texture-pat-ratio-${ln}-label`);
    if (aEl) aEl.textContent = isDots ? `Úhel: ${ang ?? 0}°` : `Úhel pruhů: ${ang ?? 0}°`;
    if (pEl) pEl.textContent = isDots ? `Hustota: ${per ?? 14}` : `Rozteč: ${per ?? 14}px`;
    if (rEl) rEl.textContent = isDots ? `Velikost teček: ${pct}%` : `Šířka pruhu: ${pct}%`;
  }
}

function syncTexturePatternControlsFromState(state) {
  const pe1 = document.getElementById('layout-texture-pat-enable-1');
  const pe2 = document.getElementById('layout-texture-pat-enable-2');
  if (pe1) pe1.checked = !!state.texturePatternEnabled1;
  if (pe2) pe2.checked = !!state.texturePatternEnabled2;
  const k1 = texturePatternKindResolved(state.texturePatternKind1);
  const s1 = document.getElementById('layout-texture-pat-stripes-1');
  const b1 = document.getElementById('layout-texture-pat-bitmap-1');
  const d1 = document.getElementById('layout-texture-pat-dothatch-1');
  if (s1 && b1 && d1) {
    s1.checked = k1 === 'stripes';
    b1.checked = k1 === 'bitmap';
    d1.checked = k1 === 'dothatch';
  }
  const k2 = texturePatternKindResolved(state.texturePatternKind2);
  const s2 = document.getElementById('layout-texture-pat-stripes-2');
  const b2 = document.getElementById('layout-texture-pat-bitmap-2');
  const d2 = document.getElementById('layout-texture-pat-dothatch-2');
  if (s2 && b2 && d2) {
    s2.checked = k2 === 'stripes';
    b2.checked = k2 === 'bitmap';
    d2.checked = k2 === 'dothatch';
  }
  const a1 = document.getElementById('layout-texture-pat-angle-1');
  if (a1) a1.value = String(state.texturePatternStripesAngle1 ?? 0);
  const p1 = document.getElementById('layout-texture-pat-period-1');
  if (p1) p1.value = String(state.texturePatternStripesPeriod1 ?? 14);
  const r1 = document.getElementById('layout-texture-pat-ratio-1');
  const pct1 = Math.round((Number(state.texturePatternStripesRatio1) || 0.45) * 100);
  if (r1) r1.value = String(pct1);
  const sc1 = document.getElementById('layout-texture-pat-bitmap-scale-1');
  const sc1l = document.getElementById('layout-texture-pat-bitmap-scale-1-label');
  if (sc1) sc1.value = String(state.texturePatternBitmapScale1 ?? 100);
  if (sc1l) sc1l.textContent = `Dlaždice: ${state.texturePatternBitmapScale1 ?? 100}%`;

  const a2 = document.getElementById('layout-texture-pat-angle-2');
  if (a2) a2.value = String(state.texturePatternStripesAngle2 ?? 0);
  const p2 = document.getElementById('layout-texture-pat-period-2');
  if (p2) p2.value = String(state.texturePatternStripesPeriod2 ?? 14);
  const r2 = document.getElementById('layout-texture-pat-ratio-2');
  const pct2 = Math.round((Number(state.texturePatternStripesRatio2) || 0.45) * 100);
  if (r2) r2.value = String(pct2);
  const sc2 = document.getElementById('layout-texture-pat-bitmap-scale-2');
  const sc2l = document.getElementById('layout-texture-pat-bitmap-scale-2-label');
  if (sc2) sc2.value = String(state.texturePatternBitmapScale2 ?? 100);
  if (sc2l) sc2l.textContent = `Dlaždice: ${state.texturePatternBitmapScale2 ?? 100}%`;
  const bps1 = document.getElementById('layout-texture-pat-bitmap-per-shape-1');
  if (bps1) bps1.checked = !!state.texturePatternBitmapPerShape1;
  const bps2 = document.getElementById('layout-texture-pat-bitmap-per-shape-2');
  if (bps2) bps2.checked = !!state.texturePatternBitmapPerShape2;
  refreshTexturePatParamLabelsFromState(state);
  syncTextureSubpanelVisibility(state);
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
  const fkFeat = layoutFeatureCssToFontKit(feature);
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
        const ink = glyphCenterHalfSpanTimesFit(char, fk1, axes1, fkFeat, fitUnified);
        maxHalf = Math.max(maxHalf, ink ?? (h1 * fitUnified) / 2);
      }
      if (layer2Visible) {
        const ink = glyphCenterHalfSpanTimesFit(char, fk2, axes2, fkFeat, fitUnified);
        maxHalf = Math.max(maxHalf, ink ?? (h2 * fitUnified) / 2);
      }
      if (maxHalf <= 0) continue;
      colMin = ay - maxHalf;
      colMax = ay + maxHalf;
    } else {
      let maxH = 0;
      if (layer1Visible) {
        const ink = glyphHeightAboveBottomPivotTimesFit(char, fk1, axes1, fkFeat, fitScale1);
        maxH = Math.max(maxH, ink ?? h1 * fitScale1);
      }
      if (layer2Visible) {
        const ink = glyphHeightAboveBottomPivotTimesFit(char, fk2, axes2, fkFeat, fitScale2);
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
  const fkFeat = layoutFeatureCssToFontKit(feature);
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
        const inkY = glyphCenterHalfSpanTimesFit(char, fk1, axes1, fkFeat, fitUnified);
        maxHalfY = Math.max(maxHalfY, inkY ?? (h1 * fitUnified) / 2);
        const inkW = glyphMaxHalfWidthTimesFit(char, fk1, axes1, fkFeat, fitUnified);
        halfW = Math.max(halfW, inkW ?? (w1 * fitUnified) / 2);
      }
      if (layer2Visible) {
        const inkY = glyphCenterHalfSpanTimesFit(char, fk2, axes2, fkFeat, fitUnified);
        maxHalfY = Math.max(maxHalfY, inkY ?? (h2 * fitUnified) / 2);
        const inkW = glyphMaxHalfWidthTimesFit(char, fk2, axes2, fkFeat, fitUnified);
        halfW = Math.max(halfW, inkW ?? (w2 * fitUnified) / 2);
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
        const inkH = glyphHeightAboveBottomPivotTimesFit(char, fk1, axes1, fkFeat, fitScale1);
        maxH = Math.max(maxH, inkH ?? h1 * fitScale1);
        const inkWi = glyphMaxHalfWidthTimesFit(char, fk1, axes1, fkFeat, fitScale1);
        halfW = Math.max(halfW, inkWi ?? (w1 * fitScale1) / 2);
      }
      if (layer2Visible) {
        const inkH = glyphHeightAboveBottomPivotTimesFit(char, fk2, axes2, fkFeat, fitScale2);
        maxH = Math.max(maxH, inkH ?? h2 * fitScale2);
        const inkWi = glyphMaxHalfWidthTimesFit(char, fk2, axes2, fkFeat, fitScale2);
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

  const fkFeat = layoutFeatureCssToFontKit(feature);
  const fk1 = getResolvedLayoutFontKit(fontName1);
  const fk2 = getResolvedLayoutFontKit(fontName2);
  const usePathLayers = !!(fk1 && fk2);

  let layerSvg1 = null;
  let layerSvg2 = null;
  if (usePathLayers) {
    layerSvg1 = document.createElementNS(SVG_NS, 'svg');
    layerSvg1.setAttribute('class', 'layout-layer-svg');
    layerSvg1.setAttribute('data-layer', '1');
    layerSvg1.setAttribute('width', String(CANVAS_W));
    layerSvg1.setAttribute('height', String(CANVAS_H));
    layerSvg1.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
    layerSvg1.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;';
    layerSvg2 = document.createElementNS(SVG_NS, 'svg');
    layerSvg2.setAttribute('class', 'layout-layer-svg');
    layerSvg2.setAttribute('data-layer', '2');
    layerSvg2.setAttribute('width', String(CANVAS_W));
    layerSvg2.setAttribute('height', String(CANVAS_H));
    layerSvg2.setAttribute('viewBox', `0 0 ${CANVAS_W} ${CANVAS_H}`);
    layerSvg2.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;mix-blend-mode:multiply;';
  }

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

    if (usePathLayers) {
      const glyph1 = getGlyphPathFromFontKit(fk1, char, FONT_SIZE_LOAD, axes1, fkFeat);
      const glyph2 = getGlyphPathFromFontKit(fk2, char, FONT_SIZE_LOAD, axes2, fkFeat);
      if (layer1Visible && glyph1) {
        const py1 = centerAnchors ? glyph1.pivotYCenter : glyph1.pivotYBottom;
        const tr = `translate(${anchorX},${anchorY}) scale(${scale1}) scale(1,-1) translate(${-glyph1.pivotX},${-py1})`;
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('transform', tr);
        g.dataset.debugIdx = String(i);
        for (const sub of glyph1.contours) {
          const p = document.createElementNS(SVG_NS, 'path');
          p.setAttribute('d', sub.pathData);
          p.setAttribute('fill', `rgb(${logo1Color[0]},${logo1Color[1]},${logo1Color[2]})`);
          g.appendChild(p);
        }
        layerSvg1.appendChild(g);
      }
      if (layer2Visible && glyph2) {
        const py2 = centerAnchors ? glyph2.pivotYCenter : glyph2.pivotYBottom;
        const tr = `translate(${anchorX},${anchorY}) scale(${scale2}) scale(1,-1) translate(${-glyph2.pivotX},${-py2})`;
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('transform', tr);
        g.dataset.debugIdx = String(i);
        for (const sub of glyph2.contours) {
          const p = document.createElementNS(SVG_NS, 'path');
          p.setAttribute('d', sub.pathData);
          p.setAttribute('fill', `rgb(${logo2Color[0]},${logo2Color[1]},${logo2Color[2]})`);
          g.appendChild(p);
        }
        layerSvg2.appendChild(g);
      }
    } else {
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
  }

  if (usePathLayers) {
    layer1.appendChild(layerSvg1);
    layer2.appendChild(layerSvg2);
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
    const pathDebugGlyphs = !!layer1.querySelector('svg.layout-layer-svg');
    const layer1Els = pathDebugGlyphs
      ? layer1.querySelectorAll('g[data-debug-idx]')
      : layer1.querySelectorAll('span[data-debug-idx]');
    layer1Els.forEach((span) => {
      const i = parseInt(span.dataset.debugIdx, 10);
      const set = renderLayoutDebug[i];
      const r = span.getBoundingClientRect();
      const setLeft = pathDebugGlyphs ? (set?.left ?? 0) : (parseFloat(span.style.left) || 0);
      const setTop = pathDebugGlyphs ? (set?.top ?? 0) : (parseFloat(span.style.top) || 0);
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
    const firstSpan = pathDebugGlyphs
      ? layer1.querySelector('g[data-debug-idx="0"]')
      : layer1.querySelector('span[data-debug-idx="0"]');
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
    const layer2Els = pathDebugGlyphs
      ? layer2.querySelectorAll('g[data-debug-idx]')
      : layer2.querySelectorAll('span[data-debug-idx]');
    layer2Els.forEach((span2) => {
      const i = parseInt(span2.dataset.debugIdx, 10);
      const span1 = pathDebugGlyphs
        ? layer1.querySelector(`g[data-debug-idx="${i}"]`)
        : layer1.querySelector(`span[data-debug-idx="${i}"]`);
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

function parseCssTransformScale(transformStr) {
  if (!transformStr || transformStr === 'none') return { sx: 1, sy: 1 };
  const matrixMatch = transformStr.match(/matrix\(([^)]+)\)/);
  if (matrixMatch) {
    const parts = matrixMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map((x) => parseFloat(x))
      .filter((n) => !Number.isNaN(n));
    if (parts.length >= 4) {
      const a = parts[0];
      const b = parts[1];
      const c = parts[2];
      const d = parts[3];
      return { sx: Math.hypot(a, b), sy: Math.hypot(c, d) };
    }
  }
  const scaleMatch = transformStr.match(/scale\(([^)]+)\)/);
  if (scaleMatch) {
    const vals = scaleMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map((x) => parseFloat(x))
      .filter((n) => !Number.isNaN(n));
    const sxa = vals[0] || 1;
    const sya = vals.length > 1 ? vals[1] : sxa;
    return { sx: sxa, sy: sya };
  }
  return { sx: 1, sy: 1 };
}

function collectLayoutCutoutDebugSnapshot(note, layoutContainer, state, stageIndices1, stageIndices2) {
  const layoutEl = document.getElementById('layout-canvas');
  const wrap = layoutEl?.querySelector('.layout-wrapper');
  const inner = layoutContainer ? getLayoutCanvasInnerSize(layoutContainer) : { width: 0, height: 0 };
  const tr = wrap ? window.getComputedStyle(wrap).transform : 'none';
  const { sx, sy } = parseCssTransformScale(tr);
  const wr = wrap?.getBoundingClientRect();
  const layoutCanvas = layoutContainer?.getBoundingClientRect();
  const svgEl = wrap?.querySelector('svg');
  let pathBBoxUnion = '—';
  let pathCount = 0;
  try {
    if (svgEl) {
      const paths = Array.from(svgEl.querySelectorAll('path'));
      pathCount = paths.length;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of paths) {
        const bb = p.getBBox();
        minX = Math.min(minX, bb.x);
        minY = Math.min(minY, bb.y);
        maxX = Math.max(maxX, bb.x + bb.width);
        maxY = Math.max(maxY, bb.y + bb.height);
      }
      if (Number.isFinite(minX) && pathCount) {
        pathBBoxUnion = `x ${minX.toFixed(1)}–${maxX.toFixed(1)} y ${minY.toFixed(1)}–${maxY.toFixed(1)} (${(maxX - minX).toFixed(1)}×${(maxY - minY).toFixed(1)})`;
      }
    }
  } catch {
    pathBBoxUnion = 'getBBox err';
  }

  const sxArr = state.screenX || [];
  const syArr = state.screenY || [];
  const screenSpan =
    sxArr.length > 0
      ? `X ${Math.min(...sxArr).toFixed(0)}–${Math.max(...sxArr).toFixed(0)} · Y ${Math.min(...syArr).toFixed(0)}–${Math.max(...syArr).toFixed(0)}`
      : '—';

  const cellGeom = { availCellW: state.availCellW, availCellH: state.availCellH, cellHeight: state.cellHeight };
  const shiftY =
    sxArr.length && stageIndices1?.length
      ? computeLayoutVerticalCenterShift(state, stageIndices1, stageIndices2, state.screenX, state.screenY, cellGeom)
      : 0;

  const fitScaleW = inner.width / CANVAS_W;
  const fitScaleH = inner.height / CANVAS_H;
  const fitMin = Math.min(fitScaleW, fitScaleH);
  const fitExpected = Math.min(fitMin, 1);

  return {
    note,
    pair_cutout_chrome: String(layoutViewUsesCutoutChrome(state)),
    layoutGlyphAnchor: state.layoutGlyphAnchor || 'bottom',
    wrapper_class: wrap?.className || '—',
    canvas_inner_css: `${inner.width.toFixed(0)}×${inner.height.toFixed(0)}`,
    fit_to_inner: `${fitScaleW.toFixed(4)} / ${fitScaleH.toFixed(4)} (min cap 1 → ${fitExpected.toFixed(4)})`,
    wrapper_css_size: `${CANVAS_W}×${CANVAS_H}`,
    wrapper_client_rect: wr ? `${wr.width.toFixed(1)}×${wr.height.toFixed(1)}` : '—',
    css_transform_scale: `${sx.toFixed(4)} × ${sy.toFixed(4)}`,
    layout_canvas_rect: layoutCanvas ? `${layoutCanvas.width.toFixed(0)}×${layoutCanvas.height.toFixed(0)}` : '—',
    svg_root_wh: svgEl ? `${svgEl.getAttribute('width') || '?'}×${svgEl.getAttribute('height') || '?'}` : '—',
    svg_viewBox: svgEl?.getAttribute('viewBox') || '—',
    path_count: String(pathCount),
    path_bbox_union_SVG_px: pathBBoxUnion,
    screen_span_anchor: screenSpan,
    availCell: `${typeof state.availCellW === 'number' ? state.availCellW.toFixed(2) : '—'} × ${typeof state.availCellH === 'number' ? state.availCellH.toFixed(2) : '—'}`,
    cellHeight: typeof state.cellHeight === 'number' ? state.cellHeight.toFixed(4) : '—',
    shiftY: Number(shiftY).toFixed(2)
  };
}

function logLayoutCutoutComparisonTable(before, after, shapes) {
  const allKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const rows = allKeys.map((metric) => ({
    metric,
    before: String(before[metric] ?? '—'),
    after: String(after[metric] ?? '—')
  }));
  const shapesSummary = shapes
    ? {
        layoutExportW: shapes.layoutExportW,
        layoutExportH: shapes.layoutExportH,
        svg_has_pair_cutout_vector: !!shapes.layoutSvg?.includes('data-layout-pair-cutout'),
        layoutSvg_chars: shapes.layoutSvg?.length ?? 0
      }
    : null;
  const tsv = ['metric\tbefore\tafter', ...rows.map((r) => `${r.metric}\t${r.before}\t${r.after}`)].join('\n');
  layoutDlog('[Layout výřez DEBUG] window.__layoutCutoutDebugLast');
  layoutDlog(tsv);
  const conv = typeof window !== 'undefined' ? window.__layoutConversionDebug : null;
  const pathAnchors =
    conv?.after?.map((r) => ({
      i: r.i,
      pointId: r.pointId ?? '—',
      char: r.char ?? '—',
      svgPosX: typeof r.svgPosX === 'number' ? r.svgPosX.toFixed(2) : '—',
      svgPosY: typeof r.svgPosY === 'number' ? r.svgPosY.toFixed(2) : '—',
      anchor: r.anchor ?? '—',
      fitUnified: r.fitUnified != null ? r.fitUnified.toFixed(4) : '—'
    })) ?? null;
  const payload = { rows, shapesSummary, pathAnchors };
  layoutDlog(JSON.stringify(payload, null, 2));
  layoutDtable(rows);
  if (pathAnchors?.length) {
    layoutDlog('[Layout výřez DEBUG] Path anchors (canvas px)');
    layoutDtable(pathAnchors);
  }
  if (typeof window !== 'undefined') {
    window.__layoutCutoutDebugLast = { before, after, rows, shapesSummary, tsv, pathAnchors };
  }
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

function layoutFeatureCssToFontKit(css) {
  const fk = {};
  const s = String(css || '');
  for (const m of s.matchAll(/"?(ss\d+)"?\s+1/gi)) fk[m[1]] = 1;
  if (Object.keys(fk).length) return fk;
  return { ss04: 1 };
}

function renderPoster(state, stageIndices1, stageIndices2, posterLetter, posterNumber, posterFeatureKey) {
  const posterContainer = document.getElementById('poster-canvas');
  if (!posterContainer) return;

  const { fontName1, fontName2, logo1Color, logo2Color, layer1Visible, layer2Visible } = state;
  const feature = posterFeatureKeyToCss(posterFeatureKey);

  const stage1 = stageIndices1[0] % NUM_STAGES;
  const stage2 = stageIndices2[0] % NUM_STAGES;
  const axes1 = getAxesForLayer(state, 1, stage1);
  const axes2 = getAxesForLayer(state, 2, stage2);
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

  const fk1 = getResolvedLayoutFontKit(fontName1);
  const fk2 = getResolvedLayoutFontKit(fontName2);
  const posterFeats = posterFeatureKeyToFontKit(posterFeatureKey);
  const usePosterPaths = !!(fk1 && fk2);

  if (usePosterPaths) {
    const glyph1 = getGlyphPathFromFontKit(fk1, letter, POSTER_FONT_SIZE, axes1, posterFeats);
    const glyph2 = getGlyphPathFromFontKit(fk2, number, POSTER_FONT_SIZE, axes2, posterFeats);
    const layerSvg1 = document.createElementNS(SVG_NS, 'svg');
    layerSvg1.setAttribute('class', 'layout-layer-svg');
    layerSvg1.setAttribute('data-layer', '1');
    layerSvg1.setAttribute('width', String(POSTER_W));
    layerSvg1.setAttribute('height', String(POSTER_H));
    layerSvg1.setAttribute('viewBox', `0 0 ${POSTER_W} ${POSTER_H}`);
    layerSvg1.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;';
    const layerSvg2 = document.createElementNS(SVG_NS, 'svg');
    layerSvg2.setAttribute('class', 'layout-layer-svg');
    layerSvg2.setAttribute('data-layer', '2');
    layerSvg2.setAttribute('width', String(POSTER_W));
    layerSvg2.setAttribute('height', String(POSTER_H));
    layerSvg2.setAttribute('viewBox', `0 0 ${POSTER_W} ${POSTER_H}`);
    layerSvg2.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;mix-blend-mode:multiply;';
    if (layer1Visible && glyph1) {
      const tr = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyph1.pivotX},${-glyph1.pivotYCenter})`;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', tr);
      for (const sub of glyph1.contours) {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', sub.pathData);
        p.setAttribute('fill', `rgb(${logo1Color[0]},${logo1Color[1]},${logo1Color[2]})`);
        g.appendChild(p);
      }
      layerSvg1.appendChild(g);
    }
    if (layer2Visible && glyph2) {
      const tr = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyph2.pivotX},${-glyph2.pivotYCenter})`;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('transform', tr);
      for (const sub of glyph2.contours) {
        const p = document.createElementNS(SVG_NS, 'path');
        p.setAttribute('d', sub.pathData);
        p.setAttribute('fill', `rgb(${logo2Color[0]},${logo2Color[1]},${logo2Color[2]})`);
        g.appendChild(p);
      }
      layerSvg2.appendChild(g);
    }
    layer1.appendChild(layerSvg1);
    layer2.appendChild(layerSvg2);
  } else {
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
  }

  wrapper.appendChild(layer1);
  wrapper.appendChild(layer2);
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

  const stage1 = stageIndices1[0] % NUM_STAGES;
  const stage2 = stageIndices2[0] % NUM_STAGES;
  const axes1 = getAxesForLayer(state, 1, stage1);
  const axes2 = getAxesForLayer(state, 2, stage2);
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

async function saveLayoutPng(shapes, canvasBg, state) {
  if (!shapes) return;
  const bg = normalizedCanvasBgHex(canvasBg);
  const ts = layoutTimestamp();
  let layoutSvgForFile = shapes.layoutSvgExport || shapes.layoutSvg;
  layoutSvgForFile = await finalizeSvgForExport(layoutSvgForFile, state);
  const layoutW = shapes.layoutExportW ?? CANVAS_W;
  const layoutH = shapes.layoutExportH ?? CANVAS_H;
  const layoutBlob = await svgToPngBlob(layoutSvgForFile, layoutW, layoutH, bg);
  if (layoutBlob) downloadBlob(layoutBlob, `layout_${ts}.png`);
}

async function savePosterPng(shapes, canvasBg, state) {
  if (!shapes) return;
  const bg = normalizedCanvasBgHex(canvasBg);
  const ts = layoutTimestamp();
  let posterSvg = shapes.posterSvg;
  posterSvg = await finalizeSvgForExport(posterSvg, state);
  const posterBlob = await svgToPngBlob(posterSvg, POSTER_W, POSTER_H, bg);
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

function collectSubcontourOmitPool(state, stageIndices1, stageIndices2, font1, font2, getPosterInputs) {
  const { pointIds, numPoints, layer1Visible, layer2Visible } = state;
  const feature = state.fontFeatureSettings || '"ss04" 1';
  const fkFeat = layoutFeatureCssToFontKit(feature);
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
  const pi = getPosterInputs();
  const posterFeatureKey = pi.featureKey || 'normal';
  const posterFk = posterFeatureKeyToFontKit(posterFeatureKey);
  const stage1 = stageIndices1[0] % NUM_STAGES;
  const stage2 = stageIndices2[0] % NUM_STAGES;
  const axes1 = getAxesForLayer(state, 1, stage1);
  const axes2 = getAxesForLayer(state, 2, stage2);
  const letter = String(pi.letter || 'S').charAt(0);
  const number = String(pi.number || '1').charAt(0);
  const glyphP1 = getGlyphPathFromFontKit(font1, letter, POSTER_FONT_SIZE, axes1, posterFk);
  const glyphP2 = getGlyphPathFromFontKit(font2, number, POSTER_FONT_SIZE, axes2, posterFk);
  if (layer1Visible && glyphP1 && glyphP1.contours.length > 1) {
    for (let si = 0; si < glyphP1.contours.length; si++) pool.push({ layer: 1, si, poster: true });
  }
  if (layer2Visible && glyphP2 && glyphP2.contours.length > 1) {
    for (let si = 0; si < glyphP2.contours.length; si++) pool.push({ layer: 2, si, poster: true });
  }
  return pool;
}

function collectSubcontourScalePool(state, stageIndices1, stageIndices2, font1, font2, getPosterInputs) {
  const { pointIds, numPoints, layer1Visible, layer2Visible } = state;
  const feature = state.fontFeatureSettings || '"ss04" 1';
  const fkFeat = layoutFeatureCssToFontKit(feature);
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
  const pst1 = stageIndices1[0] % NUM_STAGES;
  const pst2 = stageIndices2[0] % NUM_STAGES;
  const axesP1 = getAxesForLayer(state, 1, pst1);
  const axesP2 = getAxesForLayer(state, 2, pst2);
  const letter = String(pi.letter || 'S').charAt(0);
  const number = String(pi.number || '1').charAt(0);
  const glyphP1 = getGlyphPathFromFontKit(font1, letter, POSTER_FONT_SIZE, axesP1, posterFk);
  const glyphP2 = getGlyphPathFromFontKit(font2, number, POSTER_FONT_SIZE, axesP2, posterFk);
  if (layer1Visible && glyphP1 && glyphP1.contours.length) {
    for (let si = 0; si < glyphP1.contours.length; si++) pool.push({ layer: 1, si, poster: true });
  }
  if (layer2Visible && glyphP2 && glyphP2.contours.length) {
    for (let si = 0; si < glyphP2.contours.length; si++) pool.push({ layer: 2, si, poster: true });
  }
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
    if (p.poster) {
      const m = p.layer === 1 ? state.shapeScalePosterSub1 : state.shapeScalePosterSub2;
      m.set(p.si, p.scale);
    } else {
      const top = p.layer === 1 ? state.shapeScaleSubcontours1 : state.shapeScaleSubcontours2;
      let inner = top.get(p.i);
      if (!inner) {
        inner = new Map();
        top.set(p.i, inner);
      }
      inner.set(p.si, p.scale);
    }
  }
}

function glyphCenterHalfSpanTimesFit(char, fontKit, axes, fkFeat, fit) {
  if (!fontKit || fit == null || !Number.isFinite(fit)) return null;
  const g = getGlyphPathFromFontKit(fontKit, char, FONT_SIZE_LOAD, axes, fkFeat);
  if (!g) return null;
  const boxMinY = g.bottomY;
  const boxMaxY = g.bottomY + g.height;
  const half = Math.max(boxMaxY - g.pivotYCenter, g.pivotYCenter - boxMinY);
  return half * fit;
}

function glyphHeightAboveBottomPivotTimesFit(char, fontKit, axes, fkFeat, fit) {
  if (!fontKit || !Number.isFinite(fit)) return null;
  const g = getGlyphPathFromFontKit(fontKit, char, FONT_SIZE_LOAD, axes, fkFeat);
  if (!g) return null;
  const boxMaxY = g.bottomY + g.height;
  return Math.max(0, boxMaxY - g.pivotYBottom) * fit;
}

function glyphMaxHalfWidthTimesFit(char, fontKit, axes, fkFeat, fit) {
  if (!fontKit || !Number.isFinite(fit)) return null;
  const g = getGlyphPathFromFontKit(fontKit, char, FONT_SIZE_LOAD, axes, fkFeat);
  if (!g) return null;
  const minX = g.cx - g.width / 2;
  const maxX = g.cx + g.width / 2;
  return Math.max(g.pivotX - minX, maxX - g.pivotX) * fit;
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

    const fkFeat = layoutFeatureCssToFontKit(feature);
    const glyph1 = getGlyphPathFromFontKit(font1, char, FONT_SIZE_LOAD, axes1, fkFeat);
    const glyph2 = getGlyphPathFromFontKit(font2, char, FONT_SIZE_LOAD, axes2, fkFeat);

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
      glyph1: glyph1 ? { nContour: glyph1.contours.length, cx: glyph1.cx, cy: glyph1.cy, bottomY: glyph1.bottomY, pivotX: glyph1.pivotX, pivotYBottom: glyph1.pivotYBottom, pivotYCenter: glyph1.pivotYCenter, width: glyph1.width, height: glyph1.height } : null,
      glyph2: glyph2 ? { nContour: glyph2.contours.length, cx: glyph2.cx, cy: glyph2.cy, bottomY: glyph2.bottomY, pivotX: glyph2.pivotX, pivotYBottom: glyph2.pivotYBottom, pivotYCenter: glyph2.pivotYCenter, width: glyph2.width, height: glyph2.height } : null
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
        const line = `  <path data-idx="${i}" data-sub="${si}" data-tex-layer="1" d="${escapeXmlAttr(sub.pathData)}" fill="${c1}" transform="${tr}"/>\n`;
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
        const line = `  <path data-idx="${i}" data-sub="${si}" data-tex-layer="2" d="${escapeXmlAttr(sub.pathData)}" fill="${c2}" transform="${tr}"/>\n`;
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

  const stage1 = stageIndices1[0] % NUM_STAGES;
  const stage2 = stageIndices2[0] % NUM_STAGES;
  const axes1 = getAxesForLayer(state, 1, stage1);
  const axes2 = getAxesForLayer(state, 2, stage2);
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
    const trBase = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyph1.pivotX},${-glyph1.pivotYCenter})`;
    layer1Paths = '';
    glyph1.contours.forEach((sub, si) => {
      if (state.shapeOmitPosterSub1 && state.shapeOmitPosterSub1.has(si)) return;
      const tr = `${trBase}${posterSubcontourLocalScaleSuffix(sub, glyph1.pivotX, glyph1.pivotYCenter, state.shapeScalePosterSub1, si)}`;
      layer1Paths += `  <path data-sub="${si}" data-tex-layer="1" d="${escapeXmlAttr(sub.pathData)}" fill="${c1}" transform="${tr}"/>\n`;
    });
  }
  if (layer2Visible && glyph2) {
    const trBase = `translate(${centerX},${centerY}) scale(${fitScale}) scale(1,-1) translate(${-glyph2.pivotX},${-glyph2.pivotYCenter})`;
    layer2Paths = '';
    glyph2.contours.forEach((sub, si) => {
      if (state.shapeOmitPosterSub2 && state.shapeOmitPosterSub2.has(si)) return;
      const tr = `${trBase}${posterSubcontourLocalScaleSuffix(sub, glyph2.pivotX, glyph2.pivotYCenter, state.shapeScalePosterSub2, si)}`;
      layer2Paths += `  <path data-sub="${si}" data-tex-layer="2" d="${escapeXmlAttr(sub.pathData)}" fill="${c2}" transform="${tr}"/>\n`;
    });
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
<g data-poster-pair-cutout="1">
<g id="layer1">\n${layer1Paths}</g>
<g id="layer2" style="mix-blend-mode:multiply">\n${layer2Paths}</g>
${holePath}</g>
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
  const layout = convertLayoutToShapes(font1, font2, state, stageIndices1, stageIndices2);
  const posterSvg = convertPosterToShapes(font1, font2, state, stageIndices1, stageIndices2, posterInputs.letter, posterInputs.number);
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

async function saveLayoutSvg(shapes, state) {
  if (!shapes) return;
  const ts = layoutTimestamp();
  let layoutSvgForFile = shapes.layoutSvgExport || shapes.layoutSvg;
  layoutSvgForFile = await finalizeSvgForExport(layoutSvgForFile, state);
  downloadBlob(new Blob([layoutSvgForFile], { type: 'image/svg+xml' }), `layout_${ts}.svg`);
}

async function savePosterSvg(shapes, state) {
  if (!shapes) return;
  const ts = layoutTimestamp();
  let posterSvg = shapes.posterSvg;
  posterSvg = await finalizeSvgForExport(posterSvg, state);
  downloadBlob(new Blob([posterSvg], { type: 'image/svg+xml' }), `poster_${ts}.svg`);
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

      try {
        await Promise.all([resolveLayoutFontKit(fontName1), resolveLayoutFontKit(fontName2)]);
      } catch (e) {
        console.warn('FontKit preload (layout paths):', e);
      }

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
        shapeScalePosterSub1: new Map(),
        shapeScalePosterSub2: new Map(),
        textureBlurPx: 0,
        textureBlurLayer1: true,
        textureBlurLayer2: true,
        textureRadialAmount1: 0,
        textureRadialAmount2: 0,
        textureFillLayer1: true,
        textureFillLayer2: true,
        textureGradientKind1: 'radial',
        textureGradientKind2: 'radial',
        textureGradientInvert1: false,
        textureGradientInvert2: false,
        textureGradientAngle1: 90,
        textureGradientAngle2: 90,
        texturePatternEnabled1: false,
        texturePatternEnabled2: false,
        texturePatternKind1: 'stripes',
        texturePatternKind2: 'stripes',
        texturePatternStripesAngle1: 45,
        texturePatternStripesAngle2: 330,
        texturePatternStripesPeriod1: 14,
        texturePatternStripesPeriod2: 18,
        texturePatternStripesRatio1: 0.45,
        texturePatternStripesRatio2: 0.5,
        texturePatternBitmapUrl1: '',
        texturePatternBitmapUrl2: '',
        texturePatternBitmapScale1: 100,
        texturePatternBitmapScale2: 100,
        texturePatternBitmapPerShape1: false,
        texturePatternBitmapPerShape2: false,
        pathOutlineLayer1: false,
        pathOutlineLayer2: false,
        pathOutlineWidth: 0,
        pathOutlineWidth1: 0,
        pathOutlineWidth2: 0,
        pathOutlineRandomGaps: false,
        pathOutlineGapAmount: 5,
        pathOutlineDashSalt: 0
      };

      const getPosterInputs = () => ({
        letter: document.getElementById('poster-letter')?.value || 'S',
        number: document.getElementById('poster-number')?.value || '1',
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
        const blurL1 = document.getElementById('layout-texture-blur-l1');
        const blurL2 = document.getElementById('layout-texture-blur-l2');
        if (blurL1) blurL1.checked = !!state.textureBlurLayer1;
        if (blurL2) blurL2.checked = !!state.textureBlurLayer2;
        syncTextureGradientControlsFromState(state);
        syncTexturePatternControlsFromState(state);
        syncPathOutlineControlsFromState(state);
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
        try {
          await Promise.all([resolveLayoutFontKit(name1), resolveLayoutFontKit(name2)]);
        } catch (e) {
          console.warn('FontKit:', e);
        }
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

      document.getElementById('layout-btn-png-logo')?.addEventListener('click', () => {
        saveLayoutPng(convertedShapes, state.canvasBg, state).catch((e) => console.error('PNG layout failed:', e));
      });
      document.getElementById('layout-btn-png-plakat')?.addEventListener('click', () => {
        savePosterPng(convertedShapes, state.canvasBg, state).catch((e) => console.error('PNG poster failed:', e));
      });
      document.getElementById('layout-btn-svg-logo')?.addEventListener('click', () => {
        if (!convertedShapes || !krok1ConfirmedForSvg) return;
        saveLayoutSvg(convertedShapes, state).catch((e) => console.error('SVG layout failed:', e));
      });
      document.getElementById('layout-btn-svg-plakat')?.addEventListener('click', () => {
        if (!convertedShapes || !krok1ConfirmedForSvg) return;
        savePosterSvg(convertedShapes, state).catch((e) => console.error('SVG poster failed:', e));
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
        } catch (e) {
          console.error('[Omit tvary] příprava výběru selhala:', e);
        }
        try {
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
            { error: String(e?.message || e), pool_kontur: pickMeta.poolSize, vyber: pickMeta.picksStr }
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
          console.error('Obnovit všechny tvary failed:', e);
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
          const pool = collectSubcontourScalePool(state, stageIndices1, stageIndices2, font1, font2, getPosterInputs);
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
            try {
              await Promise.all([resolveLayoutFontKit(f1), resolveLayoutFontKit(f2)]);
            } catch (e) {
              console.warn('FontKit:', e);
            }
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
            try {
              await Promise.all([resolveLayoutFontKit(next1), resolveLayoutFontKit(next2)]);
            } catch (e) {
              console.warn('FontKit:', e);
            }
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
            try {
              await resolveLayoutFontKit(next1);
            } catch (e) {
              console.warn('FontKit:', e);
            }
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
            try {
              await resolveLayoutFontKit(next2);
            } catch (e) {
              console.warn('FontKit:', e);
            }
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
            try {
              await Promise.all([resolveLayoutFontKit(next1), resolveLayoutFontKit(next2)]);
            } catch (e) {
              console.warn('FontKit:', e);
            }
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

      document.getElementById('layout-btn-random-effects')?.addEventListener('click', () => {
        applyRandomTextureEffectsCombo(state);
      });

      document.getElementById('layout-btn-clear-texture-effects')?.addEventListener('click', () => {
        resetNahodneTextureEfekty(state);
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
        applyRandomTextureBlur(state);
      });

      document.getElementById('layout-texture-blur-l1')?.addEventListener('change', (e) => {
        state.textureBlurLayer1 = !!e.target.checked;
        syncTextureBlur(state);
      });
      document.getElementById('layout-texture-blur-l2')?.addEventListener('change', (e) => {
        state.textureBlurLayer2 = !!e.target.checked;
        syncTextureBlur(state);
      });

      document.getElementById('layout-texture-radial-amount-1')?.addEventListener('input', (e) => {
        state.textureRadialAmount1 = Number(e.target.value) || 0;
        const radialLabelEl1 = document.getElementById('layout-texture-radial-amount-1-label');
        if (radialLabelEl1) radialLabelEl1.textContent = `V1 gradient: ${state.textureRadialAmount1}`;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-radial-amount-2')?.addEventListener('input', (e) => {
        state.textureRadialAmount2 = Number(e.target.value) || 0;
        const radialLabelEl2 = document.getElementById('layout-texture-radial-amount-2-label');
        if (radialLabelEl2) radialLabelEl2.textContent = `V2 gradient: ${state.textureRadialAmount2}`;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-radial-random-layer')?.addEventListener('click', () => {
        applyRandomTextureGradient(state);
      });

      document.getElementById('layout-texture-fill-l1')?.addEventListener('change', (e) => {
        state.textureFillLayer1 = !!e.target.checked;
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-fill-l2')?.addEventListener('change', (e) => {
        state.textureFillLayer2 = !!e.target.checked;
        syncTextureRadial(state);
      });

      const bindGradKindRadios = (radId, linId, key) => {
        document.getElementById(radId)?.addEventListener('change', (e) => {
          if (!e.target.checked) return;
          state[key] = 'radial';
          syncTextureSubpanelVisibility(state);
          syncTextureRadial(state);
        });
        document.getElementById(linId)?.addEventListener('change', (e) => {
          if (!e.target.checked) return;
          state[key] = 'linear';
          syncTextureSubpanelVisibility(state);
          syncTextureRadial(state);
        });
      };
      bindGradKindRadios('layout-texture-grad-1-radial', 'layout-texture-grad-1-linear', 'textureGradientKind1');
      bindGradKindRadios('layout-texture-grad-2-radial', 'layout-texture-grad-2-linear', 'textureGradientKind2');

      document.getElementById('layout-texture-linear-angle-1')?.addEventListener('input', (e) => {
        state.textureGradientAngle1 = Number(e.target.value) || 0;
        const linAngLabel1 = document.getElementById('layout-texture-linear-angle-1-label');
        if (linAngLabel1) linAngLabel1.textContent = `Směr: ${state.textureGradientAngle1}°`;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-linear-angle-2')?.addEventListener('input', (e) => {
        state.textureGradientAngle2 = Number(e.target.value) || 0;
        const linAngLabel2 = document.getElementById('layout-texture-linear-angle-2-label');
        if (linAngLabel2) linAngLabel2.textContent = `Směr: ${state.textureGradientAngle2}°`;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-radial-light-center-1')?.addEventListener('click', () => {
        state.textureGradientInvert1 = false;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-radial-light-edge-1')?.addEventListener('click', () => {
        state.textureGradientInvert1 = true;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-radial-light-center-2')?.addEventListener('click', () => {
        state.textureGradientInvert2 = false;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-radial-light-edge-2')?.addEventListener('click', () => {
        state.textureGradientInvert2 = true;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-pat-enable-1')?.addEventListener('change', (e) => {
        state.texturePatternEnabled1 = !!e.target.checked;
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-enable-2')?.addEventListener('change', (e) => {
        state.texturePatternEnabled2 = !!e.target.checked;
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-bitmap-per-shape-1')?.addEventListener('change', (e) => {
        state.texturePatternBitmapPerShape1 = !!e.target.checked;
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-bitmap-per-shape-2')?.addEventListener('change', (e) => {
        state.texturePatternBitmapPerShape2 = !!e.target.checked;
        syncTextureRadial(state);
      });

      const bindPatKindGroup = (name, kindKey) => {
        document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
          el.addEventListener('change', (e) => {
            if (!e.target.checked) return;
            const v = e.target.value;
            state[kindKey] = v === 'bitmap' ? 'bitmap' : v === 'dothatch' ? 'dothatch' : 'stripes';
            syncTextureSubpanelVisibility(state);
            refreshTexturePatParamLabelsFromState(state);
            syncTextureRadial(state);
          });
        });
      };
      bindPatKindGroup('layout-tex-pat-kind-1', 'texturePatternKind1');
      bindPatKindGroup('layout-tex-pat-kind-2', 'texturePatternKind2');

      document.getElementById('layout-texture-pat-angle-1')?.addEventListener('input', (e) => {
        state.texturePatternStripesAngle1 = Number(e.target.value) || 0;
        refreshTexturePatParamLabelsFromState(state);
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-period-1')?.addEventListener('input', (e) => {
        state.texturePatternStripesPeriod1 = Math.max(4, Number(e.target.value) || 14);
        refreshTexturePatParamLabelsFromState(state);
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-ratio-1')?.addEventListener('input', (e) => {
        const pct = Math.max(10, Math.min(90, Number(e.target.value) || 45));
        state.texturePatternStripesRatio1 = pct / 100;
        refreshTexturePatParamLabelsFromState(state);
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-bitmap-scale-1')?.addEventListener('input', (e) => {
        state.texturePatternBitmapScale1 = Math.max(25, Math.min(200, Number(e.target.value) || 100));
        const el = document.getElementById('layout-texture-pat-bitmap-scale-1-label');
        if (el) el.textContent = `Dlaždice: ${state.texturePatternBitmapScale1}%`;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-pat-angle-2')?.addEventListener('input', (e) => {
        state.texturePatternStripesAngle2 = Number(e.target.value) || 0;
        refreshTexturePatParamLabelsFromState(state);
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-period-2')?.addEventListener('input', (e) => {
        state.texturePatternStripesPeriod2 = Math.max(4, Number(e.target.value) || 14);
        refreshTexturePatParamLabelsFromState(state);
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-ratio-2')?.addEventListener('input', (e) => {
        const pct = Math.max(10, Math.min(90, Number(e.target.value) || 45));
        state.texturePatternStripesRatio2 = pct / 100;
        refreshTexturePatParamLabelsFromState(state);
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-bitmap-scale-2')?.addEventListener('input', (e) => {
        state.texturePatternBitmapScale2 = Math.max(25, Math.min(200, Number(e.target.value) || 100));
        const el = document.getElementById('layout-texture-pat-bitmap-scale-2-label');
        if (el) el.textContent = `Dlaždice: ${state.texturePatternBitmapScale2}%`;
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-pat-bitmap-file-1')?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (!f || !String(f.type || '').startsWith('image/')) {
          e.target.value = '';
          return;
        }
        revokeTexturePatternBitmap(state, 1);
        state.texturePatternBitmapUrl1 = URL.createObjectURL(f);
        e.target.value = '';
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-bitmap-clear-1')?.addEventListener('click', () => {
        revokeTexturePatternBitmap(state, 1);
        syncTexturePatternControlsFromState(state);
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-bitmap-file-2')?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (!f || !String(f.type || '').startsWith('image/')) {
          e.target.value = '';
          return;
        }
        revokeTexturePatternBitmap(state, 2);
        state.texturePatternBitmapUrl2 = URL.createObjectURL(f);
        e.target.value = '';
        syncTextureRadial(state);
      });
      document.getElementById('layout-texture-pat-bitmap-clear-2')?.addEventListener('click', () => {
        revokeTexturePatternBitmap(state, 2);
        syncTexturePatternControlsFromState(state);
        syncTextureRadial(state);
      });

      document.getElementById('layout-texture-pattern-random')?.addEventListener('click', () => {
        applyRandomTexturePattern(state);
      });

      document.getElementById('layout-path-outline-random')?.addEventListener('click', () => {
        applyRandomPathOutline(state);
      });

      document.getElementById('layout-path-outline-width-1')?.addEventListener('input', (e) => {
        state.pathOutlineWidth1 = Math.max(0, Math.min(10, Number(e.target.value) || 0));
        state.pathOutlineWidth = 0;
        const el = document.getElementById('layout-path-outline-width-1-label');
        if (el) el.textContent = `Šířka obrysu V1: ${state.pathOutlineWidth1} px`;
        syncTextureRadial(state);
      });
      document.getElementById('layout-path-outline-width-2')?.addEventListener('input', (e) => {
        state.pathOutlineWidth2 = Math.max(0, Math.min(10, Number(e.target.value) || 0));
        state.pathOutlineWidth = 0;
        const el = document.getElementById('layout-path-outline-width-2-label');
        if (el) el.textContent = `Šířka obrysu V2: ${state.pathOutlineWidth2} px`;
        syncTextureRadial(state);
      });
      document.getElementById('layout-path-outline-gap-amount')?.addEventListener('input', (e) => {
        state.pathOutlineGapAmount = Math.max(0, Math.min(10, Number(e.target.value) || 0));
        const el = document.getElementById('layout-path-outline-gap-amount-label');
        if (el) el.textContent = `Přerušení (mezery): ${state.pathOutlineGapAmount}`;
        syncTextureRadial(state);
      });
      document.getElementById('layout-path-outline-random-gaps')?.addEventListener('change', (e) => {
        state.pathOutlineRandomGaps = !!e.target.checked;
        syncTextureRadial(state);
      });
      document.getElementById('layout-path-outline-reroll-gaps')?.addEventListener('click', () => {
        state.pathOutlineDashSalt = (Number(state.pathOutlineDashSalt) || 0) + 1;
        syncTextureRadial(state);
      });
      document.getElementById('layout-path-outline-l1')?.addEventListener('change', (e) => {
        state.pathOutlineLayer1 = !!e.target.checked;
        syncTextureRadial(state);
      });
      document.getElementById('layout-path-outline-l2')?.addEventListener('change', (e) => {
        state.pathOutlineLayer2 = !!e.target.checked;
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

if (typeof window !== 'undefined') {
  window.layoutDebugOn = () => {
    try {
      localStorage.setItem(LAYOUT_DEBUG_STORAGE_KEY, '1');
    } catch {}
    window.__LAYOUT_DEBUG = true;
    console.info('[Layout] Verbose console: ON (persist reload). OFF: layoutDebugOff() · URL: ?layoutDebug=1');
  };
  window.layoutDebugOff = () => {
    try {
      localStorage.removeItem(LAYOUT_DEBUG_STORAGE_KEY);
    } catch {}
    window.__LAYOUT_DEBUG = false;
    console.info('[Layout] Verbose console: OFF');
  };
}

document.addEventListener('DOMContentLoaded', () => {
  initLayout('layout-canvas');
});
