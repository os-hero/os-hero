const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getState: () => ipcRenderer.invoke("state:get"),
  renderCharacter: (character, frameIndex, scale) =>
    ipcRenderer.invoke("character:render", character, frameIndex, scale),
  saveCharacter: (draft) => ipcRenderer.invoke("character:save", draft),
  cancelCustomization: () => ipcRenderer.invoke("character:cancel-customization"),
  updateEquipment: (payload) => ipcRenderer.invoke("inventory:update-equipment", payload),
  saveQuest: (payload) => ipcRenderer.invoke("quest:save", payload),
  deleteQuest: (id) => ipcRenderer.invoke("quest:delete", id),
  updateQuestStatus: (payload) => ipcRenderer.invoke("quest:update-status", payload),
  openQuestUrl: (id) => ipcRenderer.invoke("quest:open-url", id),
  openQuestDetailWindow: (id) => ipcRenderer.invoke("quest:open-detail-window", id),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke("settings:set-launch-at-login", enabled),
  setLanguage: (language) => ipcRenderer.invoke("settings:set-language", language),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadAndInstallUpdate: () => ipcRenderer.invoke("update:download-and-install"),
  openTrayView: (view) => ipcRenderer.invoke("tray:open-view", view),
  showTrayMenu: () => ipcRenderer.invoke("tray:show-menu"),
  fitWindowToContent: (size) => ipcRenderer.invoke("window:fit-content", size),
  onAppState: (callback) => {
    const listener = (_event, nextState) => callback(nextState);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
  onUpdateState: (callback) => {
    const listener = (_event, updateState) => callback(updateState);
    ipcRenderer.on("update:state", listener);
    return () => ipcRenderer.removeListener("update:state", listener);
  },
  onShowQuestDetail: (callback) => {
    const listener = (_event, questId) => callback(questId);
    ipcRenderer.on("quest:show-detail", listener);
    return () => ipcRenderer.removeListener("quest:show-detail", listener);
  },
  closeWindow: () => ipcRenderer.invoke("window:close")
};

contextBridge.exposeInMainWorld("osHeroApi", api);
contextBridge.exposeInMainWorld("osBoyApi", api);
