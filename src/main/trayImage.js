const { nativeImage } = require("electron");
const { renderTrayCharacterBuffer } = require("./pixelRenderer");

function createTrayImage(character, frameIndex = 0) {
  const image = nativeImage.createFromBuffer(renderTrayCharacterBuffer(character, frameIndex));
  if (process.platform === "darwin") {
    const retina = renderTrayCharacterBuffer(character, frameIndex, { scaleFactor: 2 });
    image.addRepresentation({ scaleFactor: 2, dataURL: `data:image/png;base64,${retina.toString("base64")}` });
  }
  image.setTemplateImage(false);
  return image;
}

module.exports = { createTrayImage };
