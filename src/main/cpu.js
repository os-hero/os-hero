const EventEmitter = require("events");
const os = require("os");

function snapshotCpuTimes() {
  return os.cpus().map((cpu) => {
    const times = cpu.times;
    const idle = times.idle;
    const total = times.user + times.nice + times.sys + times.idle + times.irq;

    return { idle, total };
  });
}

function calculateCpuPercent(previous, current) {
  if (!previous || previous.length !== current.length) {
    return 0;
  }

  let idleDelta = 0;
  let totalDelta = 0;

  for (let index = 0; index < current.length; index += 1) {
    idleDelta += current[index].idle - previous[index].idle;
    totalDelta += current[index].total - previous[index].total;
  }

  if (totalDelta <= 0) {
    return 0;
  }

  const busy = 1 - idleDelta / totalDelta;
  return Math.max(0, Math.min(100, busy * 100));
}

class CpuMonitor extends EventEmitter {
  constructor(intervalMs = 1000) {
    super();
    this.intervalMs = intervalMs;
    this.percent = 0;
    this.previous = null;
    this.timer = null;
  }

  start() {
    if (this.timer) {
      return;
    }

    this.previous = snapshotCpuTimes();
    this.timer = setInterval(() => this.sample(), this.intervalMs);
    this.timer.unref();
  }

  sample() {
    const current = snapshotCpuTimes();
    const rawPercent = calculateCpuPercent(this.previous, current);
    this.previous = current;

    this.percent = this.percent === 0 ? rawPercent : this.percent * 0.65 + rawPercent * 0.35;
    this.emit("change", this.percent);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = {
  CpuMonitor
};
