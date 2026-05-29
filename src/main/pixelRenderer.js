const { PNG } = require("pngjs");
const {
  DEFAULT_CLOTHES_ID,
  getEyeType,
  getItemById,
  normalizeCharacter
} = require("../shared/catalog");

const VIRTUAL_SIZE = 16;
const OUTLINE = "#1F2328";
const SHADOW = "#000000";

function hexToRgba(hex, alpha = 255) {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
    alpha
  ];
}

function createGrid() {
  return Array.from({ length: VIRTUAL_SIZE * VIRTUAL_SIZE }, () => [0, 0, 0, 0]);
}

function setPixel(grid, x, y, color) {
  if (x < 0 || y < 0 || x >= VIRTUAL_SIZE || y >= VIRTUAL_SIZE) {
    return;
  }

  grid[y * VIRTUAL_SIZE + x] = hexToRgba(color);
}

function drawRect(grid, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      setPixel(grid, px, py, color);
    }
  }
}

function drawPixelPattern(grid, pixels, color) {
  for (const [x, y] of pixels) {
    setPixel(grid, x, y, color);
  }
}

function getClothesStyle(character) {
  const clothes = getItemById(character.equipped.clothes) || getItemById(DEFAULT_CLOTHES_ID);
  return clothes.style;
}

function drawBodyLayer(grid, character, bob) {
  const skin = character.bodyColor;
  const headY = 1 + bob;
  const neckY = 7 + bob;

  drawRect(grid, 5, headY, 6, 1, OUTLINE);
  drawRect(grid, 4, headY + 1, 8, 4, OUTLINE);
  drawRect(grid, 5, headY + 5, 6, 1, OUTLINE);
  drawRect(grid, 5, headY + 1, 6, 4, skin);
  drawRect(grid, 6, headY + 5, 4, 1, skin);

  drawRect(grid, 7, neckY, 2, 1, OUTLINE);
  drawRect(grid, 7, neckY, 2, 1, skin);

  drawRect(grid, 3, 8 + bob, 2, 4, OUTLINE);
  drawRect(grid, 11, 8 + bob, 2, 4, OUTLINE);
  drawRect(grid, 4, 8 + bob, 1, 3, skin);
  drawRect(grid, 11, 8 + bob, 1, 3, skin);
}

function drawClothesLayer(grid, character, bob, frameIndex) {
  const style = getClothesStyle(character);
  const torsoY = 8 + bob;
  const expanded = frameIndex % 4 === 1;

  drawRect(grid, expanded ? 4 : 5, torsoY, expanded ? 8 : 6, 4, OUTLINE);
  drawRect(grid, 5, torsoY, 6, 4, style.shirt);

  if (character.equipped.clothes === "blue_overalls") {
    drawRect(grid, 5, torsoY, 1, 4, style.pants);
    drawRect(grid, 10, torsoY, 1, 4, style.pants);
    drawRect(grid, 6, torsoY + 2, 4, 2, style.pants);
    setPixel(grid, 6, torsoY + 1, style.accent);
    setPixel(grid, 9, torsoY + 1, style.accent);
  } else if (character.equipped.clothes === "green_tunic") {
    drawRect(grid, 5, torsoY + 3, 6, 1, style.accent);
    setPixel(grid, 7, torsoY + 1, style.accent);
    setPixel(grid, 8, torsoY + 1, style.accent);
  } else {
    drawRect(grid, 5, torsoY + 3, 6, 1, style.accent);
  }

  const legHeight = bob ? 2 : 3;
  const legsY = 12 + bob;
  drawRect(grid, 5, legsY - 1, 6, 1, OUTLINE);
  drawRect(grid, 6, legsY, 2, legHeight, style.pants);
  drawRect(grid, 9, legsY, 2, legHeight, style.pants);
  drawRect(grid, 5, 15, 3, 1, OUTLINE);
  drawRect(grid, 9, 15, 3, 1, OUTLINE);
}

function drawHeadLayer(grid, character, bob) {
  const item = getItemById(character.equipped.head);
  if (!item) {
    return;
  }

  const headY = 1 + bob;

  if (item.id === "basic_hair") {
    drawRect(grid, 5, headY, 6, 1, item.style.primary);
    drawRect(grid, 4, headY + 1, 2, 2, item.style.primary);
    drawRect(grid, 10, headY + 1, 2, 1, item.style.accent);
    setPixel(grid, 6, headY + 1, item.style.accent);
  }

  if (item.id === "red_cap") {
    drawRect(grid, 5, headY - 1, 6, 1, OUTLINE);
    drawRect(grid, 5, headY, 6, 1, item.style.primary);
    drawRect(grid, 8, headY + 1, 5, 1, item.style.primary);
    setPixel(grid, 7, headY, item.style.accent);
    setPixel(grid, 8, headY, item.style.accent);
  }

  if (item.id === "long_hair") {
    drawRect(grid, 5, headY, 6, 1, item.style.primary);
    drawRect(grid, 4, headY + 1, 2, 5, item.style.primary);
    drawRect(grid, 10, headY + 1, 2, 5, item.style.primary);
    drawRect(grid, 5, headY + 5, 6, 2, item.style.primary);
    setPixel(grid, 6, headY + 1, item.style.accent);
    setPixel(grid, 9, headY + 1, item.style.accent);
    setPixel(grid, 5, headY + 6, item.style.accent);
    setPixel(grid, 10, headY + 6, item.style.accent);
  }

  if (item.id === "bob_hair") {
    drawRect(grid, 5, headY, 6, 1, item.style.primary);
    drawRect(grid, 4, headY + 1, 2, 4, item.style.primary);
    drawRect(grid, 10, headY + 1, 2, 4, item.style.primary);
    drawRect(grid, 5, headY + 5, 6, 1, item.style.primary);
    drawPixelPattern(
      grid,
      [
        [6, headY + 1],
        [7, headY + 1],
        [8, headY + 1],
        [9, headY + 1],
        [7, headY + 2]
      ],
      item.style.accent
    );
  }

  if (item.id === "twin_tails") {
    drawRect(grid, 5, headY, 6, 1, item.style.primary);
    drawRect(grid, 4, headY + 1, 2, 2, item.style.primary);
    drawRect(grid, 10, headY + 1, 2, 2, item.style.primary);
    drawRect(grid, 2, headY + 3, 3, 3, item.style.primary);
    drawRect(grid, 11, headY + 3, 3, 3, item.style.primary);
    setPixel(grid, 4, headY + 3, item.style.accent);
    setPixel(grid, 11, headY + 3, item.style.accent);
    setPixel(grid, 3, headY + 5, item.style.accent);
    setPixel(grid, 12, headY + 5, item.style.accent);
  }
}

function drawEyeLayer(grid, character, bob) {
  const eyeType = getEyeType(character.eyeType).id;
  const eyeY = 4 + bob;

  if (eyeType === "dot") {
    setPixel(grid, 6, eyeY, OUTLINE);
    setPixel(grid, 9, eyeY, OUTLINE);
    return;
  }

  if (eyeType === "happy") {
    drawPixelPattern(
      grid,
      [
        [6, eyeY],
        [7, eyeY + 1],
        [9, eyeY + 1],
        [10, eyeY]
      ],
      OUTLINE
    );
    return;
  }

  if (eyeType === "sleepy") {
    drawRect(grid, 6, eyeY, 2, 1, OUTLINE);
    drawRect(grid, 9, eyeY, 2, 1, OUTLINE);
    return;
  }

  drawRect(grid, 6, eyeY, 1, 2, OUTLINE);
  drawRect(grid, 9, eyeY, 1, 2, OUTLINE);
}

function drawToolLayer(grid, character, bob) {
  const item = getItemById(character.equipped.tool);
  if (!item) {
    return;
  }

  const eyeY = 4 + bob;

  if (item.id === "round_glasses") {
    drawPixelPattern(
      grid,
      [
        [5, eyeY],
        [7, eyeY],
        [8, eyeY],
        [10, eyeY],
        [5, eyeY + 1],
        [7, eyeY + 1],
        [8, eyeY + 1],
        [10, eyeY + 1]
      ],
      item.style.primary
    );
    setPixel(grid, 6, eyeY - 1, item.style.primary);
    setPixel(grid, 9, eyeY - 1, item.style.primary);
  }

  if (item.id === "small_bag") {
    drawPixelPattern(
      grid,
      [
        [5, 8 + bob],
        [6, 9 + bob],
        [7, 10 + bob],
        [8, 11 + bob]
      ],
      item.style.accent
    );
    drawRect(grid, 11, 11 + bob, 3, 3, OUTLINE);
    drawRect(grid, 12, 11 + bob, 2, 2, item.style.primary);
  }
}

function gridToPngBuffer(grid, scale) {
  const size = VIRTUAL_SIZE * scale;
  const png = new PNG({ width: size, height: size });

  for (let y = 0; y < VIRTUAL_SIZE; y += 1) {
    for (let x = 0; x < VIRTUAL_SIZE; x += 1) {
      const rgba = grid[y * VIRTUAL_SIZE + x];

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const pixelIndex = ((y * scale + sy) * size + (x * scale + sx)) * 4;
          png.data[pixelIndex] = rgba[0];
          png.data[pixelIndex + 1] = rgba[1];
          png.data[pixelIndex + 2] = rgba[2];
          png.data[pixelIndex + 3] = rgba[3];
        }
      }
    }
  }

  return PNG.sync.write(png);
}

function renderCharacterBuffer(characterInput, frameIndex = 0, scale = 2) {
  const character = normalizeCharacter(characterInput, (characterInput && characterInput.version) || "0.1.12");
  const grid = createGrid();
  const bob = [0, 0, 1, 0][frameIndex % 4];

  drawRect(grid, 5, 15, 7, 1, SHADOW);
  drawBodyLayer(grid, character, bob);
  drawClothesLayer(grid, character, bob, frameIndex);
  drawHeadLayer(grid, character, bob);
  drawEyeLayer(grid, character, bob);
  drawToolLayer(grid, character, bob);

  return gridToPngBuffer(grid, Math.max(1, Math.round(scale)));
}

function renderCharacterDataUrl(character, frameIndex = 0, scale = 8) {
  return `data:image/png;base64,${renderCharacterBuffer(character, frameIndex, scale).toString("base64")}`;
}

module.exports = {
  renderCharacterBuffer,
  renderCharacterDataUrl
};
