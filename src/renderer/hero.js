let registrationBusy = false;
let registrationError = "";

function heroScene(id = "character-preview") {
  return `<div class="hero-scene"><img id="${id}" alt="${textHtml("custom.previewAlt")}" /></div>`;
}

function hairColorOptions(selected) {
  return `<div class="hair-colors" role="group" aria-label="${textHtml("custom.hairColor")}">
    <button class="original-color ${selected === null ? "active" : ""}" data-hair-color="" aria-pressed="${selected === null}">${textHtml("custom.originalHairColor")}</button>
    ${state.hairColors.map((color, i) => `<button class="hair-color ${color === selected ? "active" : ""}" data-hair-color="${color}" title="${textHtml(`hairColor.${i}`)}" aria-label="${textHtml(`hairColor.${i}`)}" aria-pressed="${color === selected}"></button>`).join("")}</div>`;
}

function colorHairButtons(root, onSelect) {
  root.querySelectorAll("[data-hair-color]").forEach(button => {
    if (button.dataset.hairColor) button.style.setProperty("--hair-color", button.dataset.hairColor);
    button.onclick = () => onSelect(button.dataset.hairColor || null);
  });
}

function heroDate(value) {
  return new Date(value).toLocaleDateString(languageLocale(), { year: "numeric", month: "2-digit", day: "2-digit" });
}

function heroBaseDetails(draft) {
  return `<dl class="hero-confirm-details"><dt>${textHtml("custom.gender")}</dt><dd>${escapeHtml(genderName({ id: draft.gender }))}</dd>
    <dt>${textHtml("custom.bodyColor")}</dt><dd>${escapeHtml(draft.bodyColor)}</dd>
    <dt>${textHtml("custom.eyeType")}</dt><dd>${escapeHtml(eyeName({ id: draft.eyeType }))}</dd>
    <dt>${textHtml("custom.hair")}</dt><dd>${draft.equipped.hair ? escapeHtml(itemName({ id: draft.equipped.hair })) : textHtml("custom.noHair")}</dd></dl>`;
}

function renderHeroView() {
  if (state.character.identity) return renderHeroProfile();
  const existing = state.heroRegistrationMode !== "create";
  const registration = trayUi.registration ||= { name: "", confirm: false };
  if (existing) { customizationDraft = null; customizationHairDirty = false; delete trayUi.formValues.customization; }
  const draft = customizationDraft ||= { ...state.character, equipped: { ...state.character.equipped } };
  draft.equipped = { ...state.character.equipped, hair: customizationHairDirty ? draft.equipped.hair : state.character.equipped.hair };
  const confirm = registration.confirm;
  appRoot.innerHTML = `<div class="hero-page" aria-busy="${registrationBusy}">
    <div class="title-row"><h1 class="window-title">${textHtml(confirm ? "hero.confirmTitle" : "hero.register")}</h1><span>${confirm ? 2 : 1} / 2</span></div>
    <div class="hero-columns"><section class="hero-portrait">${heroScene()}<h2 id="hero-preview-name">${escapeHtml(registration.name || text("hero.defaultName"))}</h2><p>${textHtml("hero.preview")}</p></section>
      <section class="hero-fields">
      ${confirm ? `<dl class="hero-confirm-details"><dt>${textHtml("hero.name")}</dt><dd>${escapeHtml(registration.name)}</dd></dl>${heroBaseDetails(draft)}<p class="hero-confirm-note">${textHtml("hero.confirmNote")}</p>` : `
      <label class="hero-field" for="hero-name"><strong>${textHtml("hero.name")}</strong><input id="hero-name" maxlength="24" autocomplete="off" value="${escapeHtml(registration.name)}" /></label>
      ${existing ? `<p class="hero-confirm-note" id="hero-existing-note">${textHtml("hero.existingNote")}</p>${heroBaseDetails(draft)}` : `
      <div class="hero-field"><strong>${textHtml("custom.gender")}</strong><div class="segmented" id="gender-options">${state.genderOptions.map(option => `<button data-gender="${option.id}" class="choice-button ${draft.gender === option.id ? "active" : ""}" aria-pressed="${draft.gender === option.id}">${escapeHtml(genderName(option))}</button>`).join("")}</div></div>
      <div class="hero-field"><label for="body-color">${textHtml("custom.bodyColor")}</label><div class="color-row"><input id="body-color" class="hex-input" value="${escapeHtml(draft.bodyColor)}" maxlength="7" spellcheck="false" /><input id="body-color-picker" class="color-swatch" type="color" value="${draft.bodyColor}" aria-label="${textHtml("custom.bodyColorSwatch")}" /></div></div>
      <label class="hero-field" for="eye-type"><strong>${textHtml("custom.eyeType")}</strong><select id="eye-type">${state.eyeTypes.map(option => `<option value="${option.id}" ${draft.eyeType === option.id ? "selected" : ""}>${escapeHtml(eyeName(option))}</option>`).join("")}</select></label>
      <label class="hero-field" for="hair-style"><strong>${textHtml("custom.hair")}</strong><select id="hair-style"><option value="">${textHtml("custom.noHair")}</option>${state.items.filter(item => item.slot === "hair").map(item => `<option value="${item.id}" ${draft.equipped.hair === item.id ? "selected" : ""}>${escapeHtml(itemName(item))}</option>`).join("")}</select></label>
      <div class="hero-field"><strong>${textHtml("custom.hairColor")}</strong>${hairColorOptions(draft.hairColor)}</div>`}`}
      <p id="registration-error" class="error-text" role="alert">${escapeHtml(registrationError)}</p></section></div>
    <footer class="hero-footer"><button id="registration-back">${textHtml(confirm ? "hero.back" : "hero.later")}</button><span class="hero-lock-note">${textHtml("hero.lock")}</span><button id="save-button" class="primary-button" ${registrationBusy ? "disabled" : ""}>${textHtml(confirm ? "hero.confirm" : "hero.review")}${uiIcon("chevron-right")}</button></footer></div>`;
  const preview = document.getElementById("character-preview");
  startPreviewAnimation(preview, () => draft);
  const error = value => { registrationError = value; document.getElementById("registration-error").textContent = value; };
  const refresh = () => { updatePreview(preview, draft); persistTrayUi(); };
  if (!confirm) {
    document.getElementById("hero-name").oninput = event => {
      registration.name = event.target.value;
      document.getElementById("hero-preview-name").textContent = registration.name || text("hero.defaultName");
      error("");
    };
  }
  if (!confirm && !existing) {
    document.querySelectorAll("[data-gender]").forEach(button => button.onclick = () => { draft.gender = button.dataset.gender; renderHeroView(); persistTrayUi(); });
    document.getElementById("eye-type").onchange = event => { draft.eyeType = event.target.value; refresh(); };
    document.getElementById("hair-style").onchange = event => { draft.equipped.hair = event.target.value || null; customizationHairDirty = true; refresh(); };
    colorHairButtons(appRoot, color => { draft.hairColor = color; renderHeroView(); persistTrayUi(); });
    const color = document.getElementById("body-color");
    const picker = document.getElementById("body-color-picker");
    color.oninput = () => { const valid = isValidHexColor(color.value); document.getElementById("save-button").disabled = !valid || registrationBusy; if (valid) { draft.bodyColor = color.value.toUpperCase(); picker.value = draft.bodyColor; error(""); refresh(); } else error(text("custom.hexError")); };
    picker.oninput = () => { color.value = picker.value; color.dispatchEvent(new Event("input")); };
  }
  document.getElementById("registration-back").onclick = () => {
    if (registrationBusy) return;
    if (confirm) { registration.confirm = false; renderHeroView(); persistTrayUi(); }
    else navigateTray("inventory");
  };
  document.getElementById("save-button").onclick = async () => {
    if (registrationBusy) return;
    const name = registration.name.normalize("NFC").trim();
    if (!name || [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name)].length > 12 || !/^[\p{L}\p{M}\p{N} ._-]+$/u.test(name)) return error(text("hero.nameError"));
    if (!isValidHexColor(document.getElementById("body-color")?.value || draft.bodyColor)) return error(text("custom.hexError"));
    registration.name = name;
    error("");
    if (!confirm) { registration.confirm = true; renderHeroView(); persistTrayUi(); return; }
    registrationBusy = true;
    document.getElementById("save-button").disabled = true;
    try {
      state = await api.registerHero(existing ? { name } : { name, gender: draft.gender, bodyColor: draft.bodyColor, eyeType: draft.eyeType, hair: draft.equipped.hair, hairColor: draft.hairColor });
      customizationDraft = null; customizationHairDirty = false; trayUi.registration = null;
      delete trayUi.formValues.customization;
      renderCurrentView(); persistTrayUi();
    } catch { error(text("hero.saveError")); }
    finally { registrationBusy = false; const button = document.getElementById("save-button"); if (button) button.disabled = false; }
  };
}

function renderHeroProfile() {
  const identity = state.character.identity;
  const battle = state.expedition.battle;
  const stats = battle.stats;
  const journal = state.expedition.adventure?.journal || [];
  appRoot.innerHTML = `<div class="hero-page"><h1 class="window-title">${textHtml("hero.nav")}</h1>
    <div class="hero-columns"><section class="hero-portrait">${heroScene()}<h2>${escapeHtml(identity.name)} <small>Lv. <span id="hero-level">${stats.level}</span></small></h2>
      <p>${textHtml(stats.level >= 10 ? "hero.master" : stats.level >= 3 ? "hero.explorer" : "hero.rookie")}</p><p>${textHtml("hero.registered")} ${escapeHtml(heroDate(identity.registeredAt))}</p></section>
      <section class="hero-stats"><h2>${textHtml("hero.stats")}</h2><dl>${["strength", "dexterity", "vitality", "luck"].map(key => `<div><dt>${textHtml(`hero.${key}`)}</dt><dd id="stat-${key}">${stats[key]}</dd><dd class="muted">${textHtml(`hero.${key}Hint`)}</dd></div>`).join("")}</dl>
      <div class="hero-xp"><strong>${textHtml("hero.xp")}</strong><span id="hero-xp-value">${stats.nextXp ? `${stats.xp} / ${stats.nextXp}` : textHtml("hero.levelMax")}</span></div><progress id="hero-xp" max="100" value="${stats.nextXp ? stats.xp : 100}" aria-label="${textHtml("hero.xp")}"></progress></section></div>
      <section class="hero-journal"><h2>${textHtml("hero.journal")}</h2><ol>${[...journal].reverse().map(entry => `<li><time>${escapeHtml(heroDate(entry.at))}</time><span>${textHtml(entry.kind === "victory" ? "hero.win" : "hero.retreat", { stage: `1-${entry.stage + 1}` })}</span></li>`).join("")}<li><time>${escapeHtml(heroDate(identity.registeredAt))}</time><span>${textHtml("hero.firstMeeting", { name: identity.name })}</span></li></ol></section>
      <footer class="hero-footer"><button id="hero-inventory">${uiIcon("backpack")}${textHtml("tray.inventory")}</button><button id="hero-explore" class="primary-button">${textHtml("hero.toExpedition")}${uiIcon("chevron-right")}</button></footer></div>`;
  startPreviewAnimation(document.getElementById("character-preview"), () => state.character);
  document.getElementById("hero-inventory").onclick = () => navigateTray("inventory");
  document.getElementById("hero-explore").onclick = () => navigateTray("companion");
}

function renderAdventurePanel() {
  if (document.querySelector(".companion-dialog[open]")) { updateAdventureProgress(); return; }
  const identity = state.character.identity;
  appRoot.innerHTML = `<div class="hero-page adventure-page"><div class="title-row"><h1 class="window-title">${textHtml("hero.expedition")}</h1><div class="adventure-quest-actions"><button class="text-command" id="adventure-quests">${textHtml("companion.myQuests")}</button><button class="icon-button" id="companion-add" title="${textHtml("companion.add")}" aria-label="${textHtml("companion.add")}">${uiIcon("plus")}</button></div></div>
    <div class="adventure-heading"><strong>${textHtml("hero.region")} · <span id="adventure-stage"></span></strong><span id="adventure-state"></span><button id="adventure-stage-picker" class="text-command">${textHtml("hero.stageChange")}</button></div>
    <div class="battle-columns"><section class="battle-player">${heroScene("expedition-hero")}<h2>${escapeHtml(identity?.name || text("hero.defaultName"))} <small id="adventure-level"></small></h2><progress id="player-hp" max="40" value="40" aria-label="HP"></progress><span id="player-hp-value"></span></section>
      <section class="battle-enemy"><div class="enemy-art"><img src="../../public/assets/grass-slime.png" alt="${textHtml("hero.slime")}" /></div><h2 id="enemy-name"></h2><progress id="enemy-hp" max="48" value="48" aria-label="${textHtml("hero.slime")} HP"></progress><span id="enemy-hp-value"></span></section></div>
    <div class="adventure-countdown"><span id="adventure-next-label"></span><strong id="adventure-remaining"></strong></div>
    <div class="expedition-reward adventure-reward"><img id="reward-thumbnail" alt="" /><div class="reward-information"><div class="reward-heading"><span>${textHtml("companion.target")}</span><strong id="reward-name"></strong></div><progress id="reward-progress" max="100" value="0" aria-label="${textHtml("companion.target")}"></progress><span id="reward-time"></span></div><button class="text-command" id="reward-change">${textHtml("companion.change")}</button></div>
    <p class="adventure-message" id="companion-notice" role="status">${escapeHtml(companionToast)}</p>
    <footer class="hero-footer"><button id="adventure-profile">${uiIcon("house")}${textHtml("hero.nav")}</button><span id="expedition-daily" class="muted"></span><button id="expedition-toggle" class="primary-button" data-companion-action></button></footer>
    <dialog class="companion-dialog" id="companion-dialog"></dialog></div>`;
  startPreviewAnimation(document.getElementById("expedition-hero"), () => state.character);
  document.getElementById("adventure-quests").onclick = () => navigateTray("quests");
  document.getElementById("companion-add").onclick = openCompanionQuestForm;
  document.getElementById("adventure-profile").onclick = () => navigateTray("customization");
  document.getElementById("reward-change").onclick = openRewardPicker;
  document.getElementById("expedition-toggle").onclick = () => {
    if (!identity) return navigateTray("customization");
    return companionAction(async () => { state.expedition = await api.expeditionAction({ action: state.expedition.running ? "pause" : "start" }); });
  };
  document.getElementById("adventure-stage-picker").onclick = () => {
    const dialog = prepareCompanionDialog(text("hero.stageChange"));
    const unlocked = state.expedition.adventure?.unlocked || 0;
    dialog.querySelector("#dialog-content").innerHTML = `<div class="stage-choices">${Array.from({length: 8}, (_, stage) => `<button data-stage="${stage}" ${stage > unlocked || !identity ? "disabled" : ""}>1-${stage + 1}${stage === 7 ? ` · ${textHtml("hero.boss")}` : ""}</button>`).join("")}</div>`;
    dialog.querySelectorAll("[data-stage]").forEach(button => button.onclick = async () => {
      dialog.querySelectorAll("button").forEach(control => { control.disabled = true; });
      try { state.expedition = await api.selectAdventureStage(Number(button.dataset.stage)); dialog.close(); }
      catch { dialog.close(); companionNotice(text("hero.saveError")); }
    });
    dialog.showModal();
  };
  updateAdventureProgress();
  if (trayUi.dialog === "reward") openRewardPicker();
  if (trayUi.dialog === "quest") openCompanionQuestForm();
}

function updateAdventureProgress() {
  if (!document.getElementById("adventure-stage")) return;
  const e = state.expedition, a = e.adventure, b = e.battle;
  const put = (id, value) => { document.getElementById(id).textContent = value; };
  put("adventure-stage", `1-${(a?.stage || 0) + 1}`);
  put("adventure-state", text(e.running ? a?.restMs ? "hero.resting" : "hero.active" : "hero.paused"));
  put("adventure-level", `Lv. ${b.stats.level}`);
  put("enemy-name", text(b.enemy.boss ? "hero.boss" : "hero.slime"));
  for (const [prefix, hp, max] of [["player", b.hp, b.maxHp], ["enemy", b.enemyHp, b.enemy.hp]]) {
    document.getElementById(`${prefix}-hp`).max = max; document.getElementById(`${prefix}-hp`).value = hp;
    put(`${prefix}-hp-value`, `HP ${hp} / ${max}`);
  }
  put("adventure-next-label", text(a?.restMs ? "hero.recover" : b.outcome === "retreat" ? "hero.untilRetreat" : "hero.nextStage"));
  const seconds = Math.ceil(b.remainingMs / 1000);
  put("adventure-remaining", text("hero.duration", { minutes: Math.floor(seconds / 60), seconds: seconds % 60 }));
  const reward = e.rewards.find(r => r.id === e.targetId), earned = e.unlocked.includes(reward.id);
  put("reward-name", itemName({ id: reward.id }));
  document.getElementById("reward-thumbnail").src = e.thumbnails[reward.id];
  document.getElementById("reward-progress").value = e.progress[reward.id] / (reward.minutes * 60000) * 100;
  put("reward-time", earned ? text("hero.targetDone") : text("companion.time", { value: Math.floor(e.progress[reward.id] / 60000), total: reward.minutes }));
  const capped = e.dailyMs >= e.dailyLimitMs;
  put("expedition-daily", e.clockBlocked ? text("companion.clock") : capped ? text("companion.limit") : text("companion.daily", { value: Math.floor(e.dailyMs / 60000), total: e.dailyLimitMs / 60000 }));
  const toggle = document.getElementById("expedition-toggle");
  toggle.innerHTML = `${uiIcon(e.running ? "pause" : "play")}${textHtml(!state.character.identity ? "hero.registerFirst" : e.running ? "hero.pause" : "hero.start")}`;
  toggle.disabled = companionBusy || (Boolean(state.character.identity) && (capped || e.clockBlocked));
  if (!state.character.identity) put("companion-notice", text("hero.registerPrompt"));
}
