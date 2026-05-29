const { nativeImage } = require("electron");
const { renderCharacterBuffer } = require("./pixelRenderer");

function intervalForCpu(cpuPercent) {
  if (cpuPercent < 10) {
    return 900;
  }

  if (cpuPercent < 30) {
    return 650;
  }

  if (cpuPercent < 60) {
    return 420;
  }

  if (cpuPercent < 85) {
    return 250;
  }

  return 130;
}

class TrayAnimator {
  constructor(tray, cpuMonitor) {
    this.tray = tray;
    this.cpuMonitor = cpuMonitor;
    this.frames = [];
    this.frameIndex = 0;
    this.timer = null;
    this.running = false;
  }

  updateCharacter(character) {
    this.frames = [0, 1, 2, 3].map((frameIndex) => {
      const image = nativeImage.createFromBuffer(renderCharacterBuffer(character, frameIndex, 2));
      image.setTemplateImage(false);
      return image;
    });

    this.frameIndex = 0;
    if (this.tray && this.frames[0]) {
      this.tray.setImage(this.frames[0]);
    }
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.tick();
  }

  tick() {
    if (!this.running || !this.tray || this.frames.length === 0) {
      return;
    }

    this.tray.setImage(this.frames[this.frameIndex % this.frames.length]);
    this.frameIndex += 1;

    this.timer = setTimeout(() => this.tick(), intervalForCpu(this.cpuMonitor.percent));
    this.timer.unref();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

module.exports = {
  TrayAnimator,
  intervalForCpu
};
