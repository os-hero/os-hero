const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const yaml = require("js-yaml");
const { RELEASE_REPO, validateRelease, publicFeed, assertAdvances, hash } = require("./release-feed");

const root = path.resolve(__dirname, "..");
const releaseDir = path.join(root, "release");
const { version } = require(path.join(root, "package.json"));
const tag = `v${version}`;
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const output = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();

async function main() {
  if (!process.env.OS_HERO_PAGES_DIR) throw new Error("Set OS_HERO_PAGES_DIR to the clean website checkout");
  const pages = path.resolve(process.env.OS_HERO_PAGES_DIR);
  if (output("git", ["status", "--porcelain"], pages)) throw new Error("Website checkout must be clean");
  if (output("git", ["remote", "get-url", "origin"], pages) !== "https://github.com/os-hero/os-hero.github.io.git") throw new Error("Unexpected website repository");
  run("git", ["pull", "--ff-only"], pages);
  const sourceCommit = output("git", ["rev-parse", "HEAD"]);
  if (output("git", ["status", "--porcelain"])) throw new Error("Commit source changes before releasing");
  if (output("git", ["rev-parse", `${tag}^{commit}`]) !== sourceCommit) throw new Error("Release tag must match source HEAD");
  const remoteTag = output("git", ["ls-remote", "origin", `refs/tags/${tag}`]);
  if (!remoteTag.startsWith(sourceCommit)) throw new Error("Push the lightweight release tag first");
  const { info, artifacts } = validateRelease(releaseDir, version);
  if (process.platform !== "darwin") throw new Error("Public deployment requires macOS signing/notarization verification");
  const bundle = path.join(releaseDir, "mac-arm64/OS Hero.app");
  run("codesign", ["--verify", "--deep", "--strict", bundle]);
  run("xcrun", ["stapler", "validate", bundle]);
  run("spctl", ["--assess", "--type", "execute", "--verbose=2", bundle]);
  const feedPath = path.join(pages, "updates/latest-mac.yml");
  const existingFeed = yaml.load(fs.readFileSync(feedPath, "utf8"));
  if (existingFeed.version !== version) assertAdvances(existingFeed.version, version);
  else if (existingFeed.sha512 !== info.sha512) throw new Error("Published version cannot be replaced with different bytes");
  const notes = JSON.parse(fs.readFileSync(path.join(root, `releases/${version}.json`), "utf8"));
  if (notes.version !== version) throw new Error("Release notes version mismatch");
  const body = [notes.copy.ko.summary, "", ...notes.copy.ko.notes.map(note => `- ${note}`), "", "## Installation", "", notes.installation.en, "", notes.installation.ko, ""].join("\n");
  const notesPath = path.join(releaseDir, "release-notes.md");
  fs.writeFileSync(notesPath, body);
  const sums = path.join(releaseDir, "SHA256SUMS");
  fs.writeFileSync(sums, artifacts.map(name => `${hash(path.join(releaseDir, name), "sha256", "hex")}  ${name}`).join("\n") + "\n");

  const releases = JSON.parse(output("gh", ["api", `repos/${RELEASE_REPO}/releases?per_page=100`]));
  const existing = releases.find(release => release.tag_name === tag);
  if (!existing) run("gh", ["release", "create", tag, "--repo", RELEASE_REPO, "--verify-tag", "--draft", "--title", `OS Hero ${version}`, "--notes-file", notesPath]);
  if (!existing || existing.draft) {
    run("gh", ["release", "upload", tag, "--repo", RELEASE_REPO, "--clobber", ...[...artifacts, "SHA256SUMS"].map(name => path.join(releaseDir, name))]);
    run("gh", ["release", "edit", tag, "--repo", RELEASE_REPO, "--draft=false", "--latest", "--notes-file", notesPath]);
  }
  // Publish the compatibility feed only after every referenced immutable asset is reachable.
  const nextFeed = publicFeed(info);
  const remoteInfoUrl = `https://github.com/${RELEASE_REPO}/releases/download/${tag}/latest-mac.yml`;
  const response = await fetch(remoteInfoUrl);
  if (!response.ok) throw new Error(`Release metadata unavailable: ${response.status}`);
  const remoteInfo = yaml.load(await response.text());
  if (JSON.stringify(remoteInfo.files) !== JSON.stringify(info.files) || remoteInfo.sha512 !== info.sha512) throw new Error("Remote release metadata differs from verified build");
  for (const file of nextFeed.files) {
    const head = await fetch(file.url, { method: "HEAD" });
    if (!head.ok || Number(head.headers.get("content-length")) !== file.size) throw new Error(`Remote artifact unavailable/wrong size: ${file.url}`);
  }

  const registryPath = path.join(pages, "releases.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const record = { version, releasedAt: info.releaseDate, downloads: { mac: nextFeed.files.find(file => file.url.endsWith(".dmg")).url }, copy: notes.copy };
  fs.writeFileSync(registryPath, JSON.stringify([record, ...registry.filter(item => item.version !== version)], null, 2) + "\n");
  fs.writeFileSync(feedPath, yaml.dump(nextFeed, { lineWidth: -1 }));
  fs.writeFileSync(path.join(pages, "updates/README.md"), `# OS Hero Updates\n\nStable version: ${version}\n\nCompatibility feed: https://os-hero.github.io/updates/latest-mac.yml\n\nNew signed installers and checksums are hosted at https://github.com/${RELEASE_REPO}/releases/tag/${tag}. Legacy downloads remain here. Do not replace artifacts for a published version.\n`);
  fs.mkdirSync(path.join(pages, `versions/${version}`), { recursive: true });
  fs.copyFileSync(path.join(pages, "index.html"), path.join(pages, `versions/${version}/index.html`));
  const changed = ["updates/latest-mac.yml", "updates/README.md", "releases.json", `versions/${version}/index.html`];
  run("git", ["add", "--", ...changed], pages);
  if (output("git", ["diff", "--cached", "--name-only"], pages)) run("git", ["commit", "-m", `Publish OS Hero ${version} stable update feed`], pages);
  run("git", ["push", "origin", "HEAD:main"], pages);
  console.log(`Published GitHub release ${tag}; wait for Pages deployment, then verify the public feed and download hashes.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
