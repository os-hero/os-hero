const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const EventEmitter = require("node:events");

test("renderer subscriptions detach idempotently without returning a non-cloneable IPC object", () => {
  const ipcRenderer = new EventEmitter();
  ipcRenderer.send = () => {};
  let api;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, "../src/preload/preload.js"), "utf8"), {
    require(name) {
      assert.equal(name, "electron");
      return { ipcRenderer, contextBridge: { exposeInMainWorld(_name, exposed) { api = exposed; } } };
    }
  });
  for (const [method, channel] of [["onTrayNavigate", "tray:navigate"], ["onCaptureTraySession", "tray:capture-session"], ["onExpeditionState", "expedition:changed"], ["onAppState", "state:changed"], ["onHeroMotion", "hero:motion"], ["onWalletState", "wallet:changed"], ["onUpdateState", "update:state"], ["onShowQuestDetail", "quest:show-detail"]]) {
    let calls = 0;
    const stop = api[method](() => calls++);
    assert.equal(ipcRenderer.listenerCount(channel), 1);
    ipcRenderer.emit(channel, {}, null); assert.equal(calls, 1);
    assert.equal(stop(), undefined); assert.equal(stop(), undefined);
    assert.equal(ipcRenderer.listenerCount(channel), 0);
    ipcRenderer.emit(channel, {}, null); assert.equal(calls, 1);
  }
});
