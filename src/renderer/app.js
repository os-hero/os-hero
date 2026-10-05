let appRoot = document.getElementById("app");
const api = window.osHeroApi || window.osBoyApi;
const view = new URLSearchParams(window.location.search).get("view") || "customization";
document.body.classList.toggle("tray-window", view === "tray");
document.documentElement.classList.toggle("inventory-window", view === "inventory");

let state = null;
let previewTimer = null;
let previewFrame = 0;
let updateUnsubscribe = null;
let stateUnsubscribe = null;
let walletUnsubscribe = null;
let questDetailUnsubscribe = null;
let expeditionUnsubscribe = null;
let customizationDraft = null;
let customizationHairDirty = false;
const inventoryRoute = { tab: "hair", item: null, scroll: new Map() };
const previewRequests = new WeakMap();
const CHARACTER_PREVIEW_SCALE = 8;
let questRoute = {
  mode: "list",
  type: null,
  id: null,
  editing: false,
  page: 1
};

function isValidHexColor(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMessage(template, values) {
  if (!values) {
    return template;
  }

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`;
  });
}

function text(key, values) {
  const template = (state && state.messages && state.messages[key]) || key;
  return formatMessage(template, values);
}

function textHtml(key, values) {
  return escapeHtml(text(key, values));
}

function languageLocale() {
  if (!state || !state.settings) {
    return "en-US";
  }

  if (state.settings.language === "ko") {
    return "ko-KR";
  }

  if (state.settings.language === "zh-CN") {
    return "zh-CN";
  }

  return "en-US";
}

function formatNumber(value) {
  const number = Number(value);
  return new Intl.NumberFormat(languageLocale()).format(Number.isFinite(number) ? Math.floor(number) : 0);
}

function currentGold() {
  return state && state.wallet ? state.wallet.gold : 0;
}

function updateInventoryGoldDisplay() {
  const goldValue = document.getElementById("inventory-gold-value");
  if (goldValue) {
    goldValue.textContent = formatNumber(currentGold());
  }
}

function categoryName(category) {
  return text(`category.${category}`);
}

function itemName(item) {
  return text(`item.${item.id}`);
}

function eyeName(eyeType) {
  return text(`eye.${eyeType.id}.name`);
}

function eyeDescription(eyeType) {
  return text(`eye.${eyeType.id}.description`);
}

function genderName(gender) {
  return text(`gender.${gender.id}.name`);
}

function genderDescription(gender) {
  return text(`gender.${gender.id}.description`);
}

async function updatePreview(imgElement, character, scale = CHARACTER_PREVIEW_SCALE) {
  const request = (previewRequests.get(imgElement) || 0) + 1;
  previewRequests.set(imgElement, request);
  const canonical = JSON.stringify(character) === state.hero?.key;
  const src = canonical ? state.hero.frames[previewFrame] : await api.renderCharacter(character, previewFrame, 1);
  if (imgElement.isConnected && previewRequests.get(imgElement) === request) {
    imgElement.src = src;
    imgElement.dataset.heroKey = canonical ? state.hero.key : "draft";
  }
}

function startPreviewAnimation(imgElement, getCharacter, scale = CHARACTER_PREVIEW_SCALE) {
  if (previewTimer) {
    clearInterval(previewTimer);
  }

  const render = () => {
    if (document.hidden) return;
    previewFrame = (previewFrame + 1) % 4;
    updatePreview(imgElement, getCharacter(), scale).catch(() => {});
  };

  // Paint once even during initial hidden load; later animation stays paused while hidden.
  updatePreview(imgElement, getCharacter(), scale).catch(() => {});
  previewTimer = setInterval(render, 420);
}

function renderPreviewPane(note) {
  return `
    <section class="preview-pane">
      <div class="preview-frame">
        <img id="character-preview" alt="${textHtml("custom.previewAlt")}" />
      </div>
      <p class="preview-note">${escapeHtml(note)}</p>
    </section>
  `;
}

function requestWindowFit() {
  if (view === "tray") return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const rect = appRoot.getBoundingClientRect();
      api.fitWindowToContent({
        width: Math.ceil(Math.max(appRoot.scrollWidth, rect.width)),
        height: Math.ceil(Math.max(appRoot.scrollHeight, rect.height))
      });
    });
  });
}

function renderCustomization() {
  let draft = customizationDraft || {
    ...state.character,
    equipped: { ...state.character.equipped }
  };
  draft.equipped = { ...state.character.equipped, hair: customizationHairDirty ? draft.equipped.hair : state.character.equipped.hair };
  customizationDraft = draft;

  appRoot.innerHTML = `
    <div>
      <h1 class="window-title">${textHtml("window.customization")}</h1>
      <div class="split">
        ${renderPreviewPane(text("custom.previewNote"))}
        <section class="form-pane">
          <div class="field-group">
            <span class="field-title">${textHtml("custom.gender")}</span>
            <div class="segmented" id="gender-options">
              ${state.genderOptions
                .map(
                  (gender) => `
                    <button class="choice-button ${draft.gender === gender.id ? "active" : ""}" data-gender="${gender.id}">
                      <strong>${escapeHtml(genderName(gender))}</strong>
                      <span>${escapeHtml(genderDescription(gender))}</span>
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
          <div class="field-group">
            <label class="field-title" for="hair-style">${textHtml("custom.hair")}</label>
            <select id="hair-style">
              <option value="">${textHtml("custom.noHair")}</option>
              ${state.items.filter((item) => item.slot === "hair").map((item) => `<option value="${item.id}" ${draft.equipped.hair === item.id ? "selected" : ""}>${escapeHtml(itemName(item))}</option>`).join("")}
            </select>
          </div>
          <div class="field-group">
            <span class="field-title">${textHtml("custom.hairColor")}</span>
            <div class="hair-colors" role="group" aria-label="${textHtml("custom.hairColor")}">
              <button class="original-color ${draft.hairColor === null ? "active" : ""}" data-hair-color="" aria-pressed="${draft.hairColor === null}">${textHtml("custom.originalHairColor")}</button>
              ${state.hairColors.map((color, i) => `<button class="hair-color ${draft.hairColor === color ? "active" : ""}" data-hair-color="${color}" title="${textHtml(`hairColor.${i}`)}" aria-label="${textHtml(`hairColor.${i}`)}" aria-pressed="${draft.hairColor === color}"></button>`).join("")}
            </div>
          </div>
          <div class="field-group">
            <span class="field-title">${textHtml("custom.eyeType")}</span>
            <div class="segmented" id="eye-options">
              ${state.eyeTypes
                .map(
                  (eyeType) => `
                    <button class="choice-button ${draft.eyeType === eyeType.id ? "active" : ""}" data-eye="${eyeType.id}">
                      <strong>${escapeHtml(eyeName(eyeType))}</strong>
                      <span>${escapeHtml(eyeDescription(eyeType))}</span>
                    </button>
                  `
                )
                .join("")}
            </div>
          </div>
          <div class="field-group">
            <label class="field-title" for="body-color">${textHtml("custom.bodyColor")}</label>
            <div class="color-row">
              <input class="hex-input" id="body-color" value="${escapeHtml(draft.bodyColor)}" maxlength="7" spellcheck="false" />
              <input class="color-swatch" id="body-color-picker" type="color" value="${escapeHtml(draft.bodyColor)}" aria-label="${textHtml("custom.bodyColorSwatch")}" />
            </div>
            <p class="error-text" id="color-error"></p>
          </div>
          <div class="action-row">
            <button id="cancel-button">${textHtml("common.cancel")}</button>
            <button class="primary-button" id="save-button">${textHtml("common.save")}</button>
          </div>
        </section>
      </div>
    </div>
  `;

  const preview = document.getElementById("character-preview");
  const genderOptions = document.getElementById("gender-options");
  const eyeOptions = document.getElementById("eye-options");
  const colorInput = document.getElementById("body-color");
  const colorPicker = document.getElementById("body-color-picker");
  const colorError = document.getElementById("color-error");
  const saveButton = document.getElementById("save-button");
  const cancelButton = document.getElementById("cancel-button");

  document.getElementById("hair-style").addEventListener("change", (event) => {
    draft.equipped.hair = event.target.value || null;
    customizationHairDirty = true;
    updatePreview(preview, draft);
  });
  appRoot.querySelectorAll("[data-hair-color]").forEach((button) => {
    if (button.dataset.hairColor) button.style.setProperty("--hair-color", button.dataset.hairColor);
    button.addEventListener("click", () => {
      draft.hairColor = button.dataset.hairColor || null;
      appRoot.querySelectorAll("[data-hair-color]").forEach((option) => {
        const active = (option.dataset.hairColor || null) === draft.hairColor;
        option.classList.toggle("active", active);
        option.setAttribute("aria-pressed", String(active));
      });
      updatePreview(preview, draft);
    });
  });

  const validate = () => {
    const valid = isValidHexColor(colorInput.value);
    colorError.textContent = valid ? "" : text("custom.hexError");
    saveButton.disabled = !valid;
    return valid;
  };

  const syncPreview = () => {
    if (!validate()) {
      return;
    }

    draft = {
      ...draft,
      bodyColor: colorInput.value.toUpperCase()
    };
    customizationDraft = draft;
    colorInput.value = draft.bodyColor;
    colorPicker.value = draft.bodyColor;
    updatePreview(preview, draft);
  };

  genderOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gender]");
    if (!button) {
      return;
    }

    draft.gender = button.dataset.gender;
    genderOptions.querySelectorAll("button").forEach((option) => {
      option.classList.toggle("active", option.dataset.gender === draft.gender);
    });
    updatePreview(preview, draft);
  });

  eyeOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-eye]");
    if (!button) {
      return;
    }

    draft.eyeType = button.dataset.eye;
    eyeOptions.querySelectorAll("button").forEach((option) => {
      option.classList.toggle("active", option.dataset.eye === draft.eyeType);
    });
    updatePreview(preview, draft);
  });

  colorInput.addEventListener("input", () => {
    if (isValidHexColor(colorInput.value)) {
      syncPreview();
    } else {
      validate();
    }
  });

  colorPicker.addEventListener("input", () => {
    colorInput.value = colorPicker.value.toUpperCase();
    syncPreview();
  });

  saveButton.addEventListener("click", async () => {
    if (!validate()) {
      return;
    }

    saveButton.disabled = true;
    try {
      await api.saveCharacter({
        gender: draft.gender,
        bodyColor: colorInput.value.toUpperCase(),
        eyeType: draft.eyeType,
        hair: draft.equipped.hair,
        hairColor: draft.hairColor
      });
      if (view === "tray") {
        customizationDraft = null;
        customizationHairDirty = false;
        clearTrayForm();
        state = await api.getState();
        renderCurrentView();
        persistTrayUi();
        trayNotice(text("companion.saved"));
      } else await api.closeWindow();
    } catch {
      colorError.textContent = text("companion.error");
      saveButton.disabled = false;
    }
  });

  cancelButton.addEventListener("click", async () => {
    await api.cancelCustomization();
    if (view === "tray") {
      customizationDraft = null;
      customizationHairDirty = false;
      clearTrayForm();
      renderCurrentView();
      persistTrayUi();
    } else await api.closeWindow();
  });

  startPreviewAnimation(preview, () => draft);
  requestWindowFit();
}

function renderInventory() {
  let currentTab = inventoryRoute.tab;
  let selectedItemId = inventoryRoute.item;
  const scrollTopByTab = inventoryRoute.scroll;

  const rememberScroll = () => {
    const itemList = appRoot.querySelector(".item-list");
    if (itemList) {
      scrollTopByTab.set(currentTab, itemList.scrollTop);
    }
  };

  const restoreScroll = () => {
    const itemList = appRoot.querySelector(".item-list");
    if (itemList) {
      itemList.scrollTop = scrollTopByTab.get(currentTab) || 0;
    }
  };

  const buttonLabel = (item) => {
    if (!item) {
      return text("inventory.equip");
    }

    const isEquipped = state.character.equipped[item.slot] === item.id;
    if (!isEquipped) {
      return text("inventory.equip");
    }

    return item.slot === "clothes" ? text("inventory.equipped") : text("inventory.unequip");
  };

  const render = () => {
    const filteredItems = state.items.filter((item) => item.category === currentTab);
    const selectedItem = filteredItems.find((item) => item.id === selectedItemId) || filteredItems[0] || null;
    selectedItemId = selectedItem ? selectedItem.id : null;
    inventoryRoute.tab = currentTab;
    inventoryRoute.item = selectedItemId;
    const previewCharacter = selectedItem
      ? {
          ...state.character,
          equipped: {
            ...state.character.equipped,
            [selectedItem.slot]: selectedItem.id
          }
        }
      : state.character;
    appRoot.innerHTML = `
      <div>
        <div class="inventory-header">
          <h1 class="window-title">${textHtml("window.inventory")}</h1>
          <div class="gold-balance" aria-label="${textHtml("inventory.goldAria")}">
            <span>${textHtml("inventory.gold")}</span>
            <strong id="inventory-gold-value">${escapeHtml(formatNumber(currentGold()))}</strong>
          </div>
        </div>
        ${view === "tray" ? `<label class="inventory-category" for="inventory-category"><span>${textHtml("tray.category")}</span>
          <select id="inventory-category">${state.itemCategories.map((category) => `<option value="${category.id}" ${currentTab === category.id ? "selected" : ""}>${escapeHtml(categoryName(category.id))}</option>`).join("")}</select></label>` : ""}
        <div class="inventory-layout">
          <section class="inventory-list">
            <nav class="tabs" aria-label="${textHtml("inventory.tabs")}">
              ${state.itemCategories
                .map(
                  (category) => `
                    <button class="tab-button ${currentTab === category.id ? "active" : ""}" data-tab="${category.id}">
                      ${escapeHtml(categoryName(category.id))}
                    </button>
                  `
                )
                .join("")}
            </nav>
            <div class="item-list">
              ${filteredItems
                .map((item) => {
                  const equipped = state.character.equipped[item.slot] === item.id;
                  return `
                    <button class="item-row ${item.id === selectedItemId ? "selected" : ""}" data-item="${item.id}">
                      <img class="item-thumbnail" src="${state.itemThumbnails[item.id]}" alt="" />
                      <span>
                        <h3>${escapeHtml(itemName(item))}</h3>
                        <p>${textHtml("inventory.slot", { category: categoryName(item.category) })}</p>
                      </span>
                      <span class="badge ${equipped ? "equipped" : ""}">${textHtml(equipped ? "inventory.equipped" : "inventory.owned")}</span>
                    </button>
                  `;
                })
                .join("")}
            </div>
          </section>
          <div class="side-preview">
            ${renderPreviewPane(text("inventory.previewNote"))}
            <section class="form-pane">
              <div class="field-group">
                <span class="field-title">${selectedItem ? escapeHtml(itemName(selectedItem)) : textHtml("inventory.noItem")}</span>
                <p class="preview-note">${selectedItem ? textHtml("inventory.itemType", { category: categoryName(selectedItem.category) }) : ""}</p>
              </div>
              <div class="action-row">
                <button id="equip-button" class="primary-button" ${selectedItem ? "" : "disabled"}>${escapeHtml(buttonLabel(selectedItem))}</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;

    const preview = document.getElementById("character-preview");
    startPreviewAnimation(preview, () => previewCharacter);
    restoreScroll();
    requestAnimationFrame(restoreScroll);

    appRoot.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        rememberScroll();
        currentTab = button.dataset.tab;
        const nextFiltered = state.items.filter((item) => item.category === currentTab);
        selectedItemId = nextFiltered[0] ? nextFiltered[0].id : null;
        render();
      });
    });
    const categorySelect = document.getElementById("inventory-category");
    if (categorySelect) categorySelect.onchange = () => {
      rememberScroll();
      currentTab = categorySelect.value;
      selectedItemId = null;
      render();
      persistTrayUi();
    };

    appRoot.querySelectorAll("[data-item]").forEach((button) => {
      button.addEventListener("click", () => {
        rememberScroll();
        selectedItemId = button.dataset.item;
        render();
      });
    });

    const equipButton = document.getElementById("equip-button");
    equipButton.addEventListener("click", async () => {
      if (!selectedItem) {
        return;
      }

      rememberScroll();
      const isEquipped = state.character.equipped[selectedItem.slot] === selectedItem.id;
      const action = isEquipped && selectedItem.slot !== "clothes" ? "unequip" : "equip";
      equipButton.disabled = true;
      try {
        state = await api.updateEquipment({ action, itemId: selectedItem.id, slot: selectedItem.slot });
        render();
      } catch {
        appRoot.querySelector(".preview-note").textContent = text("companion.error");
        equipButton.disabled = false;
      }
    });
  };

  render();
}

function questTypeName(type) {
  return text(`quest.type.${type}`);
}

function questTypeDescription(type) {
  return text(`quest.type.${type}.description`);
}

function questStatusName(status) {
  return text(`quest.status.${status}`);
}

function questHasStatus(questOrType) {
  const type = typeof questOrType === "string" ? questOrType : questOrType.type;
  const match = state.questTypes.find((questType) => questType.id === type);
  return match ? match.hasStatus : true;
}

function questById(id) {
  return (state.quests || []).find((quest) => quest.id === id) || null;
}

function sortedQuests() {
  return [...(state.quests || [])].sort((a, b) => {
    return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
  });
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(languageLocale());
}

function toDateTimeLocal(value) {
  const fallback = new Date(Date.now() + 60 * 60 * 1000);
  const date = value ? new Date(value) : fallback;
  const normalized = Number.isNaN(date.getTime()) ? fallback : date;
  const localTime = new Date(normalized.getTime() - normalized.getTimezoneOffset() * 60 * 1000);
  return localTime.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function ensureNotificationPermission() {
  if (!("Notification" in window) || typeof window.Notification.requestPermission !== "function") {
    return {
      granted: false,
      message: text("quest.validation.notificationUnsupported")
    };
  }

  if (window.Notification.permission === "granted") {
    return { granted: true, message: "" };
  }

  if (window.Notification.permission === "denied") {
    return {
      granted: false,
      message: text("quest.validation.notificationDenied")
    };
  }

  const permission = await window.Notification.requestPermission();
  return permission === "granted"
    ? { granted: true, message: "" }
    : {
        granted: false,
        message: text("quest.validation.notificationDenied")
      };
}

function renderQuestStatusSelect(quest) {
  if (!questHasStatus(quest)) {
    return `<span>${textHtml("quest.noStatus")}</span>`;
  }

  return `
    <select class="quest-status-select" data-quest-status="${escapeHtml(quest.id)}" aria-label="${textHtml("quest.status")}">
      ${state.questStatuses
        .map(
          (status) => `
            <option value="${escapeHtml(status.id)}" ${quest.status === status.id ? "selected" : ""}>
              ${escapeHtml(questStatusName(status.id))}
            </option>
          `
        )
        .join("")}
    </select>
  `;
}

function bindQuestStatusSelects() {
  appRoot.querySelectorAll("[data-quest-status]").forEach((select) => {
    select.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    select.addEventListener("change", async () => {
      state = await api.updateQuestStatus({
        id: select.dataset.questStatus,
        status: select.value
      });
      renderQuests();
    });
  });
}

function renderQuestPagination(totalPages) {
  if (totalPages <= 1) {
    return "";
  }

  return `
    <div class="pagination-row">
      <button data-quest-page="prev" ${questRoute.page <= 1 ? "disabled" : ""}>${textHtml("common.previous")}</button>
      <span>${textHtml("quest.pageInfo", { page: questRoute.page, total: totalPages })}</span>
      <button data-quest-page="next" ${questRoute.page >= totalPages ? "disabled" : ""}>${textHtml("common.next")}</button>
    </div>
  `;
}

function renderQuestList() {
  const quests = sortedQuests();
  const pageSize = state.questPageSize || 8;
  const totalPages = Math.max(1, Math.ceil(quests.length / pageSize));
  questRoute.page = Math.min(Math.max(questRoute.page || 1, 1), totalPages);
  const offset = (questRoute.page - 1) * pageSize;
  const pageItems = quests.slice(offset, offset + pageSize);

  appRoot.innerHTML = `
    <div>
      <div class="title-row">
        <h1 class="window-title">${textHtml("window.quests")}</h1>
        <button class="primary-button" id="new-quest-button">${textHtml("quest.new")}</button>
      </div>
      <section class="quest-panel">
        <table class="quest-table">
          <thead>
            <tr>
              <th>${textHtml("quest.type")}</th>
              <th>${textHtml("quest.title")}</th>
              <th>${textHtml("quest.status")}</th>
              <th>${textHtml("quest.createdAt")}</th>
            </tr>
          </thead>
          <tbody>
            ${
              pageItems.length
                ? pageItems
                    .map(
                      (quest) => `
                        <tr class="quest-row" tabindex="0" data-quest-id="${escapeHtml(quest.id)}">
                          <td data-label="${textHtml("quest.type")}">${escapeHtml(questTypeName(quest.type))}</td>
                          <td data-label="${textHtml("quest.title")}" class="quest-title-cell">${escapeHtml(quest.title)}</td>
                          <td data-label="${textHtml("quest.status")}">${renderQuestStatusSelect(quest)}</td>
                          <td data-label="${textHtml("quest.createdAt")}">${escapeHtml(formatDateTime(quest.createdAt))}</td>
                        </tr>
                      `
                    )
                    .join("")
                : `
                  <tr>
                    <td colspan="4">
                      <div class="empty-state">${textHtml("quest.empty")}</div>
                    </td>
                  </tr>
                `
            }
          </tbody>
        </table>
        ${renderQuestPagination(totalPages)}
      </section>
    </div>
  `;

  document.getElementById("new-quest-button").addEventListener("click", () => {
    questRoute = { mode: "type", type: null, id: null, editing: false, page: questRoute.page };
    renderQuests();
  });

  appRoot.querySelectorAll("[data-quest-id]").forEach((row) => {
    row.onkeydown = (event) => { if (event.target === row && ["Enter", " "].includes(event.key)) { event.preventDefault(); row.click(); } };
    row.addEventListener("click", (event) => {
      if (event.target.closest("select, button, a")) {
        return;
      }

      questRoute = {
        mode: "detail",
        type: null,
        id: row.dataset.questId,
        editing: false,
        page: questRoute.page
      };
      renderQuests();
    });
  });

  appRoot.querySelectorAll("[data-quest-page]").forEach((button) => {
    button.addEventListener("click", () => {
      questRoute.page += button.dataset.questPage === "next" ? 1 : -1;
      renderQuests();
    });
  });

  bindQuestStatusSelects();
  requestWindowFit();
}

function renderQuestTypePicker() {
  appRoot.innerHTML = `
    <div>
      <h1 class="window-title">${textHtml("quest.selectType")}</h1>
      <section class="quest-panel">
        <div class="quest-type-grid">
          ${state.questTypes
            .map(
              (questType) => `
                <button class="choice-button quest-type-button" data-quest-type="${escapeHtml(questType.id)}">
                  <strong>${escapeHtml(questTypeName(questType.id))}</strong>
                  <span>${escapeHtml(questTypeDescription(questType.id))}</span>
                </button>
              `
            )
            .join("")}
        </div>
        <div class="action-row">
          <button id="back-to-quest-list">${textHtml("common.back")}</button>
        </div>
      </section>
    </div>
  `;

  appRoot.querySelectorAll("[data-quest-type]").forEach((button) => {
    button.addEventListener("click", () => {
      questRoute = {
        mode: "form",
        type: button.dataset.questType,
        id: null,
        editing: true,
        page: questRoute.page
      };
      renderQuests();
    });
  });

  document.getElementById("back-to-quest-list").addEventListener("click", () => {
    questRoute = { mode: "list", type: null, id: null, editing: false, page: questRoute.page };
    renderQuests();
  });
  requestWindowFit();
}

function renderQuestForm() {
  const existing = questRoute.id ? questById(questRoute.id) : null;
  const type = questRoute.type || (existing && existing.type) || "adventure";
  const draft = existing || {
    id: null,
    type,
    title: "",
    status: "todo",
    body: "",
    url: "",
    remindAt: null
  };

  appRoot.innerHTML = `
    <div>
      <h1 class="window-title">${escapeHtml(existing ? text("common.edit") : text("quest.new"))}</h1>
      <section class="quest-panel quest-form-panel">
        <div class="info-line">
          <dt>${textHtml("quest.type")}</dt>
          <dd>${escapeHtml(questTypeName(type))}</dd>
        </div>
        <div class="field-group">
          <label class="field-title" for="quest-title">${textHtml("quest.title")}</label>
          <input class="text-input" id="quest-title" value="${escapeHtml(draft.title)}" />
        </div>
        ${
          questHasStatus(type)
            ? `
              <div class="field-group">
                <label class="field-title" for="quest-status">${textHtml("quest.status")}</label>
                <select class="text-input" id="quest-status">
                  ${state.questStatuses
                    .map(
                      (status) => `
                        <option value="${escapeHtml(status.id)}" ${draft.status === status.id ? "selected" : ""}>
                          ${escapeHtml(questStatusName(status.id))}
                        </option>
                      `
                    )
                    .join("")}
                </select>
              </div>
              <div class="field-group">
                <label class="field-title" for="quest-body">${textHtml("quest.body")}</label>
                <textarea class="text-input textarea-input" id="quest-body">${escapeHtml(draft.body)}</textarea>
              </div>
            `
            : `
              <div class="field-group">
                <label class="field-title" for="quest-url">${textHtml("quest.url")}</label>
                <input class="text-input" id="quest-url" value="${escapeHtml(draft.url)}" spellcheck="false" />
              </div>
            `
        }
        ${
          type === "reminder"
            ? `
              <div class="field-group">
                <label class="field-title" for="quest-remind-at">${textHtml("quest.remindAt")}</label>
                <input class="text-input" id="quest-remind-at" type="datetime-local" value="${escapeHtml(toDateTimeLocal(draft.remindAt))}" />
              </div>
            `
            : ""
        }
        <p class="error-text" id="quest-error"></p>
        <div class="action-row">
          <button id="cancel-quest-button">${textHtml("common.cancel")}</button>
          <button class="primary-button" id="save-quest-button">${textHtml("common.save")}</button>
        </div>
      </section>
    </div>
  `;

  const errorText = document.getElementById("quest-error");
  const saveButton = document.getElementById("save-quest-button");
  const cancelButton = document.getElementById("cancel-quest-button");

  saveButton.addEventListener("click", async () => {
    const payload = {
      id: existing ? existing.id : null,
      type,
      title: document.getElementById("quest-title").value
    };

    if (questHasStatus(type)) {
      payload.status = document.getElementById("quest-status").value;
      payload.body = document.getElementById("quest-body").value;
    } else {
      payload.url = document.getElementById("quest-url").value;
    }

    if (type === "reminder") {
      payload.remindAt = fromDateTimeLocal(document.getElementById("quest-remind-at").value);
      if (!payload.remindAt) {
        errorText.textContent = text("quest.validation.remindAt");
        return;
      }

      const permission = await ensureNotificationPermission();
      if (!permission.granted) {
        errorText.textContent = permission.message;
        return;
      }
    }

    try {
      state = await api.saveQuest(payload);
      if (view === "tray") clearTrayForm();
      questRoute = { mode: "list", type: null, id: null, editing: false, page: 1 };
      renderQuests();
    } catch (error) {
      errorText.textContent = error.message || String(error);
    }
  });

  cancelButton.addEventListener("click", () => {
    if (view === "tray") clearTrayForm();
    questRoute = existing
      ? { mode: "detail", type: null, id: existing.id, editing: false, page: questRoute.page }
      : { mode: "list", type: null, id: null, editing: false, page: questRoute.page };
    renderQuests();
  });
  requestWindowFit();
}

function renderQuestDetail() {
  const quest = questById(questRoute.id);
  if (!quest) {
    questRoute = { mode: "list", type: null, id: null, editing: false, page: questRoute.page };
    renderQuestList();
    return;
  }

  if (questRoute.editing) {
    renderQuestForm();
    return;
  }

  appRoot.innerHTML = `
    <div>
      <div class="title-row">
        <h1 class="window-title">${textHtml("quest.detail")}</h1>
        <button id="back-to-quests">${textHtml("common.back")}</button>
      </div>
      <section class="quest-panel quest-detail-panel">
        <dl class="info-list">
          <div class="info-line">
            <dt>${textHtml("quest.type")}</dt>
            <dd>${escapeHtml(questTypeName(quest.type))}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("quest.title")}</dt>
            <dd>${escapeHtml(quest.title)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("quest.status")}</dt>
            <dd>${renderQuestStatusSelect(quest)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("quest.createdAt")}</dt>
            <dd>${escapeHtml(formatDateTime(quest.createdAt))}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("quest.updatedAt")}</dt>
            <dd>${escapeHtml(formatDateTime(quest.updatedAt))}</dd>
          </div>
          ${
            quest.type === "reminder"
              ? `
                <div class="info-line">
                  <dt>${textHtml("quest.remindAt")}</dt>
                  <dd>${escapeHtml(formatDateTime(quest.remindAt))}</dd>
                </div>
              `
              : ""
          }
        </dl>
        ${
          quest.type === "bookmark"
            ? `
              <button class="bookmark-snippet" id="open-bookmark-button">
                <span class="badge">${textHtml("quest.bookmarkSnippet")}</span>
                <strong>${escapeHtml(quest.title)}</strong>
                <span>${escapeHtml(quest.url)}</span>
              </button>
            `
            : `
              <div class="quest-body-block">
                <span class="field-title">${textHtml("quest.body")}</span>
                <p>${escapeHtml(quest.body || "-")}</p>
              </div>
            `
        }
        <div class="action-row">
          ${
            quest.type === "bookmark"
              ? `<button id="open-link-button">${textHtml("quest.openLink")}</button>`
              : ""
          }
          <button id="delete-quest-button">${textHtml("common.delete")}</button>
          <button class="primary-button" id="edit-quest-button">${textHtml("common.edit")}</button>
        </div>
      </section>
    </div>
  `;

  document.getElementById("back-to-quests").addEventListener("click", () => {
    questRoute = { mode: "list", type: null, id: null, editing: false, page: questRoute.page };
    renderQuests();
  });

  document.getElementById("edit-quest-button").addEventListener("click", () => {
    questRoute = { ...questRoute, editing: true, type: quest.type };
    renderQuests();
  });

  document.getElementById("delete-quest-button").addEventListener("click", async () => {
    if (!window.confirm(text("quest.deleteConfirm"))) {
      return;
    }

    state = await api.deleteQuest(quest.id);
    questRoute = { mode: "list", type: null, id: null, editing: false, page: questRoute.page };
    renderQuests();
  });

  const openLink = async () => {
    state = await api.openQuestUrl(quest.id);
  };
  const openLinkButton = document.getElementById("open-link-button");
  const openBookmarkButton = document.getElementById("open-bookmark-button");
  if (openLinkButton) {
    openLinkButton.addEventListener("click", openLink);
  }
  if (openBookmarkButton) {
    openBookmarkButton.addEventListener("click", openLink);
  }

  bindQuestStatusSelects();
  requestWindowFit();
}

function renderQuests() {
  if (view === "tray") scheduleTrayUiSave();
  if (questRoute.mode === "type") {
    renderQuestTypePicker();
    return;
  }

  if (questRoute.mode === "form") {
    renderQuestForm();
    return;
  }

  if (questRoute.mode === "detail") {
    renderQuestDetail();
    return;
  }

  renderQuestList();
}

function formatUpdateCheckedAt(value) {
  if (!value) {
    return text("common.notChecked");
  }

  return new Date(value).toLocaleString(languageLocale());
}

function updateStatusLabel(status) {
  return text(`status.${status}`);
}

function renderUpdatePanelContent(update) {
  const currentUpdate = update || {
    enabled: false,
    status: "disabled",
    currentVersion: state.app.version,
    message: text("update.disabled")
  };
  const status = currentUpdate.status;
  const busy = ["checking", "downloading", "installing"].includes(status);
  const canCheck = currentUpdate.enabled && !busy;
  const canInstall = ["available", "downloaded"].includes(status);
  const installLabel = status === "downloaded" ? text("update.restartButton") : text("update.installButton");
  const latestVersion = currentUpdate.latestVersion || "-";
  const progress =
    typeof currentUpdate.progressPercent === "number"
      ? Math.round(currentUpdate.progressPercent)
      : null;

  return `
    <div class="update-title-row">
      <span class="field-title">${textHtml("common.update")}</span>
      <span class="badge">${escapeHtml(updateStatusLabel(status))}</span>
    </div>
    <p class="update-message">${escapeHtml(currentUpdate.message || text("update.idle"))}</p>
    <dl class="update-details">
      <div class="info-line">
        <dt>${textHtml("common.current")}</dt>
        <dd>${escapeHtml(currentUpdate.currentVersion || state.app.version)}</dd>
      </div>
      <div class="info-line">
        <dt>${textHtml("common.latest")}</dt>
        <dd>${escapeHtml(latestVersion)}</dd>
      </div>
      <div class="info-line">
        <dt>${textHtml("common.checked")}</dt>
        <dd>${escapeHtml(formatUpdateCheckedAt(currentUpdate.lastCheckedAt))}</dd>
      </div>
    </dl>
    ${
      progress === null
        ? ""
        : `
          <progress class="progress-track" value="${progress}" max="100" aria-label="${textHtml("update.progress")}"></progress>
          <p class="preview-note">${progress}%</p>
        `
    }
    ${
      currentUpdate.error
        ? `<p class="error-text">${escapeHtml(currentUpdate.error)}</p>`
        : ""
    }
    <div class="action-row">
      <button id="check-update-button" ${canCheck ? "" : "disabled"}>${textHtml("update.checkButton")}</button>
      ${
        canInstall
          ? `<button id="install-update-button" class="primary-button">${escapeHtml(installLabel)}</button>`
          : ""
      }
    </div>
  `;
}

function bindUpdatePanelEvents() {
  const checkButton = document.getElementById("check-update-button");
  const installButton = document.getElementById("install-update-button");

  if (checkButton) {
    checkButton.addEventListener("click", async () => {
      checkButton.disabled = true;
      const update = await api.checkForUpdates();
      refreshUpdatePanel(update);
    });
  }

  if (installButton) {
    installButton.addEventListener("click", async () => {
      installButton.disabled = true;
      const update = await api.downloadAndInstallUpdate();
      refreshUpdatePanel(update);
    });
  }
}

function refreshUpdatePanel(update) {
  if (update) {
    state.update = update;
  }

  const updatePanel = document.getElementById("update-panel");
  if (!updatePanel) {
    return;
  }

  updatePanel.innerHTML = renderUpdatePanelContent(state.update);
  bindUpdatePanelEvents();
  requestWindowFit();
}

function renderSettings() {
  if (view === "tray") return renderTraySettings();
  const currentLanguage =
    state.languageOptions.find((language) => language.id === state.settings.language) || state.languageOptions[0];

  appRoot.innerHTML = `
    <div>
      <h1 class="window-title">${textHtml("window.settings")}</h1>
      <section class="settings-panel">
        <label class="setting-row">
          <input id="launch-at-login" type="checkbox" ${state.settings.launchAtLogin ? "checked" : ""} />
          <span>${textHtml("settings.launchAtLogin")}</span>
        </label>
        <dl class="info-list">
          <div class="info-line">
            <dt>${textHtml("settings.language")}</dt>
            <dd>${escapeHtml(currentLanguage.label)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("common.version")}</dt>
            <dd>${escapeHtml(state.app.version)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("common.developer")}</dt>
            <dd>${escapeHtml(state.app.developer)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("common.contact")}</dt>
            <dd>${escapeHtml(state.app.contact)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("common.copyright")}</dt>
            <dd>${escapeHtml(state.app.copyright)}</dd>
          </div>
        </dl>
        <section class="update-panel" id="update-panel">
          ${renderUpdatePanelContent(state.update)}
        </section>
        <div class="storage-paths">
          <strong>${textHtml("common.storage")}</strong>
          <span>${escapeHtml(state.storage.character)}</span>
          <span>${escapeHtml(state.storage.settings)}</span>
          <span>${escapeHtml(state.storage.quests)}</span>
          <span>${escapeHtml(state.storage.wallet)}</span>
        </div>
      </section>
    </div>
  `;

  const launchAtLogin = document.getElementById("launch-at-login");
  launchAtLogin.addEventListener("change", async () => {
    state = await api.setLaunchAtLogin(launchAtLogin.checked);
    launchAtLogin.checked = state.settings.launchAtLogin;
  });

  bindUpdatePanelEvents();

  if (!updateUnsubscribe) {
    updateUnsubscribe = api.onUpdateState((updateState) => {
      refreshUpdatePanel(updateState);
    });
  }
  requestWindowFit();
}

function renderAbout() {
  appRoot.innerHTML = `
    <div>
      <h1 class="window-title">${textHtml("window.about")}</h1>
      <section class="about-panel">
        <dl class="info-list">
          <div class="info-line">
            <dt>${textHtml("common.app")}</dt>
            <dd>${escapeHtml(state.app.name)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("common.version")}</dt>
            <dd>${escapeHtml(state.app.version)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("common.developer")}</dt>
            <dd>${escapeHtml(state.app.developer)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("common.contact")}</dt>
            <dd>${escapeHtml(state.app.contact)}</dd>
          </div>
          <div class="info-line">
            <dt>${textHtml("common.copyright")}</dt>
            <dd>${escapeHtml(state.app.copyright)}</dd>
          </div>
        </dl>
        <div class="action-row">
          <button class="primary-button" id="close-button">${textHtml(view === "tray" ? "common.back" : "common.close")}</button>
        </div>
      </section>
    </div>
  `;

  document.getElementById("close-button").addEventListener("click", () => {
    if (view === "tray") navigateTray("settings");
    else api.closeWindow();
  });
  requestWindowFit();
}

function formatTrayDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(languageLocale(), {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function trayPanelQuests() {
  return sortedQuests()
    .filter((quest) => {
      return questHasStatus(quest) ? quest.status !== "done" : true;
    })
    .slice(0, 6);
}

function renderTrayQuestRows(quests) {
  if (quests.length === 0) {
    return `
      <tr>
        <td colspan="4">
          <div class="tray-empty">${textHtml("quest.empty")}</div>
        </td>
      </tr>
    `;
  }

  return quests
    .map(
      (quest) => `
        <tr class="tray-quest-row" data-tray-quest="${escapeHtml(quest.id)}">
          <td>${escapeHtml(questTypeName(quest.type))}</td>
          <td class="quest-title-cell">${escapeHtml(quest.title)}</td>
          <td>
            <span class="tray-status-pill">${escapeHtml(questHasStatus(quest) ? questStatusName(quest.status) : text("quest.noStatus"))}</span>
          </td>
          <td>${escapeHtml(formatTrayDateTime(quest.createdAt))}</td>
        </tr>
      `
    )
    .join("");
}

function renderTrayPanel() {
  renderCompanionPanel();
}

function renderCurrentView() {
  document.documentElement.lang = state.settings.language;
  if (previewTimer) clearInterval(previewTimer);
  previewTimer = null;
  if (view === "tray") ensureTrayShell();
  const route = currentView();
  if (route === "companion") renderTrayPanel();
  else if (route === "inventory") renderInventory();
  else if (route === "quests") renderQuests();
  else if (route === "settings") renderSettings();
  else if (route === "about") renderAbout();
  else if (route === "updates") renderTrayUpdates();
  else renderCustomization();
  restoreTrayForm();
  paintCanonicalHero();
}

async function main() {
  state = await api.getState();
  if (view === "tray") {
    restoreTraySession(await api.getTraySession());
    api.onTrayNavigate(({ route, questId }) => navigateTray(route, questId));
    api.onCaptureTraySession(persistTrayUi);
  }
  renderCurrentView();

  stateUnsubscribe = api.onAppState((nextState) => {
    const unchanged = JSON.stringify(state.character) === JSON.stringify(nextState.character) && state.settings.language === nextState.settings.language;
    captureTrayUi();
    state = nextState;
    paintCanonicalHero();
    if (currentView() === "customization" && unchanged) return;
    if (currentView() === "inventory" && unchanged) return;
    renderCurrentView();
  });
  updateUnsubscribe = api.onUpdateState((update) => refreshUpdatePanel(update));

  expeditionUnsubscribe = api.onExpeditionState((nextExpedition) => {
    state.expedition = nextExpedition;
    if (view === "tray") updateCompanionProgress();
  });

  if (api.onWalletState) {
    walletUnsubscribe = api.onWalletState((nextWallet) => {
      state = {
        ...state,
        wallet: nextWallet
      };
      updateInventoryGoldDisplay();
    });
  }

  if ((view === "quests" || view === "tray") && api.onShowQuestDetail) {
    questDetailUnsubscribe = api.onShowQuestDetail((questId) => {
      questRoute = {
        mode: "detail",
        type: null,
        id: questId,
        editing: false,
        page: questRoute.page
      };
      renderQuests();
    });
  }
}

window.addEventListener("beforeunload", () => {
  if (expeditionUnsubscribe) expeditionUnsubscribe();
  if (previewTimer) {
    clearInterval(previewTimer);
  }

  if (updateUnsubscribe) {
    updateUnsubscribe();
  }

  if (stateUnsubscribe) {
    stateUnsubscribe();
  }

  if (walletUnsubscribe) {
    walletUnsubscribe();
  }

  if (questDetailUnsubscribe) {
    questDetailUnsubscribe();
  }
});

main().catch((error) => {
  appRoot.innerHTML = `<pre>${escapeHtml(error.stack || error.message)}</pre>`;
});
