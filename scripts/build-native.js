const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

if (process.platform === "darwin") {
  const root = path.resolve(__dirname, "..");
  const output = path.join(root, "build/native");
  fs.mkdirSync(output, { recursive: true });
  execFileSync("xcrun", ["swiftc", "-O", "-target", `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macos12.0`,
    path.join(root, "native/OutsideClick.swift"), "-o", path.join(output, "oshero-outside-click")], { stdio: "inherit" });
}
