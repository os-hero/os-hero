let companionFrame = 0;
let companionBusy = false;
let companionToast = "";
let companionToastTimer = null;

function uiIcon(name) {
  return `<img class="ui-icon" src="../../public/icons/${name}.svg" alt="" aria-hidden="true" />`;
}

function companionNotice(message) {
  companionToast = message;
  const output = document.getElementById("companion-notice");
  if (output) output.textContent = message;
  clearTimeout(companionToastTimer);
  companionToastTimer = setTimeout(() => {
    companionToast = "";
    const current = document.getElementById("companion-notice");
    if (current) current.textContent = "";
  }, 4000);
}

async function companionAction(action) {
  if (companionBusy) return;
  companionBusy = true;
  document.querySelectorAll("[data-companion-action]").forEach((button) => { button.disabled = true; });
  try { await action(); }
  catch { companionNotice(text("companion.error")); }
  finally {
    companionBusy = false;
    updateCompanionProgress();
    document.querySelectorAll("[data-quest-toggle]").forEach((button) => { button.disabled = false; });
  }
}

function paintCanonicalHero() {
  if (!state?.hero) return;
  document.querySelectorAll("[data-canonical-hero]").forEach((img) => {
    img.src = state.hero.frames[companionFrame];
    img.dataset.heroKey = state.hero.key;
    img.dataset.heroFrame = companionFrame;
  });
}

function startCompanionAnimation() {
  paintCanonicalHero();
}

function companionQuestRows() {
  const quests = sortedQuests().filter((quest) => quest.type === "adventure");
  const visible = [...quests.filter((quest) => quest.status !== "done"), ...quests.filter((quest) => quest.status === "done")].slice(0, 6);
  if (!visible.length) return `<p class="companion-empty">${textHtml("companion.empty")}</p>`;
  return visible.map((quest) => `
    <div class="companion-quest ${quest.status === "done" ? "is-done" : ""} ${quest.status === "in_progress" ? "is-current" : ""}">
      <button class="quest-check icon-button" data-companion-action data-quest-toggle="${escapeHtml(quest.id)}"
        aria-label="${textHtml(quest.status === "done" ? "companion.undo" : "companion.done")}: ${escapeHtml(quest.title)}"
        aria-pressed="${quest.status === "done"}">${quest.status === "done" ? uiIcon("check") : ""}</button>
      <button class="quest-open" data-quest-open="${escapeHtml(quest.id)}"><strong>${escapeHtml(quest.title)}</strong>
        <span>${escapeHtml(questStatusName(quest.status))}</span></button>
    </div>`).join("");
}

function renderCompanionPanel() {
  const dialogOpen = document.querySelector(".companion-dialog[open]");
  if (dialogOpen) {
    paintCanonicalHero();
    updateCompanionProgress();
    return;
  }
  const focusedId = document.activeElement?.id;
  appRoot.innerHTML = `
    <div class="companion-page">
      <div class="companion-body">
        <section class="companion-quests" aria-labelledby="my-quests-title">
          <h1 id="my-quests-title">${textHtml("companion.myQuests")}</h1>
          <div class="companion-quest-list">${companionQuestRows()}</div>
          <button class="text-command add-quest" id="companion-add">${uiIcon("plus")}${textHtml("companion.add")}</button>
          <button class="text-command all-quests" data-open-view="quests">${textHtml("companion.all")}</button>
        </section>
        <section class="companion-expedition" aria-labelledby="expedition-title">
          <h2 id="expedition-title">${textHtml("companion.expedition")}</h2>
          <div class="expedition-stage">
            <div class="expedition-countdown"><span id="expedition-label"></span><strong id="expedition-remaining"></strong></div>
            <img id="expedition-hero" data-canonical-hero alt="${textHtml("custom.previewAlt")}" />
          </div>
          <button class="primary-button expedition-primary" data-companion-action id="expedition-toggle"></button>
          <div class="expedition-meta"><span id="expedition-daily"></span><span id="companion-notice" role="status">${escapeHtml(companionToast)}</span></div>
          <div class="expedition-reward">
            <img id="reward-thumbnail" alt="" />
            <div class="reward-information"><div class="reward-heading"><span>${textHtml("companion.target")}</span><strong id="reward-name"></strong></div>
              <progress id="reward-progress" max="100" value="0" aria-label="${textHtml("companion.time", { value: 0, total: 75 })}"></progress>
              <span id="reward-time"></span>
            </div>
            <button class="text-command" id="reward-change">${textHtml("companion.change")}</button>
          </div>
        </section>
      </div>
      <dialog class="companion-dialog" id="companion-dialog"></dialog>
    </div>`;
  appRoot.querySelectorAll("[data-open-view]").forEach((button) => button.addEventListener("click", () => navigateTray(button.dataset.openView)));
  document.getElementById("companion-add").onclick = openCompanionQuestForm;
  document.getElementById("reward-change").onclick = openRewardPicker;
  document.getElementById("expedition-toggle").onclick = () => companionAction(async () => {
    const expedition = state.expedition;
    if (expedition.unlocked.includes(expedition.targetId)) return navigateTray("inventory");
    state.expedition = await api.expeditionAction({ action: expedition.running ? "pause" : "start" });
  });
  appRoot.querySelectorAll("[data-quest-open]").forEach((button) => button.onclick = () => navigateTray("quests", button.dataset.questOpen));
  appRoot.querySelectorAll("[data-quest-toggle]").forEach((button) => button.onclick = () => companionAction(async () => {
    const quest = state.quests.find(({ id }) => id === button.dataset.questToggle);
    const done = quest.status !== "done";
    await api.updateQuestStatus({ id: quest.id, status: done ? "done" : "todo" });
    if (done) {
      companionNotice(text("companion.completed"));
      document.getElementById("expedition-hero")?.classList.add("hero-celebrate");
    }
  }));
  updateCompanionProgress();
  startCompanionAnimation();
  if (focusedId) document.getElementById(focusedId)?.focus();
  if (trayUi.dialog === "quest") openCompanionQuestForm();
  if (trayUi.dialog === "reward") openRewardPicker();
}

function updateCompanionProgress() {
  const expedition = state?.expedition;
  if (!expedition || !document.getElementById("expedition-toggle")) return;
  const reward = expedition.rewards.find(({ id }) => id === expedition.targetId);
  const progress = expedition.progress[reward.id];
  const earned = expedition.unlocked.includes(reward.id);
  const capped = expedition.dailyMs >= expedition.dailyLimitMs;
  const put = (id, value) => { document.getElementById(id).textContent = value; };
  put("expedition-label", text(earned ? "companion.newReward" : expedition.clockBlocked ? "companion.clock" : capped ? "companion.limit" : "companion.nextReward"));
  put("expedition-remaining", earned ? itemName({ id: reward.id }) : text("companion.minutes", { value: Math.ceil((reward.minutes * 60000 - progress) / 60000) }));
  document.getElementById("expedition-remaining").classList.toggle("is-complete", earned);
  const label = earned ? "companion.inventory" : expedition.running ? "companion.pause" : progress > 0 ? "companion.resume" : "companion.start";
  const button = document.getElementById("expedition-toggle");
  if (button.dataset.label !== label) {
    button.innerHTML = `${uiIcon(earned ? "backpack" : expedition.running ? "pause" : "play")}${textHtml(label)}`;
    button.dataset.label = label;
  }
  button.disabled = companionBusy || (!earned && (capped || expedition.clockBlocked));
  put("expedition-daily", text("companion.daily", { value: Math.floor(expedition.dailyMs / 60000), total: expedition.dailyLimitMs / 60000 }));
  put("reward-name", itemName({ id: reward.id }));
  const thumbnail = document.getElementById("reward-thumbnail");
  if (thumbnail.dataset.item !== reward.id) { thumbnail.src = expedition.thumbnails[reward.id]; thumbnail.dataset.item = reward.id; }
  const progressBar = document.getElementById("reward-progress");
  progressBar.value = progress / (reward.minutes * 60000) * 100;
  const time = text("companion.time", { value: Math.floor(progress / 60000), total: reward.minutes });
  progressBar.setAttribute("aria-label", time);
  put("reward-time", time);
}

function prepareCompanionDialog(title) {
  const dialog = document.getElementById("companion-dialog");
  dialog.setAttribute("aria-labelledby", "companion-dialog-title");
  dialog.innerHTML = `<header><h2 id="companion-dialog-title">${escapeHtml(title)}</h2><button class="icon-button" id="dialog-close" aria-label="${textHtml("companion.close")}">${uiIcon("x")}</button></header><div id="dialog-content"></div>`;
  dialog.querySelector("#dialog-close").onclick = () => dialog.close();
  dialog.onclose = () => { trayUi.dialog = null; persistTrayUi(); renderCompanionPanel(); document.getElementById("companion-add")?.focus(); };
  return dialog;
}

function openCompanionQuestForm() {
  trayUi.dialog = "quest";
  const dialog = prepareCompanionDialog(text("companion.add"));
  dialog.querySelector("#dialog-content").innerHTML = `<form id="quick-quest-form"><label for="quick-quest-title">${textHtml("companion.title")}</label>
    <input id="quick-quest-title" name="title" maxlength="160" required autocomplete="off" value="${escapeHtml(trayUi.quickQuest)}" />
    <p id="quick-quest-error" role="alert"></p><div class="action-row"><button class="primary-button" type="submit">${textHtml("common.save")}</button></div></form>`;
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const input = document.getElementById("quick-quest-title");
    if (!input.value.trim()) return input.focus();
    const button = dialog.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await api.saveQuest({ type: "adventure", title: input.value.trim(), status: "todo", body: "" });
      trayUi.quickQuest = "";
      input.value = "";
      dialog.close();
    } catch { document.getElementById("quick-quest-error").textContent = text("companion.error"); button.disabled = false; }
  };
  dialog.showModal();
  dialog.querySelector("input").focus();
}

function openRewardPicker() {
  trayUi.dialog = "reward";
  const dialog = prepareCompanionDialog(text("companion.goalDialog"));
  dialog.querySelector("#dialog-content").innerHTML = state.expedition.rewards.map((reward) => {
    const earned = state.expedition.unlocked.includes(reward.id);
    return `<button class="reward-choice" data-reward="${reward.id}" ${earned ? "disabled" : ""}>
      <img src="${state.expedition.thumbnails[reward.id]}" alt="" /><span><strong>${escapeHtml(itemName({ id: reward.id }))}</strong>
      <small>${earned ? textHtml("companion.earned") : textHtml("companion.time", { value: Math.floor(state.expedition.progress[reward.id] / 60000), total: reward.minutes })}</small></span>
      ${reward.id === state.expedition.targetId ? uiIcon("check") : ""}</button>`;
  }).join("");
  dialog.querySelectorAll("[data-reward]").forEach((button) => button.onclick = async () => {
    button.disabled = true;
    try {
      state.expedition = await api.expeditionAction({ action: "select", targetId: button.dataset.reward });
      dialog.close();
    } catch { button.disabled = false; companionNotice(text("companion.error")); }
  });
  dialog.showModal();
}

window.addEventListener("beforeunload", () => clearTimeout(companionToastTimer));
