const appRoot = document.getElementById("app");
const api = window.osHeroApi || window.osBoyApi;
const view = new URLSearchParams(window.location.search).get("view") || "customization";

let state = null;
let previewTimer = null;
let previewFrame = 0;
let updateUnsubscribe = null;
let stateUnsubscribe = null;
let questDetailUnsubscribe = null;
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

async function updatePreview(imgElement, character, scale = 10) {
  imgElement.src = await api.renderCharacter(character, previewFrame, scale);
}

function startPreviewAnimation(imgElement, getCharacter, scale = 10) {
  if (previewTimer) {
    clearInterval(previewTimer);
  }

  const render = () => {
    previewFrame = (previewFrame + 1) % 4;
    updatePreview(imgElement, getCharacter(), scale);
  };

  render();
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
  let draft = {
    ...state.character,
    equipped: { ...state.character.equipped }
  };

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
    colorInput.value = draft.bodyColor;
    colorPicker.value = draft.bodyColor;
    updatePreview(preview, draft, 10);
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
    updatePreview(preview, draft, 10);
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
    updatePreview(preview, draft, 10);
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

    await api.saveCharacter({
      gender: draft.gender,
      bodyColor: colorInput.value.toUpperCase(),
      eyeType: draft.eyeType
    });
    await api.closeWindow();
  });

  cancelButton.addEventListener("click", async () => {
    await api.cancelCustomization();
    await api.closeWindow();
  });

  startPreviewAnimation(preview, () => draft, 10);
  requestWindowFit();
}

function renderInventory() {
  let currentTab = state.itemCategories[0] ? state.itemCategories[0].id : "head";
  let selectedItemId = (state.items.find((item) => item.category === currentTab) || state.items[0] || {}).id || null;

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
        <h1 class="window-title">${textHtml("window.inventory")}</h1>
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
    startPreviewAnimation(preview, () => previewCharacter, 9);

    appRoot.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        currentTab = button.dataset.tab;
        const nextFiltered = state.items.filter((item) => item.category === currentTab);
        selectedItemId = nextFiltered[0] ? nextFiltered[0].id : null;
        render();
      });
    });

    appRoot.querySelectorAll("[data-item]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedItemId = button.dataset.item;
        render();
      });
    });

    const equipButton = document.getElementById("equip-button");
    equipButton.addEventListener("click", async () => {
      if (!selectedItem) {
        return;
      }

      const isEquipped = state.character.equipped[selectedItem.slot] === selectedItem.id;
      const action = isEquipped && selectedItem.slot !== "clothes" ? "unequip" : "equip";
      state = await api.updateEquipment({
        action,
        itemId: selectedItem.id,
        slot: selectedItem.slot
      });
      render();
    });
    requestWindowFit();
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
                        <tr class="quest-row" data-quest-id="${escapeHtml(quest.id)}">
                          <td>${escapeHtml(questTypeName(quest.type))}</td>
                          <td class="quest-title-cell">${escapeHtml(quest.title)}</td>
                          <td>${renderQuestStatusSelect(quest)}</td>
                          <td>${escapeHtml(formatDateTime(quest.createdAt))}</td>
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
    }

    try {
      state = await api.saveQuest(payload);
      questRoute = { mode: "list", type: null, id: null, editing: false, page: 1 };
      renderQuests();
    } catch (error) {
      errorText.textContent = error.message || String(error);
    }
  });

  cancelButton.addEventListener("click", () => {
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
          <button class="primary-button" id="close-button">${textHtml("common.close")}</button>
        </div>
      </section>
    </div>
  `;

  document.getElementById("close-button").addEventListener("click", () => {
    api.closeWindow();
  });
  requestWindowFit();
}

function renderCurrentView() {
  if (view === "inventory") {
    renderInventory();
    return;
  }

  if (view === "quests") {
    renderQuests();
    return;
  }

  if (view === "settings") {
    renderSettings();
    return;
  }

  if (view === "about") {
    renderAbout();
    return;
  }

  renderCustomization();
}

async function main() {
  state = await api.getState();
  renderCurrentView();

  stateUnsubscribe = api.onAppState((nextState) => {
    state = nextState;
    renderCurrentView();
  });

  if (view === "quests" && api.onShowQuestDetail) {
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
  if (previewTimer) {
    clearInterval(previewTimer);
  }

  if (updateUnsubscribe) {
    updateUnsubscribe();
  }

  if (stateUnsubscribe) {
    stateUnsubscribe();
  }

  if (questDetailUnsubscribe) {
    questDetailUnsubscribe();
  }
});

main().catch((error) => {
  appRoot.innerHTML = `<pre>${escapeHtml(error.stack || error.message)}</pre>`;
});
