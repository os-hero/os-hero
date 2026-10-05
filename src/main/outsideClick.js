const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const readline = require("readline");

function createOutsideClickMonitor(app, onClick) {
  let child = null;
  const bundledBinary = path.resolve(__dirname, "../../../native/oshero-outside-click");
  const binary = app.isPackaged
    ? path.join(process.resourcesPath, "native/oshero-outside-click")
    : fs.existsSync(bundledBinary) ? bundledBinary : path.join(__dirname, "../../build/native/oshero-outside-click");
  return {
    start() {
      if (child || process.platform !== "darwin") return;
      if (!fs.existsSync(binary)) { console.error("Outside-click helper is missing. Run npm run build:native."); return; }
      const processHandle = spawn(binary, [], { stdio: ["ignore", "pipe", "ignore"] });
      child = processHandle;
      const lines = readline.createInterface({ input: processHandle.stdout });
      lines.on("line", (line) => {
        if (line.length > 512) return;
        try { onClick(JSON.parse(line)); } catch { /* Ignore incomplete helper messages. */ }
      });
      processHandle.on("error", () => { if (child === processHandle) child = null; });
      processHandle.on("exit", () => { lines.close(); if (child === processHandle) child = null; });
    },
    stop() { const previous = child; child = null; previous?.kill(); }
  };
}

module.exports = { createOutsideClickMonitor };
