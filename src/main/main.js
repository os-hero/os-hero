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
  ipcMain,
  powerMonitor
} = require("electron");

const { CpuMonitor } = require("./cpu");
const { AppStore } = require("./store");
const { renderCharacterDataUrl, renderTrayCharacterBuffer, renderItemDataUrl } = require("./pixelRenderer");
const { REWARDS, dayKey, normalizeExpedition, changeExpedition, advanceExpedition, publicExpedition } = require("../shared/expedition");
const { companionMessages } = require("../shared/companionMessages");
const { HAIR_COLORS, wardrobeMessages } = require("../shared/wardrobe");
const { TRAY_ROUTES, TRAY_PANEL_SIZE, trayPanelBounds, normalizeTraySession, isOutsideClick } = require("../shared/trayPanel");
const { createOutsideClickMonitor } = require("./outsideClick");
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
  getItemById,
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
const OS_GOLD_MAX = 999_999_999;
const OS_GOLD_SECONDS_PER_GOLD = 5 * 60;
const OS_GOLD_TICK_MS = 30 * 1000;
const OS_GOLD_MAX_TICK_SECONDS = 60;
const TRAY_PANEL_IDLE_DESTROY_MS = 10 * 1000;

app.disableHardwareAcceleration();
app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId("com.themercenary.oshero");
}

if (process.env.OS_HERO_USER_DATA_DIR || process.env.OS_BOY_USER_DATA_DIR) {
  app.setPath("userData", process.env.OS_HERO_USER_DATA_DIR || process.env.OS_BOY_USER_DATA_DIR);
}

let tray = null;
let trayAnimator = null;
let trayPanelWindow = null;
let trayPanelDestroyTimer = null;
let traySession = { route: "companion" };
let outsideClickMonitor = null;
let cpuMonitor = null;
let store = null;
let character = null;
let settings = null;
let quests = [];
let wallet = null;
let expedition = null;
let expeditionTimer = null;
let expeditionTickAt = 0;
let expeditionSavedAt = 0;
let heroPresentation = null;
let updateManager = null;
let firstRunPending = false;
let isQuitting = false;
let runtimeGoldTimer = null;
let lastRuntimeGoldTickAt = 0;
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
    hero: getHeroPresentation(),
    expedition: getExpeditionState(),
    settings: {
      ...settings,
      language,
      version: currentVersion()
    },
    languageOptions: LANGUAGE_OPTIONS,
    messages: { ...getMessages(language), ...companionMessages(language), ...wardrobeMessages(language) },
    hairColors: HAIR_COLORS,
    itemThumbnails,
    eyeTypes: EYE_TYPES,
    genderOptions: GENDER_OPTIONS,
    itemCategories: ITEM_CATEGORIES,
    items: ITEMS.filter((item) => ownsItem(item.id)),
    questTypes: QUEST_TYPES,
    questStatuses: QUEST_STATUSES,
    questPageSize: QUEST_PAGE_SIZE,
    quests: sortQuestsNewestFirst(quests),
    wallet,
    cpuPercent: cpuMonitor ? cpuMonitor.percent : 0,
    update: updateManager ? localizeUpdateState(updateManager.getState()) : null,
    storage: store ? store.paths() : null,
    firstRunPending
  };
}

function ownsItem(id) {
  return Boolean(getItemById(id)?.owned || expedition?.unlocked.includes(id));
}

function getHeroPresentation() {
  const key = JSON.stringify(character);
  if (!heroPresentation || heroPresentation.key !== key) {
    heroPresentation = { key, frames: [0, 1, 2, 3].map((frame) => renderCharacterDataUrl(character, frame, 1)) };
  }
  return heroPresentation;
}

const rewardThumbnails = Object.fromEntries(REWARDS.map(({ id }) => [id, renderItemDataUrl(id)]));
const itemThumbnails = Object.fromEntries(ITEMS.map(({ id }) => [id, renderItemDataUrl(id)]));
function getExpeditionState() {
  return expedition ? { ...publicExpedition(expedition), thumbnails: rewardThumbnails, clockBlocked: dayKey() < expedition.day } : null;
}

function notifyExpedition() {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send("expedition:changed", getExpeditionState());
  }
}

function persistExpedition(next) {
  store.saveExpedition(next);
  expedition = next;
  expeditionSavedAt = performance.now();
}

function settleExpedition(forceSave = false) {
  const now = performance.now();
  const next = advanceExpedition(expedition, now - expeditionTickAt);
  expeditionTickAt = now;
  const unlocked = next.unlocked.length !== expedition.unlocked.length;
  const stopped = expedition.running && !next.running;
  try {
    if (forceSave || unlocked || stopped || now - expeditionSavedAt >= 15000) persistExpedition(next);
    else expedition = next;
  } catch (error) {
    // Never publish an unlock unless its progress and entitlement were saved together.
    expedition = { ...expedition, running: false };
    stopExpeditionTimer();
    notifyExpedition();
    throw error;
  }
  if (!expedition.running) stopExpeditionTimer();
  if (unlocked) notifyAppState();
  else notifyExpedition();
}

function stopExpeditionTimer() {
  if (expeditionTimer) clearInterval(expeditionTimer);
  expeditionTimer = null;
}

function runExpeditionAction(action, targetId) {
  if (expedition.running) settleExpedition(true);
  persistExpedition(changeExpedition(expedition, action, targetId));
  stopExpeditionTimer();
  if (expedition.running) {
    expeditionTickAt = performance.now();
    expeditionTimer = setInterval(() => {
      try { settleExpedition(); } catch { console.error("Expedition checkpoint failed; paused."); }
    }, 1000);
    expeditionTimer.unref();
  }
  notifyExpedition();
  return getExpeditionState();
}

function migrateLegacyUserDataIfNeeded() {
  if (process.env.OS_HERO_USER_DATA_DIR || process.env.OS_BOY_USER_DATA_DIR) return;
  const nextPath = app.getPath("userData");
  const legacyPath = path.join(app.getPath("appData"), LEGACY_APP_NAME);

  if (nextPath === legacyPath || !fs.existsSync(legacyPath)) {
    return;
  }

  fs.mkdirSync(nextPath, { recursive: true });

  for (const fileName of ["character.json", "settings.json", "quests.json", "wallet.json"]) {
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

function notifyWalletState() {
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send("wallet:changed", wallet);
    }
  }
}

function clampGold(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(OS_GOLD_MAX, Math.max(0, Math.floor(number)));
}

function normalizeWallet(input) {
  const source = input && typeof input === "object" ? input : {};
  const remainder = Number(source.runtimeSecondsRemainder);

  return {
    version: currentVersion(),
    gold: clampGold(source.gold),
    runtimeSecondsRemainder: Number.isFinite(remainder)
      ? Math.min(OS_GOLD_SECONDS_PER_GOLD - 1, Math.max(0, Math.floor(remainder)))
      : 0,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString()
  };
}

function saveWallet(nextWallet, options = {}) {
  wallet = normalizeWallet({
    ...nextWallet,
    updatedAt: new Date().toISOString()
  });
  store.saveWallet(wallet);

  if (options.notify !== false) {
    notifyWalletState();
  }

  return wallet;
}

function creditRuntimeGoldSeconds(seconds) {
  if (!wallet || wallet.gold >= OS_GOLD_MAX) {
    return wallet;
  }

  const elapsedSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  if (elapsedSeconds <= 0) {
    return wallet;
  }

  const previousGold = wallet.gold;
  const totalRuntimeSeconds = wallet.runtimeSecondsRemainder + elapsedSeconds;
  const earnedGold = Math.floor(totalRuntimeSeconds / OS_GOLD_SECONDS_PER_GOLD);
  const nextGold = clampGold(previousGold + earnedGold);
  const capped = nextGold >= OS_GOLD_MAX;

  saveWallet(
    {
      ...wallet,
      gold: nextGold,
      runtimeSecondsRemainder: capped ? 0 : totalRuntimeSeconds % OS_GOLD_SECONDS_PER_GOLD
    },
    { notify: false }
  );

  if (nextGold !== previousGold) {
    notifyWalletState();
  }

  return wallet;
}

function settleRuntimeGold() {
  if (expedition && dayKey() !== expedition.day) {
    try {
      persistExpedition(advanceExpedition(expedition, 0));
      notifyExpedition();
    } catch { console.error("Could not refresh expedition date."); }
  }
  const now = Date.now();
  if (!lastRuntimeGoldTickAt) {
    lastRuntimeGoldTickAt = now;
    return wallet;
  }

  const elapsedSeconds = Math.floor((now - lastRuntimeGoldTickAt) / 1000);
  if (elapsedSeconds <= 0) {
    return wallet;
  }

  const creditedSeconds = Math.min(elapsedSeconds, OS_GOLD_MAX_TICK_SECONDS);
  lastRuntimeGoldTickAt =
    elapsedSeconds > OS_GOLD_MAX_TICK_SECONDS ? now : lastRuntimeGoldTickAt + elapsedSeconds * 1000;

  return creditRuntimeGoldSeconds(creditedSeconds);
}

function startRuntimeGoldTimer() {
  lastRuntimeGoldTickAt = Date.now();
  runtimeGoldTimer = setInterval(settleRuntimeGold, OS_GOLD_TICK_MS);
}

function stopRuntimeGoldTimer() {
  if (runtimeGoldTimer) {
    clearInterval(runtimeGoldTimer);
    runtimeGoldTimer = null;
  }
  settleRuntimeGold();
}

function persistCharacter(nextCharacter) {
  const next = normalizeCharacter(nextCharacter, currentVersion());
  next.hasCharacter = true;
  store.saveCharacter(next);
  character = next;
  firstRunPending = false;

  if (trayAnimator) {
    trayAnimator.updateCharacter(character);
  }

  notifyAppState();
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
  const next = normalizeQuests(nextQuests, currentVersion());
  store.saveQuests(next);
  quests = next;
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
  showTrayPanel("quests", questId);
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

function createMoreMenu() {
  return Menu.buildFromTemplate([
    {
      label: t("tray.language"),
      submenu: LANGUAGE_OPTIONS.map((language) => ({
        label: language.label,
        type: "radio",
        checked: currentLanguage() === language.id,
        click: () => setLanguage(language.id)
      }))
    },
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

  tray.setContextMenu(null);
}

function clearTrayPanelDestroyTimer() {
  if (trayPanelDestroyTimer) {
    clearTimeout(trayPanelDestroyTimer);
    trayPanelDestroyTimer = null;
  }
}

function destroyTrayPanelWindow() {
  clearTrayPanelDestroyTimer();
  outsideClickMonitor?.stop();

  if (trayPanelWindow && !trayPanelWindow.isDestroyed()) {
    trayPanelWindow.destroy();
  }

  trayPanelWindow = null;
}

function scheduleTrayPanelDestroy() {
  if (isQuitting || !trayPanelWindow || trayPanelWindow.isDestroyed()) {
    return;
  }

  clearTrayPanelDestroyTimer();
  trayPanelDestroyTimer = setTimeout(() => {
    if (trayPanelWindow && !trayPanelWindow.isDestroyed() && !trayPanelWindow.isVisible()) {
      destroyTrayPanelWindow();
    }
  }, TRAY_PANEL_IDLE_DESTROY_MS);

  if (typeof trayPanelDestroyTimer.unref === "function") {
    trayPanelDestroyTimer.unref();
  }
}

function hideTrayPanel() {
  if (!trayPanelWindow || trayPanelWindow.isDestroyed()) {
    return;
  }

  if (isQuitting) {
    destroyTrayPanelWindow();
    return;
  }

  if (trayPanelWindow.isVisible()) {
    trayPanelWindow.webContents.send("tray:capture-session");
    trayPanelWindow.hide();
  }
  outsideClickMonitor?.stop();
  scheduleTrayPanelDestroy();
}

function positionTrayPanel() {
  if (!tray || !trayPanelWindow || trayPanelWindow.isDestroyed()) {
    return;
  }

  const trayBounds = tray.getBounds();
  const display = screen.getDisplayMatching(trayBounds);
  const workArea = display.workArea;
  trayPanelWindow.setBounds(trayPanelBounds(trayBounds, workArea));
}

function createTrayPanelWindow() {
  if (trayPanelWindow && !trayPanelWindow.isDestroyed()) {
    clearTrayPanelDestroyTimer();
    return trayPanelWindow;
  }

  clearTrayPanelDestroyTimer();

  trayPanelWindow = new BrowserWindow({
    width: TRAY_PANEL_SIZE.width,
    height: TRAY_PANEL_SIZE.height,
    minWidth: 1,
    minHeight: 1,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    transparent: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    hasShadow: true,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  trayPanelWindow.on("blur", () => {
    // macOS uses actual mouse-down events, not keyboard focus loss or native pickers.
    if (process.platform !== "darwin") hideTrayPanel();
    else trayPanelWindow?.webContents.send("tray:capture-session");
  });

  trayPanelWindow.on("close", (event) => {
    if (!isQuitting) event.preventDefault();
  });

  trayPanelWindow.on("closed", () => {
    clearTrayPanelDestroyTimer();
    trayPanelWindow = null;
  });

  trayPanelWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
    query: { view: "tray" }
  });

  return trayPanelWindow;
}

function showTrayPanel(route, questId) {
  const panelWindow = createTrayPanelWindow();
  if (TRAY_ROUTES.has(route)) {
    traySession.route = route;
    if (questId) traySession.questRoute = { mode: "detail", id: questId, editing: false, page: 1 };
    if (!panelWindow.webContents.isLoading()) panelWindow.webContents.send("tray:navigate", { route, questId });
  }
  clearTrayPanelDestroyTimer();
  // Reposition only on open/display changes, never in response to page content.
  if (!panelWindow.isVisible()) positionTrayPanel();
  panelWindow.show();
  panelWindow.focus();
  outsideClickMonitor?.start();
  return panelWindow;
}

function toggleTrayPanel() {
  if (trayPanelWindow?.isVisible()) hideTrayPanel();
  else showTrayPanel();
}

function showTrayContextMenu() {
  hideTrayPanel();
  tray?.popUpContextMenu(createMoreMenu());
}

function createTray() {
  const initialImage = nativeImage.createFromBuffer(renderTrayCharacterBuffer(character, 0));
  initialImage.setTemplateImage(false);
  tray = new Tray(initialImage);
  tray.setToolTip(`${APP_NAME} - CPU ${Math.round(cpuMonitor.percent)}%`);
  refreshTrayMenu();

  tray.on("click", () => {
    toggleTrayPanel();
  });

  tray.on("right-click", () => {
    showTrayContextMenu();
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
  return showTrayPanel(view);
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
  if (browserWindow === trayPanelWindow) return;
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
  ipcMain.handle("tray:get-session", () => normalizeTraySession(traySession));
  ipcMain.on("tray:save-session", (event, session) => {
    if (event.sender !== trayPanelWindow?.webContents) return;
    try { traySession = normalizeTraySession(session); } catch { /* Reject oversized draft snapshots. */ }
  });
  ipcMain.handle("app:quit", () => { isQuitting = true; app.quit(); });
  ipcMain.handle("state:get", () => getPublicState());

  ipcMain.handle("character:render", (_event, draft, frameIndex, scale) => {
    const normalized = normalizeCharacter(
      { ...character, ...(draft || {}), equipped: (draft && draft.equipped) || character.equipped },
      currentVersion()
    );
    const safeFrame = Number.isInteger(frameIndex) && frameIndex >= 0 ? frameIndex % 4 : 0;
    const safeScale = Number.isFinite(scale) ? Math.min(12, Math.max(1, Math.round(scale))) : 8;
    return renderCharacterDataUrl(normalized, safeFrame, safeScale);
  });

  ipcMain.handle("expedition:action", (_event, payload) => {
    if (!payload || !["start", "pause", "select"].includes(payload.action)) throw new Error("Invalid expedition action");
    if (payload.action === "select" && !REWARDS.some(({ id }) => id === payload.targetId)) throw new Error("Unknown reward");
    return runExpeditionAction(payload.action, payload.targetId);
  });

  ipcMain.handle("character:save", (_event, draft) => {
    if (!draft || !isValidHexColor(draft.bodyColor)) {
      throw new Error("Body color must be a valid #RRGGBB hex color.");
    }
    if (Object.hasOwn(draft, "hair") && draft.hair !== null && (getItemById(draft.hair)?.slot !== "hair" || !ownsItem(draft.hair))) {
      throw new Error("Invalid hairstyle");
    }
    if (Object.hasOwn(draft, "hairColor") && draft.hairColor !== null && !HAIR_COLORS.includes(draft.hairColor)) {
      throw new Error("Invalid hair color");
    }

    const nextCharacter = {
      ...character,
      gender: draft.gender,
      bodyColor: draft.bodyColor,
      eyeType: draft.eyeType,
      hairColor: Object.hasOwn(draft, "hairColor") ? draft.hairColor : character.hairColor,
      equipped: { ...character.equipped, hair: Object.hasOwn(draft, "hair") ? draft.hair : character.equipped.hair },
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
    } else if (action === "equip" && ownsItem(itemId)) {
      persistCharacter(equipItem(character, itemId));
    } else {
      throw new Error("Item not owned or invalid action");
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

  ipcMain.handle("quest:open-detail-window", (_event, questId) => {
    if (findQuest(questId)) {
      openQuestDetailWindow(questId);
    }
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

  ipcMain.handle("tray:open-view", (_event, view) => {
    if (TRAY_ROUTES.has(view)) {
      openWindow(view);
    }
    return getPublicState();
  });

  ipcMain.handle("tray:show-menu", () => {
    showTrayContextMenu();
    return getPublicState();
  });

  ipcMain.handle("window:close", (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow === trayPanelWindow) return;
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

  wallet = normalizeWallet(store.loadWallet());
  store.saveWallet(wallet);

  expedition = normalizeExpedition(store.loadExpedition());
  persistExpedition(expedition);
  for (const [slot, id] of Object.entries(character.equipped)) {
    if (id && !ownsItem(id)) character = unequipSlot(character, slot);
  }

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
  outsideClickMonitor = createOutsideClickMonitor(app, (click) => {
    if (trayPanelWindow?.isVisible() && tray && isOutsideClick(click, trayPanelWindow.getBounds(), tray.getBounds(), process.pid)) hideTrayPanel();
  });
  for (const event of ["display-metrics-changed", "display-removed", "display-added"]) {
    screen.on(event, () => { if (trayPanelWindow?.isVisible()) positionTrayPanel(); });
  }
  scheduleAllReminders();
  createTray();
  startRuntimeGoldTimer();
  powerMonitor.on("suspend", () => {
    if (expedition?.running) {
      try { runExpeditionAction("pause"); } catch { console.error("Could not save expedition on suspend."); }
    }
  });
  powerMonitor.on("resume", () => { if (expedition) notifyExpedition(); });

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
      toggleTrayPanel();
    }
  });

  app.whenReady().then(bootstrap);

  app.on("before-quit", () => {
    isQuitting = true;
    updateManager?.stop();
    if (expedition?.running) {
      try { runExpeditionAction("pause"); } catch { console.error("Could not save expedition on exit."); }
    }
    stopExpeditionTimer();
    destroyTrayPanelWindow();
    if (trayAnimator) {
      trayAnimator.stop();
    }
    if (cpuMonitor) {
      cpuMonitor.stop();
    }
    stopRuntimeGoldTimer();
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
