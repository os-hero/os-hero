const { createTrayImage } = require("./trayImage");

function intervalForCpu(cpuPercent) {
  const cpu = Number.isFinite(cpuPercent) ? Math.max(0, Math.min(100, cpuPercent)) : 0;
  if (cpu < 10) return 1000;
  if (cpu < 30) return 800;
  if (cpu < 60) return 625;
  if (cpu < 85) return 500;
  return 400;
}

class TrayAnimator {
  constructor(tray, cpuMonitor, { onFrame = () => {} } = {}) {
    this.tray = tray;
    this.cpuMonitor = cpuMonitor;
    this.frames = [];
    this.frameIndex = 0;
    this.currentFrame = 0;
    this.onFrame = onFrame;
    this.timer = null;
    this.running = false;
  }

  updateCharacter(character) {
    this.frames = [0, 1, 2, 3].map((frameIndex) => createTrayImage(character, frameIndex));

    if (this.tray && !this.tray.isDestroyed?.()) {
      this.tray.setImage(this.frames[this.currentFrame]);
    }
    if (this.running && !this.timer) this.tick();
  }

  getMotion() {
    const intervalMs = intervalForCpu(this.cpuMonitor.percent);
    return { kind: "idle", frame: this.currentFrame, intervalMs, cycleMs: intervalMs * 4 };
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.tick();
  }

  tick() {
    this.timer = null;
    if (!this.running || !this.tray || this.tray.isDestroyed?.() || this.frames.length === 0) {
      return;
    }

    this.currentFrame = this.frameIndex % this.frames.length;
    this.tray.setImage(this.frames[this.currentFrame]);
    this.frameIndex = (this.currentFrame + 1) % this.frames.length;
    const motion = this.getMotion();
    this.onFrame(motion);

    this.timer = setTimeout(() => this.tick(), motion.intervalMs);
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
