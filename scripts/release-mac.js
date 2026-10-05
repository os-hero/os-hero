const path = require("path");
const { execFileSync } = require("child_process");
const root = path.resolve(__dirname, "..");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: "inherit" });

if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("Current public release supports Apple Silicon macOS only");
if (!process.env.APPLE_KEYCHAIN_PROFILE) throw new Error("Set APPLE_KEYCHAIN_PROFILE to your notarytool profile; never pass passwords in scripts");
if (!process.env.OS_HERO_PAGES_DIR) throw new Error("Set OS_HERO_PAGES_DIR to the clean website checkout");
// Validation fails closed before modifying the stable channel.
execFileSync("xcrun", ["notarytool", "history", "--keychain-profile", process.env.APPLE_KEYCHAIN_PROFILE, "--output-format", "json"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
run("npm", ["test"]);
run("npm", ["run", "dist:mac", "--", "--arm64", "--publish", "never", "--config.forceCodeSigning=true"]);
const bundle = path.join(root, "release/mac-arm64/OS Hero.app");
run("codesign", ["--verify", "--deep", "--strict", bundle]);
run("xcrun", ["stapler", "validate", bundle]);
run("spctl", ["--assess", "--type", "execute", "--verbose=2", bundle]);
run("npm", ["run", "verify:release"]);
run("npm", ["run", "deploy:updates"]);
