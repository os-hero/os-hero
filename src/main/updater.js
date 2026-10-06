const fs = require("fs");
const path = require("path");

const PLACEHOLDER_UPDATE_URL = "https://updates.example.com/os-hero/";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_COOLDOWN_MS = 15 * 60 * 1000;
const RETRY_DELAYS_MS = [15 * 60 * 1000, 60 * 60 * 1000, UPDATE_CHECK_INTERVAL_MS];

function newerVersion(a, b) {
  if (!/^\d+\.\d+\.\d+$/.test(a || "")) return false;
  if (!b) return true;
  const left = a.split(".").map(Number), right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false;
}

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
    readyVersion: null,
    appliedVersion: null,
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
  constructor({ app, notifyState, beforeInstall, onInstallError, autoUpdater, timers = globalThis,
    now = Date.now, isOnline = () => true, getAutoDownload = () => true,
    readMetadata = () => ({}), writeMetadata = () => {} }) {
    this.app = app;
    this.notifyState = notifyState;
    this.beforeInstall = beforeInstall || (() => {});
    this.onInstallError = onInstallError || (() => {});
    this.now = now;
    this.isOnline = isOnline;
    this.getAutoDownload = getAutoDownload;
    this.writeMetadata = writeMetadata;
    const saved = readMetadata() || {};
    this.metadata = {
      lastSuccess: Number.isFinite(saved.lastSuccess) ? saved.lastSuccess : 0,
      retryAt: Number.isFinite(saved.retryAt) ? saved.retryAt : 0,
      failures: Math.min(3, Math.max(0, Number(saved.failures) || 0)),
      seenVersion: typeof saved.seenVersion === "string" ? saved.seenVersion : app.getVersion()
    };
    this.feedUrl = resolveUpdateFeedUrl(app);
    this.enabled = Boolean(this.feedUrl);
    this.state = createInitialState(this.enabled, this.feedUrl, app.getVersion());
    this.state.lastCheckedAt = this.metadata.lastSuccess ? new Date(this.metadata.lastSuccess).toISOString() : null;
    this.state.appliedVersion = newerVersion(app.getVersion(), this.metadata.seenVersion) ? app.getVersion() : null;
    this.persistMetadata();
    this.checkPromise = null;
    this.downloadPromise = null;
    this.installPromise = null;
    this.candidateVersion = null;
    this.verification = null;
    this.verificationTimer = null;
    this.online = this.isOnline();
    this.startupCheckStarted = false;
    this.autoUpdater = null;
    this.providedAutoUpdater = autoUpdater;
    this.timers = timers;
    this.periodicTimer = null;
    this.automaticCheckPromise = null;

    if (this.enabled) {
      this.configureAutoUpdater();
    }
  }

  configureAutoUpdater() {
    this.autoUpdater = this.providedAutoUpdater || getAutoUpdater();
    this.autoUpdater.autoDownload = false;
    this.autoUpdater.autoInstallOnAppQuit = true;
    this.autoUpdater.allowPrerelease = false;
    this.autoUpdater.allowDowngrade = false;

    if (!this.app.isPackaged) {
      this.autoUpdater.forceDevUpdateConfig = true;
    }

    this.autoUpdater.setFeedURL({
      provider: "generic",
      url: this.feedUrl,
      useMultipleRangeRequest: false
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
        status: newerVersion(info.version, this.state.readyVersion) ? "available" : "downloaded",
        latestVersion: newerVersion(info.version, this.state.readyVersion) ? info.version : this.state.readyVersion,
        progressPercent: null,
        error: null,
        message: `새 버전 ${info.version || ""}이 있습니다.`
      });
    });

    this.autoUpdater.on("update-not-available", () => {
      this.patchState({
        status: this.state.readyVersion ? "downloaded" : "not-available",
        latestVersion: this.state.readyVersion || this.app.getVersion(),
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
      this.candidateVersion = info.version;
      // MacUpdater emits this before Squirrel has validated/staged the signed app.
      if (this.autoUpdater.nativeUpdater) {
        this.patchState({ status: "verifying", progressPercent: 100 });
        this.verificationTimer = this.timers.setTimeout(() => this.verification?.reject(new Error("verification timeout")), 180000);
      }
      else this.markReady();
    });
    this.autoUpdater.nativeUpdater?.on("update-downloaded", () => this.markReady());

    this.autoUpdater.on("error", (error) => {
      this.verification?.reject(error);
      if (this.state.status === "installing") this.onInstallError();
      this.patchState({ status: "error", error: "update.failed", progressPercent: null });
    });
  }

  persistMetadata() {
    try { this.writeMetadata(this.metadata); } catch { console.warn("Update scheduling metadata could not be saved."); }
  }

  acknowledgeApplied() {
    this.metadata.seenVersion = this.app.getVersion();
    this.persistMetadata();
    return this.patchState({ appliedVersion: null });
  }

  markReady() {
    if (!this.candidateVersion) return;
    this.patchState({ status: "downloaded", readyVersion: this.candidateVersion, latestVersion: this.candidateVersion, progressPercent: 100, error: null });
    this.metadata.failures = 0;
    this.metadata.retryAt = 0;
    this.persistMetadata();
    this.verification?.resolve();
  }

  failed(kind) {
    this.metadata.failures++;
    this.metadata.retryAt = this.now() + RETRY_DELAYS_MS[Math.min(this.metadata.failures - 1, 2)];
    this.persistMetadata();
    return this.patchState({ status: "error", error: kind, progressPercent: null });
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
    if (this.startupCheckStarted || !this.app.isPackaged || !this.enabled) {
      return this.state;
    }

    this.startupCheckStarted = true;
    // One cheap main-process tick also detects network recovery with no renderer alive.
    this.periodicTimer = this.timers.setInterval(() => { void this.checkIfDue(); }, 60000);
    this.periodicTimer.unref?.();
    const elapsed = this.now() - this.metadata.lastSuccess;
    if ((!this.metadata.lastSuccess || elapsed < 0 || elapsed >= STARTUP_COOLDOWN_MS) && this.now() >= this.metadata.retryAt) await this.checkAutomatically();
    return this.patchState({ startupCheckCompleted: true });
  }

  async checkIfDue() {
    if (!this.app.isPackaged || !this.enabled || !this.startupCheckStarted) return this.state;
    this.online = this.isOnline();
    if (!this.online) return this.state;
    const elapsed = this.now() - this.metadata.lastSuccess;
    const due = this.metadata.retryAt ? this.now() >= this.metadata.retryAt : !this.metadata.lastSuccess || elapsed < 0 || elapsed >= UPDATE_CHECK_INTERVAL_MS;
    return due ? this.checkAutomatically() : this.state;
  }

  async checkAutomatically() {
    if (this.automaticCheckPromise) return this.automaticCheckPromise;
    if (this.downloadPromise || this.installPromise || this.state.status === "installing") return this.state;
    this.automaticCheckPromise = (async () => {
      const state = await this.checkForUpdates();
      if (state.status === "available" && this.getAutoDownload()) await this.downloadUpdate();
      return this.state;
    })().finally(() => { this.automaticCheckPromise = null; });
    return this.automaticCheckPromise;
  }

  async checkManually() {
    await this.checkForUpdates();
    if (this.state.status === "available" && this.getAutoDownload()) await this.downloadUpdate();
    return this.state;
  }

  stop() {
    if (this.periodicTimer) this.timers.clearInterval(this.periodicTimer);
    this.periodicTimer = null;
  }

  async checkForUpdates() {
    if (!this.enabled) {
      return this.state;
    }

    if (this.checkPromise) {
      return this.checkPromise;
    }

    if (this.downloadPromise || this.installPromise || this.state.status === "installing") {
      return this.state;
    }

    this.checkPromise = this.autoUpdater
      .checkForUpdates()
      .then(() => {
        this.metadata.lastSuccess = this.now();
        this.metadata.retryAt = 0;
        if (["not-available", "downloaded"].includes(this.state.status)) this.metadata.failures = 0;
        this.persistMetadata();
        this.patchState({ lastCheckedAt: new Date(this.now()).toISOString(), error: null });
        return this.state;
      })
      .catch(() => this.failed("update.checkFailed"))
      .finally(() => {
        this.checkPromise = null;
      });

    return this.checkPromise;
  }

  async downloadUpdate() {
    if (!this.enabled) {
      return this.state;
    }

    if (this.installPromise || this.downloadPromise) return this.downloadPromise || this.state;
    if (this.state.status === "downloaded") return this.state;

    if (!["available", "downloading"].includes(this.state.status)) {
      await this.checkForUpdates();
    }
    if (this.downloadPromise) return this.downloadPromise;

    if (this.state.status !== "available" && this.state.status !== "downloading") {
      return this.state;
    }

    this.patchState({
      status: "downloading",
      progressPercent: 0,
      error: null,
      message: "업데이트를 내려받는 중입니다."
    });

    this.candidateVersion = this.state.latestVersion;
    const verified = new Promise((resolve, reject) => { this.verification = { resolve, reject }; });
    // Attach a handler immediately: native verification can fail before download resolves.
    verified.catch(() => {});
    this.downloadPromise = (async () => {
      try {
        await this.autoUpdater.downloadUpdate();
        await verified;
      } catch { this.failed("update.downloadFailed"); }
      finally {
        if (this.verificationTimer) this.timers.clearTimeout(this.verificationTimer);
        this.verificationTimer = null;
        this.verification = null;
        this.candidateVersion = null;
        this.downloadPromise = null;
      }
      return this.state;
    })();

    return this.downloadPromise;
  }

  async installDownloadedUpdate() {
    if (this.installPromise) return this.installPromise;
    if (!this.state.readyVersion || this.downloadPromise || this.checkPromise || this.state.status === "installing") return this.state;
    this.installPromise = (async () => {
      try {
        this.patchState({ status: "preparing", error: null });
        if (await this.beforeInstall() === false) return this.patchState({ status: "downloaded" });
        this.patchState({ status: "installing", progressPercent: 100 });
        this.autoUpdater.autoRunAppAfterInstall = true;
        this.autoUpdater.quitAndInstall(false, true);
      } catch {
        this.onInstallError();
        this.patchState({ status: "error", error: "update.saveFailed" });
      }
      return this.state;
    })().finally(() => { this.installPromise = null; });
    return this.installPromise;
  }
}

module.exports = {
  UpdateManager,
  PLACEHOLDER_UPDATE_URL,
  UPDATE_CHECK_INTERVAL_MS,
  STARTUP_COOLDOWN_MS,
  RETRY_DELAYS_MS,
  newerVersion,
  resolveUpdateFeedUrl
};
