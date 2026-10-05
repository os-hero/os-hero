const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`Failed to read ${filePath}:`, error);
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
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
  }

  loadCharacter() {
    return readJson(this.characterPath);
  }

  saveCharacter(character) {
    const previous = this.loadCharacter();
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
    return readJson(this.expeditionPath);
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
      expedition: this.expeditionPath
    };
  }
}

module.exports = {
  AppStore
};
