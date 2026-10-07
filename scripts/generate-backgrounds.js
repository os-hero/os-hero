const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { BACKGROUND_ITEMS, SCENE_WIDTH: W, SCENE_HEIGHT: H } = require("../src/shared/backgrounds");

// Original native-grid artwork. Details stay at the edges of the Hero's stage.
function paintBackground(theme) {
  const png = new PNG({ width: W, height: H });
  const rect = (x, y, w, h, hex) => {
    const rgba = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).concat(255);
    for (let py = Math.max(0, y); py < Math.min(H, y + h); py++) {
      for (let px = Math.max(0, x); px < Math.min(W, x + w); px++) png.data.set(rgba, (py * W + px) * 4);
    }
  };
  const cloud = (x, y, color = "#F3F5DC", shade = "#D0E3D7") => {
    rect(x + 2, y, 4, 1, color); rect(x, y + 1, 8, 2, color); rect(x + 1, y + 3, 6, 1, shade);
  };
  const ridge = (heights, color) => heights.forEach((top, x) => rect(x, top, 1, H - top, color));
  const hill = (base, color, lift = 0) => ridge(Array.from({ length: W }, (_, x) => base - Math.round(Math.sin(x / 6 + lift) * 2)), color);
  const pine = (x, y, color, light, snow) => {
    rect(x + 3, y + 5, 1, 9, "#647466");
    for (let row = 0; row < 9; row++) {
      const width = Math.min(7, 1 + 2 * Math.floor(row / 3));
      rect(x + (7 - width) / 2, y + row, width, 1, row % 3 === 0 && snow ? snow : color);
    }
    rect(x + 3, y + 2, 1, 6, light);
  };
  const tree = (x, y, foliage, light, trunk = "#927158") => {
    rect(x + 3, y + 7, 2, 9, trunk); rect(x + 2, y + 5, 1, 5, trunk);
    rect(x + 1, y, 5, 2, foliage); rect(x, y + 2, 7, 5, foliage); rect(x + 1, y + 7, 5, 2, foliage);
    rect(x + 1, y + 1, 3, 2, light); rect(x, y + 4, 2, 2, light);
  };
  const grass = (base, ground, light, dark) => {
    rect(0, base, W, H - base, ground);
    for (const x of [1, 5, 32, 36]) { rect(x, base + 1, 1, 2, light); rect(x + 1, base + 2, 2, 1, light); }
    for (const x of [2, 6, 31, 35]) rect(x, H - 1, 3, 1, dark);
  };
  switch (theme) {
    case "meadow":
      rect(0, 0, W, H, "#83C9E5"); cloud(10, 3); cloud(26, 6);
      hill(15, "#93BC9A"); hill(18, "#70A98B", 2);
      tree(0, 7, "#519A6A", "#87BD70"); tree(32, 9, "#519A6A", "#87BD70");
      grass(23, "#9AC970", "#D2DF8B", "#72AA64"); break;
    case "forest":
      rect(0, 0, W, H, "#A9D0C5"); cloud(13, 3, "#DBE9CE", "#C3DAC6");
      hill(12, "#7FA89A"); hill(18, "#729586", 1);
      for (const [x, y] of [[0, 5], [32, 4], [5, 11], [28, 10]]) pine(x, y, "#4C7D70", "#74A087");
      grass(23, "#97B589", "#CDD4A1", "#6B957D"); rect(2, 23, 2, 1, "#D88468"); break;
    case "coast":
      rect(0, 0, W, H, "#A6DDE4"); cloud(8, 4); cloud(27, 2);
      rect(0, 14, W, 9, "#66BDBF"); rect(0, 18, W, 1, "#B6E5D4");
      rect(1, 16, 5, 1, "#96D4CF"); rect(30, 20, 8, 1, "#C5E6D1");
      grass(23, "#E5D69B", "#F4E7BF", "#C9B888");
      rect(2, 10, 1, 13, "#A88966"); rect(0, 8, 6, 2, "#69A584"); rect(1, 7, 4, 1, "#8ABB8C");
      rect(34, 22, 3, 1, "#F7EFE0"); break;
    case "dunes":
      rect(0, 0, W, H, "#E5B0A4"); rect(29, 5, 5, 5, "#F5D69B");
      hill(16, "#CFB295"); hill(21, "#D8BF9E", 2); grass(23, "#E4CDAC", "#F2DFBD", "#C6A78E");
      rect(3, 15, 2, 8, "#70978C"); rect(1, 18, 2, 1, "#70978C"); rect(1, 16, 1, 3, "#70978C");
      rect(34, 20, 3, 3, "#B39786"); break;
    case "snow":
      rect(0, 0, W, H, "#AACDDC"); cloud(17, 3, "#F4F4EA", "#D6E5E7");
      ridge(Array.from({ length: W }, (_, x) => 6 + Math.min(Math.abs(x - 5), Math.abs(x - 34))), "#92B2C1");
      for (const x of [5, 34]) { rect(x - 1, 7, 3, 2, "#E8F0ED"); rect(x - 2, 9, 5, 1, "#D3E4E4"); }
      hill(20, "#C7DCE0"); pine(0, 12, "#708F90", "#A0B9B2", "#E5EFEA"); pine(32, 11, "#708F90", "#A0B9B2", "#E5EFEA");
      grass(23, "#EBF1E8", "#FFFFFF", "#BFD4D7"); break;
    case "blossoms":
      rect(0, 0, W, H, "#BBDADD"); cloud(13, 3, "#F7EAD9", "#DADFCF");
      hill(18, "#AAC4A5"); tree(0, 6, "#D99EAD", "#F0C3C5", "#A08478"); tree(32, 8, "#D99EAD", "#F0C3C5", "#A08478");
      grass(23, "#BDCDA2", "#EAD7BA", "#9DB58F"); rect(3, 23, 2, 1, "#F1B9BE"); rect(33, 24, 2, 1, "#F1B9BE"); break;
    case "rain_town":
      rect(0, 0, W, H, "#AEBBC4"); cloud(15, 3, "#CAD1D0", "#9FAFB8");
      hill(18, "#99AAB0"); rect(0, 12, 7, 12, "#B5A997"); rect(32, 14, 7, 10, "#9DABA9");
      rect(0, 10, 7, 2, "#827F83"); rect(32, 12, 7, 2, "#758C94");
      for (const [x, y] of [[2, 14], [34, 16]]) { rect(x, y, 2, 3, "#F1D6A0"); rect(x, y, 2, 1, "#D1BC95"); }
      grass(23, "#B6C1C0", "#D8DFD6", "#93A5AF");
      for (const [x, y] of [[2, 3], [7, 6], [32, 2], [36, 9]]) rect(x, y, 1, 2, "#DAE4E1"); break;
    case "moon_lake":
      rect(0, 0, W, H, "#899CB7"); rect(30, 3, 4, 4, "#EBE1B3"); rect(32, 3, 2, 3, "#899CB7");
      for (const [x, y] of [[3, 4], [8, 2], [28, 9], [36, 5]]) rect(x, y, 1, 1, "#D7E1DE");
      hill(17, "#7A91A9"); rect(0, 19, W, 4, "#9AB8C2"); rect(30, 20, 5, 1, "#CCDAD1");
      pine(0, 12, "#697F94", "#A2B0B1"); pine(32, 13, "#697F94", "#A2B0B1");
      grass(23, "#B4C4BA", "#CFD8C1", "#97ADA7"); break;
    case "autumn":
      rect(0, 0, W, H, "#C8D5CF"); cloud(14, 3, "#F3E8CC", "#DDE0C8");
      hill(18, "#B6B99C"); tree(0, 7, "#C58468", "#E0B378"); tree(32, 6, "#BB9667", "#E1C58C");
      grass(23, "#C8BE98", "#E3D2A3", "#AA9F82"); rect(3, 24, 2, 1, "#C4856A"); rect(33, 24, 2, 1, "#D8A479"); break;
    case "volcano":
      rect(0, 0, W, H, "#B4A8B3"); cloud(23, 3, "#C7BFC4", "#A79EA9");
      ridge(Array.from({ length: W }, (_, x) => 9 + Math.min(Math.abs(x - 4), Math.abs(x - 34))), "#8F939E");
      rect(3, 9, 3, 1, "#D29983"); rect(33, 9, 3, 1, "#D29983");
      hill(21, "#A7A7AD"); grass(23, "#B8B7B3", "#D3C9BE", "#9799A2");
      rect(0, 24, 7, 1, "#D6957A"); rect(32, 24, 7, 1, "#D6957A"); rect(1, 24, 4, 1, "#EDC39A"); break;
    default: throw new Error(`Unknown background theme: ${theme}`);
  }
  return PNG.sync.write(png);
}

if (require.main === module) {
  for (const item of BACKGROUND_ITEMS) {
    const destination = path.resolve(__dirname, "../public", item.assetPath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, paintBackground(item.theme));
    console.log(`${item.id}: ${W}x${H} PNG`);
  }
}
module.exports = { paintBackground };
