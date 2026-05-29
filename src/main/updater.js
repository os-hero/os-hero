const fs = require("fs");
const path = require("path");

const PLACEHOLDER_UPDATE_URL = "https://updates.example.com/os-hero/";

let electronAutoUpdater = null;

function getAutoUpdater() {
  if (!electronAutoUpdater) {
    electronAutoUpdater = require("electron-updater").autoUpdater;
  }

  return electronAutoUpdater;
}

function normalizeFeedUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const withTrailingSlash = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  if (withTrailingSlash === PLACEHOLDER_UPDATE_URL) {
    return null;
  }

  return withTrailingSlash;
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function getPublishUrlFromPackage(app) {
  const packageJson = readJson(path.join(app.getAppPath(), "package.json"));
  const publish = packageJson && packageJson.build && packageJson.build.publish;
  const entries = Array.isArray(publish) ? publish : publish ? [publish] : [];
  const genericEntry = entries.find((entry) => entry && entry.provider === "generic" && entry.url);

  return normalizeFeedUrl(genericEntry && genericEntry.url);
}

function getPublishUrlFromResource(app) {
  const resourcePath = path.join(process.resourcesPath || app.getAppPath(), "update-feed.json");
  const feedConfig = readJson(resourcePath);

  return normalizeFeedUrl(feedConfig && feedConfig.url);
}

function getPublishUrlFromAppUpdateYml(app) {
  try {
    const appUpdatePath = path.join(process.resourcesPath || app.getAppPath(), "app-update.yml");
    if (!fs.existsSync(appUpdatePath)) {
      return null;
    }

    const content = fs.readFileSync(appUpdatePath, "utf8");
    const provider = content.match(/^provider:\s*(.+)$/m);
    if (!provider || provider[1].trim() !== "generic") {
      return null;
    }

    const url = content.match(/^url:\s*(.+)$/m);
    return normalizeFeedUrl(url && url[1]);
  } catch (error) {
    return null;
  }
}

function resolveUpdateFeedUrl(app) {
  return (
    normalizeFeedUrl(process.env.OS_HERO_UPDATE_URL) ||
    normalizeFeedUrl(process.env.OS_BOY_UPDATE_URL) ||
    getPublishUrlFromResource(app) ||
    getPublishUrlFromAppUpdateYml(app) ||
    getPublishUrlFromPackage(app)
  );
}

function createInitialState(enabled, feedUrl, currentVersion) {
  return {
    enabled,
    feedUrl,
    status: enabled ? "idle" : "disabled",
    currentVersion,
    latestVersion: null,
    progressPercent: null,
    lastCheckedAt: null,
    error: null,
    message: enabled
      ? "업데이트 확인 준비 완료"
      : "업데이트 채널이 설정되어 있지 않습니다.",
    startupCheckCompleted: false
  };
}

class UpdateManager {
  constructor({ app, notifyState, beforeInstall }) {
    this.app = app;
    this.notifyState = notifyState;
    this.beforeInstall = beforeInstall || (() => {});
    this.feedUrl = resolveUpdateFeedUrl(app);
    this.enabled = Boolean(this.feedUrl);
    this.state = createInitialState(this.enabled, this.feedUrl, app.getVersion());
    this.checkPromise = null;
    this.downloadPromise = null;
    this.installAfterDownload = false;
    this.startupCheckStarted = false;
    this.autoUpdater = null;

    if (this.enabled) {
      this.configureAutoUpdater();
    }
  }

  configureAutoUpdater() {
    this.autoUpdater = getAutoUpdater();
    this.autoUpdater.autoDownload = false;
    this.autoUpdater.autoInstallOnAppQuit = true;

    if (!this.app.isPackaged) {
      this.autoUpdater.forceDevUpdateConfig = true;
    }

    this.autoUpdater.setFeedURL({
      provider: "generic",
      url: this.feedUrl
    });

    this.autoUpdater.on("checking-for-update", () => {
      this.patchState({
        status: "checking",
        progressPercent: null,
        error: null,
        message: "새 버전을 확인하는 중입니다."
      });
    });

    this.autoUpdater.on("update-available", (info) => {
      this.patchState({
        status: "available",
        latestVersion: info.version || null,
        progressPercent: null,
        error: null,
        message: `새 버전 ${info.version || ""}이 있습니다.`
      });
    });

    this.autoUpdater.on("update-not-available", () => {
      this.patchState({
        status: "not-available",
        latestVersion: null,
        progressPercent: null,
        error: null,
        message: "현재 최신 버전을 사용 중입니다."
      });
    });

    this.autoUpdater.on("download-progress", (progress) => {
      this.patchState({
        status: "downloading",
        progressPercent: Math.max(0, Math.min(100, progress.percent || 0)),
        error: null,
        message: "업데이트를 내려받는 중입니다."
      });
    });

    this.autoUpdater.on("update-downloaded", (info) => {
      this.patchState({
        status: "downloaded",
        latestVersion: info.version || this.state.latestVersion,
        progressPercent: 100,
        error: null,
        message: "업데이트 다운로드가 완료되었습니다. 재시작하면 적용됩니다."
      });

      if (this.installAfterDownload) {
        this.installDownloadedUpdate();
      }
    });

    this.autoUpdater.on("error", (error) => {
      this.patchState({
        status: "error",
        progressPercent: null,
        error: error.message || String(error),
        message: "업데이트 확인 또는 다운로드 중 오류가 발생했습니다."
      });
    });
  }

  patchState(partial) {
    this.state = {
      ...this.state,
      ...partial,
      currentVersion: this.app.getVersion()
    };

    this.notifyState(this.state);
    return this.state;
  }

  getState() {
    return this.state;
  }

  async checkAtLaunch() {
    if (this.startupCheckStarted) {
      return this.state;
    }

    this.startupCheckStarted = true;
    const state = await this.checkForUpdates();
    this.patchState({ startupCheckCompleted: true });

    if (state.status === "available") {
      await this.downloadUpdate(false);
    }

    return this.state;
  }

  async checkForUpdates() {
    if (!this.enabled) {
      return this.state;
    }

    if (this.checkPromise) {
      return this.checkPromise;
    }

    if (this.downloadPromise) {
      return this.state;
    }

    this.checkPromise = this.autoUpdater
      .checkForUpdates()
      .then(() => {
        this.patchState({ lastCheckedAt: new Date().toISOString() });
        return this.state;
      })
      .catch((error) => {
        this.patchState({
          status: "error",
          progressPercent: null,
          lastCheckedAt: new Date().toISOString(),
          error: error.message || String(error),
          message: "업데이트 확인 중 오류가 발생했습니다."
        });
        return this.state;
      })
      .finally(() => {
        this.checkPromise = null;
      });

    return this.checkPromise;
  }

  async downloadUpdate(installAfterDownload) {
    if (!this.enabled) {
      return this.state;
    }

    if (this.state.status === "downloaded") {
      if (installAfterDownload) {
        return this.installDownloadedUpdate();
      }

      return this.state;
    }

    if (!["available", "downloading"].includes(this.state.status)) {
      await this.checkForUpdates();
    }

    if (this.state.status !== "available" && this.state.status !== "downloading") {
      return this.state;
    }

    this.installAfterDownload = Boolean(installAfterDownload);

    if (this.downloadPromise) {
      return this.downloadPromise;
    }

    this.patchState({
      status: "downloading",
      progressPercent: 0,
      error: null,
      message: "업데이트를 내려받는 중입니다."
    });

    this.downloadPromise = this.autoUpdater
      .downloadUpdate()
      .then(() => {
        if (this.installAfterDownload && this.state.status === "downloaded") {
          return this.installDownloadedUpdate();
        }

        return this.state;
      })
      .catch((error) => {
        this.patchState({
          status: "error",
          progressPercent: null,
          error: error.message || String(error),
          message: "업데이트 다운로드 중 오류가 발생했습니다."
        });
        return this.state;
      })
      .finally(() => {
        this.downloadPromise = null;
        this.installAfterDownload = false;
      });

    return this.downloadPromise;
  }

  installDownloadedUpdate() {
    if (this.state.status !== "downloaded") {
      return this.state;
    }

    this.patchState({
      status: "installing",
      progressPercent: 100,
      error: null,
      message: "업데이트 적용을 위해 앱을 재시작합니다."
    });

    setImmediate(() => {
      this.beforeInstall();
      this.autoUpdater.quitAndInstall(false, true);
    });

    return this.state;
  }
}

module.exports = {
  UpdateManager,
  PLACEHOLDER_UPDATE_URL,
  resolveUpdateFeedUrl
};
