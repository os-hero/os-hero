const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const electron = require("electron");

async function main() {
  const only = ["--wardrobe", "--backgrounds", "--tray-shell", "--inventory-layout", "--updates"].find((flag) => process.argv.includes(flag));
  const scenarios = only ? [[only]] : [[], ["--wardrobe"], ["--backgrounds"], ["--inventory-layout"], ["--tray-shell"], ["--completion"], ["--restart"], ["--updates"]];
  for (const args of scenarios) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "oshero-qa-"));
    try {
      const code = await new Promise((resolve, reject) => {
        const child = spawn(electron, [path.join(__dirname, "qa-electron.js"), ...args], {
          stdio: "inherit", env: { ...process.env, OS_HERO_QA_PROFILE: profile }
        });
        child.on("error", reject);
        child.on("exit", resolve);
      });
      if (code !== 0) throw new Error(`Electron QA failed (${args.join(" ") || "flow"})`);
    } finally {
      // Chromium helpers finish their cache flush after the main process exits.
      await new Promise((resolve) => setTimeout(resolve, 500));
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
