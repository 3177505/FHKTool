import p5 from 'p5';

const B = import.meta.env.BASE_URL;
const A4_RATIO = 595 / 842;
const FORUM_PALETTE_STORAGE_KEY = 'forum-palette';
const FORUM_DEFAULT_COLOR1 = '#ff0080';
const FORUM_DEFAULT_COLOR2 = '#0066ff';

const FORUM_PRESETS = {
  default: {
    stampSpacing: 12,
    minSpacing: 12,
    maxSpacing: 100,
    lineStampSpacing: 20,
    minScale: 0.07,
    maxScale: 0.2,
    exportPrefix: 'forum',
  },
  dense: {
    stampSpacing: 1,
    minSpacing: 1,
    maxSpacing: 8,
    lineStampSpacing: 2,
    minScale: 0.05,
    maxScale: 0.14,
    exportPrefix: 'forum-dense',
    interactionMode: 'grow',
    growStepLength: 1.8,
    growFramesPerStep: 4,
    growWiggleAmp: 0.09,
    growWiggleFreq: 0.04,
    growWiggleHarmonic: 0.35,
    growPerpendicularJitter: 1,
    growMinDurationMs: 20000,
    growMaxDurationMs: 40000,
    growEdgeSteer: 0.07,
  },
};

function loadForumPaletteFromStorage() {
  try {
    const raw = localStorage.getItem(FORUM_PALETTE_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length !== 2 || typeof arr[0] !== 'string' || typeof arr[1] !== 'string') return null;
    if (!/^#?[0-9a-fA-F]{6}$/.test(arr[0].replace('#', '')) || !/^#?[0-9a-fA-F]{6}$/.test(arr[1].replace('#', ''))) return null;
    return [arr[0].startsWith('#') ? arr[0] : '#' + arr[0], arr[1].startsWith('#') ? arr[1] : '#' + arr[1]];
  } catch {
    return null;
  }
}

function saveForumPaletteToStorage(hex1, hex2) {
  try {
    localStorage.setItem(FORUM_PALETTE_STORAGE_KEY, JSON.stringify([hex1, hex2]));
  } catch (e) {
    console.warn('Failed to save forum palette:', e);
  }
}
const PNG_EXPORT_SCALE = 2;
const LOGO_SVG_NAMES = ['forum.svg', 'forum1.svg', 'forum2.svg', 'forum3.svg', 'forum4.svg', 'forum5.svg', 'forum6.svg'];
const LOGO_COUNT = 7;
const GRADIENT_ANGLE_STEPS = 24;
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_PIX = 15;
const SIZE_STEP = 0.05;
const SIZE_MIN = 0.5;
const SIZE_MAX = 2;

export function initForum(containerId, options = {}) {
  const preset = FORUM_PRESETS[options.preset] || FORUM_PRESETS.default;
  const prefix = options.prefix || containerId.replace(/-canvas$/, '');
  const elId = (suffix) => `${prefix}-${suffix}`;

  let logos = [];
  let logoMasks = [];
  let gradMasked = [];
  let logoPathData = [];
  let currentLogoIndex = 0;
  let stampSpacing = preset.stampSpacing;
  let minSpacing = preset.minSpacing;
  let maxSpacing = preset.maxSpacing;
  let maxSpeed = 40;
  let minScale = preset.minScale;
  let maxScale = preset.maxScale;
  let oscSpeed;
  let oscSpeedFrom = 0.01;
  let oscSpeedTo = 0.2;
  let gradPink;
  let gradBlue;
  let gradientPhaseOffset;
  let gradientCenter = 0.5;
  let sizeMultiplier = 1;
  let rebuildLogoIndex = -1;
  let lineStart = null;
  let lineStartScale;
  let lineStartGradientAngle;
  let lastClickTime = 0;
  let lastClickX = 0;
  let lastClickY = 0;
  let lineStampSpacing = preset.lineStampSpacing;
  let drawing;
  let stamps = [];
  let lastStampPos = { x: -9999, y: -9999 };
  let a4Frame = true;
  const exportPrefix = preset.exportPrefix;
  const interactionMode = preset.interactionMode || 'stamp';
  const growStepLength = preset.growStepLength || 2;
  const growFramesPerStep = preset.growFramesPerStep || 3;
  const growWiggleAmp = preset.growWiggleAmp || 0.08;
  const growWiggleFreq = preset.growWiggleFreq || 0.04;
  const growWiggleHarmonic = preset.growWiggleHarmonic || 0.3;
  const growPerpendicularJitter = preset.growPerpendicularJitter || 1;
  const growMinDurationMs = preset.growMinDurationMs || 20000;
  const growMaxDurationMs = preset.growMaxDurationMs || 40000;
  const growEdgeSteer = preset.growEdgeSteer || 0.06;
  let activeGrowths = [];
  let toColor;
  let p5ColorToHex;

  const getCanvasDimensions = () => {
    const el = document.getElementById(containerId);
    const main = el?.closest('main');
    const h = main ? main.clientHeight : window.innerHeight;
    const w = main ? main.clientWidth : window.innerWidth;
    if (a4Frame) {
      return { w: Math.round(h * A4_RATIO), h };
    }
    return { w, h };
  };

  const syncSizeSlider = () => {
    const sliderSize = document.getElementById(elId('slider-size'));
    if (sliderSize) sliderSize.value = Math.round(sizeMultiplier * 100);
  };

  const adjustSize = (delta) => {
    sizeMultiplier = Math.min(SIZE_MAX, Math.max(SIZE_MIN, sizeMultiplier + delta));
    syncSizeSlider();
  };

  return new p5((sketch) => {
    sketch.preload = () => {
      for (let i = 0; i < LOGO_COUNT; i++) {
        logos[i] = sketch.loadImage(`${B}forum/${LOGO_SVG_NAMES[i]}`);
      }
    };

    const doResize = () => {
      const oldW = sketch.width;
      const oldH = sketch.height;
      const { w: canvasW, h: canvasH } = getCanvasDimensions();
      sketch.resizeCanvas(canvasW, canvasH);
      if (oldW > 0 && oldH > 0 && stamps.length > 0) {
        const scaleX = canvasW / oldW;
        const scaleY = canvasH / oldH;
        stamps = stamps.map(s => ({
          ...s,
          x: s.x * scaleX,
          y: s.y * scaleY
        }));
        activeGrowths = activeGrowths.map(g => ({
          ...g,
          x: g.x * scaleX,
          y: g.y * scaleY,
        }));
      }
      drawing = sketch.createGraphics(canvasW, canvasH, sketch.P2D);
      drawing.background(255);
      stamps.forEach(s => drawStampFromStamp(drawing, s));
      const el = document.getElementById(containerId);
      if (el) el.classList.toggle('forum-full-width', !a4Frame);
    };

    sketch.setup = () => {
      const { w: canvasW, h: canvasH } = getCanvasDimensions();
      const cnv = sketch.createCanvas(canvasW, canvasH, sketch.P2D);
      cnv.parent(containerId);
      const el = document.getElementById(containerId);
      if (el) el.classList.toggle('forum-full-width', !a4Frame);
      sketch.smooth(8);
      toColor = (hex) => {
        const h = String(hex || '').trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(h)) return sketch.color(h.startsWith('#') ? h : '#' + h);
        return null;
      };
      p5ColorToHex = (c) => '#' + sketch.hex(sketch.red(c), 2) + sketch.hex(sketch.green(c), 2) + sketch.hex(sketch.blue(c), 2);
      const saved = loadForumPaletteFromStorage();
      const hex1 = saved ? saved[0] : FORUM_DEFAULT_COLOR1;
      const hex2 = saved ? saved[1] : FORUM_DEFAULT_COLOR2;
      gradPink = toColor(hex1) || sketch.color(255, 0, 128);
      gradBlue = toColor(hex2) || sketch.color(0, 102, 255);
      oscSpeed = sketch.random(oscSpeedFrom, oscSpeedTo);
      gradientPhaseOffset = sketch.random(sketch.TWO_PI);
      drawing = sketch.createGraphics(canvasW, canvasH, sketch.P2D);
      loadLogoPathData().then(() => {
        buildLogoMasks();
        rebuildGradientMasked();
        restartCanvas();
        wireControls();
      });

      function wireControls() {
        const btnLogo = document.getElementById(elId('btn-logo'));
        const btnRestart = document.getElementById(elId('btn-restart'));
        const btnPng = document.getElementById(elId('btn-png'));
        const btnSvg = document.getElementById(elId('btn-svg'));
        const toggleA4 = document.getElementById(elId('toggle-a4'));
        const sliderOsc = document.getElementById(elId('slider-osc'));
        const sliderGrad = document.getElementById(elId('slider-grad'));
        const sliderSize = document.getElementById(elId('slider-size'));

        if (toggleA4) {
          toggleA4.checked = a4Frame;
          toggleA4.addEventListener('change', () => {
            a4Frame = !!toggleA4.checked;
            doResize();
          });
        }
        function p5ColorToHexLocal(c) {
          return p5ColorToHex(c);
        }
        function buildForumSwatch(containerId, getColor, setColor) {
          const container = document.getElementById(containerId);
          if (!container) return;
          const update = () => {
            const hex = p5ColorToHexLocal(getColor());
            colorInput.value = hex;
            hexInput.value = hex;
          };
          container.innerHTML = '';
          const colorInput = document.createElement('input');
          colorInput.type = 'color';
          colorInput.value = p5ColorToHexLocal(getColor());
          const hexInput = document.createElement('input');
          hexInput.type = 'text';
          hexInput.value = p5ColorToHexLocal(getColor());
          hexInput.placeholder = '#000000';
          hexInput.maxLength = 7;
          const syncFromColor = () => {
            const c = toColor(colorInput.value);
            if (c) { setColor(c); hexInput.value = colorInput.value; rebuildLogoIndex = 0; }
          };
          const syncFromHex = () => {
            const c = toColor(hexInput.value);
            if (c) { setColor(c); colorInput.value = p5ColorToHexLocal(c); rebuildLogoIndex = 0; }
          };
          colorInput.addEventListener('input', syncFromColor);
          colorInput.addEventListener('change', syncFromColor);
          hexInput.addEventListener('change', syncFromHex);
          hexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') syncFromHex(); });
          container.appendChild(colorInput);
          container.appendChild(hexInput);
          return update;
        }
        buildForumSwatch(elId('color1-swatch'), () => gradPink, (c) => { gradPink = c; })();
        buildForumSwatch(elId('color2-swatch'), () => gradBlue, (c) => { gradBlue = c; })();
        document.getElementById(elId('btn-save-palette'))?.addEventListener('click', () => {
          saveForumPaletteToStorage(p5ColorToHexLocal(gradPink), p5ColorToHexLocal(gradBlue));
          const btn = document.getElementById(elId('btn-save-palette'));
          if (btn) { const orig = btn.textContent; btn.textContent = 'Uloženo!'; setTimeout(() => { btn.textContent = orig; }, 1500); }
        });
        document.getElementById(elId('btn-reset-palette'))?.addEventListener('click', () => {
          gradPink = toColor(FORUM_DEFAULT_COLOR1) || sketch.color(255, 0, 128);
          gradBlue = toColor(FORUM_DEFAULT_COLOR2) || sketch.color(0, 102, 255);
          rebuildLogoIndex = 0;
          buildForumSwatch(elId('color1-swatch'), () => gradPink, (c) => { gradPink = c; })();
          buildForumSwatch(elId('color2-swatch'), () => gradBlue, (c) => { gradBlue = c; })();
        });
        if (btnLogo) btnLogo.addEventListener('click', () => {
          currentLogoIndex = (currentLogoIndex + 1) % LOGO_COUNT;
          oscSpeed = sketch.random(oscSpeedFrom, oscSpeedTo);
          gradientPhaseOffset = sketch.random(sketch.TWO_PI);
          if (sliderOsc) sliderOsc.value = Math.round(sketch.map(oscSpeed, 0.001, 1, 1, 100));
        });
        if (btnRestart) btnRestart.addEventListener('click', restartCanvas);
        if (btnPng) btnPng.addEventListener('click', savePng);
        if (btnSvg) btnSvg.addEventListener('click', saveSvg);

        if (sliderOsc) {
          sliderOsc.value = Math.round(sketch.map(oscSpeed, 0.001, 1, 1, 100));
          sliderOsc.addEventListener('input', () => {
            oscSpeed = sketch.map(parseFloat(sliderOsc.value), 1, 100, 0.001, 1);
          });
        }
        if (sliderGrad) {
          sliderGrad.value = Math.round(gradientCenter * 100);
          sliderGrad.addEventListener('input', () => {
            gradientCenter = sketch.constrain(parseFloat(sliderGrad.value) / 100, 0.1, 0.9);
            rebuildLogoIndex = 0;
          });
        }
        if (sliderSize) {
          sliderSize.value = Math.round(sizeMultiplier * 100);
          sliderSize.addEventListener('input', () => {
            sizeMultiplier = parseFloat(sliderSize.value) / 100;
          });
        }
      }

      sketch.windowResized = () => doResize();
    };

    async function loadLogoPathData() {
      logoPathData = [];
      for (let i = 0; i < LOGO_COUNT; i++) {
        try {
          const res = await fetch(`${B}forum/${LOGO_SVG_NAMES[i]}`);
          const txt = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(txt, 'image/svg+xml');
          const paths = doc.querySelectorAll('path');
          logoPathData[i] = Array.from(paths).map(p => p.getAttribute('d') || '');
        } catch {
          logoPathData[i] = [];
        }
      }
    }

    function buildLogoMasks() {
      logoMasks = [];
      for (let i = 0; i < LOGO_COUNT; i++) {
        if (!logos[i]) continue;
        const w = Math.max(1, Math.floor(logos[i].width));
        const h = Math.max(1, Math.floor(logos[i].height));
        const maskBuf = sketch.createGraphics(w, h);
        maskBuf.background(255, 255, 255, 255);
        const ctx = maskBuf.drawingContext;
        if (ctx) {
          ctx.globalCompositeOperation = 'destination-in';
        }
        maskBuf.push();
        maskBuf.image(logos[i], 0, 0, w, h);
        maskBuf.pop();
        if (ctx) {
          ctx.globalCompositeOperation = 'source-over';
        }
        logoMasks[i] = maskBuf.get(0, 0, maskBuf.width, maskBuf.height);
      }
    }

    function rebuildGradientMasked() {
      gradMasked = [];
      for (let i = 0; i < LOGO_COUNT; i++) {
        rebuildOneLogo(i);
      }
    }

    function rebuildOneLogo(i) {
      if (!logos[i] || !logoMasks[i]) return;
      const w = Math.max(1, Math.floor(logos[i].width));
      const h = Math.max(1, Math.floor(logos[i].height));
      const R = Math.sqrt(w * w + h * h) / 2 + 2;
      const maskImg = logoMasks[i];
      gradMasked[i] = [];
      for (let step = 0; step < GRADIENT_ANGLE_STEPS; step++) {
        const angle = step * sketch.TWO_PI / GRADIENT_ANGLE_STEPS;
        const gradBuf = sketch.createGraphics(w, h, sketch.P2D);
        gradBuf.background(gradPink);
        gradBuf.noStroke();
        gradBuf.push();
        gradBuf.translate(w / 2, h / 2);
        gradBuf.rotate(angle);
        for (let y = -R; y <= R; y += 1) {
          let p = (y + R) / (2 * R);
          p = sketch.constrain(p, 0, 1);
          let t;
          if (gradientCenter <= 0.001) t = 1;
          else if (gradientCenter >= 0.999) t = 0;
          else if (p <= gradientCenter) t = 0.5 * p / gradientCenter;
          else t = 0.5 + 0.5 * (p - gradientCenter) / (1 - gradientCenter);
          t = sketch.constrain(t, 0, 1);
          gradBuf.fill(sketch.lerpColor(gradPink, gradBlue, t));
          gradBuf.rect(-R, y, 2 * R, 1.5);
        }
        gradBuf.pop();
        const gradImg = gradBuf.get(0, 0, gradBuf.width, gradBuf.height);
        gradImg.mask(maskImg);
        gradMasked[i][step] = gradImg;
      }
    }

    function restartCanvas() {
      drawing.clear();
      drawing.background(255);
      stamps = [];
      lastStampPos = { x: -9999, y: -9999 };
      lineStart = null;
      activeGrowths = [];
    }

    function currentScaleOsc() {
      return sketch.map(sketch.sin(sketch.frameCount * oscSpeed), -1, 1, minScale, maxScale);
    }

    function currentGradientAngle() {
      return sketch.frameCount * oscSpeed + gradientPhaseOffset;
    }

    function snapshotPrintStyle(gradientAngle) {
      return {
        color1: p5ColorToHex(gradPink),
        color2: p5ColorToHex(gradBlue),
        gradCenter: gradientCenter,
        gradientAngle,
        sizeMult: sizeMultiplier,
      };
    }

    function bakeStampGradient(logoIdx, style) {
      if (!logos[logoIdx] || !logoMasks[logoIdx]) return null;
      const w = Math.max(1, Math.floor(logos[logoIdx].width));
      const h = Math.max(1, Math.floor(logos[logoIdx].height));
      const R = Math.sqrt(w * w + h * h) / 2 + 2;
      const pink = toColor(style.color1) || gradPink;
      const blue = toColor(style.color2) || gradBlue;
      const gc = style.gradCenter;
      let a = style.gradientAngle % sketch.TWO_PI;
      if (a < 0) a += sketch.TWO_PI;
      const angle = Math.round(a / (sketch.TWO_PI / GRADIENT_ANGLE_STEPS)) * sketch.TWO_PI / GRADIENT_ANGLE_STEPS;
      const gradBuf = sketch.createGraphics(w, h, sketch.P2D);
      gradBuf.background(pink);
      gradBuf.noStroke();
      gradBuf.push();
      gradBuf.translate(w / 2, h / 2);
      gradBuf.rotate(angle);
      for (let y = -R; y <= R; y += 1) {
        let p = (y + R) / (2 * R);
        p = sketch.constrain(p, 0, 1);
        let t;
        if (gc <= 0.001) t = 1;
        else if (gc >= 0.999) t = 0;
        else if (p <= gc) t = 0.5 * p / gc;
        else t = 0.5 + 0.5 * (p - gc) / (1 - gc);
        t = sketch.constrain(t, 0, 1);
        gradBuf.fill(sketch.lerpColor(pink, blue, t));
        gradBuf.rect(-R, y, 2 * R, 1.5);
      }
      gradBuf.pop();
      const gradImg = gradBuf.get(0, 0, gradBuf.width, gradBuf.height);
      gradImg.mask(logoMasks[logoIdx]);
      return gradImg;
    }

    function commitStamp(x, y, scaleOsc, logoIdx, gradientAngle) {
      if (!logos[logoIdx]) return null;
      const style = snapshotPrintStyle(gradientAngle);
      const baked = bakeStampGradient(logoIdx, style);
      const effectiveScale = scaleOsc * style.sizeMult;
      const p = clampStampToCanvas(x, y, effectiveScale, logoIdx);
      const stamp = { x: p.x, y: p.y, s: scaleOsc, logoIdx, ...style, baked };
      stamps.push(stamp);
      drawStampFromStamp(drawing, stamp);
      return p;
    }

    function startGrowth(x, y) {
      const heading = sketch.random(sketch.TWO_PI);
      const seedScale = sketch.lerp(minScale, maxScale, 0.5);
      commitStamp(x, y, seedScale, currentLogoIndex, currentGradientAngle() + heading);
      activeGrowths.push({
        x,
        y,
        heading,
        logoIdx: currentLogoIndex,
        wigglePhase: sketch.random(sketch.TWO_PI),
        wiggleFreq: growWiggleFreq * sketch.random(0.85, 1.15),
        endTime: Date.now() + sketch.random(growMinDurationMs, growMaxDurationMs),
        age: 0,
      });
    }

    function steerSnakeFromEdges(s) {
      const margin = 28;
      let dx = 0;
      let dy = 0;
      if (s.x < margin) dx += (margin - s.x) / margin;
      if (s.x > sketch.width - margin) dx -= (s.x - (sketch.width - margin)) / margin;
      if (s.y < margin) dy += (margin - s.y) / margin;
      if (s.y > sketch.height - margin) dy -= (s.y - (sketch.height - margin)) / margin;
      if (dx === 0 && dy === 0) return;
      const target = Math.atan2(dy, dx);
      let diff = target - s.heading;
      while (diff > Math.PI) diff -= sketch.TWO_PI;
      while (diff < -Math.PI) diff += sketch.TWO_PI;
      s.heading += diff * growEdgeSteer;
    }

    function tickGrowths() {
      for (let gi = activeGrowths.length - 1; gi >= 0; gi--) {
        const s = activeGrowths[gi];
        s.age++;
        if (s.age % growFramesPerStep !== 0) continue;

        s.wigglePhase += s.wiggleFreq;
        const wiggle = Math.sin(s.wigglePhase) * growWiggleAmp;
        const dance = Math.sin(s.wigglePhase * 2.17 + 0.6) * growWiggleAmp * growWiggleHarmonic;
        s.heading += wiggle + dance;

        if (sketch.random() < 0.015) {
          s.heading += sketch.random(-0.06, 0.06);
        }

        steerSnakeFromEdges(s);

        s.x += Math.cos(s.heading) * growStepLength;
        s.y += Math.sin(s.heading) * growStepLength;

        const perp = s.heading + sketch.HALF_PI;
        const jitter = sketch.random(-growPerpendicularJitter, growPerpendicularJitter);
        const px = s.x + Math.cos(perp) * jitter;
        const py = s.y + Math.sin(perp) * jitter;

        const scaleOsc = sketch.lerp(minScale, maxScale, 0.5 + 0.5 * Math.sin(s.wigglePhase * 1.3));
        commitStamp(px, py, scaleOsc, s.logoIdx, currentGradientAngle() + s.heading);

        if (Date.now() >= s.endTime) activeGrowths.splice(gi, 1);
      }
    }

    sketch.draw = () => {
      if (rebuildLogoIndex >= 0) {
        if (rebuildLogoIndex < LOGO_COUNT) {
          rebuildOneLogo(rebuildLogoIndex);
          rebuildLogoIndex++;
        }
        if (rebuildLogoIndex >= LOGO_COUNT) rebuildLogoIndex = -1;
      }

      if (sketch.mouseIsPressed && interactionMode === 'stamp') {
        const moveSpeed = sketch.dist(sketch.mouseX, sketch.mouseY, sketch.pmouseX, sketch.pmouseY);
        stampSpacing = sketch.constrain(sketch.map(moveSpeed, 0, maxSpeed, minSpacing, maxSpacing), minSpacing, maxSpacing);
      }

      if (interactionMode === 'grow') tickGrowths();

      const scaleOsc = currentScaleOsc();
      const gradientAngle = currentGradientAngle();

      sketch.background(255);
      sketch.image(drawing, 0, 0);
      const effectiveScale = scaleOsc * sizeMultiplier;
      const p = clampStampToCanvas(sketch.mouseX, sketch.mouseY, effectiveScale, currentLogoIndex);
      drawStampAt(sketch, p.x, p.y, scaleOsc, currentLogoIndex, gradientAngle);
    };

    sketch.mousePressed = () => {
      if (sketch.mouseButton !== sketch.LEFT && sketch.mouseButton !== sketch.RIGHT) return;

      if (interactionMode === 'grow') {
        startGrowth(sketch.mouseX, sketch.mouseY);
        lastClickTime = Date.now();
        lastClickX = sketch.mouseX;
        lastClickY = sketch.mouseY;
        return;
      }

      const t = Date.now();
      const isDoubleClick = (t - lastClickTime < DOUBLE_CLICK_MS) &&
        sketch.dist(sketch.mouseX, sketch.mouseY, lastClickX, lastClickY) < DOUBLE_CLICK_PIX;

      if (isDoubleClick) {
        lineStart = { x: sketch.mouseX, y: sketch.mouseY };
        lineStartScale = sketch.map(sketch.sin(sketch.frameCount * oscSpeed), -1, 1, minScale, maxScale);
        lineStartGradientAngle = sketch.frameCount * oscSpeed + gradientPhaseOffset;
        lastClickTime = t;
        lastClickX = sketch.mouseX;
        lastClickY = sketch.mouseY;
        return;
      }

      if (lineStart) {
        placeStampsAlongLine(lineStart, { x: sketch.mouseX, y: sketch.mouseY }, lineStartScale, lineStartGradientAngle);
        lineStart = null;
        lastClickTime = t;
        lastClickX = sketch.mouseX;
        lastClickY = sketch.mouseY;
        return;
      }

      placeStamp();
      lastClickTime = t;
      lastClickX = sketch.mouseX;
      lastClickY = sketch.mouseY;
    };

    sketch.mouseDragged = () => {
      if (interactionMode === 'grow') return;
      if (sketch.mouseButton === sketch.LEFT || sketch.mouseButton === sketch.RIGHT) {
        const scaleOsc = currentScaleOsc();
        const p = clampStampToCanvas(sketch.mouseX, sketch.mouseY, scaleOsc, currentLogoIndex);
        if (sketch.dist(p.x, p.y, lastStampPos.x, lastStampPos.y) >= stampSpacing) {
          placeStamp();
        }
      }
    };

    sketch.keyPressed = () => {
      if (sketch.key === ' ' || sketch.key === '\t') {
        currentLogoIndex = (currentLogoIndex + 1) % LOGO_COUNT;
        oscSpeed = sketch.random(oscSpeedFrom, oscSpeedTo);
        gradientPhaseOffset = sketch.random(sketch.TWO_PI);
      }
      if (sketch.keyCode === sketch.UP_ARROW) {
        oscSpeed += 0.01;
        oscSpeed = sketch.constrain(oscSpeed, 0.001, 1);
      }
      if (sketch.keyCode === sketch.DOWN_ARROW) {
        oscSpeed -= 0.02;
        oscSpeed = sketch.constrain(oscSpeed, 0.001, 1);
      }
      if (sketch.keyCode === sketch.LEFT_ARROW) {
        gradientCenter -= 0.1;
        gradientCenter = sketch.constrain(gradientCenter, 0.1, 0.9);
        rebuildLogoIndex = 0;
      }
      if (sketch.keyCode === sketch.RIGHT_ARROW) {
        gradientCenter += 0.1;
        gradientCenter = sketch.constrain(gradientCenter, 0.1, 0.9);
        rebuildLogoIndex = 0;
      }
      if (sketch.key === '-' || sketch.key === '_') adjustSize(-SIZE_STEP);
      if (sketch.key === '+' || sketch.key === '=') adjustSize(SIZE_STEP);
      if (sketch.key === 'r' || sketch.key === 'R') restartCanvas();
      if (sketch.key === 'p' || sketch.key === 'P') savePng();
      if (sketch.key === 's' || sketch.key === 'S') saveSvg();

      const sliderOsc = document.getElementById(elId('slider-osc'));
      const sliderGrad = document.getElementById(elId('slider-grad'));
      if (sliderOsc) sliderOsc.value = Math.round(sketch.map(oscSpeed, 0.001, 1, 1, 100));
      if (sliderGrad) sliderGrad.value = Math.round(gradientCenter * 100);
    };

    function placeStamp() {
      if (!logos[currentLogoIndex]) return;
      const p = commitStamp(sketch.mouseX, sketch.mouseY, currentScaleOsc(), currentLogoIndex, currentGradientAngle());
      if (p) lastStampPos = { x: p.x, y: p.y };
    }

    function placeStampsAlongLine(A, B, scaleAtA, gradientAngleAtA) {
      if (!logos[currentLogoIndex]) return;
      const scaleAtB = sketch.map(sketch.sin(sketch.frameCount * oscSpeed), -1, 1, minScale, maxScale);
      const gradientAngleAtB = sketch.frameCount * oscSpeed + gradientPhaseOffset;
      const d = sketch.dist(A.x, A.y, B.x, B.y);
      const n = Math.max(1, Math.round(d / lineStampSpacing));

      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const s = sketch.lerp(scaleAtA, scaleAtB, t);
        const gradientAngle = sketch.lerp(gradientAngleAtA, gradientAngleAtB, t);
        const effectiveScale = s * sizeMultiplier;
        const pt = {
          x: sketch.lerp(A.x, B.x, t),
          y: sketch.lerp(A.y, B.y, t)
        };
        const clamped = clampStampToCanvas(pt.x, pt.y, effectiveScale, currentLogoIndex);
        commitStamp(clamped.x, clamped.y, s, currentLogoIndex, gradientAngle);
      }
      lastStampPos = { x: B.x, y: B.y };
    }

    function clampStampToCanvas(cx, cy, s, logoIdx) {
      const p = { x: cx, y: cy };
      if (!logos[logoIdx]) return p;
      const logo = logos[logoIdx];
      const hw = logo.width * s / 2;
      const hh = logo.height * s / 2;
      p.x = sketch.constrain(cx, hw, sketch.width - hw);
      p.y = sketch.constrain(cy, hh, sketch.height - hh);
      return p;
    }

    function drawStampFromStamp(pg, stamp) {
      if (!logos[stamp.logoIdx]) return;
      const effectiveS = stamp.s * stamp.sizeMult;
      const logo = logos[stamp.logoIdx];
      const p = clampStampToCanvas(stamp.x, stamp.y, effectiveS, stamp.logoIdx);
      const w = logo.width * effectiveS;
      const h = logo.height * effectiveS;
      if (stamp.baked) {
        pg.push();
        pg.translate(p.x, p.y);
        pg.image(stamp.baked, -w / 2, -h / 2, w, h);
        pg.pop();
        return;
      }
      drawStampAt(pg, p.x, p.y, stamp.s, stamp.logoIdx, stamp.gradientAngle);
    }

    function drawStampAt(pg, cx, cy, s, logoIdx, gradientAngle) {
      if (!logos[logoIdx]) return;
      const effectiveS = s * sizeMultiplier;
      const logo = logos[logoIdx];
      if (!gradMasked[logoIdx] || !gradMasked[logoIdx][0]) {
        pg.noStroke();
        pg.fill(0);
        const p = clampStampToCanvas(cx, cy, effectiveS, logoIdx);
        pg.push();
        pg.translate(p.x, p.y);
        pg.scale(effectiveS);
        pg.translate(-logo.width / 2, -logo.height / 2);
        pg.image(logo, 0, 0, logo.width, logo.height);
        pg.pop();
        return;
      }

      const p = clampStampToCanvas(cx, cy, effectiveS, logoIdx);
      const w = logo.width * effectiveS;
      const h = logo.height * effectiveS;
      let a = gradientAngle % sketch.TWO_PI;
      if (a < 0) a += sketch.TWO_PI;
      const step = sketch.constrain(Math.round(a / (sketch.TWO_PI / GRADIENT_ANGLE_STEPS)), 0, GRADIENT_ANGLE_STEPS - 1);

      pg.push();
      pg.translate(p.x, p.y);
      pg.image(gradMasked[logoIdx][step], -w / 2, -h / 2, w, h);
      pg.pop();
    }

    function savePng() {
      const exportW = sketch.width * PNG_EXPORT_SCALE;
      const exportH = sketch.height * PNG_EXPORT_SCALE;
      const png = sketch.createGraphics(exportW, exportH, sketch.P2D);
      png.smooth(8);
      png.scale(PNG_EXPORT_SCALE);
      png.background(255);
      stamps.forEach(s => drawStampFromStamp(png, s));
      png.save(exportPrefix + '_' + timestamp() + '.png');
    }

    function saveSvg() {
      let svg = '<?xml version="1.0" encoding="UTF-8"?>\n';
      svg += `<svg width="${sketch.width}" height="${sketch.height}" xmlns="http://www.w3.org/2000/svg">\n`;
      svg += '<rect width="100%" height="100%" fill="#ffffff"/>\n<defs>\n';

      let gradIdx = 0;
      stamps.forEach(s => {
        if (!logos[s.logoIdx] || !logoPathData[s.logoIdx]) return;
        const logo = logos[s.logoIdx];
        const w = logo.width;
        const h = logo.height;
        const angle = s.gradientAngle;
        const R = Math.sqrt(w * w + h * h) / 2 + 5;
        const cx = w / 2;
        const cy = h / 2;
        const x1 = cx - R * Math.cos(angle);
        const y1 = cy - R * Math.sin(angle);
        const x2 = cx + R * Math.cos(angle);
        const y2 = cy + R * Math.sin(angle);
        const pinkHex = s.color1 || p5ColorToHex(gradPink);
        const blueHex = s.color2 || p5ColorToHex(gradBlue);
        const pinkC = toColor(pinkHex);
        const blueC = toColor(blueHex);
        const midHex = pinkC && blueC
          ? p5ColorToHex(sketch.lerpColor(pinkC, blueC, 0.5))
          : pinkHex;
        const gc = sketch.constrain(s.gradCenter ?? gradientCenter, 0.01, 0.99);
        svg += `  <linearGradient id="g${gradIdx}" gradientUnits="userSpaceOnUse" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}">\n`;
        svg += `    <stop offset="0" stop-color="${pinkHex}"/>\n`;
        svg += `    <stop offset="${gc.toFixed(3)}" stop-color="${midHex}"/>\n`;
        svg += `    <stop offset="1" stop-color="${blueHex}"/>\n`;
        svg += '  </linearGradient>\n';
        gradIdx++;
      });
      svg += '</defs>\n';

      gradIdx = 0;
      stamps.forEach(s => {
        if (!logos[s.logoIdx] || !logoPathData[s.logoIdx]) return;
        const logo = logos[s.logoIdx];
        const cx = s.x;
        const cy = s.y;
        const w = logo.width;
        const h = logo.height;
        const scaleVal = s.s * (s.sizeMult ?? sizeMultiplier);
        const tr = `translate(${cx.toFixed(2)},${cy.toFixed(2)}) scale(${scaleVal.toFixed(4)}) translate(${(-w/2).toFixed(2)},${(-h/2).toFixed(2)})`;
        svg += `<g transform="${tr}">\n`;
        const gradRef = `url(#g${gradIdx})`;
        logoPathData[s.logoIdx].forEach(d => {
          if (!d) return;
          const dEsc = d.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          svg += `  <path d="${dEsc}" fill="${gradRef}"/>\n`;
        });
        svg += '</g>\n';
        gradIdx++;
      });
      svg += '</svg>';

      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportPrefix + '_' + timestamp() + '.svg';
      a.click();
      URL.revokeObjectURL(url);
    }

    function timestamp() {
      const d = new Date();
      return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '_' +
        String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
    }
  }, containerId);
}

const container = document.getElementById('forum-canvas');
if (container) {
  initForum('forum-canvas', { preset: 'default', prefix: 'forum' });
}
