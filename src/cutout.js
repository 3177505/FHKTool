const OVERLAP_THRESHOLD = 60;

function svgStringToSvgWithOneLayer(svgString, layerId) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const layer = doc.querySelector(`#${layerId}`);
  if (!layer) return null;
  const layerClone = layer.cloneNode(true);
  layerClone.removeAttribute('style');
  const wrapper = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const viewBox = doc.documentElement.getAttribute('viewBox') || `0 0 ${doc.documentElement.getAttribute('width')} ${doc.documentElement.getAttribute('height')}`;
  wrapper.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  wrapper.setAttribute('width', doc.documentElement.getAttribute('width'));
  wrapper.setAttribute('height', doc.documentElement.getAttribute('height'));
  wrapper.setAttribute('viewBox', viewBox);
  wrapper.appendChild(layerClone);
  return new XMLSerializer().serializeToString(wrapper);
}

function renderSvgToCanvas(svgString, width, height) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG render failed'));
    };
    img.src = url;
  });
}

export async function applyCutoutToSvg(svgString, width, height) {
  const svgLayer1 = svgStringToSvgWithOneLayer(svgString, 'layer1');
  const svgLayer2 = svgStringToSvgWithOneLayer(svgString, 'layer2');
  if (!svgLayer1 && !svgLayer2) return null;

  const canvas1 = svgLayer1 ? await renderSvgToCanvas(svgLayer1, width, height) : null;
  const canvas2 = svgLayer2 ? await renderSvgToCanvas(svgLayer2, width, height) : null;

  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  const ctx = result.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);

  const data1 = canvas1 ? canvas1.getContext('2d').getImageData(0, 0, width, height) : null;
  const data2 = canvas2 ? canvas2.getContext('2d').getImageData(0, 0, width, height) : null;

  if (canvas1) ctx.drawImage(canvas1, 0, 0);
  if (canvas2) ctx.drawImage(canvas2, 0, 0);

  const resultData = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < resultData.data.length; i += 4) {
    const a1 = data1 ? data1.data[i + 3] : 0;
    const a2 = data2 ? data2.data[i + 3] : 0;
    if (a1 > OVERLAP_THRESHOLD && a2 > OVERLAP_THRESHOLD) {
      resultData.data[i] = 255;
      resultData.data[i + 1] = 255;
      resultData.data[i + 2] = 255;
      resultData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(resultData, 0, 0);
  return result;
}
