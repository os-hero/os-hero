const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const asar = require("@electron/asar");
const assert = require("assert/strict");

const root = path.resolve(__dirname, "..");
const bundle = path.join(root, "release/mac-arm64/OS Hero.app");
const archive = path.join(bundle, "Contents/Resources/app.asar");
const output = process.env.OS_HERO_QA_OUTPUT || path.join(root, "review-artifacts", new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }), "packaged");
const filesIn = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesIn(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const report = { bundle, version: require("../package.json").version, files: [], passed: false, appCopiesCreated: 0 };
fs.mkdirSync(output, { recursive: true });
try {
  // electron-builder removes development-only keys from packaged metadata.
  const metadata = require("../package.json");
  const expected = Object.fromEntries(Object.entries(metadata).filter(([key]) => !["scripts", "build", "devDependencies"].includes(key)));
  assert.deepEqual(JSON.parse(asar.extractFile(archive, "package.json")), expected, "Packaged runtime metadata differs");
  report.metadata = { version: metadata.version, main: metadata.main, dependencies: metadata.dependencies, passed: true };
  for (const file of [...filesIn(path.join(root, "src")), ...filesIn(path.join(root, "public"))]) {
    const name = path.relative(root, file);
    if (!asar.extractFile(archive, name).equals(fs.readFileSync(file))) throw Error(`Packaged source differs: ${name}`);
    report.files.push(name);
  }
  for (const target of [bundle, path.join(bundle, "Contents/Resources/native/oshero-outside-click")]) execFileSync("codesign", ["--verify", "--deep", "--strict", target], { stdio: "inherit" });
  // Electron reads the signed ASAR directly, without extracting/registering another .app.
  execFileSync(process.execPath, [path.join(__dirname, "qa-runner.js")], {
    cwd: root, stdio: "inherit", env: { ...process.env, OS_HERO_QA_APP: path.join(archive, "src/main/main.js"), OS_HERO_QA_OUTPUT: output }
  });
  report.passed = true;
} finally {
  fs.writeFileSync(path.join(output, "package-equality.json"), JSON.stringify(report, null, 2) + "\n");
}
