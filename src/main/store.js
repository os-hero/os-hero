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
  }

  loadCharacter() {
    return readJson(this.characterPath);
  }

  saveCharacter(character) {
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

  saveWallet(wallet) {
    writeJson(this.walletPath, wallet);
  }

  paths() {
    return {
      userData: this.userDataPath,
      character: this.characterPath,
      settings: this.settingsPath,
      quests: this.questsPath,
      wallet: this.walletPath
    };
  }
}

module.exports = {
  AppStore
};
