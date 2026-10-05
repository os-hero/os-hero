const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yaml = require("js-yaml");
const { validateRelease, publicFeed, assertAdvances, hash } = require("../scripts/release-feed");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oshero-feed-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = ["zip", "dmg"].map(ext => {
    const url = `OS-Hero-1.3.0-arm64.${ext}`;
    fs.writeFileSync(path.join(directory, url), `test-${ext}`);
    fs.writeFileSync(path.join(directory, `${url}.blockmap`), "test-blockmap");
    return { url, sha512: hash(path.join(directory, url)), size: fs.statSync(path.join(directory, url)).size };
  });
  const info = { version: "1.3.0", files, path: files[0].url, sha512: files[0].sha512, releaseDate: "2026-10-05T00:00:00.000Z" };
  const save = () => fs.writeFileSync(path.join(directory, "latest-mac.yml"), yaml.dump(info));
  save();
  return { directory, info, save };
}

test("release metadata binds exact version, ZIP/DMG bytes and legacy fields", t => {
  const { directory, info } = fixture(t);
  assert.deepEqual(validateRelease(directory, "1.3.0").info, info);
  assert.equal(validateRelease(directory, "1.3.0").artifacts.length, 5);
  const feed = publicFeed(info);
  assert.match(feed.path, /^https:\/\/github.com\/os-hero\/os-hero\/releases\/download\/v1.3.0\//);
  assert.equal(feed.files[0].sha512, info.files[0].sha512);
  assert.equal(new URL(feed.files[0].url, "https://os-hero.github.io/updates/").href, feed.files[0].url);
});

test("mismatched bytes, missing files and legacy metadata cannot reach stable feed", t => {
  const { directory, info, save } = fixture(t);
  assert.throws(() => validateRelease(directory, "1.4.0"), /versions differ/);
  info.sha512 = "wrong"; save();
  assert.throws(() => validateRelease(directory, "1.3.0"), /Legacy/);
  info.sha512 = info.files[0].sha512; save();
  fs.writeFileSync(path.join(directory, info.path), "altered");
  assert.throws(() => validateRelease(directory, "1.3.0"), /mismatch/);
});

test("stable feed rejects reused/downgrade/prerelease versions and path substitutions", t => {
  assertAdvances("1.2.0", "1.3.0");
  assert.throws(() => assertAdvances("1.3.0", "1.3.0"));
  assert.throws(() => assertAdvances("1.3.0", "1.2.0"));
  const { directory, info, save } = fixture(t);
  assert.throws(() => validateRelease(directory, "1.3.0-beta.1"), /Stable/);
  info.files[0].url = "../../private-file"; save();
  assert.throws(() => validateRelease(directory, "1.3.0"), /Missing artifact metadata/);
});
