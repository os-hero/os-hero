let trayRoute = "companion";
let trayUi = { scroll: {}, formValues: {}, dialog: null, quickQuest: "" };
let traySessionTimer = null;

function currentView() { return view === "tray" ? trayRoute : view; }

function trayFormKey() {
  return trayRoute === "quests" ? `quests:${questRoute.id || "new"}:${questRoute.type || "adventure"}` : trayRoute;
}

function captureTrayUi() {
  if (view !== "tray") return;
  if (appRoot.id === "tray-page") trayUi.scroll[trayRoute] = appRoot.scrollTop;
  const values = {};
  if (["customization", "quests"].includes(trayRoute)) {
    appRoot.querySelectorAll("input[id], textarea[id], select[id]").forEach((input) => {
      if (trayRoute === "customization" && input.id !== "body-color") return;
      values[input.id] = input.type === "checkbox" ? input.checked : input.value;
    });
    if (Object.keys(values).length) trayUi.formValues[trayFormKey()] = values;
  }
  const quick = document.getElementById("quick-quest-title");
  if (quick) trayUi.quickQuest = quick.value;
  const list = document.querySelector(".item-list");
  if (list) inventoryRoute.scroll.set(inventoryRoute.tab, list.scrollTop);
}

function persistTrayUi() {
  if (view !== "tray") return;
  clearTimeout(traySessionTimer);
  captureTrayUi();
  api.saveTraySession({
    ...trayUi, route: trayRoute, customizationDraft, customizationHairDirty, questRoute,
    hasUnsavedChanges: hasUnsavedTrayChanges(),
    inventory: { tab: inventoryRoute.tab, item: inventoryRoute.item, previewEquipped: inventoryRoute.previewEquipped, scroll: [...inventoryRoute.scroll] }
  });
}

function hasUnsavedTrayChanges() {
  if ((trayUi.quickQuest || "").trim()) return true;
  if (customizationDraft) {
    for (const field of ["gender", "bodyColor", "eyeType", "hairColor"])
      if (customizationDraft[field] !== state.character[field]) return true;
    if (customizationHairDirty && customizationDraft.equipped.hair !== state.character.equipped.hair) return true;
  }
  const rawColor = trayUi.formValues.customization?.["body-color"];
  if (rawColor !== undefined && rawColor.toUpperCase() !== state.character.bodyColor.toUpperCase()) return true;
  for (const [key, fields] of Object.entries(trayUi.formValues)) {
    if (!key.startsWith("quests:")) continue;
    const existing = state.quests.find(quest => quest.id === key.split(":")[1]);
    const baseline = { "quest-title": existing?.title || "", "quest-body": existing?.body || "",
      "quest-url": existing?.url || "", "quest-status": existing?.status || "todo", "quest-remind-at": toDateTimeLocal(existing?.remindAt) };
    if (Object.entries(fields).some(([id, value]) => value !== baseline[id])) return true;
  }
  return false;
}

function scheduleTrayUiSave() {
  if (view !== "tray") return;
  clearTimeout(traySessionTimer);
  traySessionTimer = setTimeout(persistTrayUi, 60);
}

function restoreTraySession(session) {
  trayRoute = session.route || "companion";
  customizationDraft = session.customizationDraft || null;
  customizationHairDirty = Boolean(session.customizationHairDirty);
  if (session.questRoute) questRoute = session.questRoute;
  if (session.inventory) {
    inventoryRoute.tab = session.inventory.tab || "hair";
    inventoryRoute.item = session.inventory.item || null;
    inventoryRoute.previewEquipped = session.inventory.previewEquipped === true;
    inventoryRoute.scroll = new Map(session.inventory.scroll || []);
  }
  trayUi = { scroll: session.scroll || {}, formValues: session.formValues || {}, dialog: session.dialog || null, quickQuest: session.quickQuest || "" };
}

function restoreTrayForm() {
  if (view !== "tray") return;
  for (const [id, value] of Object.entries(trayUi.formValues[trayFormKey()] || {})) {
    if (trayRoute === "customization" && id !== "body-color") continue;
    const input = document.getElementById(id);
    if (!input || !appRoot.contains(input)) continue;
    if (input.type === "checkbox") input.checked = Boolean(value);
    else input.value = value;
  }
  appRoot.scrollTop = trayUi.scroll[trayRoute] || 0;
  if (trayRoute === "customization") document.getElementById("body-color")?.dispatchEvent(new Event("input"));
}

function clearTrayForm() {
  delete trayUi.formValues[trayFormKey()];
}

function ensureTrayShell() {
  const root = document.getElementById("app");
  if (!document.getElementById("tray-page")) {
    root.innerHTML = `<div class="tray-shell">
      <header class="tray-shell-header"><img class="companion-avatar" data-canonical-hero alt="${textHtml("custom.previewAlt")}" />
        <strong>OS Hero</strong><button class="icon-button" id="tray-settings" data-tray-route="settings"></button>
      </header><div id="update-applied-notice" class="update-applied-notice" hidden role="status"></div>
      <div class="tray-shell-body"><nav class="tray-rail" aria-label="${textHtml("tray.panelNav")}"></nav>
        <section id="tray-page" class="tray-page" tabindex="-1"></section>
      </div><div id="tray-status" class="tray-status" role="status"></div>
    </div>`;
    document.getElementById("tray-page").addEventListener("scroll", scheduleTrayUiSave);
  }
  appRoot = document.getElementById("tray-page");
  appRoot.dataset.route = trayRoute;
  const settings = document.getElementById("tray-settings");
  settings.innerHTML = uiIcon("settings");
  settings.title = text("tray.settings");
  settings.setAttribute("aria-label", text("tray.settings"));
  settings.classList.toggle("active", ["settings", "about", "updates"].includes(trayRoute));
  paintUpdateIndicator();
  const applied = document.getElementById("update-applied-notice");
  if (state.update?.appliedVersion && applied.hidden) {
    applied.hidden = false;
    applied.innerHTML = `<span>${escapeHtml(text("update.applied", { version: state.update.appliedVersion }))}</span><button id="applied-notes">${textHtml("update.releaseNotes")}</button><button class="icon-button" id="applied-dismiss" aria-label="${textHtml("update.dismiss")}">${uiIcon("x")}</button>`;
    document.getElementById("applied-notes").onclick = () => api.openUpdateLink("notes");
    document.getElementById("applied-dismiss").onclick = () => { applied.hidden = true; };
    requestAnimationFrame(() => api.acknowledgeUpdate());
  }
  settings.onclick = () => navigateTray("settings");
  document.querySelector(".tray-rail").innerHTML = [
    ["customization", "house", "tray.customize"], ["inventory", "backpack", "tray.inventory"], ["companion", "clipboard-list", "tray.quests"]
  ].map(([route, icon, label]) => `<button data-tray-route="${route}" title="${textHtml(label)}" aria-label="${textHtml(label)}"
    ${trayRoute === route || (route === "companion" && trayRoute === "quests") ? 'aria-current="page"' : ""}>
    ${uiIcon(icon)}<span>${textHtml(label)}</span></button>`).join("");
  document.querySelectorAll(".tray-rail [data-tray-route]").forEach((button) => {
    button.onclick = () => navigateTray(button.dataset.trayRoute);
  });
  startCompanionAnimation();
}

function navigateTray(route, questId) {
  if (view !== "tray") return api.openTrayView(route);
  if (!["companion", "customization", "inventory", "quests", "settings", "about", "updates"].includes(route)) return;
  captureTrayUi();
  trayRoute = route;
  if (questId) questRoute = { mode: "detail", id: questId, type: null, editing: false, page: 1 };
  renderCurrentView();
  persistTrayUi();
  appRoot.focus({ preventScroll: true });
}

function trayNotice(message) {
  const notice = document.getElementById("tray-status");
  if (!notice) return;
  notice.textContent = message;
  setTimeout(() => { if (notice.textContent === message) notice.textContent = ""; }, 3000);
}

function renderTraySettings() {
  appRoot.innerHTML = `<div class="settings-content"><h1 class="window-title">${textHtml("window.settings")}</h1>
    <div class="settings-rows">
      <label class="settings-row" for="launch-at-login"><span>${textHtml("settings.launchAtLogin")}</span>
        <input class="switch" role="switch" type="checkbox" id="launch-at-login" ${state.settings.launchAtLogin ? "checked" : ""} /></label>
      <label class="settings-row" for="settings-language"><span>${textHtml("settings.language")}</span><select id="settings-language">
        ${state.languageOptions.map((language) => `<option value="${language.id}" ${language.id === state.settings.language ? "selected" : ""}>${escapeHtml(language.label)}</option>`).join("")}
      </select></label>
      <label class="settings-row" for="auto-download-updates"><span>${textHtml("settings.autoDownload")}</span>
        <input class="switch" role="switch" type="checkbox" id="auto-download-updates" ${state.settings.autoDownloadUpdates !== false ? "checked" : ""} /></label>
      <button class="settings-row settings-command" id="settings-about"><span>${textHtml("window.about")}</span>${uiIcon("chevron-right")}</button>
      <button class="settings-row settings-command" id="settings-updates"><span>${textHtml("common.update")}</span><span id="settings-update-status">${state.update?.readyVersion ? textHtml("update.readyLabel") : ""}</span>${uiIcon("chevron-right")}</button>
    </div><button class="quit-command" id="quit-app">${textHtml("tray.quit")}</button><p id="settings-error" class="error-text" role="alert"></p></div>`;
  document.getElementById("settings-about").onclick = () => navigateTray("about");
  document.getElementById("settings-updates").onclick = () => navigateTray("updates");
  document.getElementById("quit-app").onclick = () => api.quitApp();
  const changeSetting = async (input, action) => {
    input.disabled = true;
    try { state = await action(); renderCurrentView(); }
    catch { document.getElementById("settings-error").textContent = text("companion.error"); input.disabled = false; }
  };
  const login = document.getElementById("launch-at-login");
  login.onchange = () => changeSetting(login, () => api.setLaunchAtLogin(login.checked));
  const language = document.getElementById("settings-language");
  language.onchange = () => changeSetting(language, () => api.setLanguage(language.value));
  const automatic = document.getElementById("auto-download-updates");
  automatic.onchange = () => changeSetting(automatic, () => api.setAutoDownloadUpdates(automatic.checked));
}

function paintUpdateIndicator() {
  const ready = Boolean(state.update?.readyVersion);
  const settings = document.getElementById("tray-settings");
  if (settings) {
    settings.classList.toggle("update-ready", ready);
    settings.title = text("tray.settings") + (ready ? `: ${text("update.readyLabel")}` : "");
    settings.setAttribute("aria-label", settings.title);
  }
  const label = document.getElementById("settings-update-status");
  if (label) label.textContent = ready ? text("update.readyLabel") : "";
}

function renderTrayUpdates() {
  appRoot.innerHTML = `<div><div class="title-row"><h1 class="window-title">${textHtml("common.update")}</h1>
    <button id="back-settings">${textHtml("common.back")}</button></div>
    <section class="update-panel" id="update-panel">${renderUpdatePanelContent(state.update)}</section></div>`;
  document.getElementById("back-settings").onclick = () => navigateTray("settings");
  bindUpdatePanelEvents();
}

document.addEventListener("input", scheduleTrayUiSave);
document.addEventListener("change", scheduleTrayUiSave);
document.addEventListener("click", scheduleTrayUiSave);
document.addEventListener("visibilitychange", () => { if (document.hidden) persistTrayUi(); });
window.addEventListener("beforeunload", persistTrayUi);
