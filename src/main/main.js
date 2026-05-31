const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray,
  ipcMain
} = require("electron");

const { CpuMonitor } = require("./cpu");
const { AppStore } = require("./store");
const { renderCharacterDataUrl, renderTrayCharacterBuffer } = require("./pixelRenderer");
const { TrayAnimator } = require("./trayAnimator");
const { UpdateManager } = require("./updater");
const {
  EYE_TYPES,
  GENDER_OPTIONS,
  ITEM_CATEGORIES,
  ITEMS,
  defaultCharacter,
  normalizeCharacter,
  normalizeSettings,
  equipItem,
  isValidHexColor,
  unequipSlot
} = require("../shared/catalog");
const {
  LANGUAGE_OPTIONS,
  getMessages,
  normalizeLanguage,
  translate
} = require("../shared/i18n");
const {
  DEFAULT_QUEST_STATUS,
  QUEST_PAGE_SIZE,
  QUEST_STATUSES,
  QUEST_TYPES,
  isValidQuestStatus,
  isValidQuestType,
  normalizeQuest,
  normalizeQuests,
  questTypeHasStatus,
  sortQuestsNewestFirst
} = require("../shared/quests");

const APP_NAME = "OS Hero";
const LEGACY_APP_NAME = "OS Boy";
const DEVELOPER = "이충복";
const CONTACT = "themercenary@duck.com";

app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId("com.themercenary.oshero");
}

if (process.env.OS_HERO_USER_DATA_DIR || process.env.OS_BOY_USER_DATA_DIR) {
  app.setPath("userData", process.env.OS_HERO_USER_DATA_DIR || process.env.OS_BOY_USER_DATA_DIR);
}

let tray = null;
let trayAnimator = null;
let cpuMonitor = null;
let store = null;
let character = null;
let settings = null;
let quests = [];
let updateManager = null;
let firstRunPending = false;
let isQuitting = false;
const reminderTimers = new Map();

const windows = new Map();

const WINDOW_CONFIG = {
  customization: {
    titleKey: "window.customization",
    width: 760,
    height: 680
  },
  inventory: {
    titleKey: "window.inventory",
    width: 860,
    height: 720
  },
  quests: {
    titleKey: "window.quests",
    width: 940,
    height: 760
  },
  settings: {
    titleKey: "window.settings",
    width: 640,
    height: 640
  },
  about: {
    titleKey: "window.about",
    width: 520,
    height: 420
  }
};

function currentVersion() {
  return app.getVersion();
}

function getAppIcon() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "../../public/assets/app-icon.png"));
  return icon.isEmpty() ? undefined : icon;
}

function appInfo() {
  const year = new Date().getFullYear();

  return {
    name: APP_NAME,
    version: currentVersion(),
    developer: DEVELOPER,
    contact: CONTACT,
    copyright: `Copyright © ${year} The Mercenary. All Rights Reserved.`
  };
}

function currentLanguage() {
  return normalizeLanguage(settings && settings.language);
}

function t(key, values) {
  return translate(currentLanguage(), key, values);
}

function localizeUpdateState(updateState) {
  if (!updateState) {
    return null;
  }

  const version = updateState.latestVersion || "";
  const messageKeyByStatus = {
    disabled: "update.disabled",
    idle: "update.idle",
    checking: "update.checking",
    available: "update.available",
    "not-available": "update.notAvailable",
    downloading: "update.downloading",
    downloaded: "update.downloaded",
    installing: "update.installing",
    error: "update.error"
  };

  return {
    ...updateState,
    message: t(messageKeyByStatus[updateState.status] || "update.idle", { version })
  };
}

function getPublicState() {
  const language = currentLanguage();

  return {
    app: appInfo(),
    character,
    settings: {
      ...settings,
      language,
      version: currentVersion()
    },
    languageOptions: LANGUAGE_OPTIONS,
    messages: getMessages(language),
    eyeTypes: EYE_TYPES,
    genderOptions: GENDER_OPTIONS,
    itemCategories: ITEM_CATEGORIES,
    items: ITEMS.filter((item) => item.owned),
    questTypes: QUEST_TYPES,
    questStatuses: QUEST_STATUSES,
    questPageSize: QUEST_PAGE_SIZE,
    quests: sortQuestsNewestFirst(quests),
    cpuPercent: cpuMonitor ? cpuMonitor.percent : 0,
    update: updateManager ? localizeUpdateState(updateManager.getState()) : null,
    storage: store ? store.paths() : null,
    firstRunPending
  };
}

function migrateLegacyUserDataIfNeeded() {
  const nextPath = app.getPath("userData");
  const legacyPath = path.join(app.getPath("appData"), LEGACY_APP_NAME);

  if (nextPath === legacyPath || !fs.existsSync(legacyPath)) {
    return;
  }

  fs.mkdirSync(nextPath, { recursive: true });

  for (const fileName of ["character.json", "settings.json", "quests.json"]) {
    const legacyFile = path.join(legacyPath, fileName);
    const nextFile = path.join(nextPath, fileName);

    if (fs.existsSync(legacyFile) && !fs.existsSync(nextFile)) {
      fs.copyFileSync(legacyFile, nextFile);
    }
  }
}

function notifyUpdateState(updateState) {
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send("update:state", localizeUpdateState(updateState));
    }
  }
}

function notifyAppState() {
  const publicState = getPublicState();

  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send("state:changed", publicState);
    }
  }
}

function persistCharacter(nextCharacter) {
  character = normalizeCharacter(nextCharacter, currentVersion());
  character.hasCharacter = true;
  store.saveCharacter(character);
  firstRunPending = false;

  if (trayAnimator) {
    trayAnimator.updateCharacter(character);
  }

  return character;
}

function persistDefaultCharacterIfNeeded() {
  if (!firstRunPending) {
    return;
  }

  persistCharacter(defaultCharacter(currentVersion()));
}

function createQuestId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function findQuest(questId) {
  return quests.find((quest) => quest.id === questId) || null;
}

function saveQuestRecords(nextQuests, options = {}) {
  quests = normalizeQuests(nextQuests, currentVersion());
  store.saveQuests(quests);
  scheduleAllReminders();

  if (options.notify !== false) {
    notifyAppState();
  }

  return quests;
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch (_error) {
    return null;
  }
}

function buildQuestFromPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const existing = source.id ? findQuest(source.id) : null;
  const type = isValidQuestType(source.type) ? source.type : existing ? existing.type : "adventure";
  const title = typeof source.title === "string" ? source.title.trim() : "";
  const now = new Date().toISOString();

  if (!title) {
    throw new Error(t("quest.validation.title"));
  }

  const quest = normalizeQuest(
    {
      ...existing,
      ...source,
      id: existing ? existing.id : createQuestId(),
      type,
      title,
      body: typeof source.body === "string" ? source.body : "",
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    },
    currentVersion()
  );

  if (!questTypeHasStatus(type)) {
    const normalizedUrl = normalizeUrl(source.url);
    if (!normalizedUrl) {
      throw new Error(t("quest.validation.url"));
    }

    return {
      ...quest,
      status: null,
      body: "",
      url: normalizedUrl,
      remindAt: null,
      notifiedAt: null
    };
  }

  quest.status = isValidQuestStatus(source.status) ? source.status : DEFAULT_QUEST_STATUS;
  quest.url = "";

  if (type === "reminder") {
    const remindTime = Date.parse(source.remindAt);
    if (!source.remindAt || Number.isNaN(remindTime)) {
      throw new Error(t("quest.validation.remindAt"));
    }

    const remindAt = new Date(remindTime).toISOString();
    return {
      ...quest,
      remindAt,
      notifiedAt: existing && existing.remindAt === remindAt ? existing.notifiedAt : null
    };
  }

  return {
    ...quest,
    remindAt: null,
    notifiedAt: null
  };
}

function cancelReminder(questId) {
  const timer = reminderTimers.get(questId);
  if (timer) {
    clearTimeout(timer);
    reminderTimers.delete(questId);
  }
}

function scheduleReminder(quest) {
  cancelReminder(quest.id);

  if (quest.type !== "reminder" || !quest.remindAt || quest.notifiedAt) {
    return;
  }

  const targetTime = Date.parse(quest.remindAt);
  if (Number.isNaN(targetTime)) {
    return;
  }

  const maxDelay = 2_147_483_647;
  const delay = Math.max(0, targetTime - Date.now());
  const timer = setTimeout(() => {
    reminderTimers.delete(quest.id);
    if (delay > maxDelay) {
      scheduleReminder(quest);
      return;
    }
    void fireReminder(quest.id);
  }, Math.min(delay, maxDelay));

  reminderTimers.set(quest.id, timer);
}

function scheduleAllReminders() {
  for (const questId of Array.from(reminderTimers.keys())) {
    cancelReminder(questId);
  }

  for (const quest of quests) {
    scheduleReminder(quest);
  }
}

function openQuestDetailWindow(questId) {
  const browserWindow = openWindow("quests");
  const sendQuest = () => {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send("quest:show-detail", questId);
    }
  };

  if (browserWindow.webContents.isLoading()) {
    browserWindow.webContents.once("did-finish-load", sendQuest);
  } else {
    setTimeout(sendQuest, 50);
  }
}

function showReminderNotification(quest) {
  return new Promise((resolve) => {
    if (typeof Notification.isSupported === "function" && !Notification.isSupported()) {
      resolve(false);
      return;
    }

    const notification = new Notification({
      title: t("quest.notificationTitle"),
      body: quest.title,
      icon: getAppIcon()
    });

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, 2000);

    notification.once("show", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(true);
      }
    });

    notification.on("click", () => {
      openQuestDetailWindow(quest.id);
    });
    notification.show();
  });
}

async function fireReminder(questId) {
  const quest = findQuest(questId);
  if (!quest || quest.type !== "reminder" || quest.notifiedAt) {
    return;
  }

  const shown = await showReminderNotification(quest);
  if (!shown) {
    return;
  }

  saveQuestRecords(
    quests.map((record) =>
      record.id === quest.id
        ? {
            ...record,
            notifiedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : record
    )
  );
}

function applyLaunchAtLogin(enabled) {
  const options = {
    openAtLogin: Boolean(enabled)
  };

  if (process.platform === "win32" && !app.isPackaged) {
    options.path = process.execPath;
    options.args = [app.getAppPath()];
  }

  app.setLoginItemSettings(options);
}

function saveSettings(nextSettings, options = {}) {
  const shouldApplyLaunchAtLogin = options.applyLaunchAtLogin !== false;
  settings = normalizeSettings(nextSettings, currentVersion());
  store.saveSettings(settings);
  if (shouldApplyLaunchAtLogin) {
    applyLaunchAtLogin(settings.launchAtLogin);
  }
  return settings;
}

function updateWindowTitles() {
  for (const [view, browserWindow] of windows.entries()) {
    if (!browserWindow.isDestroyed()) {
      const config = WINDOW_CONFIG[view] || WINDOW_CONFIG.customization;
      browserWindow.setTitle(t(config.titleKey));
    }
  }
}

function setLanguage(language) {
  settings = normalizeSettings(
    {
      ...settings,
      language: normalizeLanguage(language)
    },
    currentVersion()
  );
  store.saveSettings(settings);
  refreshTrayMenu();
  updateWindowTitles();
  notifyAppState();
  return settings;
}

function createContextMenu() {
  return Menu.buildFromTemplate([
    {
      label: t("tray.customize"),
      click: () => openWindow("customization")
    },
    {
      label: t("tray.inventory"),
      click: () => openWindow("inventory")
    },
    {
      label: t("tray.quests"),
      click: () => openWindow("quests")
    },
    {
      label: t("tray.settings"),
      click: () => openWindow("settings")
    },
    {
      label: t("tray.language"),
      submenu: LANGUAGE_OPTIONS.map((language) => ({
        label: language.label,
        type: "radio",
        checked: currentLanguage() === language.id,
        click: () => setLanguage(language.id)
      }))
    },
    { type: "separator" },
    {
      label: t("tray.about"),
      click: () => openWindow("about")
    },
    {
      label: t("tray.quit"),
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(createContextMenu());
}

function createTray() {
  const initialImage = nativeImage.createFromBuffer(renderTrayCharacterBuffer(character, 0));
  initialImage.setTemplateImage(false);
  tray = new Tray(initialImage);
  tray.setToolTip(`${APP_NAME} - CPU ${Math.round(cpuMonitor.percent)}%`);
  refreshTrayMenu();

  tray.on("click", () => {
    tray.popUpContextMenu(createContextMenu());
  });

  tray.on("right-click", () => {
    tray.popUpContextMenu(createContextMenu());
  });

  cpuMonitor.on("change", (percent) => {
    if (tray) {
      tray.setToolTip(`${APP_NAME} - CPU ${Math.round(percent)}%`);
    }
  });

  trayAnimator = new TrayAnimator(tray, cpuMonitor);
  trayAnimator.updateCharacter(character);
  trayAnimator.start();
}

function openWindow(view) {
  if (windows.has(view)) {
    const existingWindow = windows.get(view);
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.show();
      existingWindow.focus();
      return existingWindow;
    }
  }

  const config = WINDOW_CONFIG[view] || WINDOW_CONFIG.customization;
  const { width, height } = resolveWindowBounds(config);
  const browserWindow = new BrowserWindow({
    title: t(config.titleKey),
    width,
    height,
    minWidth: Math.min(width, 520),
    minHeight: Math.min(height, 360),
    icon: getAppIcon(),
    show: false,
    backgroundColor: "#F6F7F9",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  windows.set(view, browserWindow);

  browserWindow.on("close", () => {
    if (!isQuitting && view === "customization") {
      persistDefaultCharacterIfNeeded();
    }
  });

  browserWindow.on("closed", () => {
    windows.delete(view);
  });

  browserWindow.once("ready-to-show", () => {
    browserWindow.show();
    browserWindow.focus();
  });

  browserWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
    query: { view }
  });

  return browserWindow;
}

function resolveWindowBounds(config) {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workAreaSize;
  const maxWidth = Math.max(420, workArea.width - 80);
  const maxHeight = Math.max(360, workArea.height - 80);

  return {
    width: Math.min(config.width, maxWidth),
    height: Math.min(config.height, maxHeight)
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fitWindowToContent(browserWindow, requestedSize) {
  if (!browserWindow || browserWindow.isDestroyed() || !requestedSize) {
    return;
  }

  const requestedWidth = Number(requestedSize.width);
  const requestedHeight = Number(requestedSize.height);
  if (!Number.isFinite(requestedWidth) || !Number.isFinite(requestedHeight)) {
    return;
  }

  const display = screen.getDisplayMatching(browserWindow.getBounds());
  const [windowWidth, windowHeight] = browserWindow.getSize();
  const [contentWidth, contentHeight] = browserWindow.getContentSize();
  const frameWidth = Math.max(0, windowWidth - contentWidth);
  const frameHeight = Math.max(0, windowHeight - contentHeight);
  const maxContentWidth = Math.max(320, display.workArea.width - 80 - frameWidth);
  const maxContentHeight = Math.max(280, display.workArea.height - 80 - frameHeight);
  const nextContentWidth = clamp(Math.ceil(requestedWidth), 360, maxContentWidth);
  const nextContentHeight = clamp(Math.ceil(requestedHeight), 280, maxContentHeight);

  if (Math.abs(nextContentWidth - contentWidth) > 2 || Math.abs(nextContentHeight - contentHeight) > 2) {
    browserWindow.setContentSize(nextContentWidth, nextContentHeight);
    if (!browserWindow.isVisible()) {
      browserWindow.center();
    }
  }
}

function registerIpcHandlers() {
  ipcMain.handle("state:get", () => getPublicState());

  ipcMain.handle("character:render", (_event, draft, frameIndex, scale) => {
    const normalized = normalizeCharacter(
      { ...character, ...(draft || {}), equipped: (draft && draft.equipped) || character.equipped },
      currentVersion()
    );
    return renderCharacterDataUrl(normalized, frameIndex, scale || 8);
  });

  ipcMain.handle("character:save", (_event, draft) => {
    if (!draft || !isValidHexColor(draft.bodyColor)) {
      throw new Error("Body color must be a valid #RRGGBB hex color.");
    }

    const nextCharacter = {
      ...character,
      gender: draft.gender,
      bodyColor: draft.bodyColor,
      eyeType: draft.eyeType,
      hasCharacter: true
    };

    persistCharacter(nextCharacter);
    return getPublicState();
  });

  ipcMain.handle("character:cancel-customization", () => {
    persistDefaultCharacterIfNeeded();
    return getPublicState();
  });

  ipcMain.handle("inventory:update-equipment", (_event, payload) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid equipment update payload.");
    }

    const { action, itemId, slot } = payload;

    if (action === "unequip") {
      persistCharacter(unequipSlot(character, slot));
    } else {
      persistCharacter(equipItem(character, itemId));
    }

    return getPublicState();
  });

  ipcMain.handle("quest:save", (_event, payload) => {
    const nextQuest = buildQuestFromPayload(payload);
    const others = quests.filter((quest) => quest.id !== nextQuest.id);
    saveQuestRecords([...others, nextQuest]);
    return getPublicState();
  });

  ipcMain.handle("quest:delete", (_event, questId) => {
    const quest = findQuest(questId);
    if (!quest) {
      return getPublicState();
    }

    cancelReminder(quest.id);
    saveQuestRecords(quests.filter((record) => record.id !== quest.id));
    return getPublicState();
  });

  ipcMain.handle("quest:update-status", (_event, payload) => {
    if (!payload || !isValidQuestStatus(payload.status)) {
      throw new Error("Invalid quest status.");
    }

    const quest = findQuest(payload.id);
    if (!quest || !questTypeHasStatus(quest.type)) {
      return getPublicState();
    }

    saveQuestRecords(
      quests.map((record) =>
        record.id === quest.id
          ? {
              ...record,
              status: payload.status,
              updatedAt: new Date().toISOString()
            }
          : record
      )
    );
    return getPublicState();
  });

  ipcMain.handle("quest:open-url", async (_event, questId) => {
    const quest = findQuest(questId);
    if (!quest || quest.type !== "bookmark" || !quest.url) {
      return getPublicState();
    }

    await shell.openExternal(quest.url);
    return getPublicState();
  });

  ipcMain.handle("settings:set-launch-at-login", (_event, enabled) => {
    saveSettings({
      ...settings,
      launchAtLogin: Boolean(enabled)
    });
    return getPublicState();
  });

  ipcMain.handle("settings:set-language", (_event, language) => {
    setLanguage(language);
    return getPublicState();
  });

  ipcMain.handle("update:check", async () => {
    if (!updateManager) {
      return null;
    }

    return localizeUpdateState(await updateManager.checkForUpdates());
  });

  ipcMain.handle("update:download-and-install", async () => {
    if (!updateManager) {
      return null;
    }

    return localizeUpdateState(await updateManager.downloadUpdate(true));
  });

  ipcMain.handle("window:close", (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow) {
      browserWindow.close();
    }
  });

  ipcMain.handle("window:fit-content", (event, size) => {
    fitWindowToContent(BrowserWindow.fromWebContents(event.sender), size);
  });
}

function bootstrap() {
  Menu.setApplicationMenu(null);

  migrateLegacyUserDataIfNeeded();
  store = new AppStore(app.getPath("userData"));

  const storedCharacter = store.loadCharacter();
  firstRunPending = !storedCharacter || storedCharacter.hasCharacter !== true;
  character = firstRunPending
    ? defaultCharacter(currentVersion())
    : normalizeCharacter(storedCharacter, currentVersion());

  settings = normalizeSettings(store.loadSettings(), currentVersion());
  store.saveSettings(settings);
  if (settings.launchAtLogin) {
    applyLaunchAtLogin(true);
  }

  quests = normalizeQuests(store.loadQuests(), currentVersion());
  store.saveQuests(quests);

  cpuMonitor = new CpuMonitor(1000);
  cpuMonitor.start();

  updateManager = new UpdateManager({
    app,
    notifyState: notifyUpdateState,
    beforeInstall: () => {
      isQuitting = true;
    }
  });

  registerIpcHandlers();
  scheduleAllReminders();
  createTray();

  if (process.platform === "darwin" && app.dock) {
    app.dock.hide();
  }

  if (firstRunPending) {
    openWindow("customization");
  }

  setTimeout(() => {
    updateManager.checkAtLaunch();
  }, 1500);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (tray) {
      tray.popUpContextMenu(createContextMenu());
    }
  });

  app.whenReady().then(bootstrap);

  app.on("before-quit", () => {
    isQuitting = true;
    if (trayAnimator) {
      trayAnimator.stop();
    }
    if (cpuMonitor) {
      cpuMonitor.stop();
    }
    for (const questId of Array.from(reminderTimers.keys())) {
      cancelReminder(questId);
    }
  });

  app.on("window-all-closed", () => {});

  app.on("activate", () => {
    if (firstRunPending) {
      openWindow("customization");
    }
  });
}
