const { PNG } = require("pngjs");

// Flood from the canvas edge so closed gaps (eyes, straps, handles) stay clear.
function addOuterOutline(source, silhouette, thickness = 1, alpha = 224) {
  const { width, height } = source;
  const exterior = new Uint8Array(width * height);
  const queue = [];
  const visit = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (!silhouette[i] && !exterior[i]) { exterior[i] = 1; queue.push(i); }
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 0; y < height; y++) { visit(0, y); visit(width - 1, y); }
  for (let q = 0; q < queue.length; q++) {
    const x = queue[q] % width, y = Math.floor(queue[q] / width);
    visit(x - 1, y); visit(x + 1, y); visit(x, y - 1); visit(x, y + 1);
  }
  const output = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (!exterior[i]) continue;
    let edge = false;
    for (let dy = -thickness; dy <= thickness && !edge; dy++) {
      for (let dx = -thickness; dx <= thickness; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && silhouette[ny * width + nx]) { edge = true; break; }
      }
    }
    if (edge) output.data.set([255, 255, 255, alpha], i * 4);
  }
  for (let i = 0; i < width * height; i++) {
    const p = i * 4, sa = source.data[p + 3] / 255, da = output.data[p + 3] / 255;
    if (!sa) continue;
    const a = sa + da * (1 - sa);
    for (let c = 0; c < 3; c++) output.data[p + c] = Math.round((source.data[p + c] * sa + output.data[p + c] * da * (1 - sa)) / a);
    output.data[p + 3] = Math.round(a * 255);
  }
  return output;
}

module.exports = { addOuterOutline };
