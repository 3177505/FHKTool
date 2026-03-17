import p5 from 'p5';

export function initP5Example(containerId) {
  return new p5((sketch) => {
    sketch.setup = () => {
      sketch.createCanvas(400, 200);
      sketch.textFont('Bertin-DotSizeVAR');
      sketch.textSize(80);
    };

    sketch.draw = () => {
      sketch.background(255);
      sketch.fill(0);
      sketch.textAlign(sketch.CENTER, sketch.CENTER);
      sketch.text('HRA', sketch.width / 2, sketch.height / 2);
    };
  }, containerId);
}
