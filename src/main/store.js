const fs = require("fs");
const path = require("path");
const { createProgression, validateProgression } = require("../shared/progression");

function readJson(filePath, strict = false) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (strict) throw new Error(`Cannot load ${path.basename(filePath)}; the saved file was not modified`, { cause: error });
    console.warn(`Failed to read ${filePath}:`, error);
    return null;
  }
}

function writeJson(filePath, data, durable = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, { encoding: "utf8", ...(durable ? { flush: true, mode: 0o600 } : {}) });
  fs.renameSync(tmpPath, filePath);
}

class AppStore {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.characterPath = path.join(userDataPath, "character.json");
    this.settingsPath = path.join(userDataPath, "settings.json");
    this.questsPath = path.join(userDataPath, "quests.json");
    this.walletPath = path.join(userDataPath, "wallet.json");
    this.expeditionPath = path.join(userDataPath, "expedition.json");
    this.progressionPath = path.join(userDataPath, "progression.json");
    this.updatePath = path.join(userDataPath, "update-state.json");
  }

  loadUpdateMetadata() { return readJson(this.updatePath); }
  saveUpdateMetadata(value) { writeJson(this.updatePath, value); }

  loadProgression(seed) {
    if (fs.existsSync(this.progressionPath)) return validateProgression(readJson(this.progressionPath, true));
    const wallet = readJson(this.walletPath, true), expedition = readJson(this.expeditionPath, true);
    if ((fs.existsSync(this.walletPath) && !wallet) || (fs.existsSync(this.expeditionPath) && !expedition)) throw new Error("Invalid legacy records; migration was not performed");
    const next = createProgression(wallet, expedition, seed);
    const backup = path.join(this.userDataPath, "backups", "progression-v1");
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    for (const source of [this.walletPath, this.expeditionPath]) {
      if (!fs.existsSync(source)) continue;
      const target = path.join(backup, path.basename(source));
      try { fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL); fs.chmodSync(target, 0o600); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    this.saveProgression(next);
    return next;
  }

  saveProgression(value) {
    validateProgression(value);
    // Refuse a silent overwrite after corruption or an unsupported future upgrade.
    if (fs.existsSync(this.progressionPath)) validateProgression(readJson(this.progressionPath, true));
    writeJson(this.progressionPath, value, true);
  }

  loadCharacter() {
    const value = readJson(this.characterPath, true);
    if (fs.existsSync(this.characterPath) && (!value || typeof value !== "object" || Array.isArray(value) || Number(value.schemaVersion) > 3)) {
      throw new Error("Unsupported saved Hero; the original file was not modified");
    }
    return value;
  }

  saveCharacter(character) {
    const previous = this.loadCharacter();
    if (character.identity && previous && !previous.identity) {
      const backup = path.join(this.userDataPath, "backups", "hero-registration", "character.json");
      fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
      try {
        fs.copyFileSync(this.characterPath, backup, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(backup, 0o600);
      } catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    if (character.schemaVersion === 2 && previous && previous.schemaVersion !== 2) {
      const backup = path.join(this.userDataPath, "backups", "wardrobe-v2", "character.json");
      fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
      try {
        fs.copyFileSync(this.characterPath, backup, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(backup, 0o600);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    if (previous && !Object.hasOwn(previous.equipped || {}, "background")) {
      const backup = path.join(this.userDataPath, "backups", "pixel-backgrounds", "character.json");
      fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
      try {
        fs.copyFileSync(this.characterPath, backup, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(backup, 0o600);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    writeJson(this.characterPath, character);
  }

  loadSettings() {
    return readJson(this.settingsPath);
  }

  saveSettings(settings) {
    writeJson(this.settingsPath, settings);
  }

  loadQuests() {
    return readJson(this.questsPath);
  }

  saveQuests(quests) {
    writeJson(this.questsPath, { quests });
  }

  loadWallet() {
    return readJson(this.walletPath);
  }

  loadExpedition() {
    return readJson(this.expeditionPath, true);
  }

  saveExpedition(expedition) {
    writeJson(this.expeditionPath, expedition);
  }

  saveWallet(wallet) {
    writeJson(this.walletPath, wallet);
  }

  paths() {
    return {
      userData: this.userDataPath,
      character: this.characterPath,
      settings: this.settingsPath,
      quests: this.questsPath,
      wallet: this.walletPath,
      expedition: this.expeditionPath,
      progression: this.progressionPath
    };
  }
}

module.exports = {
  AppStore
};
