import p5 from 'p5';

const B = import.meta.env.BASE_URL;
const A4_RATIO = 595 / 842;
const PNG_EXPORT_SCALE = 2;
const LOGO_SVG_NAMES = ['forum.svg', 'forum1.svg', 'forum2.svg', 'forum3.svg', 'forum4.svg', 'forum5.svg', 'forum6.svg'];
const LOGO_COUNT = 7;
const GRADIENT_ANGLE_STEPS = 24;
const DOUBLE_CLICK_MS = 400;
const DOUBLE_CLICK_PIX = 15;

export function initForum(containerId) {
  let logos = [];
  let logoMasks = [];
  let gradMasked = [];
  let logoPathData = [];
  let currentLogoIndex = 0;
  let stampSpacing = 12;
  let minSpacing = 12;
  let maxSpacing = 100;
  let maxSpeed = 40;
  let minScale = 0.07;
  let maxScale = 0.2;
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
  let lineStampSpacing = 20;
  let drawing;
  let stamps = [];
  let lastStampPos = { x: -9999, y: -9999 };
  let a4Frame = true;

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
      }
      drawing = sketch.createGraphics(canvasW, canvasH, sketch.P2D);
      drawing.background(255);
      stamps.forEach(s => drawStampAt(drawing, s.x, s.y, s.s, s.logoIdx, s.gradientAngle));
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
      const toColor = (hex) => {
        const h = String(hex || '').trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(h)) return sketch.color(h.startsWith('#') ? h : '#' + h);
        return null;
      };
      const color1El = document.getElementById('forum-color-1');
      const color2El = document.getElementById('forum-color-2');
      gradPink = toColor(color1El?.value) || sketch.color(255, 0, 128);
      gradBlue = toColor(color2El?.value) || sketch.color(0, 102, 255);
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
        const btnLogo = document.getElementById('forum-btn-logo');
        const btnRestart = document.getElementById('forum-btn-restart');
        const btnPng = document.getElementById('forum-btn-png');
        const btnSvg = document.getElementById('forum-btn-svg');
        const toggleA4 = document.getElementById('forum-toggle-a4');
        const sliderOsc = document.getElementById('forum-slider-osc');
        const sliderGrad = document.getElementById('forum-slider-grad');
        const sliderSize = document.getElementById('forum-slider-size');

        if (toggleA4) {
          toggleA4.checked = a4Frame;
          toggleA4.addEventListener('change', () => {
            a4Frame = !!toggleA4.checked;
            doResize();
          });
        }
        const applyColors = () => {
          const c1 = toColor(color1El?.value);
          const c2 = toColor(color2El?.value);
          if (c1) { gradPink = c1; rebuildLogoIndex = 0; }
          if (c2) { gradBlue = c2; rebuildLogoIndex = 0; }
        };
        if (color1El) color1El.addEventListener('input', applyColors);
        if (color1El) color1El.addEventListener('change', applyColors);
        if (color2El) color2El.addEventListener('input', applyColors);
        if (color2El) color2El.addEventListener('change', applyColors);
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
    }

    sketch.draw = () => {
      if (rebuildLogoIndex >= 0) {
        if (rebuildLogoIndex < LOGO_COUNT) {
          rebuildOneLogo(rebuildLogoIndex);
          rebuildLogoIndex++;
        }
        if (rebuildLogoIndex >= LOGO_COUNT) rebuildLogoIndex = -1;
      }

      if (sketch.mouseIsPressed) {
        const moveSpeed = sketch.dist(sketch.mouseX, sketch.mouseY, sketch.pmouseX, sketch.pmouseY);
        stampSpacing = sketch.constrain(sketch.map(moveSpeed, 0, maxSpeed, minSpacing, maxSpacing), minSpacing, maxSpacing);
      }

      const scaleOsc = sketch.map(sketch.sin(sketch.frameCount * oscSpeed), -1, 1, minScale, maxScale);
      const gradientAngle = sketch.frameCount * oscSpeed + gradientPhaseOffset;

      sketch.background(255);
      sketch.image(drawing, 0, 0);
      const effectiveScale = scaleOsc * sizeMultiplier;
      const p = clampStampToCanvas(sketch.mouseX, sketch.mouseY, effectiveScale, currentLogoIndex);
      drawStampAt(sketch, p.x, p.y, scaleOsc, currentLogoIndex, gradientAngle);
    };

    sketch.mousePressed = () => {
      if (sketch.mouseButton !== sketch.LEFT && sketch.mouseButton !== sketch.RIGHT) return;
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
      if (sketch.mouseButton === sketch.LEFT || sketch.mouseButton === sketch.RIGHT) {
        const scaleOsc = sketch.map(sketch.sin(sketch.frameCount * oscSpeed), -1, 1, minScale, maxScale);
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
      if (sketch.key === 'r' || sketch.key === 'R') restartCanvas();
      if (sketch.key === 'p' || sketch.key === 'P') savePng();
      if (sketch.key === 's' || sketch.key === 'S') saveSvg();

      const sliderOsc = document.getElementById('forum-slider-osc');
      const sliderGrad = document.getElementById('forum-slider-grad');
      if (sliderOsc) sliderOsc.value = Math.round(sketch.map(oscSpeed, 0.001, 1, 1, 100));
      if (sliderGrad) sliderGrad.value = Math.round(gradientCenter * 100);
    };

    function placeStamp() {
      if (!logos[currentLogoIndex]) return;
      const scaleOsc = sketch.map(sketch.sin(sketch.frameCount * oscSpeed), -1, 1, minScale, maxScale);
      const gradientAngle = sketch.frameCount * oscSpeed + gradientPhaseOffset;
      const effectiveScale = scaleOsc * sizeMultiplier;
      const p = clampStampToCanvas(sketch.mouseX, sketch.mouseY, effectiveScale, currentLogoIndex);
      lastStampPos = { x: p.x, y: p.y };
      stamps.push({ x: p.x, y: p.y, s: scaleOsc, logoIdx: currentLogoIndex, gradientAngle });
      drawStampAt(drawing, p.x, p.y, scaleOsc, currentLogoIndex, gradientAngle);
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
        stamps.push({ x: clamped.x, y: clamped.y, s, logoIdx: currentLogoIndex, gradientAngle });
        drawStampAt(drawing, clamped.x, clamped.y, s, currentLogoIndex, gradientAngle);
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
      stamps.forEach(s => drawStampAt(png, s.x, s.y, s.s, s.logoIdx, s.gradientAngle));
      png.save('forum_' + timestamp() + '.png');
    }

    function saveSvg() {
      const pinkHex = '#' + sketch.hex(sketch.red(gradPink), 2) + sketch.hex(sketch.green(gradPink), 2) + sketch.hex(sketch.blue(gradPink), 2);
      const blueHex = '#' + sketch.hex(sketch.red(gradBlue), 2) + sketch.hex(sketch.green(gradBlue), 2) + sketch.hex(sketch.blue(gradBlue), 2);
      const midHex = '#' + sketch.hex(sketch.red(sketch.lerpColor(gradPink, gradBlue, 0.5)), 2) + sketch.hex(sketch.green(sketch.lerpColor(gradPink, gradBlue, 0.5)), 2) + sketch.hex(sketch.blue(sketch.lerpColor(gradPink, gradBlue, 0.5)), 2);

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
        const gc = sketch.constrain(gradientCenter, 0.01, 0.99);
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
        const scaleVal = s.s * sizeMultiplier;
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
      a.download = 'forum_' + timestamp() + '.svg';
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
  initForum('forum-canvas');
}
