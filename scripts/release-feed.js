const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const yaml = require("js-yaml");
const semver = require("semver");

const RELEASE_REPO = "os-hero/os-hero";
const hash = (file, algorithm = "sha512", encoding = "base64") => crypto.createHash(algorithm).update(fs.readFileSync(file)).digest(encoding);

function validateRelease(directory, version) {
  if (!semver.valid(version) || semver.prerelease(version)) throw new Error("Stable semantic version required");
  const info = yaml.load(fs.readFileSync(path.join(directory, "latest-mac.yml"), "utf8"));
  if (info.version !== version) throw new Error("Package and feed versions differ");
  const expected = [`OS-Hero-${version}-arm64.zip`, `OS-Hero-${version}-arm64.dmg`];
  if (!Array.isArray(info.files) || info.files.length !== expected.length) throw new Error("ZIP and DMG metadata required");
  const artifacts = ["latest-mac.yml"];
  for (const name of expected) {
    const entry = info.files.find(file => file.url === name);
    if (!entry) throw new Error(`Missing artifact metadata: ${name}`);
    const file = path.join(directory, name);
    if (entry.size !== fs.statSync(file).size || entry.sha512 !== hash(file)) throw new Error(`Artifact hash/size mismatch: ${name}`);
    const blockmap = `${name}.blockmap`;
    if (!fs.statSync(path.join(directory, blockmap)).size) throw new Error(`Empty blockmap: ${blockmap}`);
    artifacts.push(name, blockmap);
  }
  const zip = info.files.find(file => file.url.endsWith(".zip"));
  if (info.path !== zip.url || info.sha512 !== zip.sha512) throw new Error("Legacy feed fields do not match ZIP");
  if (!Number.isFinite(Date.parse(info.releaseDate))) throw new Error("Invalid release date");
  return { info, artifacts };
}

function publicFeed(info) {
  const base = `https://github.com/${RELEASE_REPO}/releases/download/v${info.version}/`;
  const url = name => `${base}${encodeURIComponent(name)}`;
  return { ...info, files: info.files.map(file => ({ ...file, url: url(file.url) })), path: url(info.path) };
}

function assertAdvances(current, next) {
  if (current && (!semver.valid(current) || !semver.gt(next, current))) throw new Error(`Refusing non-increasing feed version: ${current} -> ${next}`);
}

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const { version } = require(path.join(root, "package.json"));
  const result = validateRelease(path.join(root, "release"), version);
  console.log(JSON.stringify({ version, artifacts: result.artifacts, verified: true }, null, 2));
}

module.exports = { RELEASE_REPO, validateRelease, publicFeed, assertAdvances, hash };
