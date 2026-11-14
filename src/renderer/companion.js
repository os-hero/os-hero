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
  renderAdventurePanel();
}

function updateCompanionProgress() {
  updateAdventureProgress();
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
