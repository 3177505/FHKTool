import p5 from 'p5';

let audioCtx;
let analyser;
let freqData;
const silentSpec = new Uint8Array(256);

async function startMic() {
  if (analyser) return;
  audioCtx = new AudioContext();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const src = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;
  src.connect(analyser);
  freqData = new Uint8Array(analyser.frequencyBinCount);
}

function spectrumAvg(spec, from, to) {
  let s = 0;
  const a = Math.max(0, from | 0);
  const b = Math.min(spec.length, to | 0);
  for (let i = a; i < b; i++) s += spec[i];
  return b > a ? s / (b - a) : 0;
}

function readTweaks() {
  const num = (id, d) => {
    const el = document.getElementById(id);
    if (!el) return d;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : d;
  };
  const innerSlider = num('sound-waves-inner', 10);
  return {
    sens: num('sound-waves-sens', 100) / 100,
    pulseAmt: num('sound-waves-pulse', 38) / 100,
    innerHole: Math.min(0.28, Math.max(0.03, innerSlider / 100)),
    dense: num('sound-waves-dense', 100) / 100,
  };
}

function initSoundWaves(containerId) {
  return new p5((sketch) => {
    let viz = {};

    function rollViz() {
      viz.innerHoleRoll = sketch.random(0.04, 0.16);
      viz.pulseBand = sketch.floor(sketch.random(8, 28));
      viz.waveR = sketch.random(5, 14);
      viz.waveA = sketch.random(3, 10);
      viz.waveDr = sketch.random(6, 20);
    }

    function readSpec() {
      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        return freqData;
      }
      return silentSpec;
    }

    function effectiveInner(tweaks) {
      return sketch.lerp(viz.innerHoleRoll, tweaks.innerHole, 0.65);
    }

    function pixelStep(tweaks) {
      const d = sketch.constrain(tweaks.dense, 0.45, 2.05);
      return sketch.constrain(sketch.floor(12 / sketch.sqrt(d)), 5, 18);
    }

    function drawPixelRing(spec, cx, cy, R, energy, sens, innerHole, tweaks) {
      const step = pixelStep(tweaks);
      const innerR = R * innerHole;
      const gmax = sketch.ceil(R / step) + 1;
      const t = sketch.millis() * 0.001 * (0.32 + energy * 1.35);
      sketch.push();
      sketch.translate(cx, cy);
      sketch.noStroke();
      sketch.rectMode(sketch.CENTER);
      for (let gx = -gmax; gx <= gmax; gx++) {
        for (let gy = -gmax; gy <= gmax; gy++) {
          const x = (gx + 0.5) * step;
          const y = (gy + 0.5) * step;
          const d = sketch.sqrt(x * x + y * y);
          if (d < innerR || d > R * 0.998) continue;
          const ang = sketch.atan2(y, x);
          const dr = d / R;
          const ring = 0.5 + 0.5 * sketch.sin(dr * sketch.TWO_PI * viz.waveR - t * 2.1);
          const twist = 0.5 + 0.5 * sketch.sin(ang * viz.waveA + dr * viz.waveDr + t * 1.55);
          const mix = sketch.constrain(sketch.lerp(ring, twist, 0.42), 0, 1);
          const side = step * sketch.lerp(0.3, 0.96, mix);
          const bin = sketch.floor(sketch.map(d, innerR, R * 0.97, 0, spec.length - 1));
          const bi = sketch.constrain(bin, 0, spec.length - 1);
          const raw = (spec[bi] / 255) * sens;
          const g = sketch.constrain(16 + raw * 234 * (0.4 + energy * 1.15), 0, 255);
          sketch.fill(g);
          sketch.rect(x, y, side * 0.92, side * 0.92);
        }
      }
      sketch.pop();
    }

    sketch.setup = () => {
      const seed = sketch.floor(sketch.random(2147483647));
      sketch.randomSeed(seed);
      sketch.noiseSeed(seed);
      rollViz();
      const main = document.querySelector('.sound-waves-page main');
      const w = main ? main.clientWidth : 800;
      const h = main ? main.clientHeight : 600;
      sketch.createCanvas(w, h).parent(containerId);
    };

    sketch.draw = () => {
      sketch.background(46);
      const tweaks = readTweaks();
      const spec = readSpec();
      const cx = sketch.width * 0.5;
      const cy = sketch.height * 0.5;
      const bass = spectrumAvg(spec, 0, viz.pulseBand) / 255;
      const energy = bass;
      const R0 = sketch.min(sketch.width, sketch.height) * 0.44;
      const pulseMag = 0.78 + bass * (0.12 + tweaks.pulseAmt * 0.55);
      const R = R0 * pulseMag;
      const sens = tweaks.sens;
      const innerHole = effectiveInner(tweaks);
      drawPixelRing(spec, cx, cy, R, energy, sens, innerHole, tweaks);
    };

    sketch.windowResized = () => {
      const main = document.querySelector('.sound-waves-page main');
      const w = main ? main.clientWidth : sketch.windowWidth;
      const h = main ? main.clientHeight : sketch.windowHeight;
      sketch.resizeCanvas(w, h);
    };
  }, containerId);
}

function bindRangeLabel(rangeId, labelId, fmt) {
  const r = document.getElementById(rangeId);
  const l = document.getElementById(labelId);
  if (!r || !l) return;
  const apply = () => {
    l.textContent = fmt(r);
  };
  r.addEventListener('input', apply);
  apply();
}

const btn = document.getElementById('sound-waves-start');
const statusEl = document.getElementById('sound-waves-status');
if (btn) {
  btn.addEventListener('click', () => {
    startMic()
      .then(() => {
        if (statusEl) statusEl.textContent = 'Mikrofon aktivní.';
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      })
      .catch((e) => {
        if (statusEl) statusEl.textContent = 'Nelze spustit mikrofon: ' + (e && e.message ? e.message : String(e));
      });
  });
}

bindRangeLabel('sound-waves-sens', 'sound-waves-sens-lbl', (el) => 'Citlivost ' + el.value + '%');
bindRangeLabel('sound-waves-pulse', 'sound-waves-pulse-lbl', (el) => 'Pulz basů ' + el.value + '%');
bindRangeLabel('sound-waves-inner', 'sound-waves-inner-lbl', (el) => 'Vnitřní mezera ' + el.value + '%');
bindRangeLabel('sound-waves-dense', 'sound-waves-dense-lbl', (el) => 'Hustota ' + el.value + '%');

const container = document.getElementById('sound-waves-canvas');
if (container) {
  initSoundWaves('sound-waves-canvas');
}
