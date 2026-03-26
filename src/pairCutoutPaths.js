import paper from 'paper';

let paperReady = false;

function ensurePaper() {
  if (paperReady) {
    paper.project.clear();
    return;
  }
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  paper.setup(c);
  paperReady = true;
}

function svgTransformToMatrix(attr) {
  if (!attr || !String(attr).trim()) return new paper.Matrix();
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', attr);
  const t = g.transform.baseVal.consolidate();
  if (!t) return new paper.Matrix();
  const m = t.matrix;
  return new paper.Matrix(m.a, m.b, m.c, m.d, m.e, m.f);
}

function fragmentToPathItem(fragmentHtml) {
  const div = document.createElement('div');
  div.innerHTML = fragmentHtml.trim();
  const els = div.querySelectorAll('path');
  if (!els.length) return null;

  if (els.length === 1) {
    const el = els[0];
    const d = el.getAttribute('d');
    if (!d) return null;
    const p = new paper.Path(d);
    if (!p.segments.length) {
      p.remove();
      return null;
    }
    const xf = el.getAttribute('transform');
    if (xf) p.transform(svgTransformToMatrix(xf));
    return p;
  }

  const compound = new paper.CompoundPath();
  for (const el of els) {
    const d = el.getAttribute('d');
    if (!d) continue;
    const sub = new paper.Path(d);
    if (!sub.segments.length) {
      sub.remove();
      continue;
    }
    const xf = el.getAttribute('transform');
    if (xf) sub.transform(svgTransformToMatrix(xf));
    compound.addChild(sub);
  }
  if (!compound.children.length) {
    compound.remove();
    return null;
  }
  return compound;
}

export function pairFragmentsIntersectPathD(fragmentA, fragmentB) {
  ensurePaper();
  const a = fragmentToPathItem(fragmentA);
  const b = fragmentToPathItem(fragmentB);
  if (!a || !b) {
    if (a) a.remove();
    if (b) b.remove();
    return null;
  }
  try {
    const inter = a.intersect(b);
    a.remove();
    b.remove();
    if (!inter || inter.isEmpty()) {
      if (inter) inter.remove();
      return null;
    }
    const d = inter.pathData;
    inter.remove();
    return d && d.length ? d : null;
  } catch (e) {
    paper.project.clear();
    console.warn('[pairCutoutPaths] intersect failed', e);
    return null;
  }
}
